using System;
using System.Threading.Tasks;
using MailKit.Net.Smtp;
using MailKit.Security;
using Microsoft.Extensions.Logging;
using MimeKit;

namespace WebChat.Services.Email
{
    /// <summary>
    /// Sends over plain SMTP with MailKit rather than a provider SDK, so changing provider is
    /// a configuration change and not a code change. Brevo, Resend, SES and Mailgun all
    /// expose an SMTP relay; the one thing they agree on is this protocol.
    ///
    /// Running our own SMTP *server* was considered and rejected - DigitalOcean blocks
    /// outbound 25, 465 and 587 by default, and the deliverability problem behind that block
    /// is one of IP reputation rather than code. Issue #25 records the reasoning.
    /// </summary>
    public class SmtpEmailSender : IEmailSender
    {
        private readonly EmailOptions options;
        private readonly ILogger<SmtpEmailSender> logger;

        public SmtpEmailSender(EmailOptions options, ILogger<SmtpEmailSender> logger)
        {
            this.options = options;
            this.logger = logger;
        }

        public async Task<EmailResult> SendAsync(string toAddress, string subject, string htmlBody, string textBody)
        {
            var message = new MimeMessage();
            message.From.Add(new MailboxAddress(this.options.FromName, this.options.FromAddress));
            message.To.Add(MailboxAddress.Parse(toAddress));
            message.Subject = subject;

            // Both parts: a text alternative is not politeness, it measurably affects whether
            // spam filters accept the message at all.
            message.Body = new BodyBuilder { HtmlBody = htmlBody, TextBody = textBody }.ToMessageBody();

            try
            {
                using var client = new SmtpClient();

                // 465 is implicit TLS from the first byte; 587 upgrades with STARTTLS. Picking
                // by port rather than configuration removes a way to get this subtly wrong.
                var security = this.options.SmtpPort == 465
                    ? SecureSocketOptions.SslOnConnect
                    : SecureSocketOptions.StartTls;

                await client.ConnectAsync(this.options.SmtpHost, this.options.SmtpPort, security);
                await client.AuthenticateAsync(this.options.SmtpUser, this.options.SmtpKey);
                await client.SendAsync(message);
                await client.DisconnectAsync(true);

                return EmailResult.Ok();
            }
            catch (Exception e)
            {
                // Never rethrow: the caller decides what a failed send means, and for
                // registration it must not mean a failed signup.
                this.logger.LogError(e, "Sending mail to {Recipient} failed", toAddress);
                return EmailResult.Failed(e.Message);
            }
        }
    }
}
