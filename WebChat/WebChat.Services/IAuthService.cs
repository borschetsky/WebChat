

using WebChat.Models.ViewModels;

namespace WebChat.Services
{
    public interface IAuthService
    {
        AuthData GetToken(string id);

        string HashPassword(string password);

        bool VerifyPassword(string actualPassword, string hashedPassword);

    }
}