using CryptoHelper;
using Microsoft.IdentityModel.Tokens;
using System;
using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using WebChat.Models.ViewModels;



namespace WebChat.Services
{
    public class AuthService : IAuthService
    {
        private readonly string jwtSecret;
        private readonly int jwtLifeSpan;

        public AuthService(string jwtSecret, int jwtLifeSpan)
        {
            
            this.jwtLifeSpan = jwtLifeSpan;
            this.jwtSecret = jwtSecret;
        }

        /// <summary>Name of the claim carrying the user's security stamp.</summary>
        public const string SecurityStampClaim = "sstamp";

        public AuthData GetToken(string id, string securityStamp)
        {
            var expirationTime = DateTime.UtcNow.AddSeconds(jwtLifeSpan);

            var tokenDescriptor = new SecurityTokenDescriptor()
            {
                Subject = new ClaimsIdentity(new[]
                {
                    new Claim(ClaimTypes.Name, id),

                    // Carried so authentication can reject this token once the stamp is
                    // rotated. Without it the JWT is unrevokable: nothing else in the request
                    // pipeline consults the database.
                    new Claim(SecurityStampClaim, securityStamp ?? string.Empty),
                }),

                Expires = expirationTime,

                SigningCredentials = new SigningCredentials
                (
                    new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwtSecret)), 
                    SecurityAlgorithms.HmacSha256Signature
                )
            };

            

            var tokenHandler = new JwtSecurityTokenHandler();

            var token = tokenHandler.WriteToken(tokenHandler.CreateToken(tokenDescriptor));
            return new AuthData
            {
                Token = token,
                TokenExpirationTime = ((DateTimeOffset)expirationTime).ToUnixTimeSeconds(),
                Id = id

            };
            
        }

        public string HashPassword(string password)
        {
            return PasswordHasher.HashPassword(password);
        }

        public bool isPasswordUniq(string email)
        {
            throw new NotImplementedException();
        }

        public bool VerifyPassword(string actualPassword, string hashedPassword)
        {
            return PasswordHasher.VerifyHashedPassword(hashedPassword, actualPassword);
        }

        
    }
}
