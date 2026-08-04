using System.Threading.Tasks;
using Microsoft.Extensions.Logging;

namespace WebChat.Services.Email
{
    /// <summary>
    /// Used when no SMTP credentials are configured: writes the message to the log and
    /// reports success.
    ///
    /// This is what lets a fresh clone register an account without anyone holding a Brevo
    /// account, the same bargain AddAvatarStorage makes by falling back to local disk without
    /// R2 keys. The confirmation link appears in the log, so the flow is fully exercisable
    /// offline.
    ///
    /// It logs the link at Warning deliberately. At Information it would be invisible under
    /// the default Warning filter, and a developer would conclude that registration silently
    /// does nothing.
    /// </summary>
    public class LoggingEmailSender : IEmailSender
    {
        private readonly ILogger<LoggingEmailSender> logger;

        public LoggingEmailSender(ILogger<LoggingEmailSender> logger)
        {
            this.logger = logger;
        }

        public Task<EmailResult> SendAsync(string toAddress, string subject, string htmlBody, string textBody)
        {
            this.logger.LogWarning(
                "No SMTP credentials configured, so this mail was not sent. To: {Recipient}. Subject: {Subject}.\n{Body}",
                toAddress,
                subject,
                textBody);

            return Task.FromResult(EmailResult.Ok());
        }
    }
}
