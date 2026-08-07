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
} from './api-service';

import {
  toThreads,
  toMessageList,
  toMessage,
  toDirectory,
  toProfile,
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

import type { DirectoryEntry, Message, Profile, Quote, Reaction, Thread } from '@/types/models';

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
