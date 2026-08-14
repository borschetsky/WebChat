/**
 * Shapes the WebChat API actually returns, as serialized by Newtonsoft.
 *
 * These mirror the C# view models one-for-one, including their quirks - the misspelled
 * `oponentVM`/`OponentId` that runs through the whole backend, and the fact that a
 * message's `date` is only populated on the send response, never on a read.
 *
 * Anything the UI consumes is in ./models. Nothing outside services/adapters should
 * import from this file.
 */

/** AuthController login/register response. `id` is the user id the JWT carries. */
export interface AuthDataDto {
  token: string;
  tokenExpirationTime: number;
  id: string;
}

/** UsersController getprofile / update. */
export interface ProfileDto {
  id: string;
  username: string | null;
  email: string | null;
  avatarFileName: string | null;
  /** Workspace role - 'owner' | 'admin' | 'member'. Optional: a server predating #68 omits it. */
  role?: string | null;
}

/** UsersController search, HeyController getusers. */
export interface UserDto {
  id: string;
  username: string | null;
  isOnline: boolean;
  avatarFileName: string | null;
}

/** The other participant, embedded in a thread. Spelling is the backend's. */
export interface OpponentDto {
  id: string;
  username: string | null;
  email: string | null;
  avatarFileName: string | null;
  isOnline: boolean;
  isTyping: boolean;
}

export interface LastMessageDto {
  text: string | null;
  /** ISO 8601. Absent when the thread has no messages. */
  time: string | null;
  senderId: string | null;
  /** The sender's display name. The one actor never in `members` is whoever just left. */
  username?: string | null;
  /** Set when the newest row is a system message, whose `text` is null. */
  type?: string;
  systemKind?: string | null;
  systemData?: unknown;
  systemNames?: Record<string, string> | null;
}

/** HeyController getthreads. Answers 204 No Content when the user has no threads. */
export interface ThreadDto {
  id: string;
  owner: string | null;
  lastMessage: LastMessageDto | null;
  /** The other person. Null for a group, which is named rather than defined by who is not you. */
  oponentVM: OpponentDto | null;
  isGroup?: boolean;
  /** Group name. Null for a direct thread. */
  name?: string | null;
  /** Everyone but the caller: one person for a direct thread, the rest for a group. */
  members?: OpponentDto[] | null;
}

export interface MessageDto {
  id: string;
  senderId: string;
  /** Null on a system message, which stores facts rather than prose. */
  text: string | null;
  threadId: string;
  username: string | null;
  /**
   * The sender's avatar. `adapters.ts` has read this since the MUI redesign, but the server
   * only started sending it with issue #45 - until then it was `undefined` on every message
   * and every row fell back to initials.
   */
  avatarFileName?: string | null;
  /** ISO 8601 timestamp of the message. */
  time: string;
  /** 'user' or 'system'. Absent on older payloads, which are all user messages. */
  type?: string;
  /** Which system event this row records. Null on an ordinary message. */
  systemKind?: string | null;
  /** Structured facts for a system message; the client renders the sentence. */
  systemData?: unknown;
  /**
   * The user ids inside `systemData`, resolved to display names at read time.
   *
   * Resolving them client-side against the thread's current members fails for exactly the
   * people system messages are about: someone removed is no longer a member, so every
   * "You removed Maya" degraded to "You removed someone" the moment it was true.
   */
  systemNames?: Record<string, string> | null;
  /**
   * Only set on the send response and the SignalR echo - reads leave it at
   * DateTime.MinValue ("0001-01-01T00:00:00"). Do not rely on it for display.
   */
  date?: string;
}

/**
 * getmessages and thread/search return Dictionary<DateTime, MessageViewModel[]>.
 * Newtonsoft serializes the DateTime keys as ISO strings; System.Text.Json would not,
 * which is why the server stays on Newtonsoft.
 */
export type MessagesByDayDto = Record<string, MessageDto[]>;

// --- group management (SPEC-group-wire-contract.md §1, "Shared shapes") ---------

export type GroupRoleDto = 'owner' | 'admin' | 'member';
export type PermRuleDto = 'owner' | 'admins' | 'everyone';

export interface GroupMemberDto {
  userId: string;
  displayName: string | null;
  gRole: GroupRoleDto;
  joinedAt: string | null;
  /** Beyond the contract's Member shape - the drawer draws a face and a presence dot. */
  avatarFileName?: string | null;
  isOnline?: boolean;
}

export interface GroupPermsDto {
  rename: PermRuleDto;
  invite: PermRuleDto;
  remove: PermRuleDto;
}

export interface GroupDto {
  id: string;
  /** Null for an auto-named group; the client derives the title from `members`. */
  name: string | null;
  named: boolean;
  /** The concurrency token echoed back in `If-Match`. */
  version: number;
  perms: GroupPermsDto;
  /** Everyone, including the caller - unlike getthreads, which excludes them. */
  members: GroupMemberDto[];
}

/**
 * SignalR ReciveGroupEvent. One payload shape for every event, discriminated by `type`;
 * the fields beyond `groupId`/`version` depend on which.
 */
export interface GroupEventDto {
  type: string;
  groupId: string;
  version?: number;
  actorId?: string;
  /** Whole group, on `conversation.joined` - the recipient has no local copy to patch. */
  group?: GroupDto;
  name?: string | null;
  named?: boolean;
  userId?: string;
  added?: string[];
  gRole?: GroupRoleDto;
  fromUserId?: string;
  toUserId?: string;
  perms?: GroupPermsDto;
  systemMessage?: MessageDto | null;
}

/** SignalR ReciveAvatar payload. `body` is an ObjectResult, hence the nesting. */
export interface AvatarBroadcastDto {
  body: { value?: string } | string;
  uploaderId: string;
}

/** SignalR typing events. The hub sends PascalCase; some paths deliver camelCase. */
export interface TypingStatusDto {
  userId?: string;
  threadId?: string;
  /** Who is typing. A group has to name them; "typing…" alone says nothing there. */
  username?: string;
  UserId?: string;
  ThreadId?: string;
  Username?: string;
}
