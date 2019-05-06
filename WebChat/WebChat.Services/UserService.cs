using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using WebChat.Connection;
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

        public UserService(WebChatContext ctx, IAuthService authService, IThreadService threadService, IMappingService mappingService)
        {
            this.ctx = ctx ?? throw new ArgumentNullException("Context can not be null");
            this.authService = authService;
            this.threadService = threadService;
            this.mappingService = mappingService;
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

            newUser.CreatedOn = DateTime.Now;

            ctx.User.Add(newUser);
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
            if (string.IsNullOrEmpty(email))
            {
                throw new ArgumentNullException("Email can not be null or empty");
            }

            return ctx.User.FirstOrDefault(u => u.Email == email);
        }

        public string GetUserIdByName(string name)
        {
            return ctx.User.FirstOrDefault(u => u.Username == name).Id;
        }

        public string GetUserNameById(string id)
        {
            return ctx.User.FirstOrDefault(u => u.Id == id).Username;
        }

        public UserViewModel GetUserProfile(string userId)
        {
            var model = ctx.User.FirstOrDefault(u => u.Id == userId);
            var viewModel = this.mappingService.MapUserModelToUserViewModel(model);
            viewModel.Username = GetUserNameById(userId);

            return viewModel;

        }

        public ICollection<User> GetUsers()
        {
            return ctx.User.ToList();
        }

        public bool isEmailUniq(string email)
        {
            if (string.IsNullOrEmpty(email))
            {
                throw new ArgumentNullException("Email can not be null or empty");
            }
            var user = ctx.User.FirstOrDefault(u => u.Email == email);

            if (user != null)
            {
                return false;
            }

            return true;
        }

        public bool isUsernameUniq(string userName)
        {
            if (string.IsNullOrEmpty(userName))
            {
                throw new ArgumentNullException("Username can not be null or empty");
            }
            var user = ctx.User.FirstOrDefault(u => u.Username == userName);

            if (user != null)
            {
                return false;
            }

            return true;
        }


    }
}
