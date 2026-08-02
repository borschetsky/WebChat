/**
 * Bearer header for an authenticated request, or an empty object when there is no token.
 * Returning {} rather than undefined keeps call sites free of spread guards.
 */
const authHeader = (token: string | null | undefined): Record<string, string> =>
  token && token.length !== 0 ? { Authorization: `Bearer ${token}` } : {};

export default authHeader;
