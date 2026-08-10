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
  /** Uploaded avatar filename; null draws initials. Sent by getthreads for every member. */
  avatarFileName: string | null;
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

export type GroupRole = 'owner' | 'admin' | 'member';
export type PermRule = 'owner' | 'admins' | 'everyone';

export interface GroupMember {
  id: string;
  name: string;
  gRole: GroupRole;
  joinedAt: string | null;
  avatarFileName: string | null;
  presence: Presence;
  color: string;
}

export interface GroupPerms {
  rename: PermRule;
  invite: PermRule;
  remove: PermRule;
}

/**
 * A group's management state: roles, the permission map, and the concurrency token.
 *
 * Separate from `Thread` on purpose. A thread row is list data - fetched for every
 * conversation on load and never version-checked - whereas this is fetched for the one
 * group whose drawer is open, and `version` is only meaningful while something is watching
 * it. Putting `version` on `Thread` would give every row a token going stale in the cache.
 */
export interface Group {
  id: string;
  /** Null when auto-named. `title` is what to display. */
  name: string | null;
  named: boolean;
  title: string;
  version: number;
  perms: GroupPerms;
  members: GroupMember[];
  /** The viewer's own role, lifted out of `members` - every capability check needs it. */
  myRole: GroupRole | null;
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
   * True for a system message - rendered as a centered divider row with no author, and
   * excluded from the author prefix in thread-list previews.
   */
  system?: boolean;

  /** Which system event this records, when `system` is true. */
  systemKind?: string | null;

  /** Structured facts behind a system message. The sentence is rendered, never stored. */
  systemData?: unknown;

  /**
   * The ids in `systemData`, resolved to names by the server at read time.
   *
   * Preferred over the thread's member list, which cannot name the one person a removal or
   * a departure is about - they are no longer in it.
   */
  systemNames?: Record<string, string> | null;

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
