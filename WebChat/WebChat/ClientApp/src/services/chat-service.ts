// The single surface the redesigned UI talks to.
//
// Components must not call api-service or mocks directly: everything goes through here,
// so real and mocked features are indistinguishable at the call site. When a mocked
// feature gains a backend, only this file and ./mocks change.

import {
  getThreads,
  getMessages,
  searchForMessageInThread,
  sendMessageToApi,
  searchForUsers,
  createThread,
  createGroup,
  getProfile,
  updateUsersProfile,
  getGroup,
  renameGroup,
  addGroupMembers,
  removeGroupMember,
  setGroupRole,
  transferGroupOwnership,
  setGroupPermissions,
} from './api-service';

import {
  toThreads,
  toMessageList,
  toMessage,
  toDirectory,
  toProfile,
  toGroup,
  currentUserId,
} from './adapters';

import {
  mockToggleReaction,
  mockAttachQuote,
  mockAttachFile,
  mockMarkThreadRead,
  mockMarkAllRead,
  mockBumpUnread,
  mockReadReceipt,
  mockNotifications,
  MOCK_FEATURES,
} from './mocks';

import type {
  DirectoryEntry,
  Group,
  GroupPerms,
  GroupRole,
  Message,
  Profile,
  Quote,
  Reaction,
  Thread,
} from '@/types/models';

export { MOCK_FEATURES };

interface AxiosLike<T> {
  status: number;
  data: T;
}

/** getthreads answers 204 No Content when the user has no threads. */
const dataOrEmpty = <T>(res: AxiosLike<T> | undefined, fallback: T): T =>
  res && res.status !== 204 && res.data ? res.data : fallback;

// --- real, backed by the API -------------------------------------------------

export const loadThreads = async (token: string): Promise<Thread[]> =>
  toThreads(dataOrEmpty(await getThreads(token), []));

export const loadMessages = async (threadId: string, token: string): Promise<Message[]> =>
  toMessageList(dataOrEmpty(await getMessages(threadId, token), {}));

export const searchInThread = async (
  threadId: string,
  term: string,
  token: string,
): Promise<Message[]> =>
  toMessageList(dataOrEmpty(await searchForMessageInThread(token, { term, threadId }), {}));

export const searchDirectory = async (term: string, token: string): Promise<DirectoryEntry[]> =>
  toDirectory(dataOrEmpty(await searchForUsers(term, token), []));

export const loadProfile = async (token: string): Promise<Profile> =>
  toProfile(dataOrEmpty(await getProfile(token), {} as never));

export const saveProfile = async (profile: Profile, token: string): Promise<Profile> => {
  await updateUsersProfile(token, {
    id: profile.id,
    username: profile.name,
    email: profile.email,
    avatarFileName: profile.avatarFileName,
  });
  return profile;
};

/**
 * createthread answers 400 with an existing threadId when a thread already exists, which
 * is a normal outcome rather than an error - surface it as such.
 */
export const startThreadWith = async (
  person: DirectoryEntry,
  token: string,
): Promise<{ threadId: string; existed: boolean }> => {
  try {
    const res = await createThread({ Id: person.id, Username: person.name }, token);
    return { threadId: res.data?.threadId ?? res.data?.ThreadId, existed: false };
  } catch (error) {
    const err = error as { response?: { data?: { threadId?: string; ThreadId?: string } } };
    const existing = err.response?.data?.threadId ?? err.response?.data?.ThreadId;
    if (existing) return { threadId: existing, existed: true };
    throw error;
  }
};

/**
 * Creates a named group.
 *
 * Unlike startThreadWith there is no "already exists" case: two people may legitimately
 * share several groups, so the server never refuses one as a duplicate.
 *
 * Only the other members are sent - the server adds the creator, so a client cannot make a
 * group it is not in.
 */
export const startGroup = async (
  name: string,
  members: DirectoryEntry[],
  token: string,
): Promise<{ threadId: string }> => {
  const res = await createGroup(
    name,
    members.map((m) => m.id),
    token,
  );
  return { threadId: res.data?.threadId ?? res.data?.ThreadId };
};

// --- group management ---------------------------------------------------------
//
// Each of these returns the group as the server now holds it, so a caller always has a
// fresh `version` for its next `If-Match`. A refusal is thrown, not returned: the error
// envelope carries the current group on a 409, and swallowing it here would leave the
// conflict-reconciliation path in chatApi with nothing to reconcile against.

/** What every group mutation answers with: the new state, and the row it wrote to history. */
export interface GroupMutation {
  group: Group;
  /**
   * The actor's own copy of the system message. The hub broadcast deliberately excludes
   * them - they have this - so without it the person who did the thing is the one person
   * who does not see it appear until a refetch.
   */
  systemMessage: Message | null;
}

interface GroupResponse {
  group?: unknown;
  systemMessage?: unknown;
  systemMessages?: unknown[];
}

const toMutation = (data: GroupResponse | undefined): GroupMutation => {
  // The batch add answers with `systemMessages` (plural, one per batch); the rest answer
  // with `systemMessage`. Normalising here keeps that off every call site.
  const raw = data?.systemMessage ?? data?.systemMessages?.[0] ?? null;
  return {
    group: toGroup(data?.group as never),
    systemMessage: raw ? toMessage(raw as never) : null,
  };
};

export const loadGroup = async (groupId: string, token: string): Promise<Group> =>
  toGroup((await getGroup(groupId, token)).data?.group);

/** Pass null to revert to auto-naming. */
export const renameGroupTo = async (
  groupId: string,
  name: string | null,
  version: number,
  token: string,
): Promise<GroupMutation> => toMutation((await renameGroup(groupId, name, version, token)).data);

export const addMembersToGroup = async (
  groupId: string,
  userIds: string[],
  version: number,
  token: string,
): Promise<GroupMutation> =>
  toMutation((await addGroupMembers(groupId, userIds, version, token)).data);

export const removeMemberFromGroup = async (
  groupId: string,
  userId: string,
  version: number,
  token: string,
): Promise<GroupMutation> =>
  toMutation((await removeGroupMember(groupId, userId, version, token)).data);

export const setMemberRole = async (
  groupId: string,
  userId: string,
  gRole: GroupRole,
  version: number,
  token: string,
): Promise<GroupMutation> =>
  toMutation((await setGroupRole(groupId, userId, gRole, version, token)).data);

export const transferOwnership = async (
  groupId: string,
  userId: string,
  version: number,
  token: string,
): Promise<GroupMutation> =>
  toMutation((await transferGroupOwnership(groupId, userId, version, token)).data);

export const changeGroupPermissions = async (
  groupId: string,
  perms: Partial<GroupPerms>,
  version: number,
  token: string,
): Promise<GroupMutation> =>
  toMutation((await setGroupPermissions(groupId, perms, version, token)).data);

export interface SendMessageArgs {
  threadId: string;
  text: string;
  username?: string;
  replyTo?: Quote | null;
  file?: File | null;
}

/**
 * Sends a message. `replyTo` and `file` are accepted so call sites read as though the
 * backend supported them; both are attached client-side via the mock layer.
 */
export const sendMessage = async (
  { threadId, text, username, replyTo = null, file = null }: SendMessageArgs,
  token: string,
): Promise<Message> => {
  const meId = currentUserId();
  const res = await sendMessageToApi({ senderId: meId, text, threadId, username }, token);
  const message = toMessage(res.data, meId);

  // MOCK: neither survives a reload - see mocks.ts
  if (replyTo) mockAttachQuote(message.id, replyTo);
  const attachment = file ? mockAttachFile(message.id, file) : null;

  return {
    ...message,
    quote: replyTo ? { author: replyTo.author, text: replyTo.text.slice(0, 120) } : null,
    attachment,
  };
};

// --- mocked ------------------------------------------------------------------

export const toggleReaction = async (messageId: string, emoji: string): Promise<Reaction[]> =>
  mockToggleReaction(messageId, emoji);

export const markThreadRead = async (threadId: string): Promise<void> =>
  mockMarkThreadRead(threadId);
export const markAllThreadsRead = async (): Promise<void> => mockMarkAllRead();
export const noteIncomingMessage = (threadId: string): number => mockBumpUnread(threadId);
export const readReceiptFor = (thread: Thread | null | undefined) => mockReadReceipt(thread);
export const loadNotifications = async () => mockNotifications();
