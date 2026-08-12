namespace WebChat.Services.Email
{
    /// <summary>
    /// SMTP settings, bound from the "Email" configuration section.
    ///
    /// Only the non-secret fields belong in appsettings.json. SmtpUser and SmtpKey are
    /// credentials: appsettings.Secrets.json when running from Visual Studio, .env under
    /// docker compose, platform environment variables when deployed. See WebChat/.env.example.
    ///
    /// Defaults point at Brevo, which was chosen because it verifies a single sender address
    /// rather than requiring a verified domain - see issue #25 for why that decided it, and
    /// for the conditions under which Resend becomes the better choice.
    /// </summary>
    public class EmailOptions
    {
        public const string SectionName = "Email";

        public string SmtpHost { get; set; } = "smtp-relay.brevo.com";

        /// <summary>587 is STARTTLS; 465 is implicit SSL. Both work with Brevo.</summary>
        public int SmtpPort { get; set; } = 587;

        /// <summary>
        /// The SMTP login, which is neither the account email nor the sender address. Brevo
        /// generates a dedicated one - it looks like b46927001@smtp-brevo.com and is shown
        /// under SMTP &amp; API -> SMTP. Authenticating with the account email fails there.
        /// </summary>
        public string SmtpUser { get; set; } = "";

        /// <summary>
        /// An SMTP key generated in the provider dashboard. Not the account password: Brevo
        /// issues a separate key precisely so it can be revoked without changing the login.
        /// </summary>
        public string SmtpKey { get; set; } = "";

        /// <summary>
        /// Must be an address verified with the provider. Sending from an unverified address
        /// is accepted by the relay and then silently dropped by some recipients - Gmail in
        /// particular. If confirmation mail vanishes without a bounce, look here first.
        /// </summary>
        public string FromAddress { get; set; } = "";

        public string FromName { get; set; } = "WebChat";

        /// <summary>How long a confirmation link stays valid.</summary>
        public int ConfirmationLifetimeHours { get; set; } = 24;

        /// <summary>
        /// How long a password-reset link stays valid. One hour, not twenty-four: a reset
        /// link is a live credential for the account it opens, whereas a confirmation link
        /// can only confirm an address its holder already controls.
        /// </summary>
        public int PasswordResetLifetimeHours { get; set; } = 1;

        /// <summary>
        /// How long an invitation link stays valid. Thirty days - by far the longest of the
        /// three, because it has to survive someone being on leave when it arrives, and
        /// because what it grants is workspace membership rather than account control.
        ///
        /// Extending an invitation rotates the token rather than moving this deadline, so
        /// this bounds the life of any single mailed secret and not the life of the
        /// invitation itself. See <see cref="InvitationTokenService"/>.
        /// </summary>
        public int InvitationLifetimeDays { get; set; } = 30;

        /// <summary>
        /// Shortest gap between two confirmation emails to the same address. Stops
        /// resend-confirmation being used to mail-bomb someone, which the per-IP limiter
        /// alone would not: an attacker with many addresses to send *from* is rate-limited,
        /// but one distributed attack aimed at a single victim is not.
        ///
        /// Enforced against EmailConfirmationSentAt, which is already stored, so this costs
        /// no extra state.
        /// </summary>
        public int ResendCooldownSeconds { get; set; } = 60;

        /// <summary>
        /// True when real mail can be sent. Startup falls back to a sender that only logs
        /// when this is false, so a fresh clone runs and can register without anyone holding
        /// a provider account - the same bargain AddAvatarStorage makes for R2.
        /// </summary>
        public bool IsConfigured =>
            !string.IsNullOrWhiteSpace(SmtpHost)
            && !string.IsNullOrWhiteSpace(SmtpUser)
            && !string.IsNullOrWhiteSpace(SmtpKey)
            && !string.IsNullOrWhiteSpace(FromAddress);
    }
}
