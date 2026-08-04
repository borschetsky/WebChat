using System;
using System.Threading.Tasks;
using Microsoft.Extensions.Logging.Abstractions;
using WebChat.Services.Email;
using Xunit;

namespace WebChat.Tests.Email
{
    /// <summary>
    /// Sends a real email through a real relay. Skipped unless credentials are present, so a
    /// clone, CI, and anyone without a Brevo account still get a green suite.
    ///
    /// Run it deliberately, from WebChat/:
    ///
    ///   $env:Email__SmtpUser="you@example.com"
    ///   $env:Email__SmtpKey="the smtp key"
    ///   $env:Email__FromAddress="the verified sender"
    ///   $env:Email__TestRecipient="somewhere-you-can-read@gmail.com"
    ///   dotnet test WebChat.Tests --filter Category=Smtp
    ///
    /// Use a Gmail address as the recipient. Brevo accepts mail from a verified *address*
    /// but Gmail is reported to silently drop it without a verified *domain* - accepted by
    /// the relay, never delivered, no bounce. Testing only against your own inbox is exactly
    /// how that goes unnoticed until a user cannot sign up.
    /// </summary>
    [Trait("Category", "Smtp")]
    public class SmtpEmailSenderIntegrationTests
    {
        private static string? Env(string name) => Environment.GetEnvironmentVariable(name);

        private static bool Configured =>
            !string.IsNullOrWhiteSpace(Env("Email__SmtpUser"))
            && !string.IsNullOrWhiteSpace(Env("Email__SmtpKey"))
            && !string.IsNullOrWhiteSpace(Env("Email__FromAddress"))
            && !string.IsNullOrWhiteSpace(Env("Email__TestRecipient"));

        [SkippableFact]
        public async Task Sends_a_real_activation_email()
        {
            Skip.IfNot(Configured, "Set Email__SmtpUser, Email__SmtpKey, Email__FromAddress and Email__TestRecipient to run this.");

            var options = new EmailOptions
            {
                SmtpHost = Env("Email__SmtpHost") ?? "smtp-relay.brevo.com",
                SmtpPort = int.TryParse(Env("Email__SmtpPort"), out var port) ? port : 587,
                SmtpUser = Env("Email__SmtpUser"),
                SmtpKey = Env("Email__SmtpKey"),
                FromAddress = Env("Email__FromAddress"),
                FromName = "WebChat",
            };

            var sender = new SmtpEmailSender(options, NullLogger<SmtpEmailSender>.Instance);

            var url = "https://webchat-edbgd.ondigitalocean.app/api/auth/confirm?token=smoke-test";
            var (html, text) = ActivationEmail.Render("WebChat", "smoke-test", url, "https://webchat-edbgd.ondigitalocean.app");

            var result = await sender.SendAsync(
                Env("Email__TestRecipient"),
                ActivationEmail.Subject("WebChat") + " (smoke test)",
                html,
                text);

            // The sender never throws by design, so the failure has to be asserted on.
            Assert.True(result.Sent, $"SMTP send failed: {result.Error}");
        }

        [SkippableFact]
        public async Task Reports_failure_rather_than_throwing_on_bad_credentials()
        {
            Skip.IfNot(Configured, "Needs a reachable relay to attempt authentication against.");

            var options = new EmailOptions
            {
                SmtpHost = Env("Email__SmtpHost") ?? "smtp-relay.brevo.com",
                SmtpPort = 587,
                SmtpUser = Env("Email__SmtpUser"),
                SmtpKey = "definitely-not-the-key",
                FromAddress = Env("Email__FromAddress"),
            };

            var sender = new SmtpEmailSender(options, NullLogger<SmtpEmailSender>.Instance);

            // Registration must survive a provider outage or a rotated key, so this path has
            // to return a result rather than escape as an exception.
            var result = await sender.SendAsync(Env("Email__TestRecipient"), "should not arrive", "<p>x</p>", "x");

            Assert.False(result.Sent);
            Assert.False(string.IsNullOrWhiteSpace(result.Error));
        }
    }
}
