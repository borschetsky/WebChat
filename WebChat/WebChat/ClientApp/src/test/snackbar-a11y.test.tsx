import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { Provider } from 'react-redux';
import CssBaseline from '@mui/material/CssBaseline';
import App from '@/app/App';
import { ThemeModeProvider } from '@/theme/ThemeModeProvider';

/**
 * The app's snackbar, and the modal that used to swallow it - issue #96.
 *
 * A MUI `Drawer` is a modal, and while one is open MUI marks every other child of `body`
 * `aria-hidden="true"`. The app's single `Snackbar` used to render inline in `ChatApp`'s own
 * tree, so a snackbar raised from inside the settings drawer landed in that hidden subtree:
 * on screen and clickable with a mouse, absent from the accessibility tree, and - because the
 * drawer also traps focus - unreachable by keyboard. Measured in a browser at 390px on the
 * "Profile updated" toast before a line of this was written.
 *
 * That was survivable only while every such snackbar was message-only. #89 made one carry an
 * Undo, and worked around this by closing the drawer on removal; #96 is the general fix, so
 * these tests drive the real `App` rather than a component in isolation - the defect is a
 * property of the whole rendered document, not of a component.
 *
 * The stubs are the two things jsdom cannot do: a SignalR socket and an HTTP request.
 */
vi.mock('@microsoft/signalr', () => ({
  HubConnectionState: { Connected: 'Connected' },
  HubConnectionBuilder: class {
    withUrl() {
      return this;
    }
    withAutomaticReconnect() {
      return this;
    }
    build() {
      return {
        state: 'Disconnected',
        on() {},
        off() {},
        onreconnecting() {},
        onreconnected() {},
        onclose() {},
        start: () => Promise.resolve(),
        stop: () => Promise.resolve(),
        invoke: () => Promise.resolve(),
      };
    }
  },
}));

const removeAvatar = vi.fn(async () => ({ data: { avatarFileName: null, restorable: true } }));
const restoreAvatar = vi.fn(async () => ({ data: { avatarFileName: 'current.jpg' } }));

vi.mock('@/services', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services')>();
  return {
    ...actual,
    removeAvatar: (...args: unknown[]) => removeAvatar(...(args as [])),
    restoreAvatar: (...args: unknown[]) => restoreAvatar(...(args as [])),
  };
});

vi.mock('@/services/chat-service', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services/chat-service')>();
  return {
    ...actual,
    loadProfile: vi.fn().mockResolvedValue({
      id: 'me',
      name: 'Test User',
      email: 't@e.com',
      avatarFileName: 'current.jpg',
      hasOriginalPhoto: true,
      avatarCrop: { x: 12.5, y: 25, width: 50, height: 50 },
      color: '#1976d2',
      role: 'member',
    }),
    saveProfile: vi.fn(async (next: unknown) => next),
    loadThreads: vi.fn().mockResolvedValue([]),
    loadMessages: vi.fn().mockResolvedValue([]),
  };
});

import { makeStore } from '@/app/store';
import { notified, notifiedWithUndo, settingsOpened } from '@/features/ui/uiSlice';

const renderApp = () => {
  const store = makeStore();
  render(
    <Provider store={store}>
      <ThemeModeProvider>
        <CssBaseline />
        <App />
      </ThemeModeProvider>
    </Provider>,
  );
  return store;
};

/** Signed in, with the settings drawer open. Its entry point is not what this file is about. */
const openSettings = async () => {
  localStorage.setItem(
    'user-data',
    JSON.stringify({ token: 'jwt', tokenExpirationTime: 1, id: 'me' }),
  );
  const store = renderApp();
  await screen.findByText('Test User');
  store.dispatch(settingsOpened());
  await screen.findByText('Profile & settings');
  return store;
};

/** The assertion the whole issue is about: nothing between the node and `body` hides it. */
const hiddenAncestorOf = (el: HTMLElement | null) => el?.closest('[aria-hidden="true"]') ?? null;

describe('snackbars raised while a modal is open', () => {
  beforeEach(() => {
    localStorage.clear();
    window.history.pushState({}, '', '/');
    removeAvatar.mockClear();
    restoreAvatar.mockClear();
  });

  /**
   * **The reproduction.** Exactly what was measured in the browser: change the display name,
   * press Save changes, and read the snackbar while the drawer is still open.
   */
  it('a message-only snackbar is not inside an aria-hidden subtree', async () => {
    await openSettings();

    fireEvent.change(screen.getByLabelText('Display name'), { target: { value: 'Renamed' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    const snack = await screen.findByText('Profile updated');
    expect(hiddenAncestorOf(snack)).toBeNull();
  });

  /**
   * **The guard that stops the test above being vacuous.** If jsdom did not reproduce MUI's
   * `aria-hidden` sweep at all, the reproduction would pass against the broken code too. It
   * does reproduce it: with the drawer open, the app behind it *is* hidden, and must stay so -
   * hiding the rest of the document is the modal doing its job.
   */
  it('the app behind the drawer is still hidden, which is the modal working', async () => {
    await openSettings();

    // Queried by placeholder, not by role: a role query would not find it *because* it is
    // hidden, which is the very thing being asserted.
    const behind = screen.getByPlaceholderText('Search people and messages');
    expect(hiddenAncestorOf(behind)).not.toBeNull();
  });

  /**
   * The other order, which the portal alone does not fix: the snackbar is already on screen
   * when the drawer opens, so MUI's sweep finds its node and hides it. Nothing self-corrects
   * for the seconds the toast has left.
   */
  it('stays visible to assistive tech when the drawer opens on top of it', async () => {
    localStorage.setItem(
      'user-data',
      JSON.stringify({ token: 'jwt', tokenExpirationTime: 1, id: 'me' }),
    );
    const store = renderApp();
    await screen.findByText('Test User');

    store.dispatch(notified('All conversations marked as read'));
    const snack = await screen.findByText('All conversations marked as read');
    expect(hiddenAncestorOf(snack)).toBeNull();

    store.dispatch(settingsOpened());
    await screen.findByText('Profile & settings');

    await waitFor(() => expect(hiddenAncestorOf(snack)).toBeNull());
  });
});

describe('an actionable snackbar raised while the settings drawer is open', () => {
  beforeEach(() => {
    localStorage.clear();
    window.history.pushState({}, '', '/');
    removeAvatar.mockClear();
    restoreAvatar.mockClear();
  });

  const removePhoto = async () => {
    fireEvent.click(await screen.findByRole('button', { name: /profile photo options/i }));
    fireEvent.click(await screen.findByRole('menuitem', { name: /remove photo/i }));
    await waitFor(() => expect(removeAvatar).toHaveBeenCalled());
  };

  /**
   * **By role, with the drawer still open.** `getByRole` reads the accessibility tree, so an
   * Undo inside an `aria-hidden` subtree is not found - which is the difference between a
   * button a mouse can hit and a button that exists.
   */
  it('puts its action in the accessibility tree', async () => {
    await openSettings();
    await removePhoto();

    const undo = await screen.findByRole('button', { name: /undo/i });
    expect(hiddenAncestorOf(undo)).toBeNull();
    expect(screen.getByText('Profile & settings')).toBeInTheDocument();
  });

  /**
   * Being in the accessibility tree is not enough on its own: the drawer is a focus trap, and
   * MUI's sentinel nodes send Tab back to the top of the trap rather than out of it. So the
   * only way a keyboard user reaches a time-limited action outside the trap is for the action
   * to be given focus. It is given focus *because* focus was trapped - see AppSnackbar.
   */
  it('takes focus, because a trapped keyboard user cannot tab out to it', async () => {
    await openSettings();
    await removePhoto();

    const undo = await screen.findByRole('button', { name: /undo/i });
    await waitFor(() => expect(document.activeElement).toBe(undo));
  });

  /** And the drawer does not fight it back, which is what would happen with the trap intact. */
  it('keeps focus while it is up', async () => {
    await openSettings();
    await removePhoto();

    const undo = await screen.findByRole('button', { name: /undo/i });
    await waitFor(() => expect(document.activeElement).toBe(undo));
    await new Promise((resolve) => setTimeout(resolve, 120));
    expect(document.activeElement).toBe(undo);
  });

  /**
   * **A guard, not a reproduction.** Holding focus pauses MUI's auto-hide timer, so an
   * actionable toast waits for the user rather than expiring under them - which makes the way
   * out matter. `Snackbar` already closes on Escape from a document-level listener, so the key
   * works with focus parked outside the drawer; what is ours is that declining the Undo puts
   * the user back in the drawer instead of on `body` with nothing focused.
   */
  it('is dismissed by Escape, which hands focus back to the drawer', async () => {
    await openSettings();
    const menuButton = await screen.findByRole('button', { name: /profile photo options/i });
    await removePhoto();

    const undo = await screen.findByRole('button', { name: /undo/i });
    await waitFor(() => expect(document.activeElement).toBe(undo));

    fireEvent.keyDown(document, { key: 'Escape' });

    await waitFor(() => expect(screen.queryByText('Profile photo removed')).toBeNull());
    expect(restoreAvatar).not.toHaveBeenCalled();
    expect(menuButton.closest('[role="presentation"]')).toContainElement(
      document.activeElement as HTMLElement,
    );
  });

  /** Focus is borrowed, not taken: pressing Undo hands it back to where it came from. */
  it('returns focus to the drawer when it goes', async () => {
    await openSettings();
    const menuButton = await screen.findByRole('button', { name: /profile photo options/i });
    await removePhoto();

    fireEvent.click(await screen.findByRole('button', { name: /undo/i }));

    await waitFor(() => expect(restoreAvatar).toHaveBeenCalled());
    await waitFor(() => expect(document.activeElement).not.toBe(document.body));
    expect(menuButton.closest('[role="presentation"]')).toContainElement(
      document.activeElement as HTMLElement,
    );
  });

  /**
   * The counterpart, and the reason the focus move is conditional: with no modal open nothing
   * is trapping focus, the snackbar sits at the end of the document like any other toast, and
   * stealing focus from whatever the user was doing would be the rude version of this fix.
   */
  it('does not take focus when no modal is trapping it', async () => {
    localStorage.setItem(
      'user-data',
      JSON.stringify({ token: 'jwt', tokenExpirationTime: 1, id: 'me' }),
    );
    const store = renderApp();
    await screen.findByText('Test User');

    const search = screen.getByPlaceholderText('Search people and messages');
    search.focus();

    store.dispatch(notifiedWithUndo({ message: 'Profile photo removed', undo: 'avatarRemoved' }));
    const undo = await screen.findByRole('button', { name: /undo/i });

    expect(hiddenAncestorOf(undo)).toBeNull();
    expect(document.activeElement).toBe(search);
  });
});

/**
 * The tests above prove the portal is what puts a toast in the accessibility tree; this one is
 * what stops the next screen doing without it.
 *
 * Two sightings, and the second is why this exists. #96 fixed the app shell and left
 * `AdminConsole`'s own inline `AdminSnackbar` untouched, carrying the identical defect for
 * another six weeks - not because anyone disagreed, but because nothing connected the two. A
 * third screen that reaches for MUI's Snackbar directly gets the bug for free and no test will
 * notice, since the defect is a property of the rendered document rather than of the component.
 *
 * Same shape as the `inputProps` scan in `mui-drift.test.tsx`, and for the same reason:
 * per-component testing cannot find code that has not been written yet, and scanning the
 * source can. Note that nothing here exempts this file - the sentence above deliberately
 * avoids writing the tag it scans for, because an exemption is a hole the next one falls
 * through.
 */
describe('there is one snackbar implementation', () => {
  const OWNER = join('src', 'app', 'AppSnackbar.tsx');

  const sourceFiles = (dir: string): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) return sourceFiles(path);
      return /\.(jsx?|tsx?)$/.test(entry.name) ? [path] : [];
    });

  it('renders MUI Snackbar in AppSnackbar and nowhere else in src', () => {
    const src = join(__dirname, '..');

    const offenders = sourceFiles(src)
      .map((file) => file.slice(src.length + 1))
      .filter((relative) => join('src', relative) !== OWNER)
      .filter((relative) => /<Snackbar[\s/>]/.test(readFileSync(join(src, relative), 'utf8')));

    // Render `AppSnackbar` instead. It carries the portal, the `aria-hidden` strip and the
    // conditional focus hand-off, and takes `anchorOrigin` if the placement differs.
    expect(offenders).toEqual([]);
  });
});
