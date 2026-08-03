import { configureStore } from '@reduxjs/toolkit';
import { chatApi } from '@/app/api/chatApi';
import authReducer from '@/features/auth/authSlice';
import composerReducer from '@/features/composer/composerSlice';
import uiReducer from '@/features/ui/uiSlice';

export const store = configureStore({
  reducer: {
    auth: authReducer,
    composer: composerReducer,
    ui: uiReducer,
    [chatApi.reducerPath]: chatApi.reducer,
  },
  middleware: (getDefault) => getDefault().concat(chatApi.middleware),
});

export type AppStore = typeof store;
export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
