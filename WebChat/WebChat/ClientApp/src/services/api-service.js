import Axios from 'axios';
// Import the module directly, not the barrel: services/index.js imports this file, so
// going through it makes the dependency circular.
import authHeader from './auth-header';
import Config from '@/config';
import { breadcrumb } from '@/lib/error-reporter';

// const _baseUrl = 'https://localhost:44397/api/';
export const _baseUrl = `${Config.network.api}api/`;

// Every API call leaves a breadcrumb, so a crash report says what the app was doing rather
// than only where it landed (#74). Interceptors on the default axios instance, which is what
// every function in this file uses.
//
// One direction only: this file knows about the reporter, and the reporter deliberately does
// not know about this one - it posts with `fetch` and builds its own URL from `@/config`.
// Routing the report through axios would make that a real import cycle, and would also put
// the crash report through the very interceptors that are recording breadcrumbs about it.
//
// The URL is recorded without its query string. Search terms and tokens both travel there,
// and a breadcrumb trail is read by an administrator who is not the person it is about.
const path = (url) => (typeof url === 'string' ? url.split('?')[0] : '');

Axios.interceptors.response.use(
  (response) => {
    breadcrumb(
      'fetch',
      `${response.config?.method?.toUpperCase() ?? 'GET'} ${path(response.config?.url)} · ${response.status}`,
    );
    return response;
  },
  (error) => {
    // A failed request is the breadcrumb that matters most, and it is also the one that would
    // be missing if only the success path were instrumented.
    breadcrumb(
      'fetch',
      `${error?.config?.method?.toUpperCase() ?? 'GET'} ${path(error?.config?.url)} · ${error?.response?.status ?? 'failed'}`,
    );
    return Promise.reject(error);
  },
);

const register = async (registerObj) => {
  const result = await Axios.post(`${_baseUrl}auth/register`, registerObj);
  return await result;
};

const login = async (loginObj) => {
  const result = await Axios.post(`${_baseUrl}auth/login`, loginObj);
  return await result;
};

// Exchanges the token from an activation link for a session. The link points at the API
// rather than here, so this is only reached when the SPA route hands the token back.
const confirmEmail = async (token) => {
  const result = await Axios.get(`${_baseUrl}auth/confirm?token=${encodeURIComponent(token)}`);
  return await result;
};

// Always resolves with the same 200 whatever the address is - the endpoint deliberately
// gives nothing away about which addresses hold accounts.
const forgotPassword = async (email) => {
  const result = await Axios.post(`${_baseUrl}auth/forgot-password`, { email });
  return await result;
};

const resetPassword = async (token, password) => {
  const result = await Axios.post(`${_baseUrl}auth/reset-password`, { token, password });
  return await result;
};

const resendConfirmation = async (email) => {
  const result = await Axios.post(`${_baseUrl}auth/resend-confirmation`, { email });
  return await result;
};

const searchForUsers = async (value, token) => {
  const result = await Axios.get(`${_baseUrl}users/search?name=${value}`, {
    headers: authHeader(token),
  });
  return await result;
};

const uploadAvatar = async (fromData, token) => {
  const result = await Axios.post(`${_baseUrl}avatars/upload`, fromData, {
    headers: authHeader(token),
  });
  return await result;
};

// A separate endpoint from `upload`, not a flag on it, because the two differ in what the
// server *deletes*: replacing a photo drops the previous crop and the previous original,
// while re-cropping drops the crop and keeps the original. Inferring that from "no original
// part was attached" would mean a request that merely forgot the attachment silently kept an
// original belonging to a photo the user has replaced.
const recropAvatar = async (formData, token) => {
  const result = await Axios.post(`${_baseUrl}avatars/recrop`, formData, {
    headers: authHeader(token),
  });
  return await result;
};

// Remove the caller's own profile photo (#89).
//
// Takes no id and no file name - the server resolves the keys from the caller's row - and
// deletes nothing: it sets a retention marker, so the Undo below can restore the photo *and*
// the crop exactly. Answers 200 even when there was nothing to remove, because it is a request
// for a state rather than an operation on an object.
const removeAvatar = async (token) => {
  const result = await Axios.post(`${_baseUrl}avatars/remove`, null, {
    headers: authHeader(token),
  });
  return await result;
};

// Undo. **Deliberately sends nothing but the token.**
//
// A restore that accepted a file name would let any client point its avatar at any object in
// the bucket, including another user's `originals/` key - which is the exact thing the
// owner-checked original endpoint exists to prevent. The server already knows what to put back,
// so there is nothing here to get wrong.
const restoreAvatar = async (token) => {
  const result = await Axios.post(`${_baseUrl}avatars/restore`, null, {
    headers: authHeader(token),
  });
  return await result;
};

// The caller's own un-cropped photo, as bytes.
//
// Takes no id: the server resolves the key from the caller's row, which is what makes an
// original readable only by the person it belongs to. A blob rather than a URL because the
// cropper needs a `File` to decode - and because a presigned URL would be a capability that
// outlives the check that produced it, which is the whole reason originals are not on the
// anonymous /images path.
const getAvatarOriginal = async (token) => {
  const result = await Axios.get(`${_baseUrl}avatars/original`, {
    headers: authHeader(token),
    responseType: 'blob',
  });
  return await result;
};
const getProfile = async (token) => {
  const result = await Axios.get(`${_baseUrl}users/getprofile`, {
    headers: authHeader(token),
  });
  return await result;
};

const getMessages = async (threadId, token) => {
  const result = await Axios.get(`${_baseUrl}thread/getmessages/${threadId}`, {
    headers: authHeader(token),
  });
  return await result;
};

const getThreads = async (token) => {
  const result = await Axios.get(`${_baseUrl}hey/getthreads`, {
    headers: authHeader(token),
  });
  return await result;
};

// The creator is added by the server, so only the other members are sent - a client cannot
// create a group it is not in, and therefore cannot create one it has no right to read.
const createGroup = async (name, memberIds, token) => {
  const result = await Axios.post(
    `${_baseUrl}hey/creategroup`,
    {
      Name: name,
      MemberIds: memberIds,
    },
    {
      headers: authHeader(token),
    },
  );
  return await result;
};

const createThread = async (oponentViewModel, token) => {
  const result = await Axios.post(
    `${_baseUrl}hey/createthread`,
    {
      OponentVM: oponentViewModel,
    },
    {
      headers: authHeader(token),
    },
  );
  return await result;
};

const sendMessageToApi = async (messageViewModel, token) => {
  const result = await Axios.post(`${_baseUrl}hey/send`, messageViewModel, {
    headers: authHeader(token),
  });
  return await result;
};

const searchForMessageInThread = async (token, params) => {
  const result = await Axios.get(`${_baseUrl}thread/search`, {
    headers: authHeader(token),
    params: params,
  });
  return await result;
};

// --- group management (SPEC-group-wire-contract.md §1) -------------------------
//
// Every mutation is a compare-and-swap on the group's version, carried in `If-Match`. The
// server answers a stale one with 409 and the current group attached, so the caller can
// reconcile without refetching - which is why these deliberately do not swallow the error.

const groupHeaders = (token, version) => ({
  ...authHeader(token),
  // Quoted, as an entity tag is. The server strips the quotes.
  ...(version == null ? {} : { 'If-Match': `"${version}"` }),
});

const conversationUrl = (groupId) => `${_baseUrl}conversations/${encodeURIComponent(groupId)}`;

const getAdminOverview = async (token) => {
  const result = await Axios.get(`${_baseUrl}admin/overview`, { headers: authHeader(token) });
  return await result;
};

// Answers `{ policies, alwaysOn }`. The server is the authority on which policies are real:
// a key absent from `policies` is one nothing enforces, and the screen renders it as such
// rather than as a switch.
const getAdminPolicies = async (token) => {
  const result = await Axios.get(`${_baseUrl}admin/policies`, { headers: authHeader(token) });
  return await result;
};

const setAdminPolicy = async (key, value, token) => {
  const result = await Axios.post(
    `${_baseUrl}admin/policies/${encodeURIComponent(key)}`,
    { value },
    { headers: authHeader(token) },
  );
  return await result;
};

// Real as of #74. One row per fingerprint, with the sparkline, the distinct-user count and
// the browser list all counted server-side from the retained occurrences.
const getAdminErrors = async (token) => {
  const result = await Axios.get(`${_baseUrl}admin/errors`, { headers: authHeader(token) });
  return await result;
};

// Returns the whole list back, like the member and invitation mutations, so the screen
// re-renders from what the server holds rather than from a guess about what the change did.
const setAdminErrorStatus = async (id, status, token) => {
  const result = await Axios.post(
    `${_baseUrl}admin/errors/${encodeURIComponent(id)}/status`,
    { status },
    { headers: authHeader(token) },
  );
  return await result;
};

const getAdminInvitations = async (token) => {
  const result = await Axios.get(`${_baseUrl}admin/invitations`, { headers: authHeader(token) });
  return await result;
};

const sendAdminInvitations = async (emails, role, token) => {
  const result = await Axios.post(
    `${_baseUrl}admin/invitations`,
    { emails, role },
    { headers: authHeader(token) },
  );
  return await result;
};

// Resend *is* extend: it rotates the token, which kills the previous link, so the new one
// has to be mailed. There is deliberately no separate extend endpoint to call.
const resendAdminInvitation = async (id, token) => {
  const result = await Axios.post(
    `${_baseUrl}admin/invitations/${encodeURIComponent(id)}/resend`,
    {},
    { headers: authHeader(token) },
  );
  return await result;
};

const revokeAdminInvitation = async (id, token) => {
  const result = await Axios.post(
    `${_baseUrl}admin/invitations/${encodeURIComponent(id)}/revoke`,
    {},
    { headers: authHeader(token) },
  );
  return await result;
};

// Anonymous: the landing page has to render before anybody signs in.
const inspectInvitation = async (inviteToken) => {
  const result = await Axios.get(`${_baseUrl}invitations/${encodeURIComponent(inviteToken)}`);
  return await result;
};

const redeemInvitation = async (inviteToken, token) => {
  const result = await Axios.post(
    `${_baseUrl}invitations/${encodeURIComponent(inviteToken)}/redeem`,
    {},
    { headers: authHeader(token) },
  );
  return await result;
};

const getAdminMembers = async (token) => {
  const result = await Axios.get(`${_baseUrl}admin/members`, { headers: authHeader(token) });
  return await result;
};

// Bulk, because the members table has a bulk action bar - and the server refuses a batch
// whole rather than applying the part that passes, so there is no partial state to reconcile.
const setAdminMemberStatus = async (ids, status, token) => {
  const result = await Axios.post(
    `${_baseUrl}admin/members/status`,
    { ids, status },
    { headers: authHeader(token) },
  );
  return await result;
};

const setAdminMemberRole = async (id, role, token) => {
  const result = await Axios.post(
    `${_baseUrl}admin/members/${encodeURIComponent(id)}/role`,
    { role },
    { headers: authHeader(token) },
  );
  return await result;
};

// `before` is a keyset cursor - the occurredAtUtc of the oldest row already held - not a
// page number. The audit table only grows, and grows at the end being read, so an offset
// would re-show rows that arrived between one request and the next.
const getAuditLog = async ({ before, limit } = {}, token) => {
  const result = await Axios.get(`${_baseUrl}admin/audit`, {
    headers: authHeader(token),
    params: { before, limit },
  });
  return await result;
};

const getGroup = async (groupId, token) => {
  const result = await Axios.get(conversationUrl(groupId), { headers: authHeader(token) });
  return await result;
};

const renameGroup = async (groupId, name, version, token) => {
  const result = await Axios.patch(
    `${conversationUrl(groupId)}/name`,
    // Explicitly null rather than omitted: null is the revert-to-auto-naming instruction,
    // and an absent key would read as "no change".
    { name },
    { headers: groupHeaders(token, version) },
  );
  return await result;
};

const addGroupMembers = async (groupId, userIds, version, token) => {
  const result = await Axios.post(
    `${conversationUrl(groupId)}/members`,
    { userIds },
    { headers: groupHeaders(token, version) },
  );
  return await result;
};

const removeGroupMember = async (groupId, userId, version, token) => {
  const result = await Axios.delete(
    `${conversationUrl(groupId)}/members/${encodeURIComponent(userId)}`,
    { headers: groupHeaders(token, version) },
  );
  return await result;
};

const setGroupRole = async (groupId, userId, gRole, version, token) => {
  const result = await Axios.put(
    `${conversationUrl(groupId)}/members/${encodeURIComponent(userId)}/role`,
    { gRole },
    { headers: groupHeaders(token, version) },
  );
  return await result;
};

const transferGroupOwnership = async (groupId, userId, version, token) => {
  const result = await Axios.post(
    `${conversationUrl(groupId)}/owner`,
    { userId },
    { headers: groupHeaders(token, version) },
  );
  return await result;
};

const setGroupPermissions = async (groupId, perms, version, token) => {
  const result = await Axios.patch(`${conversationUrl(groupId)}/perms`, perms, {
    headers: groupHeaders(token, version),
  });
  return await result;
};

const updateUsersProfile = async (token, user) => {
  const result = await Axios.post(`${_baseUrl}users/update`, user, {
    headers: authHeader(token),
  });
  return await result;
};

export {
  getProfile,
  getMessages,
  getThreads,
  createThread,
  createGroup,
  sendMessageToApi,
  uploadAvatar,
  recropAvatar,
  removeAvatar,
  restoreAvatar,
  getAvatarOriginal,
  searchForUsers,
  login,
  register,
  confirmEmail,
  resendConfirmation,
  forgotPassword,
  resetPassword,
  searchForMessageInThread,
  updateUsersProfile,
  getGroup,
  renameGroup,
  addGroupMembers,
  removeGroupMember,
  setGroupRole,
  transferGroupOwnership,
  setGroupPermissions,
  getAuditLog,
  getAdminOverview,
  getAdminPolicies,
  setAdminPolicy,
  getAdminErrors,
  setAdminErrorStatus,
  getAdminMembers,
  setAdminMemberStatus,
  setAdminMemberRole,
  getAdminInvitations,
  sendAdminInvitations,
  resendAdminInvitation,
  revokeAdminInvitation,
  inspectInvitation,
  redeemInvitation,
};
