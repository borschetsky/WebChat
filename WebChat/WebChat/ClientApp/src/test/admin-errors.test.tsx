import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router-dom';
import { ThemeModeProvider } from '@/theme/ThemeModeProvider';
import type { AdminError } from '@/types/admin';

/**
 * The UI errors section, driven through the real console (#74).
 *
 * The section used to read fixtures that reset on reload; it now reads
 * `GET /api/admin/errors`. Nothing in the component changed, which is the seam working as
 * intended - so what is worth asserting is the two things that *are* new: the query carries
 * the session token, and triage sends a real status to a real endpoint.
 *
 * The stub is `services/admin-service`, the same seam the snackbar test stubs, because it is
 * the only thing between these components and an HTTP request.
 */

const ERRORS: AdminError[] = [
  {
    id: 'e1',
    level: 'fatal',
    name: 'TypeError',
    message: "Cannot read properties of undefined (reading 'members')",
    culprit: 'ThreadHeader in renderPresence',
    route: '/dashboard',
    release: 'web@0.1.0',
    events: 184,
    users: 31,
    firstSeenUtc: '2026-08-28T10:00:00Z',
    lastSeenUtc: '2026-08-31T10:00:00Z',
    status: 'new',
    browsers: 'Chrome 141 · Safari 18',
    spark: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2, 9, 14],
    stack: ['TypeError: Cannot read properties of undefined', '    at t (index-a1b2.js:1:1)'],
    crumbs: [{ t: '12:04:02', k: 'ui.click', v: 'button[aria-label="Conversation info"]' }],
  },
  {
    id: 'e2',
    level: 'error',
    name: 'ChunkLoadError',
    message: 'Loading chunk failed',
    culprit: 'AdminConsole in render',
    route: '/admin',
    release: 'web@0.1.0',
    events: 3,
    users: 1,
    firstSeenUtc: '2026-08-20T10:00:00Z',
    lastSeenUtc: '2026-08-21T10:00:00Z',
    status: 'resolved',
    browsers: 'Unknown',
    spark: Array.from({ length: 14 }, () => 0),
    stack: [],
    crumbs: [],
  },
];

const loadErrors = vi.fn();
const setErrorStatus = vi.fn();

vi.mock('@/services/admin-service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/services/admin-service')>()),
  loadOverview: async () => null,
  loadMembers: async () => [],
  loadInvites: async () => [],
  loadAudit: async () => [],
  loadPolicies: async () => ({ policies: {}, alwaysOn: [] }),
  loadErrors: (...args: unknown[]) => loadErrors(...args),
  setErrorStatus: (...args: unknown[]) => setErrorStatus(...args),
}));

const { default: AdminConsole } = await import('@/features/admin/AdminConsole');
const { makeStore } = await import('@/app/store');

const session = { token: 'jwt', tokenExpirationTime: 9e9, id: 'me' };
const PROFILE = { id: 'me', name: 'Owner Person', role: 'owner', avatarFileName: null };

const renderConsole = () =>
  render(
    <Provider store={makeStore({ user: session, busy: false })}>
      <ThemeModeProvider>
        <MemoryRouter>
          <AdminConsole profile={PROFILE} />
        </MemoryRouter>
      </ThemeModeProvider>
    </Provider>,
  );

const openErrors = async () => {
  renderConsole();
  fireEvent.click(screen.getByRole('button', { name: 'UI errors' }));
};

describe('the UI errors section', () => {
  beforeEach(() => {
    loadErrors.mockReset().mockResolvedValue(ERRORS);
    setErrorStatus.mockReset().mockResolvedValue(ERRORS);
  });

  /**
   * The regression this replaces: `getErrors` was the one endpoint on `adminApi` whose
   * `queryFn` ignored authentication entirely, because it resolved against fixtures. Without a
   * token the real endpoint answers 401 and the section renders empty - which looks exactly
   * like "no errors", the state an administrator most wants to believe.
   */
  it('reads the list with the session token', async () => {
    await openErrors();

    await screen.findByText('TypeError');
    expect(loadErrors).toHaveBeenCalledWith('jwt');
  });

  it('shows a row per fingerprint with its counts and where it came from', async () => {
    await openErrors();

    expect(await screen.findByText('TypeError')).toBeInTheDocument();
    expect(screen.getByText(/Cannot read properties of undefined/)).toBeInTheDocument();
    expect(screen.getByText('ThreadHeader in renderPresence · web@0.1.0')).toBeInTheDocument();
    expect(screen.getByText('184')).toBeInTheDocument();
    expect(screen.getByText('31 users')).toBeInTheDocument();
  });

  /** The default filter is Unresolved, so a resolved issue is out of the way until asked for. */
  it('hides resolved issues until the filter asks for them', async () => {
    await openErrors();

    await screen.findByText('TypeError');
    expect(screen.queryByText('ChunkLoadError')).not.toBeInTheDocument();

    fireEvent.click(screen.getByText('Resolved'));

    expect(await screen.findByText('ChunkLoadError')).toBeInTheDocument();
    expect(screen.queryByText('TypeError')).not.toBeInTheDocument();
  });

  it('opens the detail drawer with the stack and the breadcrumbs', async () => {
    await openErrors();

    fireEvent.click(await screen.findByText('TypeError'));

    expect(await screen.findByText('Stack trace')).toBeInTheDocument();
    expect(screen.getByText(/at t \(index-a1b2\.js/)).toBeInTheDocument();
    expect(screen.getByText('button[aria-label="Conversation info"]')).toBeInTheDocument();
    expect(screen.getByText('Chrome 141 · Safari 18')).toBeInTheDocument();
  });

  it('triages an issue against the server, with the token', async () => {
    await openErrors();

    fireEvent.click(await screen.findByText('TypeError'));
    fireEvent.click(await screen.findByRole('button', { name: 'Mark resolved' }));

    expect(setErrorStatus).toHaveBeenCalledWith('e1', 'resolved', 'jwt');
  });

  /**
   * Reopening is the same mutation with the other status - there is no separate endpoint, and
   * no delete. An issue leaves this list by not happening for long enough, which retention
   * decides.
   */
  it('reopens a resolved issue as acknowledged', async () => {
    await openErrors();

    fireEvent.click(screen.getByText('Resolved'));
    fireEvent.click(await screen.findByText('ChunkLoadError'));
    fireEvent.click(await screen.findByRole('button', { name: 'Reopen' }));

    expect(setErrorStatus).toHaveBeenCalledWith('e2', 'acknowledged', 'jwt');
  });

  it('says so plainly when there is nothing to triage', async () => {
    loadErrors.mockResolvedValue([]);

    await openErrors();

    expect(await screen.findByText('Nothing here.')).toBeInTheDocument();
  });
});
