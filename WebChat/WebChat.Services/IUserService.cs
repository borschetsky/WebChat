using System;
using System.Collections.Generic;
using System.Text;
using WebChat.Models;

namespace WebChat.Services
{
    public interface IUserService
    {
        bool isEmailUniq(string email);

        bool isUsernameUniq(string userName);

        User GetUserByEmail(string email);

        User CreateUser(string username, string email, string password);

        void AddUser(User newUser);



    }
}
