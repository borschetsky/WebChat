import { createSlice } from '@reduxjs/toolkit';
import type { PayloadAction } from '@reduxjs/toolkit';
import type { SessionUser } from '@/types/models';

const STORAGE_KEY = 'user-data';

/** True for the app's own password sessions, including ones stored before `provider` existed. */
export const isLocalSession = (user: SessionUser | null | undefined): boolean =>
  !!user && (user.provider === undefined || user.provider === 'local');

/**
 * The session is persisted here rather than in a component, so a reload rehydrates it.
 *
 * Only a local session comes back. An external one is never written (below), and one found
 * anyway is ignored: its token expires within the hour, and the provider's own cache is what
 * restores that session on load - with a token that is actually current.
 */
export const readStoredUser = (): SessionUser | null => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const user = raw ? (JSON.parse(raw) as SessionUser) : null;
    return isLocalSession(user) ? user : null;
  } catch {
    return null;
  }
};

const writeStoredUser = (user: SessionUser | null) => {
  try {
    if (user && isLocalSession(user)) localStorage.setItem(STORAGE_KEY, JSON.stringify(user));
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* private mode - the session just will not survive a reload */
  }
};

export interface AuthState {
  user: SessionUser | null;
  /** True while a sign-in or sign-up request is in flight. */
  busy: boolean;
}

/**
 * Starts signed out. The stored session is injected as preloadedState when the store is
 * created, rather than read here - evaluating localStorage at module scope captures it
 * once for the lifetime of the module, so a second store could never be given a different
 * session. That made the slice untestable and is the kind of hidden coupling that only
 * shows up later.
 */
const initialState: AuthState = {
  user: null,
  busy: false,
};

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    authBusy(state, action: PayloadAction<boolean>) {
      state.busy = action.payload;
    },
    signedIn(state, action: PayloadAction<SessionUser>) {
      state.user = action.payload;
      state.busy = false;
      writeStoredUser(action.payload);
    },
    /**
     * A fresh token for the *same* session - an external provider's silent renewal.
     *
     * Deliberately not `signedIn`: the realtime middleware reconnects the hub on signedIn, and
     * renewing every hour must not drop and re-open the socket. The hub reads the token from
     * the store whenever it next needs one.
     */
    tokenRefreshed(state, action: PayloadAction<{ token: string; tokenExpirationTime: number }>) {
      if (!state.user) return;
      state.user.token = action.payload.token;
      state.user.tokenExpirationTime = action.payload.tokenExpirationTime;
      writeStoredUser(state.user);
    },
    signedOut(state) {
      state.user = null;
      state.busy = false;
      writeStoredUser(null);
    },
  },
  selectors: {
    selectUser: (state) => state.user,
    selectToken: (state) => state.user?.token ?? null,
    selectUserId: (state) => state.user?.id ?? null,
    selectIsAuthenticated: (state) => state.user !== null,
    selectAuthBusy: (state) => state.busy,
  },
});

export const { authBusy, signedIn, signedOut, tokenRefreshed } = authSlice.actions;
export const { selectUser, selectToken, selectUserId, selectIsAuthenticated, selectAuthBusy } =
  authSlice.selectors;
export default authSlice.reducer;
