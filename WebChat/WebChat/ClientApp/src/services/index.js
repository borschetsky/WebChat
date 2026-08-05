// Barrel for the raw API layer.
//
// UI components should import from ./chat-service instead - it composes these with the
// adapters and the mock layer. The only direct consumers left are getUserAvatar (image
// URLs) and uploadAvatar (multipart, which chat-service does not wrap).
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
    searchForUsers,
    login,
    register, confirmEmail, resendConfirmation, forgotPassword, resetPassword,
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
    searchForUsers,
    login,
    register, confirmEmail, resendConfirmation, forgotPassword, resetPassword,
    searchForMessageInThread,
    updateUsersProfile,
};
