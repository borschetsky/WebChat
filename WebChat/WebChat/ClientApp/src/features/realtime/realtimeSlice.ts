import { createSlice } from '@reduxjs/toolkit';
import type { PayloadAction } from '@reduxjs/toolkit';
import type { Thread } from '@/types/models';

export type ConnectionStatus =
  'idle' | 'connecting' | 'connected' | 'reconnecting' | 'disconnected' | 'failed';

/**
 * State that only the hub can produce.
 *
 * `live` is an overlay of per-thread patches - presence, typing, last-message preview -
 * applied on top of the RTK Query thread cache. Keeping it separate means a hub event does
 * not have to invalidate and refetch the thread list just to flip a presence dot.
 */
/** Someone currently typing. The name is carried because a group has to say who. */
export interface TypingUser {
  id: string;
  name: string;
}

interface RealtimeState {
  status: ConnectionStatus;
  live: Record<string, Partial<Thread>>;
  /** MOCK: no read watermark on the server, so this is session-scoped. See services/mocks. */
  unread: Record<string, number>;
  /**
   * Who is typing, per thread. A map rather than the single `typingIn: string | null` this
   * replaces: a group can have two people typing at once, and rendering "Maya is typing…"
   * needs the name, which a thread id cannot carry.
   */
  typing: Record<string, TypingUser[]>;
}

const initialState: RealtimeState = { status: 'idle', live: {}, unread: {}, typing: {} };

const realtimeSlice = createSlice({
  name: 'realtime',
  initialState,
  reducers: {
    /** Dispatched once at boot when a session exists; the middleware opens the connection. */
    realtimeStarted() {},
    connectionStatusChanged(state, action: PayloadAction<ConnectionStatus>) {
      state.status = action.payload;
      // A dropped connection cannot deliver the matching stop event, so anyone shown as
      // typing would stay that way forever.
      if (action.payload === 'disconnected' || action.payload === 'failed') state.typing = {};
    },

    threadPatched(state, action: PayloadAction<{ threadId: string; patch: Partial<Thread> }>) {
      const { threadId, patch } = action.payload;
      state.live[threadId] = { ...state.live[threadId], ...patch };
    },

    /**
     * `userId` is optional so a message arriving can still clear the whole thread's typing
     * state without knowing who was typing.
     */
    opponentTyping(
      state,
      action: PayloadAction<{
        threadId: string;
        typing: boolean;
        userId?: string;
        username?: string;
      }>,
    ) {
      const { threadId, typing, userId, username } = action.payload;
      const current = state.typing[threadId] ?? [];

      let next: TypingUser[];
      if (!typing && !userId) {
        next = [];
      } else if (typing && userId) {
        next = current.some((u) => u.id === userId)
          ? current
          : [...current, { id: userId, name: username || 'Someone' }];
      } else if (userId) {
        next = current.filter((u) => u.id !== userId);
      } else {
        next = current;
      }

      if (next.length > 0) state.typing[threadId] = next;
      else delete state.typing[threadId];

      // `isTyping` on the live overlay stays in step - the thread list and the pane subtitle
      // both read it, and letting the two disagree is how a stuck indicator happens.
      state.live[threadId] = { ...state.live[threadId], isTyping: next.length > 0 };
    },

    unreadBumped(state, action: PayloadAction<{ threadId: string; count: number }>) {
      state.unread[action.payload.threadId] = action.payload.count;
    },
    unreadCleared(state, action: PayloadAction<string>) {
      state.unread[action.payload] = 0;
    },
    allUnreadCleared(state) {
      state.unread = {};
    },

    /** Everything hub-derived is meaningless once the session ends. */
    realtimeReset() {
      return initialState;
    },
  },
  selectors: {
    selectConnectionStatus: (state) => state.status,
    selectLivePatches: (state) => state.live,
    selectUnread: (state) => state.unread,
    selectTyping: (state) => state.typing,
  },
});

/** Who is typing in one thread. Empty array when nobody is, or when there is no thread. */
export const selectTypingUsersIn = (
  typing: Record<string, TypingUser[]>,
  threadId: string | null | undefined,
): TypingUser[] => (threadId ? (typing[threadId] ?? []) : []);

/**
 * The subtitle line. A direct thread says "typing…" because there is only one person it
 * could be; a group has to name them, which is the whole reason the name is on the wire.
 */
export const typingLabel = (users: TypingUser[], isGroup: boolean): string | null => {
  if (users.length === 0) return null;
  if (!isGroup) return 'typing…';
  if (users.length === 1) return `${users[0].name} is typing…`;
  if (users.length === 2) return `${users[0].name} and ${users[1].name} are typing…`;
  return `${users[0].name} and ${users.length - 1} others are typing…`;
};

export const {
  realtimeStarted,
  connectionStatusChanged,
  threadPatched,
  opponentTyping,
  unreadBumped,
  unreadCleared,
  allUnreadCleared,
  realtimeReset,
} = realtimeSlice.actions;

export const { selectConnectionStatus, selectLivePatches, selectUnread, selectTyping } =
  realtimeSlice.selectors;

export default realtimeSlice.reducer;
