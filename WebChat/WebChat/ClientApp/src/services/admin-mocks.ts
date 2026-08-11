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
  AdminAudit,
  AdminError,
  AdminInvite,
  AdminMember,
  AdminOverview,
} from '@/types/admin';

/** MOCK BECAUSE: no GET /api/admin/members. */
const MEMBERS: AdminMember[] = [
  {
    id: 'u1',
    name: 'test',
    email: 'test@parley.app',
    role: 'Owner',
    status: 'active',
    last: 'Now',
    online: true,
    joined: '12 Mar 2025',
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
    last: '2 min ago',
    online: true,
    joined: '14 Mar 2025',
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
    last: '26 min ago',
    online: false,
    joined: '14 Mar 2025',
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
    last: '3 h ago',
    online: false,
    joined: '02 Apr 2025',
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
    last: 'Yesterday',
    online: false,
    joined: '19 Apr 2025',
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
    last: '6 days ago',
    online: false,
    joined: '19 Apr 2025',
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
    last: '41 min ago',
    online: true,
    joined: '05 May 2025',
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
    last: '—',
    online: false,
    joined: 'Invited 28 Jul',
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
    last: '5 h ago',
    online: false,
    joined: '11 Jun 2025',
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
    last: '—',
    online: false,
    joined: 'Invited 02 Aug',
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
    last: '3 months ago',
    online: false,
    joined: '08 Jan 2025',
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
    last: '1 h ago',
    online: false,
    joined: '21 Jul 2025',
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
    last: '2 days ago',
    online: false,
    joined: '30 Jun 2025',
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
    last: '8 min ago',
    online: true,
    joined: '12 Mar 2025',
    groups: 2,
    sessions: 1,
    mfa: false,
  },
];

/** MOCK BECAUSE: no GET /api/admin/invitations. */
const INVITES: AdminInvite[] = [
  { id: 'i1', email: 'dev.sharma@acme.com', by: 'Maya Rodriguez', sent: '28 Jul', days: 20 },
  { id: 'i2', email: 'farid.haddad@acme.com', by: 'test', sent: '02 Aug', days: 25 },
  { id: 'i3', email: 'noor.haddad@acme.com', by: 'Clara Weiss', sent: '14 Jul', days: 6 },
  { id: 'i4', email: 'sam.pereira@acme.com', by: 'test', sent: '11 Jul', days: 3 },
  { id: 'i5', email: 'kai.lindqvist@contractor.io', by: 'Maya Rodriguez', sent: '09 Jul', days: 1 },
];

/** MOCK BECAUSE: nothing writes an audit trail yet - deferred from #63 to #64. */
const AUDIT: AdminAudit[] = [
  {
    id: 'a1',
    kind: 'block',
    text: 'test blocked Ben Okafor',
    meta: 'ben.okafor@acme.com · 4 sessions ended',
    time: '12 min ago',
  },
  {
    id: 'a2',
    kind: 'invite',
    text: 'test invited farid.haddad@acme.com',
    meta: 'Role: Member · expires 01 Sep',
    time: '2 h ago',
  },
  {
    id: 'a3',
    kind: 'role',
    text: 'Maya Rodriguez promoted Clara Weiss to Admin',
    meta: 'Member → Admin',
    time: 'Yesterday, 16:42',
  },
  {
    id: 'a4',
    kind: 'policy',
    text: 'test turned on Require admin approval for invites',
    meta: 'Workspace policy',
    time: 'Yesterday, 09:15',
  },
  {
    id: 'a5',
    kind: 'activate',
    text: 'Elena Rossi activated her account',
    meta: 'Invited 04 Jun by Maya Rodriguez',
    time: '2 days ago',
  },
  {
    id: 'a6',
    kind: 'deactivate',
    text: 'test deactivated Grace Mbeki',
    meta: 'Offboarding · removed from 4 groups',
    time: '3 days ago',
  },
  {
    id: 'a7',
    kind: 'login',
    text: 'Failed sign-in for hugo.bernard@contractor.io',
    meta: '3 attempts · 88.12.44.9',
    time: '4 days ago',
  },
  {
    id: 'a8',
    kind: 'invite',
    text: 'Clara Weiss invited noor.haddad@acme.com',
    meta: 'Role: Member · expires 13 Aug',
    time: '5 days ago',
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
    first: '2 days ago',
    last: '4 min ago',
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
    first: '6 days ago',
    last: '22 min ago',
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
    first: '9 days ago',
    last: '1 h ago',
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
    first: '3 weeks ago',
    last: '8 min ago',
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
    first: '1 month ago',
    last: '3 days ago',
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
let audit = [...AUDIT];
let errors = [...ERRORS];

export const mockMembers = (): AdminMember[] => members;
export const mockInvites = (): AdminInvite[] => invites;
export const mockAudit = (): AdminAudit[] => audit;
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
    recentAudit: audit.slice(0, 4),
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

export const mockSendInvites = (emails: string[], role: AdminMember['role']) => {
  invites = [
    ...emails.map((email, i) => ({
      id: `new-${i}-${email}`,
      email,
      by: 'you',
      sent: 'Just now',
      days: 30,
    })),
    ...invites,
  ];
  audit = [
    {
      id: `audit-${emails.join(',')}`,
      kind: 'invite' as const,
      text: `You invited ${emails.length === 1 ? emails[0] : `${emails.length} people`}`,
      meta: `Role: ${role} · expires in 30 days`,
      time: 'Just now',
    },
    ...audit,
  ];
  return invites;
};

export const mockSetErrorStatus = (id: string, status: AdminError['status']) => {
  errors = errors.map((e) => (e.id === id ? { ...e, status } : e));
  return errors;
};
