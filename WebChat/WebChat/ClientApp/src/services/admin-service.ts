// The single surface the admin console talks to.
//
// Same rule as services/chat-service.ts: components must not reach into ./admin-mocks
// directly, so a mocked section is indistinguishable from a real one at the call site.
// When a section gains a backend, only this file and ./admin-mocks change.
//
// Everything is async and returns a promise even though the mocks are synchronous, because
// the endpoints that replace them will not be - a call site written against a synchronous
// mock has to be rewritten, which is exactly the coupling this seam exists to avoid.

import {
  getAdminMembers,
  getAuditLog,
  setAdminMemberRole,
  setAdminMemberStatus,
} from './api-service';

import {
  mockErrors,
  mockExtendInvite,
  mockInvites,
  mockOverview,
  mockRevokeInvite,
  mockSendInvites,
  mockSetErrorStatus,
} from './admin-mocks';

import type {
  AdminAudit,
  AdminError,
  AdminErrorStatus,
  AdminInvite,
  AdminMember,
  AdminOverview,
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
 * Half real: the four stat cards are counted from the live members list, the 14-day chart
 * is still fixture (#73).
 *
 * It takes the token because of that first half. A section that is partly real needs the
 * same plumbing as a fully real one - which is the argument for wiring it here rather than
 * leaving Overview counting a fixture until #73.
 */
export const loadOverview = async (token: string): Promise<AdminOverview> =>
  mockOverview(await loadMembers(token));

/** Real as of #71. The list is the workspace's people, presence included. */
export const loadMembers = async (token: string): Promise<AdminMember[]> =>
  listOf<AdminMember>(await getAdminMembers(token));

export const loadInvites = async (): Promise<AdminInvite[]> => mockInvites();

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

export const loadErrors = async (): Promise<AdminError[]> => mockErrors();

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

export const revokeInvite = async (id: string): Promise<AdminInvite[]> => mockRevokeInvite(id);

/** Moves the deadline without issuing a new link. */
export const extendInvite = async (id: string): Promise<AdminInvite[]> => mockExtendInvite(id);

export const sendInvites = async (emails: string[], role: AdminRole): Promise<AdminInvite[]> =>
  mockSendInvites(emails, role);

export const setErrorStatus = async (id: string, status: AdminErrorStatus): Promise<AdminError[]> =>
  mockSetErrorStatus(id, status);
