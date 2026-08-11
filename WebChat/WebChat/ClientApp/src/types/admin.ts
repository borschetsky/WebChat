/**
 * The admin console's view models.
 *
 * The audit log is real (#70); everything else is still served from
 * `services/admin-mocks.ts`. The shapes are chosen to match what the eventual endpoints
 * should return, so making a section real is normally a change to
 * `services/admin-service.ts` and nothing else. See issue #64.
 *
 * **"And nothing else" turned out to have one exception, worth stating because it is the
 * kind that recurs.** The original fixtures held *rendered* strings - `'2 h ago'`,
 * `'Alice blocked Bob'` - and no server can send either: it does not know when the page
 * will be read, and a stored sentence is frozen in the phrasing and language of whoever
 * wrote it. So every timestamp here is an instant rendered through
 * `lib/date-time-format.ts`, and the audit log carries facts that `auditSentence.ts` turns
 * into words. A mock that formats for display hides work the seam cannot absorb.
 */

/** Workspace role as the console displays it. Capitalised for display only. */
export type AdminRoleLabel = 'Owner' | 'Admin' | 'Member' | 'Guest';

/**
 * The four account statuses. The spec is explicit that these are genuinely distinct and
 * must not be collapsed:
 *
 * - `active` — signed in and usable
 * - `pending` — invited, never activated
 * - `blocked` — account and history kept, sessions ended, sign-in refused
 * - `deactivated` — offboarded, removed from all groups
 */
export type AdminStatus = 'active' | 'pending' | 'blocked' | 'deactivated';

export interface AdminMember {
  id: string;
  name: string;
  email: string;
  role: AdminRoleLabel;
  status: AdminStatus;
  /** ISO instant of last activity, or null for an account that has never signed in. */
  lastActiveUtc: string | null;
  online: boolean;
  /** ISO instant. */
  joinedUtc: string;
  groups: number;
  sessions: number;
  mfa: boolean;
}

export interface AdminInvite {
  id: string;
  email: string;
  /** Who sent it. */
  by: string;
  /** ISO instant. */
  sentAtUtc: string;
  /**
   * ISO instant. 30-day expiry; a week or less is highlighted.
   *
   * A deadline, not a countdown: "12 days left" computed by the server is wrong by one the
   * moment the page is left open past midnight, and wrong by more if it is left open
   * overnight. `getDaysUntil` does the arithmetic at render.
   */
  expiresAtUtc: string;
}

/** Mirrors `AuditAction` on the server. A value with no case here renders no sentence. */
export type AdminAuditKind =
  'block' | 'unblock' | 'deactivate' | 'activate' | 'role' | 'invite' | 'policy' | 'login';

/**
 * One audit entry, as **facts** rather than as a sentence.
 *
 * The server stores and sends `kind` plus a `data` object; `auditSentence.ts` turns them
 * into the wording. Same rule as a system message, and for the same reason: a stored
 * sentence is frozen in the phrasing - and the language - of whoever was an admin when it
 * was written, and cannot be corrected or re-localised afterwards.
 *
 * `names` is resolved **server-side at read time**, because the people an audit entry is
 * about are precisely the ones the client can no longer resolve: a deactivated account is
 * gone from every member list it holds.
 */
export interface AdminAudit {
  id: string;
  kind: AdminAuditKind;
  actorId: string;
  targetType: string;
  targetId: string | null;
  data: Record<string, unknown> | null;
  names: Record<string, string> | null;
  /** ISO instant. Rendered through `getRelativeTime`, never sent pre-formatted. */
  occurredAtUtc: string;
}

export type AdminErrorLevel = 'fatal' | 'error' | 'warning';
export type AdminErrorStatus = 'new' | 'acknowledged' | 'resolved';

export interface AdminErrorCrumb {
  t: string;
  k: string;
  v: string;
}

/**
 * One row per **fingerprint** — component + function + error name — never the raw message.
 * Interpolated values in a message would open a new issue per occurrence.
 */
export interface AdminError {
  id: string;
  level: AdminErrorLevel;
  name: string;
  message: string;
  culprit: string;
  route: string;
  release: string;
  events: number;
  users: number;
  /** ISO instants. */
  firstSeenUtc: string;
  lastSeenUtc: string;
  status: AdminErrorStatus;
  browsers: string;
  /** 14-day sparkline. */
  spark: number[];
  stack: string[];
  crumbs: AdminErrorCrumb[];
}

export interface AdminOverview {
  total: number;
  active: number;
  pending: number;
  blocked: number;
  chart: { value: number; day: string }[];
}
