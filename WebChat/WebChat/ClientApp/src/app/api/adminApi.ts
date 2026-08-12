import { createApi, fakeBaseQuery } from '@reduxjs/toolkit/query/react';
import * as admin from '@/services/admin-service';
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
  tagTypes: ['Overview', 'Members', 'Invites', 'Audit', 'Errors'],
  endpoints: (build) => ({
    getOverview: build.query<AdminOverview, void>({
      queryFn: (_arg, api) => run(() => admin.loadOverview(tokenOf(api.getState))),
      // Members too: the stat cards count the real list, so blocking somebody has to move
      // them even though this query is not the one that fetched it.
      providesTags: ['Overview', 'Members'],
    }),

    getMembers: build.query<AdminMember[], void>({
      queryFn: (_arg, api) => run(() => admin.loadMembers(tokenOf(api.getState))),
      providesTags: ['Members'],
    }),

    getInvites: build.query<AdminInvite[], void>({
      queryFn: () => run(() => admin.loadInvites()),
      providesTags: ['Invites'],
    }),

    // Real, like members and overview's counts. Invitations, errors and policies still
    // resolve against fixtures and ignore authentication entirely - see admin-mocks.ts.
    getAudit: build.query<AdminAudit[], { before?: string; limit?: number } | void>({
      queryFn: (arg, api) => run(() => admin.loadAudit(tokenOf(api.getState), arg ?? {})),
      providesTags: ['Audit'],
    }),

    getErrors: build.query<AdminError[], void>({
      queryFn: () => run(() => admin.loadErrors()),
      providesTags: ['Errors'],
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
      queryFn: (id) => run(() => admin.revokeInvite(id)),
      invalidatesTags: ['Invites', 'Overview', 'Audit'],
    }),

    extendInvite: build.mutation<AdminInvite[], string>({
      queryFn: (id) => run(() => admin.extendInvite(id)),
      invalidatesTags: ['Invites'],
    }),

    sendInvites: build.mutation<AdminInvite[], { emails: string[]; role: AdminRole }>({
      queryFn: ({ emails, role }) => run(() => admin.sendInvites(emails, role)),
      invalidatesTags: ['Invites', 'Overview', 'Audit'],
    }),

    setErrorStatus: build.mutation<AdminError[], { id: string; status: AdminErrorStatus }>({
      queryFn: ({ id, status }) => run(() => admin.setErrorStatus(id, status)),
      invalidatesTags: ['Errors'],
    }),
  }),
});

export const {
  useGetOverviewQuery,
  useGetMembersQuery,
  useGetInvitesQuery,
  useGetAuditQuery,
  useGetErrorsQuery,
  useSetMemberStatusMutation,
  useSetMemberRoleMutation,
  useRevokeInviteMutation,
  useExtendInviteMutation,
  useSendInvitesMutation,
  useSetErrorStatusMutation,
} = adminApi;
