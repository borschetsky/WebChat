import { describe, it, expect, beforeEach } from 'vitest';
import { makeStore } from './store';
import {
  threadSelected,
  queryChanged,
  filterChanged,
  searchToggled,
  searchQueryChanged,
  settingsOpened,
  settingsClosed,
  notified,
  notificationDismissed,
  selectActiveThreadId,
  selectFilter,
  selectSearchOpen,
  selectSearchQuery,
  selectSettingsOpen,
  selectPane,
  selectSnack,
} from '@/features/ui/uiSlice';
import {
  draftChanged,
  attachmentAdded,
  composerCleared,
  registerDraftFile,
  takeDraftFile,
  selectDraft,
  selectReplyTo,
  selectAttachment,
  selectCanSend,
} from '@/features/composer/composerSlice';
import {
  signedIn,
  signedOut,
  selectUserId,
  selectIsAuthenticated,
  selectUser,
} from '@/features/auth/authSlice';
import {
  threadPatched,
  opponentTyping,
  unreadBumped,
  unreadCleared,
  allUnreadCleared,
  realtimeReset,
  selectLivePatches,
  selectUnread,
  selectTyping,
  selectTypingUsersIn,
} from '@/features/realtime/realtimeSlice';

const session = { token: 'jwt', tokenExpirationTime: 1, id: 'u1' };

describe('uiSlice', () => {
  it('resets thread-scoped state in a single action', () => {
    const store = makeStore();
    store.dispatch(searchToggled());
    store.dispatch(searchQueryChanged('pineapple'));
    expect(selectSearchOpen(store.getState())).toBe(true);

    // One action, not four setState calls that could interleave.
    store.dispatch(threadSelected('t1'));
    const s = store.getState();
    expect(selectActiveThreadId(s)).toBe('t1');
    expect(selectSearchOpen(s)).toBe(false);
    expect(selectSearchQuery(s)).toBe('');
    expect(selectPane(s)).toBe('chat');
  });

  it('tracks filters, overlays and the snackbar', () => {
    const store = makeStore();
    store.dispatch(filterChanged('unread'));
    store.dispatch(queryChanged('maya'));
    store.dispatch(settingsOpened());
    expect(selectFilter(store.getState())).toBe('unread');
    expect(selectSettingsOpen(store.getState())).toBe(true);

    store.dispatch(settingsClosed());
    store.dispatch(notified('saved'));
    expect(selectSnack(store.getState())).toBe('saved');
    store.dispatch(notificationDismissed());
    expect(selectSnack(store.getState())).toBe('');
  });
});

describe('composerSlice', () => {
  it('treats whitespace as not sendable', () => {
    const store = makeStore();
    expect(selectCanSend(store.getState())).toBe(false);
    store.dispatch(draftChanged('   '));
    expect(selectCanSend(store.getState())).toBe(false);
    store.dispatch(draftChanged('hi'));
    expect(selectCanSend(store.getState())).toBe(true);
  });

  it('makes an attachment alone sendable', () => {
    const store = makeStore();
    store.dispatch(attachmentAdded(registerDraftFile(new File(['x'], 'a.pdf'))));
    expect(selectCanSend(store.getState())).toBe(true);
  });

  it('keeps File objects out of the store and releases them on clear', () => {
    const store = makeStore();
    const meta = registerDraftFile(new File(['x'], 'brief.pdf'));
    store.dispatch(attachmentAdded(meta));

    // Only serializable metadata is in state; the File is reachable by key.
    expect(selectAttachment(store.getState())).toEqual(meta);
    expect(JSON.stringify(store.getState().composer)).toContain('brief.pdf');
    expect(takeDraftFile(meta.key)).toBeInstanceOf(File);

    store.dispatch(composerCleared());
    expect(takeDraftFile(meta.key)).toBeUndefined();
    expect(selectDraft(store.getState())).toBe('');
    expect(selectReplyTo(store.getState())).toBeNull();
  });

  /**
   * The whole reason composerSlice exists: typing must not touch any other slice, or
   * components subscribed to them re-render and the memoized message list is defeated.
   */
  it('leaves every other slice reference identical while typing', () => {
    const store = makeStore();
    const before = store.getState();
    store.dispatch(draftChanged('typing a long message'));
    const after = store.getState();

    expect(after.composer).not.toBe(before.composer);
    expect(after.ui).toBe(before.ui);
    expect(after.auth).toBe(before.auth);
    expect(after.realtime).toBe(before.realtime);
  });
});

describe('authSlice', () => {
  beforeEach(() => localStorage.clear());

  it('round-trips the session through localStorage', () => {
    const store = makeStore();
    store.dispatch(signedIn(session));
    expect(selectUserId(store.getState())).toBe('u1');
    expect(selectIsAuthenticated(store.getState())).toBe(true);
    expect(JSON.parse(localStorage.getItem('user-data')!).id).toBe('u1');

    store.dispatch(signedOut());
    expect(selectUser(store.getState())).toBeNull();
    expect(localStorage.getItem('user-data')).toBeNull();
  });

  /**
   * Regression: initialState used to call readStoredUser() at module scope, so the session
   * was captured once for the module's lifetime and a second store could never differ.
   */
  it('hydrates per store, not once per module', () => {
    localStorage.setItem('user-data', JSON.stringify(session));
    expect(selectUserId(makeStore().getState())).toBe('u1');

    localStorage.removeItem('user-data');
    expect(selectUser(makeStore().getState())).toBeNull();

    // And an explicitly injected session wins over storage.
    const injected = makeStore({ user: { ...session, id: 'other' }, busy: false });
    expect(selectUserId(injected.getState())).toBe('other');
  });
});

describe('realtimeSlice', () => {
  it('accumulates per-thread patches rather than replacing them', () => {
    const store = makeStore();
    store.dispatch(threadPatched({ threadId: 't1', patch: { presence: 'online' } }));
    store.dispatch(threadPatched({ threadId: 't1', patch: { preview: 'hey' } }));
    expect(selectLivePatches(store.getState()).t1).toEqual({ presence: 'online', preview: 'hey' });
  });

  it('tracks who is typing, per thread', () => {
    const store = makeStore();
    store.dispatch(
      opponentTyping({ threadId: 't1', typing: true, userId: 'u1', username: 'Maya' }),
    );
    expect(selectTypingUsersIn(selectTyping(store.getState()), 't1')).toEqual([
      { id: 'u1', name: 'Maya' },
    ]);

    // A group can have two people typing at once, which the old single-thread-id state
    // could not represent at all.
    store.dispatch(
      opponentTyping({ threadId: 't1', typing: true, userId: 'u2', username: 'Tomás' }),
    );
    expect(selectTypingUsersIn(selectTyping(store.getState()), 't1')).toHaveLength(2);

    store.dispatch(opponentTyping({ threadId: 't1', typing: false, userId: 'u1' }));
    expect(selectTypingUsersIn(selectTyping(store.getState()), 't1')).toEqual([
      { id: 'u2', name: 'Tomás' },
    ]);

    store.dispatch(opponentTyping({ threadId: 't1', typing: false, userId: 'u2' }));
    expect(selectTypingUsersIn(selectTyping(store.getState()), 't1')).toEqual([]);
    expect(selectLivePatches(store.getState()).t1?.isTyping).toBe(false);
  });

  it('clears unread per thread and in bulk', () => {
    const store = makeStore();
    store.dispatch(unreadBumped({ threadId: 't1', count: 3 }));
    store.dispatch(unreadBumped({ threadId: 't2', count: 1 }));
    store.dispatch(unreadCleared('t1'));
    expect(selectUnread(store.getState())).toEqual({ t1: 0, t2: 1 });

    store.dispatch(allUnreadCleared());
    expect(selectUnread(store.getState())).toEqual({});
  });

  it('discards everything hub-derived on reset', () => {
    const store = makeStore();
    store.dispatch(threadPatched({ threadId: 't1', patch: { presence: 'online' } }));
    store.dispatch(unreadBumped({ threadId: 't1', count: 2 }));
    store.dispatch(realtimeReset());
    expect(selectLivePatches(store.getState())).toEqual({});
    expect(selectUnread(store.getState())).toEqual({});
  });
});
