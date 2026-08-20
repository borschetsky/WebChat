// Barrel for the raw API layer.
//
// UI components should import from ./chat-service instead - it composes these with the
// adapters and the mock layer. The only direct consumers left are getUserAvatar (image
// URLs) and the avatar-transfer calls - uploadAvatar, recropAvatar, getAvatarOriginal and
// the #89 pair removeAvatar/restoreAvatar - which move multipart bodies and raw bytes, or
// in the last two cases nothing at all: neither has a payload to adapt, and both are about
// the same avatar the other three write.
//
// default-image-service was dropped with the legacy screens: PresenceAvatar falls back to
// generated initials rather than fetching a placeholder from ui-avatars.com.
import getUserAvatar from './avatar-image-service';
import authHeader from './auth-header';
import {
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
} from './api-service';

export {
  getUserAvatar,
  authHeader,
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
};
