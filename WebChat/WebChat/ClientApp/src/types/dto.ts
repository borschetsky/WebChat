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
  text: string;
  threadId: string;
  username: string | null;
  /** ISO 8601 timestamp of the message. */
  time: string;
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

/** SignalR ReciveAvatar payload. `body` is an ObjectResult, hence the nesting. */
export interface AvatarBroadcastDto {
  body: { value?: string } | string;
  uploaderId: string;
}

/** SignalR typing events. The hub sends PascalCase; some paths deliver camelCase. */
export interface TypingStatusDto {
  userId?: string;
  threadId?: string;
  UserId?: string;
  ThreadId?: string;
}
