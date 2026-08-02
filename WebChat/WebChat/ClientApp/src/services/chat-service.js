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

export { MOCK_FEATURES };

/** getthreads answers 204 No Content when the user has no threads. */
const dataOrEmpty = (res, fallback) => (res && res.status !== 204 && res.data ? res.data : fallback);

// --- real, backed by the API -------------------------------------------------

export const loadThreads = async (token) => toThreads(dataOrEmpty(await getThreads(token), []));

export const loadMessages = async (threadId, token) =>
  toMessageList(dataOrEmpty(await getMessages(threadId, token), {}));

export const searchInThread = async (threadId, term, token) =>
  toMessageList(dataOrEmpty(await searchForMessageInThread(token, { term, threadId }), {}));

export const searchDirectory = async (term, token) =>
  toDirectory(dataOrEmpty(await searchForUsers(term, token), []));

export const loadProfile = async (token) => toProfile(dataOrEmpty(await getProfile(token), {}));

export const saveProfile = async (profile, token) => {
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
export const startThreadWith = async (person, token) => {
  try {
    const res = await createThread({ Id: person.id, Username: person.name }, token);
    return { threadId: res.data?.threadId ?? res.data?.ThreadId, existed: false };
  } catch (err) {
    const existing = err.response?.data?.threadId ?? err.response?.data?.ThreadId;
    if (existing) return { threadId: existing, existed: true };
    throw err;
  }
};

/**
 * Sends a message. `replyTo` and `file` are accepted so call sites read as though the
 * backend supported them; both are attached client-side via the mock layer.
 */
export const sendMessage = async ({ threadId, text, username, replyTo = null, file = null }, token) => {
  const meId = currentUserId();

  const res = await sendMessageToApi(
    { senderId: meId, text, threadId, username },
    token
  );

  const message = toMessage(res.data, meId);

  // MOCK: neither survives a reload - see mocks.js
  if (replyTo) mockAttachQuote(message.id, replyTo);
  if (file) mockAttachFile(message.id, file);

  return {
    ...message,
    quote: replyTo ? { author: replyTo.author, text: replyTo.text.slice(0, 120) } : null,
    attachment: file ? mockAttachFile(message.id, file) : null,
  };
};

// --- mocked ------------------------------------------------------------------

export const toggleReaction = async (messageId, emoji) => mockToggleReaction(messageId, emoji);
export const markThreadRead = async (threadId) => mockMarkThreadRead(threadId);
export const markAllThreadsRead = async () => mockMarkAllRead();
export const noteIncomingMessage = (threadId) => mockBumpUnread(threadId);
export const readReceiptFor = (thread) => mockReadReceipt(thread);
export const loadNotifications = async () => mockNotifications();
