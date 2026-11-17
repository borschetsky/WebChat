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

        /// <summary>
        /// Stored in <c>User.Password</c> for an account that has no local password - one
        /// created by an external sign-in, or taken over from an unconfirmed registration.
        ///
        /// A marker rather than null because the column is <c>NOT NULL</c> and every existing
        /// reader assumes a string. It is not valid base64, so no hash can ever equal it, and
        /// <see cref="VerifyPassword"/> refuses it before the hasher sees it - the hasher would
        /// otherwise throw on it and turn a wrong password into a 500.
        /// </summary>
        public const string NoLocalPassword = "!no-local-password";

        public bool VerifyPassword(string actualPassword, string hashedPassword)
        {
            if (string.IsNullOrEmpty(hashedPassword) || hashedPassword == NoLocalPassword)
            {
                return false;
            }

            return PasswordHasher.VerifyHashedPassword(hashedPassword, actualPassword);
        }

        
    }
}
