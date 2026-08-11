import type { AdminError, AdminInvite } from '@/types/admin';

export type AdminTab = 'overview' | 'members' | 'invites' | 'errors' | 'audit' | 'policies';

export interface AdminNavItem {
  key: AdminTab;
  label: string;
  /** Bottom-navigation label below 600px, where the full one does not fit. */
  short: string;
  icon: string;
  title: string;
  searchHint?: string;
}

/**
 * The five sections plus policies, in rail order.
 *
 * `icon` names are Material Symbols, matching the design file; the components map them to
 * `@mui/icons-material` imports, since the app has no icon font loaded and adding one for
 * six glyphs would cost more than the imports do.
 */
export const ADMIN_NAV: AdminNavItem[] = [
  { key: 'overview', label: 'Overview', short: 'Home', icon: 'dashboard', title: 'Overview' },
  {
    key: 'members',
    label: 'Members',
    short: 'Members',
    icon: 'group',
    title: 'Members',
    searchHint: 'Search name or email',
  },
  {
    key: 'invites',
    label: 'Invitations',
    short: 'Invites',
    icon: 'mail',
    title: 'Invitations',
    searchHint: 'Search invitations',
  },
  {
    key: 'errors',
    label: 'UI errors',
    short: 'Errors',
    icon: 'bug_report',
    title: 'UI errors',
    searchHint: 'Search errors',
  },
  { key: 'audit', label: 'Audit log', short: 'Audit', icon: 'history', title: 'Audit log' },
  { key: 'policies', label: 'Policies', short: 'Policies', icon: 'policy', title: 'Policies' },
];

/**
 * The badge counts. Only two sections carry one, and both are "things waiting for you"
 * rather than totals - a count that never goes down stops being read.
 */
export const navBadge = (
  key: AdminTab,
  invites: AdminInvite[] = [],
  errors: AdminError[] = [],
): number => {
  if (key === 'invites') return invites.length;
  if (key === 'errors') return errors.filter((e) => e.status !== 'resolved').length;
  return 0;
};

/** The console entry point's badge: pending invitations plus unresolved errors. */
export const consoleBadge = (invites: AdminInvite[] = [], errors: AdminError[] = []): number =>
  navBadge('invites', invites, errors) + navBadge('errors', invites, errors);
