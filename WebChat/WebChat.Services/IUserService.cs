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
        


    }
}
