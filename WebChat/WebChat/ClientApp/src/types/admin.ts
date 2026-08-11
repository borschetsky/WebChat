/**
 * The admin console's view models.
 *
 * Everything here is currently served from `services/admin-mocks.ts`; the shapes are chosen
 * to match what the eventual endpoints should return, so making a section real is a change
 * to `services/admin-service.ts` and nothing else. See issue #64.
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
  /** Pre-formatted "last active", not a timestamp. */
  last: string;
  online: boolean;
  joined: string;
  groups: number;
  sessions: number;
  mfa: boolean;
}

export interface AdminInvite {
  id: string;
  email: string;
  /** Who sent it. */
  by: string;
  sent: string;
  /** Days until it lapses. 30-day expiry; a week or less is highlighted. */
  days: number;
}

export type AdminAuditKind =
  'block' | 'deactivate' | 'login' | 'invite' | 'role' | 'policy' | 'activate';

export interface AdminAudit {
  id: string;
  kind: AdminAuditKind;
  text: string;
  meta: string;
  time: string;
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
  first: string;
  last: string;
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
  recentAudit: AdminAudit[];
}
