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

        /// <summary>The provider login, not the sender address - with Brevo these differ.</summary>
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
