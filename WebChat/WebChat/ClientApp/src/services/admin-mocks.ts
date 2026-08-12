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

import type {
  AdminRoleLabel,
  AdminError,
  AdminInvite,
  AdminMember,
  AdminOverview,
} from '@/types/admin';

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
const inDays = (n: number): string => minutesAgo(-n * 1440);

/** MOCK BECAUSE: no GET /api/admin/members. */
const MEMBERS: AdminMember[] = [
  {
    id: 'u1',
    name: 'test',
    email: 'test@parley.app',
    role: 'Owner',
    status: 'active',
    lastActiveUtc: minutesAgo(0),
    online: true,
    joinedUtc: '2025-03-12T09:14:00Z',
    groups: 6,
    sessions: 3,
    mfa: true,
  },
  {
    id: 'u2',
    name: 'Maya Rodriguez',
    email: 'maya.rodriguez@acme.com',
    role: 'Admin',
    status: 'active',
    lastActiveUtc: minutesAgo(2),
    online: true,
    joinedUtc: '2025-03-14T10:02:00Z',
    groups: 5,
    sessions: 2,
    mfa: true,
  },
  {
    id: 'u3',
    name: 'Tomás Lind',
    email: 'tomas.lind@acme.com',
    role: 'Member',
    status: 'active',
    lastActiveUtc: minutesAgo(26),
    online: false,
    joinedUtc: '2025-03-14T10:02:00Z',
    groups: 4,
    sessions: 1,
    mfa: true,
  },
  {
    id: 'u4',
    name: 'Priya Nair',
    email: 'priya.nair@acme.com',
    role: 'Member',
    status: 'active',
    lastActiveUtc: hoursAgo(3),
    online: false,
    joinedUtc: '2025-04-02T08:40:00Z',
    groups: 3,
    sessions: 1,
    mfa: false,
  },
  {
    id: 'u5',
    name: 'Aiko Tanaka',
    email: 'aiko.tanaka@acme.com',
    role: 'Member',
    status: 'active',
    lastActiveUtc: hoursAgo(26),
    online: false,
    joinedUtc: '2025-04-19T13:25:00Z',
    groups: 2,
    sessions: 2,
    mfa: true,
  },
  {
    id: 'u6',
    name: 'Ben Okafor',
    email: 'ben.okafor@acme.com',
    role: 'Member',
    status: 'blocked',
    lastActiveUtc: daysAgo(6),
    online: false,
    joinedUtc: '2025-04-19T13:25:00Z',
    groups: 2,
    sessions: 0,
    mfa: false,
  },
  {
    id: 'u7',
    name: 'Clara Weiss',
    email: 'clara.weiss@acme.com',
    role: 'Admin',
    status: 'active',
    lastActiveUtc: minutesAgo(41),
    online: true,
    joinedUtc: '2025-05-05T11:07:00Z',
    groups: 5,
    sessions: 2,
    mfa: true,
  },
  {
    id: 'u8',
    name: 'Dev Sharma',
    email: 'dev.sharma@acme.com',
    role: 'Member',
    status: 'pending',
    lastActiveUtc: null,
    online: false,
    joinedUtc: '2026-07-28T15:30:00Z',
    groups: 0,
    sessions: 0,
    mfa: false,
  },
  {
    id: 'u9',
    name: 'Elena Rossi',
    email: 'elena.rossi@acme.com',
    role: 'Member',
    status: 'active',
    lastActiveUtc: hoursAgo(5),
    online: false,
    joinedUtc: '2025-06-11T09:55:00Z',
    groups: 3,
    sessions: 1,
    mfa: true,
  },
  {
    id: 'u10',
    name: 'Farid Haddad',
    email: 'farid.haddad@acme.com',
    role: 'Member',
    status: 'pending',
    lastActiveUtc: null,
    online: false,
    joinedUtc: '2026-08-02T12:10:00Z',
    groups: 0,
    sessions: 0,
    mfa: false,
  },
  {
    id: 'u11',
    name: 'Grace Mbeki',
    email: 'grace.mbeki@acme.com',
    role: 'Member',
    status: 'deactivated',
    lastActiveUtc: daysAgo(92),
    online: false,
    joinedUtc: '2025-01-08T16:45:00Z',
    groups: 0,
    sessions: 0,
    mfa: false,
  },
  {
    id: 'u12',
    name: 'Hugo Bernard',
    email: 'hugo.bernard@contractor.io',
    role: 'Guest',
    status: 'active',
    lastActiveUtc: hoursAgo(1),
    online: false,
    joinedUtc: '2025-07-21T07:20:00Z',
    groups: 1,
    sessions: 1,
    mfa: false,
  },
  {
    id: 'u13',
    name: 'Ines Oliveira',
    email: 'ines.oliveira@acme.com',
    role: 'Member',
    status: 'active',
    lastActiveUtc: daysAgo(2),
    online: false,
    joinedUtc: '2025-06-30T14:05:00Z',
    groups: 2,
    sessions: 1,
    mfa: true,
  },
  {
    id: 'u14',
    name: 'Release Bot',
    email: 'bots+release@parley.app',
    role: 'Member',
    status: 'active',
    lastActiveUtc: minutesAgo(8),
    online: true,
    joinedUtc: '2025-03-12T09:14:00Z',
    groups: 2,
    sessions: 1,
    mfa: false,
  },
];

/** MOCK BECAUSE: no GET /api/admin/invitations. */
const INVITES: AdminInvite[] = [
  {
    id: 'i1',
    email: 'dev.sharma@acme.com',
    by: 'Maya Rodriguez',
    sentAtUtc: daysAgo(10),
    expiresAtUtc: inDays(20),
  },
  {
    id: 'i2',
    email: 'farid.haddad@acme.com',
    by: 'test',
    sentAtUtc: daysAgo(5),
    expiresAtUtc: inDays(25),
  },
  {
    id: 'i3',
    email: 'noor.haddad@acme.com',
    by: 'Clara Weiss',
    sentAtUtc: daysAgo(24),
    expiresAtUtc: inDays(6),
  },
  {
    id: 'i4',
    email: 'sam.pereira@acme.com',
    by: 'test',
    sentAtUtc: daysAgo(27),
    expiresAtUtc: inDays(3),
  },
  {
    id: 'i5',
    email: 'kai.lindqvist@contractor.io',
    by: 'Maya Rodriguez',
    sentAtUtc: daysAgo(29),
    expiresAtUtc: inDays(1),
  },
];

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

/** MOCK BECAUSE: no message-volume aggregate exists. 14 days, matching the design. */
const CHART = [42, 58, 51, 74, 66, 89, 23, 18, 71, 84, 79, 92, 61, 48];
const DAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S', 'M', 'T', 'W', 'T', 'F', 'S', 'S'];

// Session-scoped mutable copies, so the console's actions visibly do something. Resets on
// reload - never mistake it for persistence.
let members = [...MEMBERS];
let invites = [...INVITES];

let errors = [...ERRORS];

export const mockMembers = (): AdminMember[] => members;
export const mockInvites = (): AdminInvite[] => invites;

export const mockErrors = (): AdminError[] => errors;

export const mockOverview = (): AdminOverview => {
  const count = (status: AdminMember['status']) =>
    members.filter((m) => m.status === status).length;

  return {
    total: members.length,
    active: count('active'),
    pending: count('pending'),
    blocked: count('blocked') + count('deactivated'),
    chart: CHART.map((value, i) => ({ value, day: DAYS[i] })),
  };
};

export const mockSetMemberStatus = (ids: string[], status: AdminMember['status']) => {
  members = members.map((m) => (ids.includes(m.id) ? { ...m, status } : m));
  return members;
};

export const mockSetMemberRole = (id: string, role: AdminMember['role']) => {
  members = members.map((m) => (m.id === id ? { ...m, role } : m));
  return members;
};

export const mockRevokeInvite = (id: string) => {
  invites = invites.filter((i) => i.id !== id);
  return invites;
};

/** Extending moves the deadline without issuing a new link - the spec is explicit. */
export const mockExtendInvite = (id: string) => {
  invites = invites.map((i) => (i.id === id ? { ...i, days: 30 } : i));
  return invites;
};

/**
 * No audit entry is written here any more. The audit log is real as of #70, and a mock
 * invitation cannot produce a real one - so a fixture appended here would be a fabricated
 * record sitting alongside genuine ones, in the one list whose whole value is that its
 * contents actually happened. It comes back when invitations do (#72).
 */
export const mockSendInvites = (emails: string[], role: AdminRoleLabel) => {
  void role;
  invites = [
    ...emails.map((email, i) => ({
      id: `new-${i}-${email}`,
      email,
      by: 'you',
      sentAtUtc: new Date().toISOString(),
      expiresAtUtc: inDays(30),
    })),
    ...invites,
  ];
  return invites;
};

export const mockSetErrorStatus = (id: string, status: AdminError['status']) => {
  errors = errors.map((e) => (e.id === id ? { ...e, status } : e));
  return errors;
};
