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
  mockAudit,
  mockErrors,
  mockExtendInvite,
  mockInvites,
  mockMembers,
  mockOverview,
  mockRevokeInvite,
  mockSendInvites,
  mockSetErrorStatus,
  mockSetMemberRole,
  mockSetMemberStatus,
} from './admin-mocks';

import type {
  AdminAudit,
  AdminError,
  AdminErrorStatus,
  AdminInvite,
  AdminMember,
  AdminOverview,
  AdminRoleLabel,
  AdminStatus,
} from '@/types/admin';

export const loadOverview = async (): Promise<AdminOverview> => mockOverview();

export const loadMembers = async (): Promise<AdminMember[]> => mockMembers();

export const loadInvites = async (): Promise<AdminInvite[]> => mockInvites();

export const loadAudit = async (): Promise<AdminAudit[]> => mockAudit();

export const loadErrors = async (): Promise<AdminError[]> => mockErrors();

/** Bulk, because the members table supports multi-select with a bulk action bar. */
export const setMemberStatus = async (ids: string[], status: AdminStatus): Promise<AdminMember[]> =>
  mockSetMemberStatus(ids, status);

export const setMemberRole = async (id: string, role: AdminRoleLabel): Promise<AdminMember[]> =>
  mockSetMemberRole(id, role);

export const revokeInvite = async (id: string): Promise<AdminInvite[]> => mockRevokeInvite(id);

/** Moves the deadline without issuing a new link. */
export const extendInvite = async (id: string): Promise<AdminInvite[]> => mockExtendInvite(id);

export const sendInvites = async (emails: string[], role: AdminRoleLabel): Promise<AdminInvite[]> =>
  mockSendInvites(emails, role);

export const setErrorStatus = async (id: string, status: AdminErrorStatus): Promise<AdminError[]> =>
  mockSetErrorStatus(id, status);
