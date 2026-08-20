using System;
using System.Collections.Generic;
using System.Text;
using WebChat.Models;
using WebChat.Models.ViewModels;

namespace WebChat.Services
{
    public interface IUserService
    {
        void UpdateProfile(ProfileViewModel model);

        OponentViewModel GetOponentProfile(string id);

        IEnumerable<UserViewModel> FindUserByMatch(string match, string curentUser);

        ProfileViewModel GetUserProfile(string userId);

        /// <summary>
        /// Points the user at a newly stored avatar, and at the original it was cropped from.
        ///
        /// Replaces the old <c>AddAvatar</c>, which returned nothing - and returning nothing is
        /// why issue #20 existed: the caller never learned which object had just stopped being
        /// referenced, so nothing could delete it. The previous keys come back so exactly one
        /// place, after the write has committed, can clean them up.
        ///
        /// This is the **replace a photo** path, so both previous objects are surrendered:
        /// the old crop and the old original. Passing a null
        /// <paramref name="originalFileName"/> still clears the stored original, because an
        /// original that no longer matches the avatar is worse than none - "Adjust crop" would
        /// re-open a different photo.
        /// </summary>
        AvatarUpdate SetAvatar(string userId, string avatarFileName, string originalFileName, AvatarCropViewModel crop);

        /// <summary>
        /// Points the user at a newly rendered crop of the original they already have.
        ///
        /// The **re-crop** path, and the difference from <see cref="SetAvatar"/> is the whole
        /// of it: the previous crop is surrendered, the original is kept. Deleting the original
        /// here would silently degrade "Adjust crop" back into "pick the file again" - a
        /// failure no test notices and no user can explain.
        ///
        /// Still writes a new <paramref name="avatarFileName"/>, never the same key twice:
        /// CachingAvatarUrlProvider memoises a presigned URL for 30 minutes and the redirect is
        /// served max-age=300, so re-rendering into a stable key serves the old picture from
        /// two caches at once - most visibly to the person who just re-cropped.
        /// </summary>
        AvatarUpdate SetAvatarCrop(string userId, string avatarFileName, AvatarCropViewModel crop);

        /// <summary>
        /// The key of this user's stored original, or null. Resolved server-side from the
        /// caller's own row rather than accepted from the client, which is what makes an
        /// original readable only by the person it belongs to.
        /// </summary>
        string GetAvatarOriginalFileName(string userId);

        bool isEmailUniq(string email);

        bool isUsernameUniq(string userName);

        User GetUserByEmail(string email);

        /// <summary>
        /// Finds a user by email address or username, case-insensitively. Returns null rather
        /// than throwing for anything unknown or malformed.
        /// </summary>
        User FindByEmailOrUsername(string identifier);

        User CreateUser(string username, string email, string password);

        void AddUser(User newUser);

        string GetUserNameById(string id);

        string GetUserIdByName(string name);

        string GetOponentIdByTheadId(string senderId, string threadId);

        ICollection<User> GetUsers();

        /// <summary>
        /// Records a pending confirmation, replacing any previous one - so a resend
        /// invalidates the link already sent rather than leaving two valid at once.
        /// </summary>
        void SetEmailConfirmation(string userId, string tokenHash, DateTime sentAt);

        /// <summary>
        /// Finds the user holding this pending token hash, or null. Expiry and the
        /// constant-time comparison are still the token service's job.
        /// </summary>
        User GetUserByConfirmationHash(string tokenHash);

        /// <summary>
        /// Marks the address confirmed and clears the pending token, which is what makes a
        /// confirmation link single-use.
        /// </summary>
        void ConfirmEmail(string userId);

        /// <summary>Records a pending password reset, replacing any previous one.</summary>
        void SetPasswordReset(string userId, string tokenHash, DateTime sentAt);

        /// <summary>Finds the user holding this pending reset hash, or null.</summary>
        User GetUserByPasswordResetHash(string tokenHash);

        /// <summary>
        /// Sets a new password hash, clears the reset token, and marks the email confirmed -
        /// opening the link proved the mailbox.
        /// </summary>
        /// <summary>
        /// Sets a new password hash, clears the reset token, marks the email confirmed, and
        /// rotates the security stamp so existing sessions stop working. Returns the new
        /// stamp, so the caller can issue a token that will actually authenticate.
        /// </summary>
        string ResetPassword(string userId, string newPasswordHash);



    }

    /// <summary>
    /// What an avatar write leaves behind: the object keys that were referenced a moment ago
    /// and are not any more.
    ///
    /// The type exists so the delete rule is stated rather than inferred. Replacing a photo
    /// surrenders both objects; re-cropping surrenders only the crop and leaves
    /// <see cref="PreviousOriginalFileName"/> null, because the original has to survive for
    /// the crop to be adjustable a second time. Getting that backwards is not loud - it
    /// silently turns "Adjust crop" back into "pick the file again" - so it lives in a return
    /// value a test can read.
    /// </summary>
    public class AvatarUpdate
    {
        private AvatarUpdate() { }

        /// <summary>False when the user row was not there, in which case nothing was written.</summary>
        public bool Ok { get; private set; }

        /// <summary>The crop that has just stopped being the user's avatar, or null.</summary>
        public string PreviousAvatarFileName { get; private set; }

        /// <summary>
        /// The original that has just stopped being referenced, or null - including the null
        /// that means "kept deliberately", which is the re-crop case.
        /// </summary>
        public string PreviousOriginalFileName { get; private set; }

        public static AvatarUpdate Written(string previousAvatar, string previousOriginal) =>
            new AvatarUpdate
            {
                Ok = true,
                PreviousAvatarFileName = previousAvatar,
                PreviousOriginalFileName = previousOriginal,
            };

        public static AvatarUpdate NoSuchUser() => new AvatarUpdate();
    }
}
