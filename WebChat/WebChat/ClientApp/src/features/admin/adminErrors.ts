/**
 * Turns a refused admin action into something worth reading.
 *
 * These matter more than most error strings, because every one of them is a guard doing its
 * job rather than a fault: an administrator who is told "something went wrong" after being
 * stopped from locking themselves out has learned nothing, and will try again.
 *
 * The server sends both a `code` and a `message`; the message is preferred, and this map is
 * the fallback for a client that meets a code from a newer deploy - or a network failure
 * with no body at all.
 */

const BY_CODE: Record<string, string> = {
  self_action: 'You cannot do that to your own account.',
  last_owner: 'The workspace would be left with no owner who can sign in.',
  owner_only: 'Only the workspace owner can appoint or remove administrators.',
  not_found: 'That account no longer exists.',
  invalid_status: 'That is not a status an account can be in.',
  invalid_role: 'That is not a workspace role.',
};

interface RtkQueryError {
  status?: number | string;
  data?: { error?: string; message?: string } | string;
}

export const errorMessage = (error: unknown): string => {
  const body = (error as RtkQueryError)?.data;

  if (body && typeof body === 'object') {
    if (body.message) return body.message;
    if (body.error && BY_CODE[body.error]) return BY_CODE[body.error];
  }

  // 403 with nothing usable in it is the shape a workspace role check produces, and it is
  // the one an admin is most likely to hit by accident.
  if ((error as RtkQueryError)?.status === 403) return BY_CODE.owner_only;

  return 'That did not go through. Nothing was changed.';
};
