// MOCK LAYER
// ==========
// The MUI redesign specifies features the WebChat backend does not implement. Rather than
// scatter fake data through components, every unbacked feature is served from here behind
// the same call signature the real thing would have.
//
// Each export is prefixed `mock` and carries a MOCK BECAUSE note stating what is missing
// server-side. To make one real: implement the endpoint, replace the single call site in
// api-service.js / adapters.js, and delete the mock. No component should need to change.
//
// State is in-memory and intentionally resets on reload - it must not be mistaken for
// persisted data.

/** What is fake, and what each needs on the server. Rendered by the dev-only mock banner. */
export const MOCK_FEATURES = [
  { key: 'reactions', needs: 'MessageReaction table + POST/DELETE /api/thread/messages/{id}/reactions' },
  { key: 'readReceipts', needs: 'per-user read watermark per thread' },
  { key: 'unreadCounts', needs: 'the same read watermark, aggregated' },
  { key: 'attachments', needs: 'message attachment storage (only avatar upload exists today)' },
  { key: 'replyQuote', needs: 'Message.ReplyToMessageId column' },
  { key: 'groupThreads', needs: 'Thread.OponentId -> a participants collection (there is already a TODO in HeyController)' },
  { key: 'notifications', needs: 'a notification feed; presence "away" also has no server representation' },
];

export const isMocked = (key) => MOCK_FEATURES.some((f) => f.key === key);

// ---------------------------------------------------------------------------
// Reactions
// MOCK BECAUSE: no reaction storage. Toggling is real, persistence is not.
// ---------------------------------------------------------------------------
const reactions = new Map(); // messageId -> [{ emoji, count, mine }]

export const mockMessageReactions = (messageId) => reactions.get(messageId) ?? [];

export const mockToggleReaction = (messageId, emoji) => {
  const current = [...(reactions.get(messageId) ?? [])];
  const i = current.findIndex((r) => r.emoji === emoji);

  if (i === -1) {
    current.push({ emoji, count: 1, mine: true });
  } else if (current[i].mine) {
    const count = current[i].count - 1;
    if (count <= 0) current.splice(i, 1);
    else current[i] = { ...current[i], count, mine: false };
  } else {
    current[i] = { ...current[i], count: current[i].count + 1, mine: true };
  }

  reactions.set(messageId, current);
  return current;
};

// ---------------------------------------------------------------------------
// Reply / quote
// MOCK BECAUSE: Message has no ReplyToMessageId, so a quote cannot round-trip.
// The quote survives only for the lifetime of the page.
// ---------------------------------------------------------------------------
const quotes = new Map(); // messageId -> { author, text }

export const mockMessageQuote = (messageId) => quotes.get(messageId) ?? null;

export const mockAttachQuote = (messageId, quote) => {
  if (quote) quotes.set(messageId, { author: quote.author, text: quote.text.slice(0, 120) });
  return quotes.get(messageId) ?? null;
};

// ---------------------------------------------------------------------------
// Attachments
// MOCK BECAUSE: only avatar upload exists; there is no message attachment storage.
// ---------------------------------------------------------------------------
const attachments = new Map(); // messageId -> { name, meta }

export const mockMessageAttachment = (messageId) => attachments.get(messageId) ?? null;

export const mockAttachFile = (messageId, file) => {
  if (!file) return null;
  const kb = Math.max(1, Math.round((file.size ?? 0) / 1024));
  const meta = `${(file.name?.split('.').pop() ?? 'FILE').toUpperCase()} · ${kb >= 1024 ? `${(kb / 1024).toFixed(1)} MB` : `${kb} KB`}`;
  attachments.set(messageId, { name: file.name ?? 'attachment', meta });
  return attachments.get(messageId);
};

// ---------------------------------------------------------------------------
// Unread counts
// MOCK BECAUSE: no read watermark. Always zero, so badges render but never lie about
// a count the server could contradict.
// ---------------------------------------------------------------------------
const unread = new Map(); // threadId -> number

export const mockThreadUnread = (threadId) => unread.get(threadId) ?? 0;
export const mockMarkThreadRead = (threadId) => { unread.set(threadId, 0); };
export const mockBumpUnread = (threadId) => {
  unread.set(threadId, (unread.get(threadId) ?? 0) + 1);
  return unread.get(threadId);
};
export const mockMarkAllRead = () => { unread.clear(); };

// ---------------------------------------------------------------------------
// Read receipts
// MOCK BECAUSE: nothing tracks whether the opponent has read a message.
// ---------------------------------------------------------------------------
export const mockReadReceipt = (thread) => {
  if (!thread) return null;
  return { read: true, label: `Read by ${thread.name?.split(' ')[0] ?? 'them'}` };
};

// ---------------------------------------------------------------------------
// Group threads
// MOCK BECAUSE: Thread has a single OponentId. Every thread is 1:1 today; the design's
// group affordances (Groups filter, member list) have nothing real to show.
// ---------------------------------------------------------------------------
export const mockThreadIsGroup = () => false;

export const mockThreadMembers = (threadId, opponent) => [
  { id: opponent?.id, name: opponent?.username ?? 'Unknown', role: 'Direct message', presence: opponent?.isOnline ? 'online' : 'offline' },
  { id: 'me', name: 'You', role: 'You', presence: 'online' },
];

// ---------------------------------------------------------------------------
// Notifications
// MOCK BECAUSE: no notification feed on the server.
// ---------------------------------------------------------------------------
export const mockNotifications = () => [];
