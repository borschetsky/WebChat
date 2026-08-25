import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { Provider } from 'react-redux';
import CssBaseline from '@mui/material/CssBaseline';
import App from '@/app/App';
import { ThemeModeProvider } from '@/theme/ThemeModeProvider';

/**
 * Remove photo, end to end through the real app - issue #89.
 *
 * **This file is about reachability, which is where this repo keeps losing features.** The
 * admin console answered every request for five slices while being unreachable from a browser
 * (#82), and #84's entire crop dialog shipped unwired. A unit test of the drawer would pass
 * against a Remove button no `ChatApp` ever handed a callback to, and a unit test of the
 * reducer would pass against a snackbar that never drew the Undo. So this drives `App`: press
 * the button that exists on screen, and assert that the HTTP call happened and that Undo -
 * *the actual button in the snackbar* - reverses it.
 *
 * The stubs are the two things jsdom cannot do: a SignalR socket and an HTTP request. The
 * removal path itself is entirely real - `ChatApp`, `SettingsDrawer`, `uiSlice`, the store.
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

// The avatar calls move multipart bodies and raw bytes, so they are the documented exception
// to the chat-service seam: `ChatApp` imports them straight from the barrel.
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
    loadThreads: vi.fn().mockResolvedValue([]),
    loadMessages: vi.fn().mockResolvedValue([]),
  };
});

import { makeStore } from '@/app/store';
import { settingsOpened } from '@/features/ui/uiSlice';

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

/**
 * Signed in, with the settings drawer open. The drawer's entry point is the header avatar and
 * is not what this file is about, so it is opened by dispatching - everything after that is
 * the real component tree.
 */
const openSettings = async () => {
  localStorage.setItem(
    'user-data',
    JSON.stringify({ token: 'jwt', tokenExpirationTime: 1, id: 'me' }),
  );
  const store = renderApp();
  await screen.findByText('Test User');
  store.dispatch(settingsOpened());
  return store;
};

const openPhotoMenu = async () =>
  fireEvent.click(await screen.findByRole('button', { name: /profile photo options/i }));

describe('removing a profile photo', () => {
  beforeEach(() => {
    localStorage.clear();
    window.history.pushState({}, '', '/');
    removeAvatar.mockClear();
    restoreAvatar.mockClear();
  });

  it('is reachable from the avatar menu and calls the endpoint', async () => {
    await openSettings();
    await openPhotoMenu();

    fireEvent.click(await screen.findByRole('menuitem', { name: /remove photo/i }));

    await waitFor(() => expect(removeAvatar).toHaveBeenCalledTimes(1));
  });

  /**
   * The handoff: "No confirm dialog; instead snackbar with working **Undo**". Both halves are
   * asserted, because a snackbar with a dead Undo is the failure mode that looks fine.
   */
  it('says so in a snackbar carrying an Undo, with no confirmation first', async () => {
    await openSettings();
    await openPhotoMenu();

    fireEvent.click(await screen.findByRole('menuitem', { name: /remove photo/i }));

    // No dialog stood between the click and the call - the endpoint has already been asked.
    await waitFor(() => expect(removeAvatar).toHaveBeenCalled());
    expect(await screen.findByText('Profile photo removed')).toBeInTheDocument();

    // **By role**, not by text. The drawer is a modal: while it is open MUI marks the rest of
    // the document `aria-hidden`, and until #96 the app's one Snackbar rendered in the app tree
    // rather than a portal - so a `getByText` would have passed against an Undo button no screen
    // reader could see and no keyboard could reach. The role query reads the accessibility tree,
    // which is the only version of this assertion that means anything.
    expect(await screen.findByRole('button', { name: /undo/i })).toBeInTheDocument();
  });

  /**
   * **The settings drawer stays open**, pinned in the opposite direction from #89.
   *
   * #89 closed it, and said so at length: the drawer is a modal, MUI marks everything outside
   * it `aria-hidden`, and the app's one `Snackbar` rendered inline - so the only way to make
   * the Undo reachable was to remove the modal. #96 fixed that where it belonged, and the
   * workaround went with it: Undo means "put me back where I was", which it cannot do if
   * pressing Remove has already thrown the user out of settings. `snackbar-a11y.test.tsx` is
   * what now holds the reachability property this used to stand in for.
   */
  it('leaves the settings drawer open, because Undo puts the user back where they were', async () => {
    await openSettings();
    expect(await screen.findByText('Profile & settings')).toBeInTheDocument();
    await openPhotoMenu();

    fireEvent.click(await screen.findByRole('menuitem', { name: /remove photo/i }));

    await waitFor(() => expect(removeAvatar).toHaveBeenCalled());
    expect(await screen.findByRole('button', { name: /undo/i })).toBeInTheDocument();
    expect(screen.getByText('Profile & settings')).toBeInTheDocument();
  });

  it('restores the photo when Undo is pressed', async () => {
    await openSettings();
    await openPhotoMenu();
    fireEvent.click(await screen.findByRole('menuitem', { name: /remove photo/i }));

    fireEvent.click(await screen.findByRole('button', { name: /undo/i }));

    await waitFor(() => expect(restoreAvatar).toHaveBeenCalledTimes(1));
    expect(await screen.findByText('Photo restored')).toBeInTheDocument();
  });

  /**
   * **The security property, at the client end.** The server resolves the keys from the
   * caller's row, and this is the other half of that decision: the request carries a token and
   * nothing else, so there is no file name for a compromised or careless client to choose.
   * Asserted on the arguments, because a wire contract nobody checks is one refactor from
   * growing a parameter.
   */
  it('sends nothing but the token when undoing', async () => {
    await openSettings();
    await openPhotoMenu();
    fireEvent.click(await screen.findByRole('menuitem', { name: /remove photo/i }));

    fireEvent.click(await screen.findByRole('button', { name: /undo/i }));

    await waitFor(() => expect(restoreAvatar).toHaveBeenCalled());
    expect(restoreAvatar.mock.calls[0]).toEqual(['jwt']);
  });

  /**
   * A failed removal must not claim to have removed anything, and must not offer an Undo for a
   * thing that did not happen.
   */
  it('reports a failure instead of pretending, and offers no Undo', async () => {
    removeAvatar.mockRejectedValueOnce(new Error('network'));

    await openSettings();
    await openPhotoMenu();
    fireEvent.click(await screen.findByRole('menuitem', { name: /remove photo/i }));

    expect(await screen.findByText('Could not remove your photo.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /undo/i })).toBeNull();
  });

  /**
   * The other end of the same honesty: an Undo the server refuses (409 - nothing to restore,
   * which is what a late Undo gets) says so rather than leaving a button that appears to do
   * nothing.
   */
  it('says so when the photo can no longer be restored', async () => {
    restoreAvatar.mockRejectedValueOnce(new Error('409'));

    await openSettings();
    await openPhotoMenu();
    fireEvent.click(await screen.findByRole('menuitem', { name: /remove photo/i }));
    fireEvent.click(await screen.findByRole('button', { name: /undo/i }));

    expect(await screen.findByText('That photo could not be restored.')).toBeInTheDocument();
  });
});
