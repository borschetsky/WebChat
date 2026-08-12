using System;
using System.Collections.Generic;
using System.IO;
using System.Net;
using System.Reflection;
using System.Text;

namespace WebChat.Services.Email
{
    /// <summary>
    /// Renders the workspace-invitation email. Shares the activation and reset layout - same
    /// tables, colours and dark-mode block - with its own copy.
    ///
    /// **No `{{Username}}`.** The other two write to someone who already has an account; this
    /// one writes to an address that may belong to nobody, so there is no name to greet them
    /// by that would not be invented. The inviter's name carries the personal part instead,
    /// and it is the thing that makes the mail credible rather than phishy.
    /// </summary>
    public static class InvitationEmail
    {
        private const string ResourceName = "WebChat.Services.Email.Templates.InviteToWorkspace.html";

        public static string Subject(string productName, string invitedBy) =>
            string.IsNullOrWhiteSpace(invitedBy)
                ? $"You have been invited to {productName}"
                : $"{invitedBy} invited you to {productName}";

        public static (string Html, string Text) Render(
            string productName, string invitedBy, string acceptUrl, string appUrl)
        {
            invitedBy = string.IsNullOrWhiteSpace(invitedBy) ? "An administrator" : invitedBy;

            var tokens = new Dictionary<string, string>
            {
                // Encoded for the same reason as the other two: the inviter's display name is
                // user-supplied and lands inside markup we send under our own sending
                // reputation.
                ["{{InvitedBy}}"] = WebUtility.HtmlEncode(invitedBy),
                ["{{ProductName}}"] = WebUtility.HtmlEncode(productName ?? string.Empty),
                ["{{ActionUrl}}"] = WebUtility.HtmlEncode(acceptUrl ?? string.Empty),
                ["{{AppUrl}}"] = WebUtility.HtmlEncode(appUrl ?? string.Empty),
            };

            var html = LoadTemplate();
            foreach (var token in tokens)
            {
                html = html.Replace(token.Key, token.Value);
            }

            return (html, RenderText(productName, invitedBy, acceptUrl));
        }

        private static string RenderText(string productName, string invitedBy, string acceptUrl)
        {
            var text = new StringBuilder();
            text.AppendLine($"{invitedBy} invited you to {productName}");
            text.AppendLine();
            text.AppendLine("Accept the invitation here:");
            text.AppendLine();
            // Unencoded: never parsed as markup, and an &amp; here would break a pasted URL.
            text.AppendLine(acceptUrl);
            text.AppendLine();
            text.AppendLine("This link expires in 30 days and can be used once.");
            text.AppendLine();
            text.AppendLine("Weren't expecting this? Ignore this email - nothing happens until the link is opened.");
            return text.ToString();
        }

        private static string LoadTemplate()
        {
            var assembly = Assembly.GetExecutingAssembly();
            using var stream = assembly.GetManifestResourceStream(ResourceName);

            if (stream == null)
            {
                var available = string.Join(", ", assembly.GetManifestResourceNames());
                throw new InvalidOperationException(
                    $"Email template '{ResourceName}' is not an embedded resource. Present: [{available}]. " +
                    "Check the EmbeddedResource item in WebChat.Services.csproj.");
            }

            using var reader = new StreamReader(stream, Encoding.UTF8);
            return reader.ReadToEnd();
        }
    }
}
