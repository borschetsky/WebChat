/**
 * Whether a workspace role may reach the admin console.
 *
 * Mirrors `WorkspaceRole.CanAdminister` on the server, and like every other client-side
 * permission check in this app it decides only what to *draw* or where to navigate. The
 * server re-checks each request; a route guard protects nothing.
 *
 * An unrecognised role denies, matching the server, so a value this client has not heard of
 * closes the door rather than opening it.
 */
export const isAdminRole = (role: string | null | undefined): boolean =>
  role === 'owner' || role === 'admin';
