using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using WebChat.Connection;
using WebChat.Hubs.Interfaces;
using WebChat.Models;
using WebChat.Models.ViewModels;
using WebChat.Services.Inerfaces;

namespace WebChat.Services
{
    public class UserService : IUserService
    {
        private readonly WebChatContext ctx;
        private readonly IAuthService authService;
        private readonly IThreadService threadService;
        private readonly IMappingService mappingService;
        private readonly IConnectionMapping<string> connectionMapping;

        public UserService(
            WebChatContext ctx, 
            IAuthService authService, 
            IThreadService threadService, 
            IMappingService mappingService, 
            IConnectionMapping<string> connectionMapping)
        {
            this.ctx = ctx ?? throw new ArgumentNullException("Context can not be null");
            this.authService = authService ?? throw new ArgumentNullException("Authorization service can not be null");  
            this.threadService = threadService ?? throw new ArgumentNullException("Thread service service can not be null");
            this.mappingService = mappingService ?? throw new ArgumentNullException("Mapping service service can not be null");
            this.connectionMapping = connectionMapping ?? throw new ArgumentNullException(nameof(connectionMapping));
        }

        public void UpdateProfile(ProfileViewModel model)
        {
            var entity = this.ctx.User.FirstOrDefault(u => u.Id == model.Id);
            entity.Email = model.Email;
            entity.Username = model.Username;
            ctx.User.Update(entity);
            ctx.SaveChanges();
        }

        public IEnumerable<UserViewModel> FindUserByMatch(string match, string curentUser)
        {
            if (string.IsNullOrEmpty(curentUser)) throw new ArgumentNullException("Current user Id can not be null");

            var queryResult = ctx.User.Where(u => u.Username.IndexOf(match) > -1 && u.Id != curentUser);
            var searchResult = new List<UserViewModel>();
            foreach (var user in queryResult)
            {
                //Check is current user has any connection to provide online/offline status
                List<string> userConnections = connectionMapping.GetConnections(user.Id).ToList();

                var userVm = mappingService.MapUserModelToUserViewModel(user);
                userVm.IsOnline = userConnections.Count == 0 ? false : true;
                searchResult.Add(userVm);
            }
            return searchResult;
        }

        public void AddAvatar(string avatarId, string userId)
        {
            var user = ctx.User.FirstOrDefault(u => u.Id == userId);
            user.AvatarFileName = avatarId;
            ctx.User.Update(user);
            ctx.SaveChanges();
        }

        public void AddUser(User newUser)
        {
            if (newUser == null)
            {
                throw new ArgumentNullException("User Entity can not be null");
            }

            newUser.CreatedOn = DateTime.UtcNow;

            ctx.User.Add(newUser);
            ctx.SaveChanges();
        }

        public void SetEmailConfirmation(string userId, string tokenHash, DateTime sentAt)
        {
            var user = ctx.User.FirstOrDefault(u => u.Id == userId);
            if (user == null)
            {
                return;
            }

            // Overwriting rather than adding: a resend must invalidate the link already in
            // the user's inbox, or every old email stays usable until it expires.
            user.EmailConfirmationTokenHash = tokenHash;
            user.EmailConfirmationSentAt = sentAt;
            ctx.User.Update(user);
            ctx.SaveChanges();
        }

        public User GetUserByConfirmationHash(string tokenHash)
        {
            // Guarded, because a null hash matches every row that has no pending confirmation
            // - which is most of them, and would confirm an arbitrary account.
            if (string.IsNullOrWhiteSpace(tokenHash))
            {
                return null;
            }

            return ctx.User.FirstOrDefault(u => u.EmailConfirmationTokenHash == tokenHash);
        }

        public void ConfirmEmail(string userId)
        {
            var user = ctx.User.FirstOrDefault(u => u.Id == userId);
            if (user == null)
            {
                return;
            }

            user.EmailConfirmed = true;

            // Clearing these is what makes the link single-use. Leaving them would let the
            // same URL be replayed until it expired.
            user.EmailConfirmationTokenHash = null;
            user.EmailConfirmationSentAt = null;
            user.ModifiedOn = DateTime.UtcNow;

            ctx.User.Update(user);
            ctx.SaveChanges();
        }

        public void SetPasswordReset(string userId, string tokenHash, DateTime sentAt)
        {
            var user = ctx.User.FirstOrDefault(u => u.Id == userId);
            if (user == null)
            {
                return;
            }

            // Overwrites any previous request, so asking again invalidates the link already
            // sent rather than leaving several usable at once.
            user.PasswordResetTokenHash = tokenHash;
            user.PasswordResetSentAt = sentAt;
            ctx.User.Update(user);
            ctx.SaveChanges();
        }

        public User GetUserByPasswordResetHash(string tokenHash)
        {
            // Guarded: a null hash matches every row with no reset pending, which is nearly
            // all of them, and would hand over an arbitrary account.
            if (string.IsNullOrWhiteSpace(tokenHash))
            {
                return null;
            }

            return ctx.User.FirstOrDefault(u => u.PasswordResetTokenHash == tokenHash);
        }

        public string ResetPassword(string userId, string newPasswordHash)
        {
            var user = ctx.User.FirstOrDefault(u => u.Id == userId);
            if (user == null)
            {
                return null;
            }

            user.Password = newPasswordHash;

            // Rotating this is what actually ends the compromise: every token signed with the
            // previous stamp stops authenticating on its next request. Without it a reset
            // changes the password while an attacker keeps their session for up to a week.
            user.SecurityStamp = Guid.NewGuid().ToString();

            // Clearing these makes the link single-use.
            user.PasswordResetTokenHash = null;
            user.PasswordResetSentAt = null;

            // Opening a link sent to that mailbox is the same proof activation asks for, so
            // someone who resets should not then be told to go and confirm.
            user.EmailConfirmed = true;
            user.EmailConfirmationTokenHash = null;
            user.EmailConfirmationSentAt = null;

            user.ModifiedOn = DateTime.UtcNow;
            ctx.User.Update(user);
            ctx.SaveChanges();

            return user.SecurityStamp;
        }

        public User CreateUser(string username, string email, string password)
        {

            var newUser = new User()
            {
                Id = Guid.NewGuid().ToString(),
                Username = username,
                Email = email,
                Password = authService.HashPassword(password),

                // Explicit, not left to the column default. #63 taught this the hard way: a
                // migration backfilled every existing row and hid that the write path still
                // wrote whatever the default happened to be. Nobody registers into a
                // privileged role; promotion is a separate, deliberate act.
                Role = WorkspaceRole.Member,

                // Active, not pending. Pending means "invited, never activated" and belongs
                // to the invitation flow (#72); someone who registered themselves has an
                // account from this moment - the email confirmation they still owe is
                // tracked by EmailConfirmed, which is a different question and already has
                // its own answer.
                Status = AccountStatus.Active,

                // Present from creation: a null stamp would make the very first token
                // unverifiable against the user it was issued for.
                SecurityStamp = Guid.NewGuid().ToString()
            };

            return newUser;
        }

        public string GetOponentIdByTheadId(string senderId, string threadId)
        {
            //Get thread from thread service
            Thread currentThread = this.threadService.GetThreadById(threadId);
            if (currentThread.OwnerId == senderId)
            {
                return currentThread.OponentId;
            }
            return currentThread.OwnerId;
            throw new NotImplementedException();
        }

        public User GetUserByEmail(string email)
        {
            // Email only - see UserQueries.ByEmail for why reset and resend must not accept a
            // username. No longer throws on empty input either: these endpoints pass
            // user-supplied values straight in, and a throw there is a 500 where a null is a
            // clean "no such user".
            return UserQueries.ByEmail(ctx.User, email);
        }

        public User FindByEmailOrUsername(string identifier)
        {
            return UserQueries.ByEmailOrUsername(ctx.User, identifier);
        }

        public string GetUserIdByName(string name)
        {
            return ctx.User.FirstOrDefault(u => u.Username == name)?.Id;
        }

        /// <summary>
        /// The username, or null when there is no such user.
        ///
        /// Null rather than an exception, because a missing user here is ordinary rather than
        /// exceptional. Every caller before the audit log passed an id taken from a thread's
        /// current members or a message's sender - ids that exist by construction - so the
        /// missing `?.` went unnoticed for as long as that stayed true. The audit log breaks
        /// it deliberately: an entry naming a deactivated account is precisely the entry worth
        /// keeping, and resolving names at read time is why the endpoint asks at all. One such
        /// row turned the whole page into a 500.
        ///
        /// Callers already treat null as "leave the name out", and the client renders
        /// "someone" for an id it cannot resolve - so there is exactly one fallback, on the
        /// side that displays it.
        /// </summary>
        public string GetUserNameById(string id)
        {
            return ctx.User.FirstOrDefault(u => u.Id == id)?.Username;
        }

        public ProfileViewModel GetUserProfile(string userId)
        {
            var model = ctx.User.FirstOrDefault(u => u.Id == userId);

            // A signed token whose user no longer exists is not an exceptional case: it
            // happens whenever the database is rebuilt while a browser still holds a session,
            // which the move off SQL Server made routine. Returning null lets the controller
            // answer 401 instead of throwing a NullReferenceException out of the mapper.
            if (model == null)
            {
                return null;
            }

            var viewModel = this.mappingService.MapUserModelRoProfileViewModel(model);
            viewModel.Username = GetUserNameById(userId);

            return viewModel;

        }
        //TODO: Check opponent's status
        public OponentViewModel GetOponentProfile(string id)
        {
            var userConnections = connectionMapping.GetConnections(id);

            var profile = (from u in ctx.User
                           where u.Id == id
                           select new OponentViewModel
                           {
                               Id = u.Id, Username = u.Username,
                               AvatarFileName = u.AvatarFileName,
                               IsOnline = userConnections.Count() > 0 ? true : false
                           }).FirstOrDefault();
            return profile;
        }

        public ICollection<User> GetUsers()
        {
            return ctx.User.ToList();
        }

        // Both are now case-insensitive. Comparing exactly let `User@x.com` and `user@x.com`
        // register as two accounts, after which sign-in resolved to whichever the database
        // happened to return first.
        public bool isEmailUniq(string email)
        {
            return UserQueries.IsEmailAvailable(ctx.User, email);
        }

        public bool isUsernameUniq(string userName)
        {
            return UserQueries.IsUsernameAvailable(ctx.User, userName);
        }


    }
}
