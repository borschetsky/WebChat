using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Configuration;
using System;
using System.Threading.Tasks;
using WebChat.Models.ViewModels;
using WebChat.Services;
using WebChat.Services.Email;
using WebChat.ViewModels;

namespace WebChat.Controllers
{
    [Route("api/[controller]")]
    [ApiController]
    public class AuthController : ControllerBase
    {
        private readonly IAuthService authService;
        private readonly IUserService userService;
        private readonly IEmailSender emailSender;
        private readonly IEmailConfirmationTokenService tokens;
        private readonly EmailOptions emailOptions;
        private readonly IConfiguration configuration;

        public AuthController(
            IAuthService authService,
            IUserService userService,
            IEmailSender emailSender,
            IEmailConfirmationTokenService tokens,
            EmailOptions emailOptions,
            IConfiguration configuration)
        {
            this.authService = authService ?? throw new ArgumentNullException("Authorization service can not be null, check IoC container");
            this.userService = userService ?? throw new ArgumentNullException("User service can not be null, check IoC container");
            this.emailSender = emailSender ?? throw new ArgumentNullException(nameof(emailSender));
            this.tokens = tokens ?? throw new ArgumentNullException(nameof(tokens));
            this.emailOptions = emailOptions ?? throw new ArgumentNullException(nameof(emailOptions));
            this.configuration = configuration ?? throw new ArgumentNullException(nameof(configuration));
        }

        [HttpPost("login")]
        public ActionResult<AuthData> Post([FromBody] LoginViewModel model)
        {
            if (!ModelState.IsValid) return BadRequest(ModelState);

            var user = userService.GetUserByEmail(model.Email);

            if (user == null) return BadRequest(new { email = "no user with this email"});

            var passwordValid = authService.VerifyPassword(model.Password, user.Password);

            if (!passwordValid) return BadRequest(new { password = "invalid password"});

            // The gate. Checked after the password so that an unconfirmed account cannot be
            // used to probe which addresses are registered - the message only appears to
            // someone who already proved they own the credentials.
            if (!user.EmailConfirmed)
            {
                return StatusCode(403, new
                {
                    error = "email_not_confirmed",
                    message = "Confirm your email address to sign in. Check your inbox for the activation link.",
                });
            }

            return authService.GetToken(user.Id);
        }

        /// <summary>
        /// Creates the account and sends an activation link. Deliberately returns no token:
        /// the point of the feature is that an address is proven reachable before it can be
        /// used, and handing back a working session here would undo that.
        /// </summary>
        [HttpPost("register")]
        public async Task<ActionResult> Post([FromBody] RegisterViewModel model)
        {
            if (!ModelState.IsValid) return BadRequest(ModelState);

            if (!userService.isEmailUniq(model.Email)) return BadRequest(new { email = "user with this email already exists" });

            if (!userService.isUsernameUniq(model.Username)) return BadRequest(new { username = "user with this username already exists" });

            var user = userService.CreateUser(model.Username, model.Email, model.Password);
            userService.AddUser(user);

            var delivered = await SendConfirmation(user.Id, user.Username, user.Email);

            // The account exists either way. A provider outage must not cost someone their
            // registration - they are offered a resend instead. See issue #25.
            return StatusCode(201, new
            {
                emailSent = delivered,
                message = delivered
                    ? "Check your email for the activation link."
                    : "Your account was created, but the activation email could not be sent. Please request another.",
            });
        }

        /// <summary>
        /// Confirms an address from the link in the email, then signs the user in - arriving
        /// here is proof they own the mailbox, so making them type the password again buys
        /// nothing.
        /// </summary>
        [HttpGet("confirm")]
        public ActionResult<AuthData> Confirm([FromQuery] string token)
        {
            var user = userService.GetUserByConfirmationHash(tokens.HashFor(token));

            // Verify still runs even though the lookup matched: it applies expiry and
            // compares in constant time. The lookup only narrows the candidate.
            if (user == null || !tokens.Verify(token, user.EmailConfirmationTokenHash, user.EmailConfirmationSentAt))
            {
                return BadRequest(new
                {
                    error = "invalid_or_expired",
                    message = "This activation link is no longer valid. Request a new one and try again.",
                });
            }

            userService.ConfirmEmail(user.Id);

            return authService.GetToken(user.Id);
        }

        /// <summary>
        /// Issues a fresh link, invalidating any already sent.
        ///
        /// Answers identically whatever the address is - unknown, already confirmed, or
        /// genuinely pending. Anything else turns this into an oracle for which addresses
        /// hold accounts, which is worse than the inconvenience it saves.
        /// </summary>
        [HttpPost("resend-confirmation")]
        public async Task<ActionResult> Resend([FromBody] ResendConfirmationViewModel model)
        {
            if (!ModelState.IsValid) return BadRequest(ModelState);

            var user = userService.GetUserByEmail(model.Email);

            if (user != null && !user.EmailConfirmed)
            {
                await SendConfirmation(user.Id, user.Username, user.Email);
            }

            return Ok(new { message = "If that address needs confirming, a new link is on its way." });
        }

        private async Task<bool> SendConfirmation(string userId, string username, string email)
        {
            var issued = tokens.Issue();

            // Persisted before sending. The other order risks a link reaching an inbox that
            // the database has no record of, which would be indistinguishable to the user
            // from an expired one and impossible to diagnose.
            userService.SetEmailConfirmation(userId, issued.Hash, DateTime.UtcNow);

            var publicUrl = (configuration.GetValue<string>("App:PublicUrl") ?? string.Empty).TrimEnd('/');

            // The SPA route, not the API endpoint. Pointing at /api/auth/confirm would work,
            // but the user would be looking at raw JSON with a bearer token in it rather than
            // at the app - and the browser would have no way to store the session. The client
            // route calls the endpoint and then signs in.
            var confirmUrl = $"{publicUrl}/confirm?token={Uri.EscapeDataString(issued.Token)}";

            var (html, text) = ActivationEmail.Render(this.emailOptions.FromName, username, confirmUrl, publicUrl);

            var result = await emailSender.SendAsync(
                email,
                ActivationEmail.Subject(this.emailOptions.FromName),
                html,
                text);

            return result.Sent;
        }
    }
}
