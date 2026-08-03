import { createSlice } from '@reduxjs/toolkit';
import type { PayloadAction } from '@reduxjs/toolkit';

export type ThreadFilter = 'all' | 'unread' | 'groups';
export type MobilePane = 'list' | 'chat';

/**
 * Transient view state: what is selected, what is open, what is being searched.
 *
 * Deliberately excludes theme mode and density, which are user preferences owned by
 * ThemeModeProvider and persisted to localStorage, and excludes server data, which moves
 * to RTK Query in Phase 3.
 */
interface UiState {
  activeThreadId: string | null;
  /** Sidebar filter box. */
  query: string;
  filter: ThreadFilter;
  /** In-thread search. */
  searchOpen: boolean;
  searchQuery: string;
  settingsOpen: boolean;
  composeOpen: boolean;
  /** Which pane is visible below the md breakpoint. */
  pane: MobilePane;
  snack: string;
}

const initialState: UiState = {
  activeThreadId: null,
  query: '',
  filter: 'all',
  searchOpen: false,
  searchQuery: '',
  settingsOpen: false,
  composeOpen: false,
  pane: 'list',
  snack: '',
};

const uiSlice = createSlice({
  name: 'ui',
  initialState,
  reducers: {
    /** Selecting a thread resets everything scoped to the previous one. */
    threadSelected(state, action: PayloadAction<string>) {
      state.activeThreadId = action.payload;
      state.pane = 'chat';
      state.searchOpen = false;
      state.searchQuery = '';
    },
    queryChanged(state, action: PayloadAction<string>) {
      state.query = action.payload;
    },
    filterChanged(state, action: PayloadAction<ThreadFilter>) {
      state.filter = action.payload;
    },
    searchToggled(state) {
      state.searchOpen = !state.searchOpen;
      state.searchQuery = '';
    },
    searchQueryChanged(state, action: PayloadAction<string>) {
      state.searchQuery = action.payload;
    },
    settingsOpened(state) { state.settingsOpen = true; },
    settingsClosed(state) { state.settingsOpen = false; },
    composeOpened(state) { state.composeOpen = true; },
    composeClosed(state) { state.composeOpen = false; },
    paneChanged(state, action: PayloadAction<MobilePane>) {
      state.pane = action.payload;
    },
    notified(state, action: PayloadAction<string>) {
      state.snack = action.payload;
    },
    notificationDismissed(state) { state.snack = ''; },
  },
  selectors: {
    selectActiveThreadId: (state) => state.activeThreadId,
    selectQuery: (state) => state.query,
    selectFilter: (state) => state.filter,
    selectSearchOpen: (state) => state.searchOpen,
    selectSearchQuery: (state) => state.searchQuery,
    selectSettingsOpen: (state) => state.settingsOpen,
    selectComposeOpen: (state) => state.composeOpen,
    selectPane: (state) => state.pane,
    selectSnack: (state) => state.snack,
  },
});

export const {
  threadSelected, queryChanged, filterChanged,
  searchToggled, searchQueryChanged,
  settingsOpened, settingsClosed, composeOpened, composeClosed,
  paneChanged, notified, notificationDismissed,
} = uiSlice.actions;

export const {
  selectActiveThreadId, selectQuery, selectFilter,
  selectSearchOpen, selectSearchQuery,
  selectSettingsOpen, selectComposeOpen, selectPane, selectSnack,
} = uiSlice.selectors;

export default uiSlice.reducer;
