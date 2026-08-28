/**
 * The admin console's view models.
 *
 * **UI errors is the last section served from `services/admin-mocks.ts`**; the audit log
 * (#70), members (#71), invitations (#72), the overview (#73) and policies (#75) all have
 * real endpoints now, and #74 is what would finish the set. `services/admin-service.ts` is
 * the authority on which is which - it imports exactly `mockErrors` and `mockSetErrorStatus`
 * - because a comment saying so drifts and that file cannot.
 *
 * The shapes are chosen to match what the eventual endpoints should return, so making a
 * section real is normally a change to `services/admin-service.ts` and nothing else. See
 * issue #64.
 *
 * **"And nothing else" turned out to have one exception, worth stating because it is the
 * kind that recurs.** The original fixtures held *rendered* strings - `'2 h ago'`,
 * `'Alice blocked Bob'` - and no server can send either: it does not know when the page
 * will be read, and a stored sentence is frozen in the phrasing and language of whoever
 * wrote it. So every timestamp here is an instant rendered through
 * `lib/date-time-format.ts`, and the audit log carries facts that `auditSentence.ts` turns
 * into words. A mock that formats for display hides work the seam cannot absorb.
 */

/**
 * Workspace role, exactly as the server stores and sends it (`WorkspaceRole` in C#).
 *
 * Lower-case, and capitalised only at the point of display. The mocks used to carry
 * `'Owner' | 'Admin' | 'Member' | 'Guest'` — capitalised for the screen, and including a
 * `Guest` tier that does not exist anywhere in this app. Both were fiction the seam could
 * not absorb: one would have needed translating on every request, and the other named a
 * permission level with nothing behind it.
 */
export type AdminRole = 'owner' | 'admin' | 'member';

/** Sentence case for display. The wire value stays lower-case. */
export const ROLE_LABEL: Record<AdminRole, string> = {
  owner: 'Owner',
  admin: 'Admin',
  member: 'Member',
};

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
  role: AdminRole;
  status: AdminStatus;
  avatarFileName: string | null;
  /**
   * ISO instant, or null. Currently derived from the newest message they sent, because the
   * app records no general activity timestamp — so an account that reads constantly and
   * never writes reads as idle. Null means "never wrote anything", rendered as an em dash
   * rather than as an invented date.
   */
  lastActiveUtc: string | null;
  /** Live hub connections right now, not a last-seen guess. */
  online: boolean;
  /** ISO instant. */
  joinedUtc: string;
  groups: number;
  /**
   * Open hub connections. Named for what it measures: the mock called this `sessions`, and
   * a JWT cannot be counted once issued, so "3 sessions" was never a number anyone could
   * have produced.
   */
  connections: number;
  /**
   * Replaces the mock's `mfa`. This app has no second factor at all, so a "Two-factor: On"
   * row was stating a security property that did not exist — the worst kind of fiction to
   * leave on an admin screen.
   */
  emailConfirmed: boolean;
}

export interface AdminInvite {
  id: string;
  email: string;
  /** Display name of whoever sent it, resolved server-side. */
  by: string;
  /** The role they will land in. Never `owner` — an invitation cannot hand over the workspace. */
  role: AdminRole;
  /**
   * ISO instant, and it moves on every resend: resending mints a *new* token rather than
   * re-mailing the old one, so "sent" means "this link was sent", not "you were first
   * invited".
   */
  sentAtUtc: string;
  /**
   * ISO instant. 30-day expiry; a week or less is highlighted.
   *
   * A deadline, not a countdown: "12 days left" computed by the server is wrong by one the
   * moment the page is left open past midnight, and wrong by more if it is left open
   * overnight. `getDaysUntil` does the arithmetic at render.
   *
   * It bounds *this token's* life rather than the invitation's — a resend rotates the token
   * and starts the window again, which is what stops a single mailed secret staying live
   * indefinitely.
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

/**
 * The workspace policies, as the server reports them.
 *
 * `policies` holds only the ones something actually reads, so its **keys** are the contract:
 * a row the client knows about that is absent here is not enforced, and is rendered as such.
 * `alwaysOn` is behaviour that is unconditional and therefore not a switch at all.
 */
export interface AdminPolicies {
  policies: Record<string, boolean>;
  alwaysOn: string[];
}

/** One stage of the activation funnel. Each is a subset of the one above it. */
export interface AdminFunnelStage {
  /**
   * `registered` | `confirmed` | `joined` | `wrote` today — deliberately typed as `string`
   * rather than that union.
   *
   * The union would be a lie in the direction that matters: it tells the compiler an unknown
   * stage cannot arrive, so `FUNNEL_STAGE[stage.key]` narrows to always-defined and the
   * fallback in `overviewText.ts` reads as dead code somebody would delete. A server one
   * deploy ahead sends a fifth stage, and the client must render its raw key rather than an
   * undefined label. Wire values are open sets; the client is the one that is behind.
   */
  key: string;
  value: number;
}

export interface AdminOverview {
  total: number;
  active: number;
  pending: number;
  /** Blocked and deactivated together — both mean sign-in is refused. */
  blocked: number;
  /** Accounts created in the last 30 days. */
  joinedRecently: number;
  /** Outstanding invitations lapsing within a week. */
  expiringSoon: number;
  /**
   * Fourteen days, oldest first, gap-filled — days with no messages are present with a
   * value of zero, so the bars do not silently re-space when a quiet day drops out.
   *
   * `dayUtc` is an instant, not a weekday letter: the client derives "M"/"T" at render, and
   * a server-side letter would be wrong for every reader outside UTC.
   */
  chart: { dayUtc: string; value: number }[];
  funnel: AdminFunnelStage[];
}
