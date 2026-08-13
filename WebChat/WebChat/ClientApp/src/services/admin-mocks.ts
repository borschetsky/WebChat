// Fixtures for the admin console.
//
// MOCK BECAUSE: none of this has a backend yet. Issue #64 is the console; #67 gave us the
// workspace role that gates it, and that is the only part of this screen that is real.
//
// Every export here is shaped like the endpoint that will eventually replace it, and is
// reached only through `services/admin-service.ts` - the same seam the chat app uses, so
// making one of these real is a change to that file plus the removal of one mock, and no
// component changes at all.
//
// The data is the design handoff's own fixture set (`Chat Admin Console.dc.html`), kept
// verbatim so the rendered screen can be compared against the design directly.

import type { AdminError } from '@/types/admin';

// Fixture timestamps are offsets from load, not fixed dates.
//
// They used to be the strings the design file showed - 'last: 2 min ago'. A server cannot
// send those: it does not know when the page will be read, and the console is exactly the
// screen somebody leaves open all afternoon. Now every one of these is an instant and the
// wording is computed at render (`lib/date-time-format.ts`), which is also what keeps the
// fixtures looking plausible however long the dev server has been up.
const minutesAgo = (n: number): string => new Date(Date.now() - n * 60_000).toISOString();
const hoursAgo = (n: number): string => minutesAgo(n * 60);
const daysAgo = (n: number): string => minutesAgo(n * 1440);

// Only the UI-errors fixtures are left. Members (#71), invitations (#72), the audit log
// (#70) and Overview's stat cards all read real endpoints now; the MEMBERS and INVITES
// fixtures and their mutation helpers went with them.

/** MOCK BECAUSE: the client posts nothing to /api/client-errors, and nothing ingests it. */
const ERRORS: AdminError[] = [
  {
    id: 'e1',
    level: 'fatal',
    name: 'TypeError',
    message: "Cannot read properties of undefined (reading 'members')",
    culprit: 'ThreadHeader.jsx in renderPresence',
    route: '/chat/:threadId',
    release: 'web@2.14.0',
    events: 184,
    users: 31,
    firstSeenUtc: daysAgo(2),
    lastSeenUtc: minutesAgo(4),
    status: 'new',
    browsers: 'Chrome 141 · Safari 18 · Edge 141',
    spark: [2, 4, 9, 14, 22, 31, 28, 40, 37, 52, 44, 61, 58, 73],
    stack: [
      "TypeError: Cannot read properties of undefined (reading 'members')",
      '    at renderPresence (ThreadHeader.jsx:48:31)',
      '    at ThreadHeader (ThreadHeader.jsx:22:9)',
      '    at renderWithHooks (react-dom.production.js:11121:18)',
      '    at mountIndeterminateComponent (react-dom.production.js:14602:13)',
    ],
    crumbs: [
      { t: '12:04:02', k: 'navigation', v: '/chat/t3 → /chat/g1741' },
      { t: '12:04:02', k: 'fetch', v: 'GET /api/threads/g1741 · 200' },
      { t: '12:04:03', k: 'ui.click', v: 'button[aria-label="Conversation info"]' },
      { t: '12:04:03', k: 'exception', v: 'TypeError thrown in ThreadHeader' },
    ],
  },
  {
    id: 'e2',
    level: 'error',
    name: 'ChunkLoadError',
    message: 'Loading chunk 47 failed (timeout: /assets/settings-4f2a.js)',
    culprit: 'SettingsDrawer lazy import',
    route: '/chat',
    release: 'web@2.14.0',
    events: 96,
    users: 44,
    firstSeenUtc: daysAgo(6),
    lastSeenUtc: minutesAgo(22),
    status: 'new',
    browsers: 'Chrome 141 · Firefox 133',
    spark: [12, 9, 14, 8, 11, 6, 9, 7, 12, 10, 8, 14, 11, 9],
    stack: [
      'ChunkLoadError: Loading chunk 47 failed.',
      '    at requireEnsure (webpack/runtime.js:112:23)',
      '    at loadSettingsDrawer (App.jsx:86:11)',
    ],
    crumbs: [
      { t: '09:51:40', k: 'ui.click', v: 'button[aria-label="Settings"]' },
      { t: '09:51:44', k: 'fetch', v: 'GET /assets/settings-4f2a.js · timeout after 4000ms' },
      { t: '09:51:44', k: 'exception', v: 'ChunkLoadError' },
    ],
  },
  {
    id: 'e3',
    level: 'error',
    name: 'UnhandledRejection',
    message: 'POST /api/messages failed with 413 Payload Too Large',
    culprit: 'Composer.jsx in handleSend',
    route: '/chat/:threadId',
    release: 'web@2.13.4',
    events: 57,
    users: 12,
    firstSeenUtc: daysAgo(9),
    lastSeenUtc: hoursAgo(1),
    status: 'acknowledged',
    browsers: 'Chrome 141 · Safari 18',
    spark: [6, 8, 5, 9, 7, 4, 6, 3, 5, 7, 4, 6, 5, 4],
    stack: [
      'UnhandledRejection: Request failed with status code 413',
      '    at handleSend (Composer.jsx:61:15)',
      '    at onKeyDown (Composer.jsx:88:34)',
    ],
    crumbs: [
      { t: '16:22:11', k: 'ui.input', v: 'attachment added: proposal-final.pdf (28.4 MB)' },
      { t: '16:22:14', k: 'fetch', v: 'POST /api/messages · 413' },
      { t: '16:22:14', k: 'exception', v: 'UnhandledRejection' },
    ],
  },
  {
    id: 'e4',
    level: 'warning',
    name: 'HydrationMismatch',
    message: 'Text content did not match. Server: "Active now" Client: "Away"',
    culprit: 'PresenceAvatar.jsx',
    route: '/chat',
    release: 'web@2.14.0',
    events: 311,
    users: 78,
    firstSeenUtc: daysAgo(21),
    lastSeenUtc: minutesAgo(8),
    status: 'acknowledged',
    browsers: 'All',
    spark: [20, 24, 19, 26, 22, 28, 25, 30, 27, 24, 29, 26, 31, 28],
    stack: [
      'Warning: Text content did not match.',
      '    at PresenceAvatar (PresenceAvatar.jsx:14:7)',
      '    at ThreadList (ThreadList.jsx:71:19)',
    ],
    crumbs: [
      { t: '08:15:00', k: 'navigation', v: 'SSR hydrate /chat' },
      { t: '08:15:00', k: 'exception', v: 'Hydration text mismatch' },
    ],
  },
  {
    id: 'e5',
    level: 'error',
    name: 'WebSocketError',
    message: 'Socket closed abnormally (1006) and did not reconnect',
    culprit: 'useSocket.js in reconnect',
    route: '*',
    release: 'web@2.13.4',
    events: 23,
    users: 9,
    firstSeenUtc: daysAgo(31),
    lastSeenUtc: daysAgo(3),
    status: 'resolved',
    browsers: 'Safari 18',
    spark: [4, 3, 2, 4, 1, 2, 0, 1, 0, 0, 1, 0, 0, 0],
    stack: ['WebSocketError: closed abnormally (1006)', '    at reconnect (useSocket.js:44:9)'],
    crumbs: [
      { t: '23:10:02', k: 'network', v: 'offline → online' },
      { t: '23:10:05', k: 'socket', v: 'close 1006' },
      { t: '23:10:35', k: 'exception', v: 'reconnect gave up after 5 attempts' },
    ],
  },
];

// Session-scoped mutable copy, so error triage visibly does something. Resets on reload -
// never mistake it for persistence.
let errors = [...ERRORS];

export const mockErrors = (): AdminError[] => errors;

// Overview's fixtures are gone too (#73): the stat cards, the 14-day message-volume chart
// and the activation funnel are all counted server-side now. Two invented hints went with
// them - "+3 in the last 30 days" and "2 expire within a week" - which were the worst kind
// of fiction on a dashboard: specific, plausible, and nobody cross-checks a stat card.

export const mockSetErrorStatus = (id: string, status: AdminError['status']) => {
  errors = errors.map((e) => (e.id === id ? { ...e, status } : e));
  return errors;
};
