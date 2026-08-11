import { createApi, fakeBaseQuery } from '@reduxjs/toolkit/query/react';
import * as admin from '@/services/admin-service';
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
      queryFn: () => run(() => admin.loadOverview()),
      providesTags: ['Overview'],
    }),

    getMembers: build.query<AdminMember[], void>({
      queryFn: () => run(() => admin.loadMembers()),
      providesTags: ['Members'],
    }),

    getInvites: build.query<AdminInvite[], void>({
      queryFn: () => run(() => admin.loadInvites()),
      providesTags: ['Invites'],
    }),

    getAudit: build.query<AdminAudit[], void>({
      queryFn: () => run(() => admin.loadAudit()),
      providesTags: ['Audit'],
    }),

    getErrors: build.query<AdminError[], void>({
      queryFn: () => run(() => admin.loadErrors()),
      providesTags: ['Errors'],
    }),

    setMemberStatus: build.mutation<AdminMember[], { ids: string[]; status: AdminStatus }>({
      queryFn: ({ ids, status }) => run(() => admin.setMemberStatus(ids, status)),
      // Overview counts every status, so blocking somebody moves the stat cards too.
      invalidatesTags: ['Members', 'Overview', 'Audit'],
    }),

    setMemberRole: build.mutation<AdminMember[], { id: string; role: AdminRoleLabel }>({
      queryFn: ({ id, role }) => run(() => admin.setMemberRole(id, role)),
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

    sendInvites: build.mutation<AdminInvite[], { emails: string[]; role: AdminRoleLabel }>({
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
