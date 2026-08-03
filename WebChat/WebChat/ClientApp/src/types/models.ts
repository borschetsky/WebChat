/**
 * View models the UI consumes. Produced from ./dto by services/adapters.
 *
 * Fields the backend cannot supply are marked so it stays obvious at the type level
 * which parts of a rendered screen are real - see services/mocks.
 */

export type Presence = 'online' | 'away' | 'offline';

export interface Reaction {
  emoji: string;
  count: number;
  mine: boolean;
}

export interface Quote {
  author: string;
  text: string;
}

export interface Attachment {
  name: string;
  /** Pre-formatted, e.g. "PDF · 1.5 MB". */
  meta: string;
}

export interface ThreadMember {
  id?: string;
  name: string;
  role: string;
  presence: Presence;
}

export interface Thread {
  id: string;
  opponentId?: string;
  name: string;
  avatarFileName: string | null;
  color: string;
  /** MOCK: the API only knows connected/disconnected, so 'away' is unreachable. */
  presence: Presence;
  isTyping: boolean;
  preview: string;
  /** Pre-formatted for display, not a timestamp. */
  time: string;
  lastMessageAt: string | null;
  /** MOCK: no group threads exist - Thread has a single OponentId. */
  group: boolean;
  /** MOCK: no read watermark on the server; session-scoped. */
  unread: number;
  /** MOCK: derived, since a thread is always 1:1. */
  members: ThreadMember[];
}

export interface Message {
  id: string;
  threadId: string;
  authorId: string;
  author: string;
  color: string;
  avatarFileName?: string | null;
  own: boolean;
  text: string;
  /** Pre-formatted for display. */
  time: string;
  sentAt: string | null;
  /** ISO date key of the day this message belongs to. */
  dayKey?: string | null;
  /** First message of its day - renders the day separator. */
  startsDay?: boolean;

  /** MOCK: no reaction storage. */
  reactions: Reaction[];
  /** MOCK: Message has no ReplyToMessageId. */
  quote: Quote | null;
  /** MOCK: no message attachment storage. */
  attachment: Attachment | null;

  /**
   * Delivery state for optimistic sends. Absent on messages loaded from the server.
   * 'failed' rows stay in the list so the text is not lost and a retry can be offered.
   */
  status?: 'sending' | 'sent' | 'failed';
}

export interface DirectoryEntry {
  id: string;
  name: string;
  avatarFileName: string | null;
  color: string;
  presence: Presence;
  role: string;
}

export interface Profile {
  id: string;
  name: string;
  email: string;
  avatarFileName: string | null;
  color: string;
}

/** What the login flow persists to localStorage under 'user-data'. */
export interface SessionUser {
  token: string;
  tokenExpirationTime: number;
  id: string;
}

export type ThemeMode = 'light' | 'dark';
export type Density = 'comfortable' | 'compact';
