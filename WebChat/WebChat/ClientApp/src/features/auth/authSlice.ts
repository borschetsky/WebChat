import { createSlice } from '@reduxjs/toolkit';
import type { PayloadAction } from '@reduxjs/toolkit';
import type { SessionUser } from '@/types/models';

const STORAGE_KEY = 'user-data';

/** The session is persisted here rather than in a component, so a reload rehydrates it. */
export const readStoredUser = (): SessionUser | null => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as SessionUser) : null;
  } catch {
    return null;
  }
};

const writeStoredUser = (user: SessionUser | null) => {
  try {
    if (user) localStorage.setItem(STORAGE_KEY, JSON.stringify(user));
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* private mode - the session just will not survive a reload */
  }
};

interface AuthState {
  user: SessionUser | null;
  /** True while a sign-in or sign-up request is in flight. */
  busy: boolean;
}

const initialState: AuthState = {
  user: readStoredUser(),
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

export const { authBusy, signedIn, signedOut } = authSlice.actions;
export const { selectUser, selectToken, selectUserId, selectIsAuthenticated, selectAuthBusy } =
  authSlice.selectors;
export default authSlice.reducer;
