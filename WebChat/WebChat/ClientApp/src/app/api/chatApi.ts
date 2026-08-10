import { createApi, fakeBaseQuery } from '@reduxjs/toolkit/query/react';
import { createEntityAdapter } from '@reduxjs/toolkit';
import type { EntityState } from '@reduxjs/toolkit';
import type { RootState } from '@/app/store';
import type { GroupDto } from '@/types/dto';
import type {
  DirectoryEntry,
  Group,
  GroupPerms,
  GroupRole,
  Message,
  Profile,
  Quote,
  Thread,
} from '@/types/models';
import * as chat from '@/services/chat-service';
import { toGroup } from '@/services/adapters';

/**
 * RTK Query over the existing chat-service.
 *
 * fakeBaseQuery + per-endpoint queryFn rather than fetchBaseQuery: the service layer
 * already owns URLs, auth headers, DTO adaptation and the mock seam. Going through it
 * keeps mocked features indistinguishable from real ones and means a feature gaining a
 * backend is still a change to chat-service and mocks alone.
 *
 * The token is read from the store inside each queryFn, so no component has to thread it
 * through as an argument.
 */

const tokenOf = (getState: () => unknown): string => {
  const token = (getState() as RootState).auth.user?.token;
  if (!token) throw new Error('Not authenticated');
  return token;
};

/**
 * Wraps a service call so a rejection becomes an RTK Query error rather than a throw.
 * The explicit union is what makes this assignable to queryFn's QueryReturnValue.
 */
type Result<T> = { data: T; error?: undefined } | { data?: undefined; error: unknown };

const run = async <T>(fn: () => Promise<T>): Promise<Result<T>> => {
  try {
    return { data: await fn() };
  } catch (error) {
    const err = error as { message?: string; response?: { status?: number; data?: unknown } };
    return {
      error: {
        status: err.response?.status ?? 'CUSTOM_ERROR',
        data: err.response?.data ?? err.message,
      },
    };
  }
};

/**
 * Messages are normalized so an arriving SignalR message or an optimistic send is an O(1)
 * upsert rather than a scan of the array. Sorted by send time, with optimistic messages
 * (which have no server timestamp yet) falling to the end.
 */
export const messagesAdapter = createEntityAdapter<Message>({
  sortComparer: (a, b) => {
    const at = a.sentAt ? Date.parse(a.sentAt) : Number.MAX_SAFE_INTEGER;
    const bt = b.sentAt ? Date.parse(b.sentAt) : Number.MAX_SAFE_INTEGER;
    return at - bt;
  },
});

export type MessagesCache = EntityState<Message, string>;

export interface SendArgs {
  threadId: string;
  text: string;
  username?: string;
  replyTo?: Quote | null;
  file?: File | null;
  /** Set when retrying, so the failed row is replaced rather than duplicated. */
  retryOf?: string;
}

/**
 * The wire contract's error envelope, as `run` above surfaces it.
 * `group` is attached to every 409 precisely so the client can reconcile without refetching.
 */
interface GroupErrorBody {
  error?: { code?: string; message?: string; group?: GroupDto };
}

export const groupErrorCode = (error: unknown): string | undefined =>
  ((error as { data?: GroupErrorBody } | undefined)?.data as GroupErrorBody | undefined)?.error
    ?.code;

export const groupErrorMessage = (error: unknown): string | undefined =>
  ((error as { data?: GroupErrorBody } | undefined)?.data as GroupErrorBody | undefined)?.error
    ?.message;

/** The current group a 409 carries, or null if this is not a version conflict. */
const conflictGroup = (error: unknown): Group | null => {
  const body = (error as { data?: GroupErrorBody } | undefined)?.data as GroupErrorBody | undefined;
  if (body?.error?.code !== 'VERSION_CONFLICT' || !body.error.group) return null;
  return toGroup(body.error.group);
};

/**
 * Runs a group mutation under the spec's concurrency rule (§4).
 *
 * A stale version is not a user-visible failure - nobody caused it and nobody cares - so a
 * conflict is retried **once** against the version the server just handed back. A second
 * conflict is genuine contention: stop, and let the caller adopt the returned group. The
 * error still surfaces rather than being reported as success, because the intent did not
 * land; it is the UI that decides a VERSION_CONFLICT is not worth a snackbar.
 */
const mutateGroup = async (
  version: number,
  attempt: (version: number) => Promise<chat.GroupMutation>,
): Promise<Result<chat.GroupMutation>> => {
  const first = await run(() => attempt(version));
  if (first.error === undefined) return first;

  const current = conflictGroup(first.error);
  if (!current) return first;

  return run(() => attempt(current.version));
};

/**
 * Shared aftermath for every group mutation.
 *
 * On success the server's group replaces the cached one and the system message is inserted
 * into the open conversation - the hub broadcast excludes the actor, so this is the only
 * thing that puts the row in front of the person who caused it.
 *
 * On a conflict that survived the retry, the group the error carries is adopted anyway. The
 * mutation still reports failure; the cache still tells the truth.
 */
async function onGroupMutation(
  arg: { groupId: string },
  {
    dispatch,
    queryFulfilled,
  }: {
    // Not AppDispatch: the store's type is derived from this api's reducer and middleware,
    // so naming it here makes chatApi reference itself through the store and TypeScript
    // gives up on inferring either. A structural dispatch breaks the cycle.
    dispatch: (action: unknown) => unknown;
    queryFulfilled: Promise<{ data: chat.GroupMutation }>;
  },
) {
  const adopt = (group: Group) =>
    dispatch(chatApi.util.upsertQueryData('getGroup', arg.groupId, group));

  try {
    const { data } = await queryFulfilled;
    adopt(data.group);

    if (data.systemMessage) {
      dispatch(
        chatApi.util.updateQueryData('getMessages', arg.groupId, (draft) => {
          messagesAdapter.upsertOne(draft, data.systemMessage as Message);
        }),
      );
    }
  } catch (rejection) {
    const current = conflictGroup((rejection as { error?: unknown })?.error);
    if (current) adopt(current);
  }
}

export const chatApi = createApi({
  reducerPath: 'chatApi',
  baseQuery: fakeBaseQuery(),
  tagTypes: ['Threads', 'Messages', 'Profile', 'Group'],
  endpoints: (build) => ({
    getProfile: build.query<Profile, void>({
      queryFn: (_arg, api) => run(() => chat.loadProfile(tokenOf(api.getState))),
      providesTags: ['Profile'],
    }),

    getThreads: build.query<Thread[], void>({
      queryFn: (_arg, api) => run(() => chat.loadThreads(tokenOf(api.getState))),
      providesTags: ['Threads'],
    }),

    getMessages: build.query<MessagesCache, string>({
      queryFn: async (threadId, api): Promise<Result<MessagesCache>> => {
        const res = await run(() => chat.loadMessages(threadId, tokenOf(api.getState)));
        if (res.error !== undefined) return { error: res.error };
        const initial: MessagesCache = messagesAdapter.getInitialState();
        return { data: messagesAdapter.setAll(initial, res.data ?? []) };
      },
      providesTags: (_r, _e, threadId) => [{ type: 'Messages' as const, id: threadId }],
    }),

    searchThread: build.query<Message[], { threadId: string; term: string }>({
      queryFn: ({ threadId, term }, api) =>
        run(() => chat.searchInThread(threadId, term, tokenOf(api.getState))),
    }),

    searchDirectory: build.query<DirectoryEntry[], string>({
      queryFn: (term, api) => run(() => chat.searchDirectory(term, tokenOf(api.getState))),
    }),

    sendMessage: build.mutation<Message, SendArgs>({
      queryFn: (args, api) =>
        run(() =>
          chat.sendMessage(
            {
              threadId: args.threadId,
              text: args.text,
              username: args.username,
              replyTo: args.replyTo ?? null,
              file: args.file ?? null,
            },
            tokenOf(api.getState),
          ),
        ),

      /**
       * Optimistic insert, with the row left in place and marked failed on error so the UI
       * can offer a retry. The handoff's definition of done asks for exactly this; the
       * reference app had no failure state at all.
       */
      async onQueryStarted(args, { dispatch, queryFulfilled, getState }) {
        const tempId =
          args.retryOf ?? `pending-${Date.now()}-${Math.random().toString(36).slice(2)}`;
        const me = (getState() as RootState).auth.user;

        const optimistic: Message = {
          id: tempId,
          threadId: args.threadId,
          authorId: me?.id ?? '',
          author: args.username ?? 'You',
          color: '',
          own: true,
          text: args.text || args.file?.name || '',
          time: '',
          sentAt: null,
          reactions: [],
          quote: args.replyTo ?? null,
          attachment: args.file ? { name: args.file.name, meta: 'Sending…' } : null,
          status: 'sending',
        };

        const patch = dispatch(
          chatApi.util.updateQueryData('getMessages', args.threadId, (draft) => {
            messagesAdapter.upsertOne(draft, optimistic);
          }),
        );

        try {
          const { data: sent } = await queryFulfilled;
          // Swap the placeholder for the server's message, which carries the real id.
          dispatch(
            chatApi.util.updateQueryData('getMessages', args.threadId, (draft) => {
              messagesAdapter.removeOne(draft, tempId);
              messagesAdapter.upsertOne(draft, { ...sent, status: 'sent' });
            }),
          );
        } catch {
          // Keep the row so the text is not lost, and flag it for retry.
          patch.undo();
          dispatch(
            chatApi.util.updateQueryData('getMessages', args.threadId, (draft) => {
              messagesAdapter.upsertOne(draft, { ...optimistic, status: 'failed' });
            }),
          );
        }
      },
      invalidatesTags: ['Threads'],
    }),

    startThread: build.mutation<{ threadId: string; existed: boolean }, DirectoryEntry>({
      queryFn: (person, api) => run(() => chat.startThreadWith(person, tokenOf(api.getState))),
      invalidatesTags: ['Threads'],
    }),

    startGroup: build.mutation<{ threadId: string }, { name: string; members: DirectoryEntry[] }>({
      queryFn: ({ name, members }, api) =>
        run(() => chat.startGroup(name, members, tokenOf(api.getState))),
      invalidatesTags: ['Threads'],
    }),

    /**
     * The open group's management state. Fetched per group rather than folded into
     * getThreads: `version` is a concurrency token, and one going stale in a list of forty
     * cached rows is worse than useless.
     */
    getGroup: build.query<Group, string>({
      queryFn: (groupId, api) => run(() => chat.loadGroup(groupId, tokenOf(api.getState))),
      providesTags: (_r, _e, groupId) => [{ type: 'Group' as const, id: groupId }],
    }),

    renameGroup: build.mutation<
      chat.GroupMutation,
      { groupId: string; name: string | null; version: number }
    >({
      queryFn: ({ groupId, name, version }, api) =>
        mutateGroup(version, (v) => chat.renameGroupTo(groupId, name, v, tokenOf(api.getState))),
      onQueryStarted: onGroupMutation,
      // The thread list shows the group's title, so it is stale the moment this lands.
      invalidatesTags: ['Threads'],
    }),

    addGroupMembers: build.mutation<
      chat.GroupMutation,
      { groupId: string; userIds: string[]; version: number }
    >({
      queryFn: ({ groupId, userIds, version }, api) =>
        mutateGroup(version, (v) =>
          chat.addMembersToGroup(groupId, userIds, v, tokenOf(api.getState)),
        ),
      onQueryStarted: onGroupMutation,
      invalidatesTags: ['Threads'],
    }),

    removeGroupMember: build.mutation<
      chat.GroupMutation,
      { groupId: string; userId: string; version: number }
    >({
      queryFn: ({ groupId, userId, version }, api) =>
        mutateGroup(version, (v) =>
          chat.removeMemberFromGroup(groupId, userId, v, tokenOf(api.getState)),
        ),
      onQueryStarted: onGroupMutation,
      invalidatesTags: ['Threads'],
    }),

    setGroupRole: build.mutation<
      chat.GroupMutation,
      { groupId: string; userId: string; gRole: GroupRole; version: number }
    >({
      queryFn: ({ groupId, userId, gRole, version }, api) =>
        mutateGroup(version, (v) =>
          chat.setMemberRole(groupId, userId, gRole, v, tokenOf(api.getState)),
        ),
      onQueryStarted: onGroupMutation,
    }),

    transferGroupOwnership: build.mutation<
      chat.GroupMutation,
      { groupId: string; userId: string; version: number }
    >({
      queryFn: ({ groupId, userId, version }, api) =>
        mutateGroup(version, (v) =>
          chat.transferOwnership(groupId, userId, v, tokenOf(api.getState)),
        ),
      onQueryStarted: onGroupMutation,
    }),

    setGroupPermissions: build.mutation<
      chat.GroupMutation,
      { groupId: string; perms: Partial<GroupPerms>; version: number }
    >({
      queryFn: ({ groupId, perms, version }, api) =>
        mutateGroup(version, (v) =>
          chat.changeGroupPermissions(groupId, perms, v, tokenOf(api.getState)),
        ),
      onQueryStarted: onGroupMutation,
    }),

    saveProfile: build.mutation<Profile, Profile>({
      queryFn: (profile, api) => run(() => chat.saveProfile(profile, tokenOf(api.getState))),
      invalidatesTags: ['Profile'],
    }),

    toggleReaction: build.mutation<
      Message['reactions'],
      { threadId: string; messageId: string; emoji: string }
    >({
      // MOCK: no reaction endpoint - see services/mocks. Patched into the cache directly,
      // so the UI path is identical to a real one.
      queryFn: ({ messageId, emoji }) => run(() => chat.toggleReaction(messageId, emoji)),
      async onQueryStarted({ threadId, messageId }, { dispatch, queryFulfilled }) {
        try {
          const { data: reactions } = await queryFulfilled;
          dispatch(
            chatApi.util.updateQueryData('getMessages', threadId, (draft) => {
              messagesAdapter.updateOne(draft, { id: messageId, changes: { reactions } });
            }),
          );
        } catch {
          /* the mock cannot fail; nothing to roll back */
        }
      },
    }),
  }),
});

export const {
  useGetProfileQuery,
  useGetThreadsQuery,
  useGetMessagesQuery,
  useSearchThreadQuery,
  // The dialog subscribes to the term, so it gets caching and a shared in-flight request.
  // The lazy variant is gone with the hand-rolled search it existed for.
  useSearchDirectoryQuery,
  useSendMessageMutation,
  useStartThreadMutation,
  useStartGroupMutation,
  useGetGroupQuery,
  useRenameGroupMutation,
  useAddGroupMembersMutation,
  useRemoveGroupMemberMutation,
  useSetGroupRoleMutation,
  useTransferGroupOwnershipMutation,
  useSetGroupPermissionsMutation,
  useSaveProfileMutation,
  useToggleReactionMutation,
} = chatApi;
