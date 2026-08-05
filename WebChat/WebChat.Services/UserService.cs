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

        public User CreateUser(string username, string email, string password)
        {

            var newUser = new User()
            {
                Id = Guid.NewGuid().ToString(),
                Username = username,
                Email = email,
                Password = authService.HashPassword(password)
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
            // No longer throws on empty input. Sign-in, resend-confirmation and password
            // reset all pass user-supplied values straight in, and a throw on a public
            // endpoint is a 500 where a null is a clean "no such user".
            return UserQueries.ByEmailOrUsername(ctx.User, email);
        }

        public User FindByEmailOrUsername(string identifier)
        {
            return UserQueries.ByEmailOrUsername(ctx.User, identifier);
        }

        public string GetUserIdByName(string name)
        {
            return ctx.User.FirstOrDefault(u => u.Username == name).Id;
        }

        public string GetUserNameById(string id)
        {
            return ctx.User.FirstOrDefault(u => u.Id == id).Username;
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
