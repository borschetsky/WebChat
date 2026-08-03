import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Snackbar } from '@mui/material';
import AppShell, { useIsMobile } from '@/app/AppShell';
import { useAppDispatch, useAppSelector } from '@/app/hooks';
import {
  chatApi, messagesAdapter,
  useGetProfileQuery, useGetThreadsQuery, useGetMessagesQuery, useSearchThreadQuery,
  useLazySearchDirectoryQuery, useSendMessageMutation, useStartThreadMutation,
  useSaveProfileMutation, useToggleReactionMutation,
} from '@/app/api/chatApi';
import ThreadList from '@/features/threads/ThreadList';
import ConversationPane from '@/features/messages/ConversationPane';
import SettingsDrawer from '@/features/settings/SettingsDrawer';
import ComposeDialog from '@/features/threads/ComposeDialog';
import { useThemeMode } from '@/theme/ThemeModeProvider';
import { useChatConnection } from '@/features/realtime/useChatConnection';
import { avatarColor } from '@/theme/tokens';
import { uploadAvatar } from '@/services';
import { markThreadRead, markAllThreadsRead, readReceiptFor, noteIncomingMessage } from '@/services/chat-service';
import { toLiveMessage } from '@/services/adapters';
import { composerCleared, draftChanged, replyStarted, takeDraftFile } from '@/features/composer/composerSlice';
import {
  threadSelected, queryChanged, filterChanged, searchToggled, searchQueryChanged,
  settingsOpened, settingsClosed, composeOpened, composeClosed,
  paneChanged, notified, notificationDismissed,
  selectActiveThreadId, selectQuery, selectFilter, selectSearchOpen, selectSearchQuery,
  selectSettingsOpen, selectComposeOpen, selectPane, selectSnack,
} from '@/features/ui/uiSlice';

const TYPING_IDLE_MS = 3000;
const EMPTY_MESSAGES = messagesAdapter.getInitialState();

/**
 * The chat screen.
 *
 * Server data comes from RTK Query, view state from uiSlice, composer state from
 * composerSlice. The only local state left is the transient typing indicator and the
 * mocked unread overlay, neither of which the server can provide.
 *
 * This component does not subscribe to the composer draft - Composer passes its contents
 * up on send - so typing never re-renders the message list.
 */
export default function ChatApp({ user, onSignOut }) {
  const dispatch = useAppDispatch();
  const { density } = useThemeMode();
  const isMobile = useIsMobile();

  // --- view state -----------------------------------------------------------
  const activeId = useAppSelector(selectActiveThreadId);
  const query = useAppSelector(selectQuery);
  const filter = useAppSelector(selectFilter);
  const searchOpen = useAppSelector(selectSearchOpen);
  const searchQuery = useAppSelector(selectSearchQuery);
  const settingsOpen = useAppSelector(selectSettingsOpen);
  const composeOpen = useAppSelector(selectComposeOpen);
  const pane = useAppSelector(selectPane);
  const snack = useAppSelector(selectSnack);

  // --- server data ----------------------------------------------------------
  const { data: profile } = useGetProfileQuery(undefined, { skip: !user });
  const { data: threads = [], isLoading: loadingThreads, isError: threadsFailed } =
    useGetThreadsQuery(undefined, { skip: !user });
  const { data: messageCache = EMPTY_MESSAGES, isFetching: loadingMessages } =
    useGetMessagesQuery(activeId, { skip: !activeId });

  const term = searchQuery.trim();
  const { data: searchResults } = useSearchThreadQuery(
    { threadId: activeId, term },
    { skip: !searchOpen || !activeId || term.length === 0 },
  );

  const [triggerDirectory] = useLazySearchDirectoryQuery();
  const [sendMessage] = useSendMessageMutation();
  const [startThread] = useStartThreadMutation();
  const [saveProfile] = useSaveProfileMutation();
  const [toggleReaction] = useToggleReactionMutation();

  // --- local, because nothing on the server backs it ------------------------
  const [typing, setTyping] = useState(false);
  const [unread, setUnread] = useState({});

  const activeIdRef = useRef(null);
  activeIdRef.current = activeId;
  const typingTimer = useRef(null);
  const stopTypingTimer = useRef(null);

  const notify = useCallback((msg) => dispatch(notified(msg)), [dispatch]);

  // A failed profile/threads load means the token is no longer good.
  useEffect(() => { if (threadsFailed) onSignOut(); }, [threadsFailed, onSignOut]);

  const messages = useMemo(
    () => messagesAdapter.getSelectors().selectAll(messageCache),
    [messageCache],
  );

  /** Threads carry live presence/typing patches that the cached list does not. */
  const [live, setLive] = useState({});
  const decorated = useMemo(
    () => threads.map((t) => ({ ...t, ...(live[t.id] ?? {}), unread: unread[t.id] ?? 0 })),
    [threads, live, unread],
  );
  const active = decorated.find((t) => t.id === activeId) ?? null;

  const patchLive = useCallback((id, patch) => {
    setLive((l) => ({ ...l, [id]: { ...(l[id] ?? {}), ...patch } }));
  }, []);

  // --- SignalR --------------------------------------------------------------
  const handlers = useMemo(() => ({
    ReciveMessage: (payload) => {
      const incoming = toLiveMessage(payload, user.id);
      const isActive = incoming.threadId === activeIdRef.current;

      if (!isActive && !incoming.own) {
        // MOCK: unread has no server watermark, but the trigger is a real hub event.
        const n = noteIncomingMessage(incoming.threadId);
        setUnread((u) => ({ ...u, [incoming.threadId]: n }));
      }
      patchLive(incoming.threadId, { preview: incoming.text, time: incoming.time, isTyping: false });

      if (isActive) {
        // O(1) upsert, and idempotent - the hub echoes the sender's own message back.
        dispatch(chatApi.util.updateQueryData('getMessages', incoming.threadId, (draft) => {
          messagesAdapter.upsertOne(draft, incoming);
        }));
        setTyping(false);
      }
    },

    ReviceThread: () => { dispatch(chatApi.util.invalidateTags(['Threads'])); },

    ReciveTypingStatus: ({ userId, threadId, UserId, ThreadId }) => {
      const uid = userId ?? UserId;
      const tid = threadId ?? ThreadId;
      if (!tid) return;
      const t = threads.find((x) => x.id === tid);
      if (t && t.opponentId !== uid) return;
      patchLive(tid, { isTyping: true });
      if (tid === activeIdRef.current) {
        setTyping(true);
        clearTimeout(typingTimer.current);
        typingTimer.current = setTimeout(() => setTyping(false), TYPING_IDLE_MS);
      }
    },

    ReciveStopTypingStatus: ({ threadId, ThreadId }) => {
      const tid = threadId ?? ThreadId;
      if (tid) patchLive(tid, { isTyping: false });
      if (tid === activeIdRef.current) setTyping(false);
    },

    ReciveConnectedStatus: (id) => {
      threads.filter((t) => t.opponentId === id).forEach((t) => patchLive(t.id, { presence: 'online' }));
    },
    ReciveDisconnectedStatus: (id) => {
      threads.filter((t) => t.opponentId === id).forEach((t) => patchLive(t.id, { presence: 'offline' }));
    },

    ReciveAvatar: ({ body, uploaderId }) => {
      const fileName = body?.value ?? body;
      threads.filter((t) => t.opponentId === uploaderId).forEach((t) => patchLive(t.id, { avatarFileName: fileName }));
      if (profile?.id === uploaderId) dispatch(chatApi.util.invalidateTags(['Profile']));
    },

    ReviceUpdatedOpponentProfile: (p) => {
      if (!p) return;
      threads.filter((t) => t.opponentId === p.id).forEach((t) => patchLive(t.id, { name: p.username }));
      if (profile?.id === p.id) dispatch(chatApi.util.invalidateTags(['Profile']));
    },
  }), [dispatch, patchLive, threads, profile?.id, user?.id]);

  const { invoke } = useChatConnection(user?.token, handlers);

  // --- actions --------------------------------------------------------------
  const selectThread = useCallback(async (id) => {
    dispatch(threadSelected(id));
    dispatch(composerCleared());
    setTyping(false);
    await markThreadRead(id);
    setUnread((u) => ({ ...u, [id]: 0 }));
  }, [dispatch]);

  const handleTyping = (value) => {
    if (!activeId) return;
    if (!value) { invoke('OnStopTyping', activeId); return; }
    invoke('OnTyping', activeId);
    clearTimeout(stopTypingTimer.current);
    stopTypingTimer.current = setTimeout(() => invoke('OnStopTyping', activeId), TYPING_IDLE_MS);
  };

  const doSend = useCallback((args) => {
    sendMessage(args).unwrap().catch(() => {
      // The failed row stays in the cache with a retry affordance, so no snackbar here.
    });
  }, [sendMessage]);

  /** Payload comes from Composer so this component never subscribes to the draft. */
  const handleSend = ({ text, replyTo, attachment }) => {
    if (!activeId || (!text && !attachment)) return;
    const file = attachment ? takeDraftFile(attachment.key) : null;
    dispatch(composerCleared());
    invoke('OnStopTyping', activeId);
    doSend({ threadId: activeId, text, username: profile?.name, replyTo, file });
  };

  const handleRetry = (message) => {
    doSend({
      threadId: message.threadId,
      text: message.text,
      username: profile?.name,
      replyTo: message.quote,
      retryOf: message.id,
    });
  };

  const handleStartThread = async (person) => {
    dispatch(composeClosed());
    try {
      const { threadId, existed } = await startThread(person).unwrap();
      await selectThread(threadId);
      notify(existed
        ? `You already had a conversation with ${person.name}`
        : `Conversation with ${person.name} started`);
    } catch {
      notify('Could not start that conversation.');
    }
  };

  const handleSaveProfile = async (next) => {
    await saveProfile(next).unwrap();
    notify('Profile updated');
  };

  const handleUploadAvatar = async (file) => {
    const form = new FormData();
    form.append('file', file);
    try {
      await uploadAvatar(form, user.token);
      dispatch(chatApi.util.invalidateTags(['Profile']));
      notify('Avatar updated');
    } catch {
      notify('Avatar upload failed.');
    }
  };

  // --- derived --------------------------------------------------------------
  const q = query.trim().toLowerCase();
  const visibleThreads = decorated
    .filter((t) => (filter === 'unread' ? t.unread > 0 : filter === 'groups' ? t.group : true))
    .filter((t) => !q || t.name.toLowerCase().includes(q) || (t.preview ?? '').toLowerCase().includes(q));

  const shown = term && searchResults ? searchResults : messages;
  const lastOwn = [...shown].reverse().find((m) => m.own && !m.status);
  const receiptInfo = readReceiptFor(active);
  const receipt = lastOwn && receiptInfo ? { messageId: lastOwn.id, label: receiptInfo.label } : null;

  return (
    <>
      <AppShell
        pane={pane}
        sidebar={
          <ThreadList
            threads={visibleThreads}
            allThreads={decorated}
            activeId={activeId}
            query={query}
            tab={filter}
            density={density}
            loading={loadingThreads}
            profile={profile}
            unreadTotal={decorated.reduce((a, t) => a + t.unread, 0)}
            onQuery={(v) => dispatch(queryChanged(v))}
            onTab={(v) => dispatch(filterChanged(v))}
            onSelect={selectThread}
            onCompose={() => dispatch(composeOpened())}
            onSettings={() => dispatch(settingsOpened())}
            onMarkAllRead={async () => {
              await markAllThreadsRead();
              setUnread({});
              notify('All conversations marked as read');
            }}
          />
        }
      >
        <ConversationPane
          thread={active}
          messages={shown}
          loading={loadingMessages}
          density={density}
          isMobile={isMobile}
          searchOpen={searchOpen}
          searchQuery={searchQuery}
          searchCount={shown.length}
          totalCount={messages.length}
          typing={typing}
          receipt={receipt}
          onBack={() => dispatch(paneChanged('list'))}
          onToggleSearch={() => dispatch(searchToggled())}
          onSearchQuery={(v) => dispatch(searchQueryChanged(v))}
          onOpenSettings={() => dispatch(settingsOpened())}
          onSend={handleSend}
          onTyping={handleTyping}
          onReact={(messageId, emoji) => toggleReaction({ threadId: activeId, messageId, emoji })}
          onReply={(m) => dispatch(replyStarted({ author: m.author, text: m.text }))}
          onRetry={handleRetry}
          onCompose={() => dispatch(composeOpened())}
        />
      </AppShell>

      <SettingsDrawer
        open={settingsOpen}
        onClose={() => dispatch(settingsClosed())}
        profile={profile}
        members={active?.members ?? []}
        threadName={active?.name}
        onSaveProfile={handleSaveProfile}
        onUploadAvatar={handleUploadAvatar}
        onLogout={onSignOut}
        fullWidth={isMobile}
      />

      <ComposeDialog
        open={composeOpen}
        onClose={() => dispatch(composeClosed())}
        onStart={handleStartThread}
        onSearch={(t) => triggerDirectory(t).unwrap()}
        fullScreen={isMobile}
      />

      <Snackbar
        open={!!snack}
        message={snack}
        autoHideDuration={4000}
        onClose={() => dispatch(notificationDismissed())}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
      />
    </>
  );
}
