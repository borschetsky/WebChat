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

        void AddAvatar(string avatarId, string userId);

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
}
