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
        ///
        /// **Null while a removal is pending**, even though the key is still in the row: to
        /// everything outside the restore path a removed photo does not exist, so "Adjust
        /// crop" is refused rather than being a second way to bring it back with a different
        /// rectangle. See <see cref="RemoveAvatar"/>.
        /// </summary>
        string GetAvatarOriginalFileName(string userId);

        /// <summary>
        /// Marks the user's photo removed (#89) without deleting anything.
        ///
        /// **A retention marker, and the handoff is what forces it.** Remove has no confirm
        /// dialog; instead a snackbar offers an Undo that must restore the photo *and* its
        /// crop. The server cannot re-derive a crop - cropping has been client-side by design
        /// since #84 - so the only Undo that is exact rather than approximate is one that
        /// never threw anything away. <c>User.AvatarRemovedAt</c> is therefore the whole
        /// change: the keys and the four crop columns stay exactly as they were, and every
        /// read path asks <see cref="Models.AvatarVisibility"/> instead of the column.
        ///
        /// Idempotent in both directions that matter. Removing twice keeps the *first*
        /// timestamp, because that is the moment retention is measured from; removing when
        /// there was never a photo writes nothing and is not an error, since the state the
        /// caller asked for already holds.
        /// </summary>
        AvatarRemoveOutcome RemoveAvatar(string userId);

        /// <summary>
        /// Clears a pending removal, which restores the photo and the crop exactly - they were
        /// never touched.
        ///
        /// **Takes no file name, and that is the security property, not an ergonomic one.**
        /// The keys are resolved from the caller's own row, so there is nothing for a client
        /// to substitute; accepting one would let anybody point their avatar at any object in
        /// the bucket, including another user's original.
        /// </summary>
        AvatarRestore RestoreAvatar(string userId);

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

    /// <summary>
    /// What <see cref="IUserService.RemoveAvatar"/> found, rather than just whether it worked.
    ///
    /// Three of the four are successes. Removing is an idempotent request for a *state* - "I
    /// have no photo" - so asking for a state that already holds is not an error, and the
    /// caller answers 200 for all three. The distinction is kept because the tests need it and
    /// because a log line saying which happened is worth more than "remove: ok".
    /// </summary>
    public enum AvatarRemoveOutcome
    {
        /// <summary>The token names a user that is not there. The caller answers 401.</summary>
        NoSuchUser,

        /// <summary>There was a photo and it is now marked removed.</summary>
        Removed,

        /// <summary>
        /// A removal was already pending. Nothing is written - in particular the original
        /// timestamp stands, because retention is measured from the first removal, not from
        /// however many times a client repeated itself.
        /// </summary>
        AlreadyRemoved,

        /// <summary>
        /// There was no photo to begin with. Deliberately not an error: the state the caller
        /// asked for holds, and a 400 here would turn a double-click or a stale tab into a
        /// message the user cannot act on.
        /// </summary>
        NoPhoto,
    }

    /// <summary>What <see cref="IUserService.RestoreAvatar"/> found, and what to show after it.</summary>
    public class AvatarRestore
    {
        private AvatarRestore() { }

        public AvatarRestoreOutcome Outcome { get; private set; }

        /// <summary>
        /// The user's visible avatar after the call, or null when there is none. Broadcast, so
        /// other clients patch to the restored face rather than waiting for a refetch.
        /// </summary>
        public string AvatarFileName { get; private set; }

        public static AvatarRestore Of(AvatarRestoreOutcome outcome, string avatarFileName = null) =>
            new AvatarRestore { Outcome = outcome, AvatarFileName = avatarFileName };
    }

    /// <summary>
    /// The four ways an Undo can land.
    ///
    /// The shape here answers "what happens when Undo is pressed after the moment has passed",
    /// which is the question #89 asks and the one a snackbar makes real: the button can outlive
    /// the state it undoes by a tab that was never closed. Nothing in this list is a 500, and
    /// only the last is a refusal.
    /// </summary>
    public enum AvatarRestoreOutcome
    {
        /// <summary>The token names a user that is not there. The caller answers 401.</summary>
        NoSuchUser,

        /// <summary>A removal was pending and has been undone. The photo and its crop are back.</summary>
        Restored,

        /// <summary>
        /// Nothing was removed and the user has a photo - Undo pressed twice, or pressed in a
        /// second tab. The end state the caller wanted already holds, so this is a success and
        /// answers 200 rather than confusing somebody with a failure for a thing that worked.
        /// </summary>
        NotRemoved,

        /// <summary>
        /// There is genuinely nothing to bring back: no pending removal and no photo. The
        /// caller answers 409 and says so, because reporting success here would claim a photo
        /// had been restored that the user will then not see.
        /// </summary>
        NothingToRestore,
    }
}
