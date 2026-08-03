import { configureStore } from '@reduxjs/toolkit';
import { chatApi } from '@/app/api/chatApi';
import authReducer, { readStoredUser } from '@/features/auth/authSlice';
import type { AuthState } from '@/features/auth/authSlice';
import composerReducer from '@/features/composer/composerSlice';
import uiReducer from '@/features/ui/uiSlice';
import realtimeReducer from '@/features/realtime/realtimeSlice';
import { realtimeMiddleware } from '@/features/realtime/signalrMiddleware';

/**
 * Exported so tests can build an isolated store with a chosen session.
 *
 * The stored session is hydrated here rather than inside the slice's initialState.
 * Reading localStorage at module scope captures it once for the lifetime of the module,
 * so a second store could never be given a different session - which made the slice
 * untestable and hid a real coupling.
 */
export const makeStore = (auth?: AuthState) =>
  configureStore({
    reducer: {
      auth: authReducer,
      composer: composerReducer,
      ui: uiReducer,
      realtime: realtimeReducer,
      [chatApi.reducerPath]: chatApi.reducer,
    },
    preloadedState: { auth: auth ?? { user: readStoredUser(), busy: false } },
    // The realtime listener must run before the API middleware so a hub event that
    // patches the cache is not racing an in-flight query.
    middleware: (getDefault) =>
      getDefault().prepend(realtimeMiddleware.middleware).concat(chatApi.middleware),
  });

export const store = makeStore();

export type AppStore = typeof store;
export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
