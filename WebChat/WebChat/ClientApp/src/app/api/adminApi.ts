import { createApi, fakeBaseQuery } from '@reduxjs/toolkit/query/react';
import * as admin from '@/services/admin-service';
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
 * RTK Query over the admin service seam.
 *
 * A separate api from `chatApi` rather than more endpoints on it, for one reason that
 * matters: this whole slice is lazily loaded with the `/admin` route, and the vast majority
 * of users will never load it. Folding it into chatApi would put the console's reducer and
 * every one of its endpoints into the bundle that signing in already pays for.
 *
 * Same fakeBaseQuery + queryFn shape as chatApi, so the two read alike and a section that
 * gains a backend is a change inside `services/admin-service.ts` alone.
 */

/** Same shape as chatApi's: read from the store inside the queryFn, never threaded in. */
const tokenOf = (getState: () => unknown): string => {
  const token = (getState() as { auth: { user?: { token?: string } } }).auth.user?.token;
  if (!token) throw new Error('Not authenticated');
  return token;
};

type Result<T> = { data: T; error?: undefined } | { data?: undefined; error: unknown };

const run = async <T>(fn: () => Promise<T>): Promise<Result<T>> => {
  try {
    return { data: await fn() };
  } catch (error) {
    const err = error as { message?: string; response?: { status?: number; data?: unknown } };
    return {
      error: {
        status: err.response?.status ?? 'CUSTOM_ERROR',
        data: err.response?.data ?? err.message,
      },
    };
  }
};

export const adminApi = createApi({
  reducerPath: 'adminApi',
  baseQuery: fakeBaseQuery(),
  tagTypes: ['Overview', 'Members', 'Invites', 'Audit', 'Errors', 'Policies'],
  endpoints: (build) => ({
    getOverview: build.query<AdminOverview | null, void>({
      queryFn: (_arg, api) => run(() => admin.loadOverview(tokenOf(api.getState))),
      providesTags: ['Overview'],
    }),

    getMembers: build.query<AdminMember[], void>({
      queryFn: (_arg, api) => run(() => admin.loadMembers(tokenOf(api.getState))),
      providesTags: ['Members'],
    }),

    getInvites: build.query<AdminInvite[], void>({
      queryFn: (_arg, api) => run(() => admin.loadInvites(tokenOf(api.getState))),
      providesTags: ['Invites'],
    }),

    // The only paged endpoint here, hence the argument. Everything else on this api reads or
    // writes in one call, and the audit log is the one table where "just fetch them all"
    // would be genuinely unbounded.
    getAudit: build.query<AdminAudit[], { before?: string; limit?: number } | void>({
      queryFn: (arg, api) => run(() => admin.loadAudit(tokenOf(api.getState), arg ?? {})),
      providesTags: ['Audit'],
    }),

    getErrors: build.query<AdminError[], void>({
      queryFn: (_arg, api) => run(() => admin.loadErrors(tokenOf(api.getState))),
      providesTags: ['Errors'],
    }),

    getPolicies: build.query<AdminPolicies, void>({
      queryFn: (_arg, api) => run(() => admin.loadPolicies(tokenOf(api.getState))),
      providesTags: ['Policies'],
    }),

    setPolicy: build.mutation<AdminPolicies, { key: string; value: boolean }>({
      queryFn: ({ key, value }, api) =>
        run(() => admin.setPolicy(key, value, tokenOf(api.getState))),
      invalidatesTags: ['Policies', 'Audit'],
    }),

    setMemberStatus: build.mutation<AdminMember[], { ids: string[]; status: AdminStatus }>({
      queryFn: ({ ids, status }, api) =>
        run(() => admin.setMemberStatus(ids, status, tokenOf(api.getState))),
      // Overview counts every status, so blocking somebody moves the stat cards too.
      invalidatesTags: ['Members', 'Overview', 'Audit'],
    }),

    setMemberRole: build.mutation<AdminMember[], { id: string; role: AdminRole }>({
      queryFn: ({ id, role }, api) =>
        run(() => admin.setMemberRole(id, role, tokenOf(api.getState))),
      invalidatesTags: ['Members', 'Audit'],
    }),

    revokeInvite: build.mutation<AdminInvite[], string>({
      queryFn: (id, api) => run(() => admin.revokeInvite(id, tokenOf(api.getState))),
      // Members too: revoking deactivates the pending account, so the row in the members
      // table changes status at the same moment.
      invalidatesTags: ['Invites', 'Members', 'Overview', 'Audit'],
    }),

    // No extendInvite. Extending rotates the token and therefore has to re-send, so it is
    // this same operation - see services/admin-service.ts.
    resendInvite: build.mutation<AdminInvite[], string>({
      queryFn: (id, api) => run(() => admin.resendInvite(id, tokenOf(api.getState))),
      // Overview too: resending resets the expiry, which is what its "expiring soon" count
      // is measuring - the one card a resend is most likely to be a reaction to.
      invalidatesTags: ['Invites', 'Overview', 'Audit'],
    }),

    sendInvites: build.mutation<admin.SendInvitesResult, { emails: string[]; role: AdminRole }>({
      queryFn: ({ emails, role }, api) =>
        run(() => admin.sendInvites(emails, role, tokenOf(api.getState))),
      // Each invitation creates a pending account, so the members table and the stat cards
      // both move.
      invalidatesTags: ['Invites', 'Members', 'Overview', 'Audit'],
    }),

    setErrorStatus: build.mutation<AdminError[], { id: string; status: AdminErrorStatus }>({
      queryFn: ({ id, status }, api) =>
        run(() => admin.setErrorStatus(id, status, tokenOf(api.getState))),
      // Audit too: triage is recorded like every other admin mutation, so the Overview's
      // recent-activity list has to re-read.
      invalidatesTags: ['Errors', 'Audit'],
    }),
  }),
});

export const {
  useGetOverviewQuery,
  useGetMembersQuery,
  useGetInvitesQuery,
  useGetAuditQuery,
  useGetErrorsQuery,
  useGetPoliciesQuery,
  useSetPolicyMutation,
  useSetMemberStatusMutation,
  useSetMemberRoleMutation,
  useRevokeInviteMutation,
  useResendInviteMutation,
  useSendInvitesMutation,
  useSetErrorStatusMutation,
} = adminApi;
