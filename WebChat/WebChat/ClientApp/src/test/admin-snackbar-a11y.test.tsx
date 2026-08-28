import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router-dom';
import { ThemeModeProvider } from '@/theme/ThemeModeProvider';
import type { AdminError, AdminMember } from '@/types/admin';

/**
 * The admin console's snackbar, and the three modals that used to swallow it - issue #102.
 *
 * Same defect as #96, second location. A MUI `Dialog` or `Drawer` is a `Modal`, and while one
 * is open MUI marks every other child of `body` `aria-hidden="true"`. The console rendered its
 * own inline `AdminSnackbar` inside its own tree, so every toast raised while one of its three
 * modals was open was on screen, clickable with a mouse, and absent from the accessibility
 * tree.
 *
 * Unlike the pre-#89 app shell this has a live trigger: `InviteDialog.submit` deliberately
 * leaves the dialog **open** when a send is refused, so the one message an administrator most
 * needs - the failure - is the one that lands in the hidden subtree.
 *
 * These drive the real `AdminConsole` rather than a component in isolation, because the defect
 * is a property of the whole rendered document. The stub is the admin service seam, which is
 * the only thing here that would otherwise make an HTTP request.
 */

const MEMBERS: AdminMember[] = [
  {
    id: 'm1',
    name: 'Maya Rodriguez',
    email: 'maya@acme.com',
    role: 'member',
    status: 'active',
    avatarFileName: null,
    lastActiveUtc: '2026-08-20T10:00:00Z',
    online: true,
    joinedUtc: '2026-01-04T09:00:00Z',
    groups: 3,
    connections: 1,
    emailConfirmed: true,
  },
];

const ERRORS: AdminError[] = [
  {
    id: 'e1',
    level: 'error',
    name: 'TypeError',
    message: 'Cannot read properties of null',
    culprit: 'ThreadList.render',
    route: '/dashboard',
    release: '1.4.0',
    events: 12,
    users: 4,
    firstSeenUtc: '2026-08-19T10:00:00Z',
    lastSeenUtc: '2026-08-20T10:00:00Z',
    status: 'new',
    browsers: 'Chrome 140',
    spark: [1, 2, 3],
    stack: ['at ThreadList.render'],
    crumbs: [{ t: '10:00', k: 'nav', v: '/dashboard' }],
  },
];

const sendInvites = vi.fn();
const setMemberStatus = vi.fn();
const setErrorStatus = vi.fn();

vi.mock('@/services/admin-service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/services/admin-service')>()),
  // Null renders the Overview section as nothing, which is what this file wants: the console
  // shell, its three modals and its one toast, with no fixture data in the way.
  loadOverview: async () => null,
  loadMembers: async () => MEMBERS,
  loadInvites: async () => [],
  loadAudit: async () => [],
  loadErrors: async () => ERRORS,
  loadPolicies: async () => ({ policies: {}, alwaysOn: [] }),
  sendInvites: (...args: unknown[]) => sendInvites(...args),
  setMemberStatus: (...args: unknown[]) => setMemberStatus(...args),
  setErrorStatus: (...args: unknown[]) => setErrorStatus(...args),
}));

// Imported after the mock is registered, and after the fixtures above exist - the factory
// closes over them and runs on this import.
const { default: AdminConsole } = await import('@/features/admin/AdminConsole');
const { makeStore } = await import('@/app/store');

// The admin queries read the token out of the store, so a session has to be present or every
// one of them fails as "Not authenticated" and the console renders empty for the wrong reason.
const session = { token: 'jwt', tokenExpirationTime: 9e9, id: 'me' };

const PROFILE = { id: 'me', name: 'Owner Person', role: 'owner', avatarFileName: null };

const renderConsole = () => {
  render(
    <Provider store={makeStore({ user: session, busy: false })}>
      <ThemeModeProvider>
        <MemoryRouter>
          <AdminConsole profile={PROFILE} />
        </MemoryRouter>
      </ThemeModeProvider>
    </Provider>,
  );
};

/** The assertion the whole issue is about: nothing between the node and `body` hides it. */
const hiddenAncestorOf = (el: HTMLElement | null) => el?.closest('[aria-hidden="true"]') ?? null;

const REFUSED = 'Your workspace has run out of seats.';

/**
 * The three focus traps on this screen, each with the shortest real path to a toast raised
 * while it is open. The issue names two of them; `AdminErrors` has a detail `Drawer` of its
 * own, and it is the one that would have been missed.
 */
const TRAPS = [
  {
    name: 'the invite dialog',
    // A refused send. The dialog stays open on purpose - closing it would lose a pasted list
    // of twenty addresses - so the message an administrator most needs is raised into the
    // subtree the dialog has just hidden. This is the live trigger the issue is built on.
    message: REFUSED as string | RegExp,
    raise: async () => {
      sendInvites.mockRejectedValue({ response: { status: 403, data: { message: REFUSED } } });
      renderConsole();
      fireEvent.click(screen.getByRole('button', { name: 'Invite people' }));
      const field = await screen.findByLabelText('Email addresses');
      fireEvent.change(field, { target: { value: 'maya@acme.com' } });
      fireEvent.click(screen.getByRole('button', { name: 'Send invitation' }));
    },
  },
  {
    name: 'the member drawer',
    message: /Maya Rodriguez blocked/ as string | RegExp,
    raise: async () => {
      renderConsole();
      fireEvent.click(screen.getByRole('button', { name: 'Members' }));
      fireEvent.click(await screen.findByRole('button', { name: /Maya Rodriguez/ }));
      fireEvent.click(await screen.findByRole('button', { name: 'Block' }));
    },
  },
  {
    name: 'the error drawer',
    message: 'TypeError marked resolved' as string | RegExp,
    raise: async () => {
      renderConsole();
      fireEvent.click(screen.getByRole('button', { name: /UI errors/ }));
      fireEvent.click(await screen.findByRole('button', { name: /TypeError/ }));
      fireEvent.click(await screen.findByRole('button', { name: 'Mark resolved' }));
    },
  },
];

describe('admin toasts raised while one of the console modals is open', () => {
  beforeEach(() => {
    sendInvites.mockReset();
    setMemberStatus.mockReset();
    setErrorStatus.mockReset();
    setMemberStatus.mockResolvedValue([]);
    setErrorStatus.mockResolvedValue([]);
  });

  /**
   * **The reproduction.** One per focus trap, because each is a separate way into the same
   * defect and the third one is only in this list because it was gone looking for.
   */
  it.each(TRAPS)('$name: the toast raised over it is announced, not hidden', async (trap) => {
    await trap.raise();

    const snack = await screen.findByText(trap.message);
    expect(hiddenAncestorOf(snack)).toBeNull();
  });

  /**
   * **The guard that stops the reproductions being vacuous.** If jsdom did not reproduce MUI's
   * `aria-hidden` sweep at all, they would pass against the broken code too. It does reproduce
   * it: with the dialog open, the console behind it *is* hidden, and must stay so - hiding the
   * rest of the document is the modal doing its job.
   */
  it('the console behind the dialog is still hidden, which is the modal working', async () => {
    await TRAPS[0].raise();
    await screen.findByText(REFUSED);

    // Queried by text, not by role: a role query would not find it *because* it is hidden,
    // which is the very thing being asserted.
    expect(hiddenAncestorOf(screen.getByText('WebChat Admin'))).not.toBeNull();
  });

  /**
   * The behaviour that makes the invite dialog the live trigger, pinned so a later tidy-up
   * does not "fix" it: a refused send keeps the dialog open with the addresses still in it.
   * Closing on a failure would lose a pasted list of twenty and give no way to retry except
   * retyping them.
   */
  it('a refused send leaves the invite dialog open with its addresses', async () => {
    await TRAPS[0].raise();
    await screen.findByText(REFUSED);

    expect(screen.getByLabelText('Email addresses')).toHaveValue('maya@acme.com');
  });

  /**
   * The *other* order - toast already on screen when the modal opens, which is what
   * `AppSnackbar`'s `MutationObserver` exists for - is deliberately not tested here, and the
   * reason is worth writing down. It is unreachable in this console: every one of its three
   * modals is opened by a click, and MUI's `Snackbar` wraps itself in a `ClickAwayListener`,
   * so the same click dismisses the toast before the modal's sweep runs. A test for it passed
   * against the *broken* code for exactly that reason - the node it was asserting about had
   * been unmounted, so `closest` had no ancestors left to find. `snackbar-a11y.test.tsx`
   * covers that order, where the app dispatches toasts from places other than a click.
   */

  /**
   * **A guard on the focus wiring, not a reproduction.** Nothing in an admin toast can be
   * operated today, so no user-visible behaviour depends on this yet; what it pins is that
   * `disableEnforceFocus` reaches each of the three modals, so the first admin toast that
   * grows an action does not have to rediscover #96 - one prop dropped on one of the three
   * would otherwise be found by whoever adds it.
   *
   * The probe stands in for that future action: a focusable node outside the trap, which a
   * message-only toast does not have. With the trap enforcing, focus is dragged straight back
   * into the modal; with the flag through, it stays where it was put.
   */
  it.each(TRAPS)('$name: stops enforcing focus while a toast is up', async (trap) => {
    await trap.raise();
    await screen.findByText(trap.message);

    const probe = document.createElement('button');
    document.body.appendChild(probe);
    probe.focus();

    await new Promise((resolve) => setTimeout(resolve, 120));
    expect(document.activeElement).toBe(probe);
    probe.remove();
  });
});
