// The single surface the admin console talks to.
//
// Same rule as services/chat-service.ts: components must not reach past this file, so a
// mocked section is indistinguishable from a real one at the call site. That seam has now
// done its whole job - **every section of this console is real** as of #74, and
// `./admin-mocks` is gone. The six mocked features left in this client are all in the chat
// app, and `services/mocks.ts` is where they live.
//
// Everything is async and returns a promise even though the mocks are synchronous, because
// the endpoints that replace them will not be - a call site written against a synchronous
// mock has to be rewritten, which is exactly the coupling this seam exists to avoid.

import {
  getAdminErrors,
  getAdminInvitations,
  getAdminMembers,
  getAdminOverview,
  getAdminPolicies,
  setAdminErrorStatus,
  setAdminPolicy,
  getAuditLog,
  inspectInvitation,
  redeemInvitation,
  resendAdminInvitation,
  revokeAdminInvitation,
  sendAdminInvitations,
  setAdminMemberRole,
  setAdminMemberStatus,
} from './api-service';

import type {
  AdminAudit,
  AdminError,
  AdminErrorStatus,
  AdminInvite,
  AdminMember,
  AdminOverview,
  AdminPolicies,
  AdminRole,
  AdminStatus,
} from '@/types/admin';

/**
 * An array from an axios response, or an empty one.
 *
 * Deliberately not `res.data ?? []`: a 204 carries no body, and some error shapes carry a
 * body that is not an array at all. Returning [] rather than letting either through keeps
 * every caller free of a guard.
 */
const listOf = <T>(res: { status: number; data: unknown } | undefined): T[] =>
  res && res.status !== 204 && Array.isArray(res.data) ? (res.data as T[]) : [];

/**
 * The invitation endpoints that also mail something answer with an envelope
 * (`{ invitations, failed }`) rather than a bare array, because a send that stored an
 * invitation but could not deliver it is a different outcome from a send that worked and
 * has to be reportable.
 */
const invitationsFrom = (res: { status: number; data: unknown } | undefined): AdminInvite[] => {
  const body = res?.data as { invitations?: unknown } | undefined;
  return Array.isArray(body?.invitations) ? (body.invitations as AdminInvite[]) : [];
};

export interface SendInvitesResult {
  invitations: AdminInvite[];
  /** Already had a usable account. Nothing to do about these. */
  skipped: string[];
  /** Invitation exists, mail did not go out. These need a resend. */
  failed: string[];
}

export interface InviteDetails {
  email: string;
  role: AdminRole;
  expiresAtUtc: string;
}

/**
 * Fully real as of #73 — stat cards, the 14-day message-volume chart and the activation
 * funnel are all counted server-side.
 *
 * It no longer derives its counts from the members list: the funnel and the chart need
 * aggregates that list cannot answer, and counting in one query beats shipping every member
 * to the browser to be tallied there.
 */
export const loadOverview = async (token: string): Promise<AdminOverview | null> => {
  const res = await getAdminOverview(token);
  return res && res.status !== 204 && res.data ? (res.data as AdminOverview) : null;
};

/** Real as of #71. The list is the workspace's people, presence included. */
export const loadMembers = async (token: string): Promise<AdminMember[]> =>
  listOf<AdminMember>(await getAdminMembers(token));

/** Real as of #72. Outstanding invitations only - redeemed and revoked ones are history. */
export const loadInvites = async (token: string): Promise<AdminInvite[]> =>
  listOf<AdminInvite>(await getAdminInvitations(token));

/**
 * The audit log - the first section of this console with a real backend behind it (#70).
 *
 * `before` is the `occurredAtUtc` of the oldest entry already held, not a page number; the
 * server pages by keyset because this table grows at the end being read.
 */
export const loadAudit = async (
  token: string,
  options: { before?: string; limit?: number } = {},
): Promise<AdminAudit[]> => {
  return listOf<AdminAudit>(await getAuditLog(options, token));
};

/**
 * Real as of #74, and the last section of this console to become so.
 *
 * One row per **fingerprint** - component, function and error name - never per occurrence and
 * never keyed on the message, which would open a fresh issue for every interpolated value and
 * turn the section into a log. The 14-day sparkline, the distinct-user count and the browser
 * list are all counted server-side from occurrences the retention job keeps for 30 days.
 */
export const loadErrors = async (token: string): Promise<AdminError[]> =>
  listOf<AdminError>(await getAdminErrors(token));

/**
 * Real as of #75, and deliberately smaller than the screen.
 *
 * An empty envelope on a missing or malformed body means "nothing is enforced", which renders
 * every row as inert. That is the safe failure: the alternative default - assuming the screen's
 * own list is enforced - is precisely the lie this slice removed.
 */
const policiesFrom = (res: { status: number; data: unknown } | undefined): AdminPolicies => {
  const body =
    res && res.status !== 204 ? (res.data as Partial<AdminPolicies> | undefined) : undefined;

  return {
    policies:
      body?.policies && typeof body.policies === 'object'
        ? (body.policies as Record<string, boolean>)
        : {},
    alwaysOn: Array.isArray(body?.alwaysOn) ? body.alwaysOn : [],
  };
};

export const loadPolicies = async (token: string): Promise<AdminPolicies> =>
  policiesFrom(await getAdminPolicies(token));

/** Returns the whole set back, so the screen re-renders from what the server now holds. */
export const setPolicy = async (
  key: string,
  value: boolean,
  token: string,
): Promise<AdminPolicies> => policiesFrom(await setAdminPolicy(key, value, token));

/**
 * Bulk, because the members table supports multi-select with a bulk action bar.
 *
 * The server refuses a batch **whole** rather than applying the part that passes - a bulk
 * block naming the caller, or every owner, changes nothing at all. So there is no partial
 * state for this to reconcile, and the returned list is the workspace as it now stands.
 */
export const setMemberStatus = async (
  ids: string[],
  status: AdminStatus,
  token: string,
): Promise<AdminMember[]> => listOf<AdminMember>(await setAdminMemberStatus(ids, status, token));

export const setMemberRole = async (
  id: string,
  role: AdminRole,
  token: string,
): Promise<AdminMember[]> => listOf<AdminMember>(await setAdminMemberRole(id, role, token));

export const revokeInvite = async (id: string, token: string): Promise<AdminInvite[]> =>
  listOf<AdminInvite>(await revokeAdminInvitation(id, token));

/**
 * Resend, which is also extend - there is deliberately no separate `extendInvite`.
 *
 * Resending rotates the token, so the 30-day window bounds how long one mailed secret stays
 * live rather than how long the invitation does. Once rotated the old link is dead, which is
 * why this cannot be split: an "extend" that did not re-send would exist only to break the
 * link the invitee is holding.
 */
export const resendInvite = async (id: string, token: string): Promise<AdminInvite[]> =>
  invitationsFrom(await resendAdminInvitation(id, token));

/**
 * Issues invitations and mails them.
 *
 * Returns the outstanding list plus two things the caller has to be able to tell apart:
 * `skipped` are addresses that already had a usable account — those people are in, and
 * nothing needs doing — while `failed` are invitations that exist but whose mail could not
 * be sent. Those need a resend, and nobody has told the recipient anything.
 */
export const sendInvites = async (
  emails: string[],
  role: AdminRole,
  token: string,
): Promise<SendInvitesResult> => {
  const res = await sendAdminInvitations(emails, role, token);
  const body = (res?.data ?? {}) as Partial<SendInvitesResult>;

  return {
    invitations: Array.isArray(body.invitations) ? body.invitations : [],
    skipped: Array.isArray(body.skipped) ? body.skipped : [],
    failed: Array.isArray(body.failed) ? body.failed : [],
  };
};

/** Looks a link up without consuming it. Anonymous — the landing page renders before sign-in. */
export const inspectInvite = async (inviteToken: string): Promise<InviteDetails | null> => {
  const res = await inspectInvitation(inviteToken);
  return res && res.status !== 204 && res.data ? (res.data as InviteDetails) : null;
};

export const redeemInvite = async (inviteToken: string, token: string): Promise<void> => {
  await redeemInvitation(inviteToken, token);
};

/**
 * Triage. Returns the whole list back, like every other mutation here, so the screen
 * re-renders from what the server now holds.
 *
 * There is no "ignore" and no delete: an issue leaves this list by not happening for long
 * enough, which the retention job decides. Marking one resolved does not stop it counting -
 * a resolved issue that recurs keeps its status and moves its last-seen forward, because that
 * is the only shape in which a regression is visible at all.
 */
export const setErrorStatus = async (
  id: string,
  status: AdminErrorStatus,
  token: string,
): Promise<AdminError[]> => listOf<AdminError>(await setAdminErrorStatus(id, status, token));
