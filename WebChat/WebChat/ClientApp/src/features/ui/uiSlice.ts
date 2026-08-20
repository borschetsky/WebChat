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
  /** The conversation info drawer: members, roles, permissions. */
  infoOpen: boolean;
  /** Which pane is visible below the md breakpoint. */
  pane: MobilePane;
  snack: string;
  /** Which reversible action the current snackbar is about, or '' for none. See {@link SnackUndo}. */
  snackUndo: SnackUndo | '';
}

/**
 * The reversible actions a snackbar can offer to undo.
 *
 * A **key**, not a callback, because the store has to stay serializable - a function in state
 * breaks RTK's own dev-mode checks, persistence and time travel. `ChatApp` maps the key to a
 * handler, which is also the layer that has the token and the service to call.
 *
 * Deliberately a union of one. #89 needs exactly this one; making it a string would let a typo
 * produce a snackbar with a button that silently does nothing.
 */
export type SnackUndo = 'avatarRemoved';

const initialState: UiState = {
  activeThreadId: null,
  query: '',
  filter: 'all',
  searchOpen: false,
  searchQuery: '',
  settingsOpen: false,
  composeOpen: false,
  infoOpen: false,
  pane: 'list',
  snack: '',
  snackUndo: '',
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
    /**
     * The open thread went away - the viewer left it, or was removed from it. Everything
     * scoped to it goes with it, including the info drawer, whose queries would otherwise
     * start answering 403.
     *
     * Says nothing itself. "You left the group" and "you are no longer a member" are the
     * same state arrived at very differently, and only the caller knows which happened.
     */
    threadClosed(state, action: PayloadAction<string>) {
      if (state.activeThreadId !== action.payload) return;
      state.activeThreadId = null;
      state.pane = 'list';
      state.searchOpen = false;
      state.searchQuery = '';
      state.infoOpen = false;
    },
    infoOpened(state) {
      state.infoOpen = true;
    },
    infoClosed(state) {
      state.infoOpen = false;
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
    settingsOpened(state) {
      state.settingsOpen = true;
    },
    settingsClosed(state) {
      state.settingsOpen = false;
    },
    composeOpened(state) {
      state.composeOpen = true;
    },
    composeClosed(state) {
      state.composeOpen = false;
    },
    paneChanged(state, action: PayloadAction<MobilePane>) {
      state.pane = action.payload;
    },
    notified(state, action: PayloadAction<string>) {
      state.snack = action.payload;
      // Cleared, and this is the load-bearing line rather than housekeeping: without it the
      // next ordinary message inherits the previous one's Undo button, offering to reverse
      // something the user has stopped thinking about.
      state.snackUndo = '';
    },
    /**
     * A notification that can be taken back - the handoff's "snackbar with working Undo".
     */
    notifiedWithUndo(state, action: PayloadAction<{ message: string; undo: SnackUndo }>) {
      state.snack = action.payload.message;
      state.snackUndo = action.payload.undo;
    },
    notificationDismissed(state) {
      state.snack = '';
      state.snackUndo = '';
    },
  },
  selectors: {
    selectActiveThreadId: (state) => state.activeThreadId,
    selectQuery: (state) => state.query,
    selectFilter: (state) => state.filter,
    selectSearchOpen: (state) => state.searchOpen,
    selectSearchQuery: (state) => state.searchQuery,
    selectSettingsOpen: (state) => state.settingsOpen,
    selectComposeOpen: (state) => state.composeOpen,
    selectInfoOpen: (state) => state.infoOpen,
    selectPane: (state) => state.pane,
    selectSnack: (state) => state.snack,
    selectSnackUndo: (state) => state.snackUndo,
  },
});

export const {
  threadSelected,
  queryChanged,
  filterChanged,
  searchToggled,
  searchQueryChanged,
  settingsOpened,
  settingsClosed,
  composeOpened,
  composeClosed,
  threadClosed,
  infoOpened,
  infoClosed,
  paneChanged,
  notified,
  notifiedWithUndo,
  notificationDismissed,
} = uiSlice.actions;

export const {
  selectActiveThreadId,
  selectQuery,
  selectFilter,
  selectSearchOpen,
  selectSearchQuery,
  selectSettingsOpen,
  selectComposeOpen,
  selectInfoOpen,
  selectPane,
  selectSnack,
  selectSnackUndo,
} = uiSlice.selectors;

export default uiSlice.reducer;
