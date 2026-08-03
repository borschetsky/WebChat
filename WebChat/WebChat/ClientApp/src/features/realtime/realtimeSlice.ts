import { createSlice } from '@reduxjs/toolkit';
import type { PayloadAction } from '@reduxjs/toolkit';
import type { Thread } from '@/types/models';

export type ConnectionStatus = 'idle' | 'connecting' | 'connected' | 'reconnecting' | 'disconnected' | 'failed';

/**
 * State that only the hub can produce.
 *
 * `live` is an overlay of per-thread patches - presence, typing, last-message preview -
 * applied on top of the RTK Query thread cache. Keeping it separate means a hub event does
 * not have to invalidate and refetch the thread list just to flip a presence dot.
 */
interface RealtimeState {
  status: ConnectionStatus;
  live: Record<string, Partial<Thread>>;
  /** MOCK: no read watermark on the server, so this is session-scoped. See services/mocks. */
  unread: Record<string, number>;
  /** Thread the other participant is currently typing in, if any. */
  typingIn: string | null;
}

const initialState: RealtimeState = { status: 'idle', live: {}, unread: {}, typingIn: null };

const realtimeSlice = createSlice({
  name: 'realtime',
  initialState,
  reducers: {
    /** Dispatched once at boot when a session exists; the middleware opens the connection. */
    realtimeStarted() {},
    connectionStatusChanged(state, action: PayloadAction<ConnectionStatus>) {
      state.status = action.payload;
      if (action.payload === 'disconnected' || action.payload === 'failed') state.typingIn = null;
    },

    threadPatched(state, action: PayloadAction<{ threadId: string; patch: Partial<Thread> }>) {
      const { threadId, patch } = action.payload;
      state.live[threadId] = { ...(state.live[threadId] ?? {}), ...patch };
    },

    opponentTyping(state, action: PayloadAction<{ threadId: string; typing: boolean }>) {
      const { threadId, typing } = action.payload;
      state.live[threadId] = { ...(state.live[threadId] ?? {}), isTyping: typing };
      if (typing) state.typingIn = threadId;
      else if (state.typingIn === threadId) state.typingIn = null;
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
    selectTypingIn: (state) => state.typingIn,
  },
});

export const {
  realtimeStarted, connectionStatusChanged, threadPatched, opponentTyping,
  unreadBumped, unreadCleared, allUnreadCleared, realtimeReset,
} = realtimeSlice.actions;

export const { selectConnectionStatus, selectLivePatches, selectUnread, selectTypingIn } =
  realtimeSlice.selectors;

export default realtimeSlice.reducer;
