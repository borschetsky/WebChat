import { createListenerMiddleware } from '@reduxjs/toolkit';
import * as signalR from '@microsoft/signalr';
import type { AppDispatch, RootState } from '@/app/store';
import Config from '@/config';
import { chatApi, messagesAdapter } from '@/app/api/chatApi';
import { toGroup, toLiveMessage } from '@/services/adapters';
import { applyGroupEvent } from './groupEvents';
import { noteIncomingMessage } from '@/services/chat-service';
import { signedIn, signedOut } from '@/features/auth/authSlice';
import { notified, threadClosed } from '@/features/ui/uiSlice';
import type {
  AvatarBroadcastDto,
  GroupEventDto,
  MessageDto,
  ProfileBroadcastDto,
  TypingStatusDto,
} from '@/types/dto';
import {
  realtimeStarted,
  realtimeReset,
  connectionStatusChanged,
  threadPatched,
  opponentTyping,
  unreadBumped,
} from './realtimeSlice';

/**
 * Owns the SignalR connection.
 *
 * Previously this lived in ChatApp as a hook whose handler object closed over `threads`,
 * so it was rebuilt on every thread change and every handler had to be re-registered.
 * Here the connection is created once per session and hub events become plain dispatches,
 * which means no component knows the hub exists.
 */
export const realtimeMiddleware = createListenerMiddleware();

const startListening = realtimeMiddleware.startListening.withTypes<RootState, AppDispatch>();

let connection: signalR.HubConnection | null = null;

/** Typing notifications are fire-and-forget; a dropped one is not worth surfacing. */
export const invokeHub = (method: string, ...args: unknown[]) => {
  if (connection?.state === signalR.HubConnectionState.Connected) {
    connection.invoke(method, ...args).catch(() => {});
  }
};

const teardown = async () => {
  const c = connection;
  connection = null;
  if (c) {
    [
      'ReciveMessage',
      'ReviceThread',
      'ReciveTypingStatus',
      'ReciveStopTypingStatus',
      'ReciveConnectedStatus',
      'ReciveDisconnectedStatus',
      'ReciveAvatar',
      'ReviceUpdatedOpponentProfile',
      'ReciveGroupEvent',
    ].forEach((e) => c.off(e));
    await c.stop().catch(() => {});
  }
};

const connect = async (token: string, dispatch: AppDispatch, getState: () => RootState) => {
  await teardown();

  // Config.network.api is relative by default, so this resolves same-origin and works both
  // behind the Vite proxy and when served by the ASP.NET host.
  const c = new signalR.HubConnectionBuilder()
    .withUrl(`${Config.network.api}${Config.network.wss}`, { accessTokenFactory: () => token })
    .withAutomaticReconnect()
    .build();

  connection = c;

  /** The thread a hub event refers to, from the currently cached thread list. */
  const threadsOf = () => chatApi.endpoints.getThreads.select()(getState()).data ?? [];

  c.on('ReciveMessage', (payload: MessageDto) => {
    const me = getState().auth.user?.id ?? null;
    const incoming = toLiveMessage(payload, me);
    const activeId = getState().ui.activeThreadId;
    const isActive = incoming.threadId === activeId;

    dispatch(
      threadPatched({
        threadId: incoming.threadId,
        patch: { preview: incoming.text, time: incoming.time, isTyping: false },
      }),
    );

    if (!isActive && !incoming.own) {
      // MOCK: no server watermark, but the trigger is a real hub event.
      dispatch(
        unreadBumped({
          threadId: incoming.threadId,
          count: noteIncomingMessage(incoming.threadId),
        }),
      );
    }

    if (isActive) {
      // O(1) upsert, and idempotent - the hub echoes the sender's own message back, so
      // this and the mutation's optimistic insert can be the same message.
      dispatch(
        chatApi.util.updateQueryData('getMessages', incoming.threadId, (draft) => {
          messagesAdapter.upsertOne(draft, incoming);
        }),
      );
      dispatch(opponentTyping({ threadId: incoming.threadId, typing: false }));
    }
  });

  c.on('ReviceThread', () => {
    dispatch(chatApi.util.invalidateTags(['Threads']));
  });

  // The server now sends typing only to the thread's own participants and never echoes it
  // to the typist, so there is nothing left to filter here. The previous version compared
  // the sender against `t.opponentId`, which is undefined on a group thread - so every
  // group typing event was silently discarded and no group ever showed an indicator.
  c.on(
    'ReciveTypingStatus',
    ({ userId, threadId, username, UserId, ThreadId, Username }: TypingStatusDto) => {
      const tid = threadId ?? ThreadId;
      const uid = userId ?? UserId;
      if (!tid || !uid) return;
      dispatch(
        opponentTyping({
          threadId: tid,
          typing: true,
          userId: uid,
          username: username ?? Username,
        }),
      );
    },
  );

  c.on('ReciveStopTypingStatus', ({ userId, threadId, UserId, ThreadId }: TypingStatusDto) => {
    const tid = threadId ?? ThreadId;
    const uid = userId ?? UserId;
    // Without a user id this clears the whole thread, which is the right fallback: better a
    // dropped indicator than one stuck on forever.
    if (tid) dispatch(opponentTyping({ threadId: tid, typing: false, userId: uid }));
  });

  const presence = (id: string, value: 'online' | 'offline') => {
    threadsOf()
      .filter((t) => t.opponentId === id)
      .forEach((t) => dispatch(threadPatched({ threadId: t.id, patch: { presence: value } })));
  };
  c.on('ReciveConnectedStatus', (id: string) => presence(id, 'online'));
  c.on('ReciveDisconnectedStatus', (id: string) => presence(id, 'offline'));

  c.on('ReciveAvatar', ({ body, uploaderId }: AvatarBroadcastDto) => {
    const fileName = typeof body === 'string' ? body : body?.value;
    threadsOf()
      .filter((t) => t.opponentId === uploaderId)
      .forEach((t) =>
        dispatch(threadPatched({ threadId: t.id, patch: { avatarFileName: fileName ?? null } })),
      );
    if (getState().auth.user?.id === uploaderId) dispatch(chatApi.util.invalidateTags(['Profile']));
  });

  // Three fields, not a whole profile: the server stopped broadcasting the request body -
  // email address and workspace role with it - to every connected client (#94). Only `id` and
  // `username` are read here; the avatar arrives on this payload too, but avatar changes have
  // their own event (`ReciveAvatar`) and patching it from both would be two writers for one
  // field.
  c.on('ReviceUpdatedOpponentProfile', (p: ProfileBroadcastDto | null) => {
    if (!p) return;
    threadsOf()
      .filter((t) => t.opponentId === p.id)
      .forEach((t) =>
        dispatch(threadPatched({ threadId: t.id, patch: { name: p.username ?? 'Unknown' } })),
      );
    if (getState().auth.user?.id === p.id) dispatch(chatApi.util.invalidateTags(['Profile']));
  });

  /**
   * Group management events (SPEC-group-wire-contract.md §4, "Realtime delivery").
   *
   * Events are per-group ordered and carry `version`. Anything more than one ahead of the
   * cached copy means events were missed, so the group is refetched rather than patched -
   * applying a partial update on top of a gap is how a member list silently diverges.
   *
   * The system message rides along on the event, which is what makes "Maya renamed the
   * group" appear in an open conversation without a refetch.
   */
  c.on('ReciveGroupEvent', (e: GroupEventDto) => {
    if (!e?.groupId) return;

    // Being added: no local copy to patch, so the whole group arrives and the thread list
    // is refetched to make the new conversation appear.
    if (e.type === 'conversation.joined') {
      if (e.group) dispatch(chatApi.util.upsertQueryData('getGroup', e.groupId, toGroup(e.group)));
      dispatch(chatApi.util.invalidateTags(['Threads']));
      return;
    }

    // Being removed: the thread has to go, and if it is open the pane has to let go of it
    // before its queries start 403ing.
    if (e.type === 'conversation.removed') {
      if (getState().ui.activeThreadId === e.groupId) {
        dispatch(threadClosed(e.groupId));
        dispatch(notified('You are no longer a member of this group'));
      }
      dispatch(chatApi.util.invalidateTags(['Threads']));
      return;
    }

    const cached = chatApi.endpoints.getGroup.select(e.groupId)(getState()).data;

    if (cached && e.version != null && e.version > cached.version + 1) {
      // A gap. Refetch instead of guessing what happened in between.
      dispatch(chatApi.util.invalidateTags([{ type: 'Group', id: e.groupId }]));
    } else if (cached) {
      dispatch(
        chatApi.util.updateQueryData('getGroup', e.groupId, (draft) => {
          applyGroupEvent(draft, e, getState().auth.user?.id ?? null);
        }),
      );
    }
    // No cached group means no drawer is open on it; the next open fetches fresh.

    if (e.systemMessage) {
      const message = toLiveMessage(e.systemMessage, getState().auth.user?.id ?? null);
      dispatch(
        chatApi.util.updateQueryData('getMessages', e.groupId, (draft) => {
          messagesAdapter.upsertOne(draft, message);
        }),
      );
    }

    // A rename or a membership change moves the thread list's title, and an auto-named
    // group's title is derived from its members - so both need the row refreshed.
    if (e.type === 'group.renamed' || e.type.startsWith('group.member')) {
      dispatch(chatApi.util.invalidateTags(['Threads']));
    }
  });

  c.onreconnecting(() => dispatch(connectionStatusChanged('reconnecting')));

  /**
   * Reconcile after a gap in delivery.
   *
   * The spec is explicit: "Do not assume delivery: reconcile on reconnect by comparing
   * versions." Nothing is buffered while the socket is down, so every event sent during the
   * outage is simply gone - and unlike the in-band case there is no version to compare
   * against, because the events that would have carried it never arrived. Refetching is the
   * comparison: the server's version replaces whatever the client was holding.
   *
   * All three caches are invalidated, because all three could have missed an event: the
   * group's roles and membership, the thread list's titles and previews, and the open
   * conversation's messages. Only the ones with live subscribers actually refetch.
   */
  c.onreconnected(() => {
    dispatch(connectionStatusChanged('connected'));
    dispatch(chatApi.util.invalidateTags(['Threads', 'Group', 'Messages']));
  });
  c.onclose(() => dispatch(connectionStatusChanged('disconnected')));

  dispatch(connectionStatusChanged('connecting'));
  try {
    await c.start();
    dispatch(connectionStatusChanged('connected'));
  } catch {
    dispatch(connectionStatusChanged('failed'));
  }
};

// Connect on sign-in, and on boot when a session was restored from storage.
startListening({
  matcher: (action) => signedIn.match(action) || realtimeStarted.match(action),
  effect: async (_action, api) => {
    api.cancelActiveListeners();
    const token = api.getState().auth.user?.token;
    if (token) await connect(token, api.dispatch, api.getState);
  },
});

startListening({
  actionCreator: signedOut,
  effect: async (_action, api) => {
    await teardown();
    api.dispatch(realtimeReset());
  },
});
