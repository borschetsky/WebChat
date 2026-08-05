import type { Attachment, Quote, Reaction, Thread } from '@/types/models';

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
  { key: 'notifications', needs: 'a notification feed; presence "away" also has no server representation' },
];

export const isMocked = (key: string): boolean => MOCK_FEATURES.some((f) => f.key === key);

// ---------------------------------------------------------------------------
// Reactions
// MOCK BECAUSE: no reaction storage. Toggling is real, persistence is not.
// ---------------------------------------------------------------------------
const reactions = new Map<string, Reaction[]>(); // messageId -> [{ emoji, count, mine }]

export const mockMessageReactions = (messageId: string): Reaction[] => reactions.get(messageId) ?? [];

export const mockToggleReaction = (messageId: string, emoji: string): Reaction[] => {
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
const quotes = new Map<string, Quote>(); // messageId -> { author, text }

export const mockMessageQuote = (messageId: string): Quote | null => quotes.get(messageId) ?? null;

export const mockAttachQuote = (messageId: string, quote: Quote | null): Quote | null => {
  if (quote) quotes.set(messageId, { author: quote.author, text: quote.text.slice(0, 120) });
  return quotes.get(messageId) ?? null;
};

// ---------------------------------------------------------------------------
// Attachments
// MOCK BECAUSE: only avatar upload exists; there is no message attachment storage.
// ---------------------------------------------------------------------------
const attachments = new Map<string, Attachment>(); // messageId -> { name, meta }

export const mockMessageAttachment = (messageId: string): Attachment | null => attachments.get(messageId) ?? null;

export const mockAttachFile = (messageId: string, file: { name?: string; size?: number } | null): Attachment | null => {
  if (!file) return null;
  const kb = Math.max(1, Math.round((file.size ?? 0) / 1024));
  const meta = `${(file.name?.split('.').pop() ?? 'FILE').toUpperCase()} · ${kb >= 1024 ? `${(kb / 1024).toFixed(1)} MB` : `${kb} KB`}`;
  const attachment = { name: file.name ?? 'attachment', meta };
  attachments.set(messageId, attachment);
  return attachment;
};

// ---------------------------------------------------------------------------
// Unread counts
// MOCK BECAUSE: no read watermark. Always zero, so badges render but never lie about
// a count the server could contradict.
// ---------------------------------------------------------------------------
const unread = new Map<string, number>(); // threadId -> number

export const mockThreadUnread = (threadId: string): number => unread.get(threadId) ?? 0;
export const mockMarkThreadRead = (threadId: string): void => { unread.set(threadId, 0); };
export const mockBumpUnread = (threadId: string): number => {
  const next = (unread.get(threadId) ?? 0) + 1;
  unread.set(threadId, next);
  return next;
};
export const mockMarkAllRead = () => { unread.clear(); };

// ---------------------------------------------------------------------------
// Read receipts
// MOCK BECAUSE: nothing tracks whether the opponent has read a message.
//
// Gated on presence rather than returned unconditionally. The design shows "Read by …"
// under the last own message, but claiming someone read it while they are visibly offline
// is the most actively misleading thing this mock layer could do - it contradicts the
// presence dot two rows above. Online is at least consistent with what the user can see.
// ---------------------------------------------------------------------------
export const mockReadReceipt = (thread: Thread | null | undefined): { read: boolean; label: string } | null => {
  if (!thread || thread.presence !== 'online') return null;
  return { read: true, label: `Read by ${thread.name?.split(' ')[0] ?? 'them'}` };
};

// Group threads were mocked here until the server gained a participants collection. Both
// mockThreadIsGroup and mockThreadMembers are gone: adapters.ts now reads isGroup and
// members straight off the ThreadViewModel. This was the first mocked feature to become
// real, which is why MOCK_FEATURES is one shorter than it was.

// ---------------------------------------------------------------------------
// Notifications
// MOCK BECAUSE: no notification feed on the server.
// ---------------------------------------------------------------------------
export const mockNotifications = () => [];
