

using WebChat.Models.ViewModels;

namespace WebChat.Services
{
    public interface IAuthService
    {
        /// <summary>
        /// Issues a token for the user, stamped with their current security stamp. Passing a
        /// stale stamp produces a token that authentication will immediately reject.
        /// </summary>
        AuthData GetToken(string id, string securityStamp);

        string HashPassword(string password);

        bool VerifyPassword(string actualPassword, string hashedPassword);

    }
}