using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using WebChat.Connection;
using WebChat.Models;

namespace WebChat.Services
{
    public class UserService : IUserService
    {
        private readonly WebChatContext ctx;
        private readonly IAuthService authService;

        public UserService(WebChatContext ctx, IAuthService authService)
        {
            this.ctx = ctx ?? throw new ArgumentNullException("Context can not be null");
            this.authService = authService;
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

        public User GetUserByEmail(string email)
        {
            if (string.IsNullOrEmpty(email))
            {
                throw new ArgumentNullException("Email can not be null or empty");
            }

            return ctx.User.FirstOrDefault(u => u.Email == email);
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
