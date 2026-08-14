import type { AdminPolicies } from '@/types/admin';

/**
 * The nine rows the Policies screen draws, and what each of them actually is.
 *
 * **The screen is honest about the difference, which is the whole point of #75.** Eight of
 * these nine had no code path that read them: they were switches rendered from mock state
 * that reset on reload. A toggle with no enforcement point is worse than a mock - a mock is
 * obviously a mock, while a switch that looks configured tells the one person whose job is to
 * know how the workspace is set up that it is set up a way it is not.
 *
 * So a row is only interactive when the **server** says the policy exists. This file supplies
 * wording and grouping; it never decides what is enforced. That is deliberate and it is the
 * safe direction: a client that is ahead of its server shows a row as inert rather than
 * offering a switch nothing honours.
 */

export type PolicyState =
  /** The server enforces it and it can be changed. */
  | 'enforced'
  /** The server enforces it unconditionally - true, and not a choice. */
  | 'always-on'
  /** Nothing reads it yet. Rendered, and labelled as such. */
  | 'not-enforced';

export interface PolicyRow {
  key: string;
  label: string;
  hint: string;
}

export interface PolicyGroup {
  title: string;
  sub: string;
  rows: PolicyRow[];
}

/**
 * Keys are the wire contract and must match `WorkspacePolicy` on the server for the enforced
 * ones. The rest are named in the same style so that giving one an enforcement point later is
 * a server change and a deletion here, not a rename.
 */
export const POLICY_GROUPS: PolicyGroup[] = [
  {
    title: 'Membership',
    sub: 'Who can join, and how',
    rows: [
      {
        key: 'require_admin_approval_for_invites',
        label: 'Require admin approval for invites',
        hint: 'Members can propose an invite; an admin confirms it.',
      },
      {
        key: 'allow_guest_accounts',
        label: 'Allow guest accounts',
        hint: 'Guests see only the conversations they are added to.',
      },
      {
        key: 'deactivate_after_90_days_idle',
        label: 'Automatically deactivate after 90 days idle',
        hint: 'Accounts are kept, sessions ended.',
      },
    ],
  },
  {
    title: 'Messaging',
    sub: 'What people can do in conversations',
    rows: [
      {
        key: 'members_can_create_groups',
        label: 'Members can create groups',
        hint: 'Turning this off leaves group creation to admins.',
      },
      {
        key: 'members_can_delete_own_messages',
        label: 'Members can delete their own messages',
        hint: 'Deletions are recorded in the audit log.',
      },
      {
        key: 'retain_messages_indefinitely',
        label: 'Retain messages indefinitely',
        hint: 'When off, messages older than a year are removed.',
      },
    ],
  },
  {
    title: 'Security',
    sub: 'Sign-in and sessions',
    rows: [
      {
        key: 'require_two_factor',
        label: 'Require two-factor authentication',
        hint: 'Applies to admins and owners first.',
      },
      {
        key: 'sessions_end_on_password_change',
        label: 'End sessions on password change',
        hint: 'Changing a password rotates the security stamp, which refuses every token issued before it.',
      },
      {
        key: 'confirm_sign_in_from_new_devices',
        label: 'Confirm sign-in from a new device',
        hint: 'An email check the first time an account signs in from somewhere new.',
      },
    ],
  },
];

/**
 * What a row is, according to the server.
 *
 * Defaults to `not-enforced` for anything the server did not mention, which is what keeps the
 * screen from ever claiming more than the backend does.
 */
export const policyState = (key: string, data: AdminPolicies | undefined): PolicyState => {
  if (!data) return 'not-enforced';
  if (data.alwaysOn?.includes(key)) return 'always-on';
  return Object.prototype.hasOwnProperty.call(data.policies ?? {}, key)
    ? 'enforced'
    : 'not-enforced';
};

/** The switch position. An unenforced row shows off rather than a value nothing backs. */
export const policyValue = (key: string, data: AdminPolicies | undefined): boolean => {
  if (policyState(key, data) === 'always-on') return true;
  return data?.policies?.[key] ?? false;
};

/**
 * Any policy the server enforces that this build has no row for.
 *
 * Rendered rather than dropped, for the reason the funnel keeps an unknown stage: a client one
 * deploy behind should show something odd instead of silently omitting a control that governs
 * the workspace.
 */
export const unknownPolicies = (data: AdminPolicies | undefined): string[] => {
  const known = new Set(POLICY_GROUPS.flatMap((g) => g.rows.map((r) => r.key)));
  return Object.keys(data?.policies ?? {}).filter((key) => !known.has(key));
};
