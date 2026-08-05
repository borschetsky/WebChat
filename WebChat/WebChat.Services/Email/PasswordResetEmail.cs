using System;
using System.Collections.Generic;
using System.IO;
using System.Net;
using System.Reflection;
using System.Text;

namespace WebChat.Services.Email
{
    /// <summary>
    /// Renders the password-reset email. Shares the activation template's layout - same
    /// tables, colours and dark-mode block - with different copy, so the two stay visually
    /// consistent without either owning the other's wording.
    /// </summary>
    public static class PasswordResetEmail
    {
        private const string ResourceName = "WebChat.Services.Email.Templates.ResetPassword.html";

        public static string Subject(string productName) => $"Reset your {productName} password";

        public static (string Html, string Text) Render(string productName, string username, string resetUrl, string appUrl)
        {
            var tokens = new Dictionary<string, string>
            {
                // Encoded for the same reason as the activation email: a username is
                // user-supplied and lands inside markup we send under our own sending
                // reputation.
                ["{{Username}}"] = WebUtility.HtmlEncode(username ?? string.Empty),
                ["{{ProductName}}"] = WebUtility.HtmlEncode(productName ?? string.Empty),
                ["{{ActionUrl}}"] = WebUtility.HtmlEncode(resetUrl ?? string.Empty),
                ["{{AppUrl}}"] = WebUtility.HtmlEncode(appUrl ?? string.Empty),
            };

            var html = LoadTemplate();
            foreach (var token in tokens)
            {
                html = html.Replace(token.Key, token.Value);
            }

            return (html, RenderText(productName, username, resetUrl));
        }

        private static string RenderText(string productName, string username, string resetUrl)
        {
            var text = new StringBuilder();
            text.AppendLine($"Reset your {productName} password, {username}");
            text.AppendLine();
            text.AppendLine("Someone asked to reset the password for this account. Choose a new one here:");
            text.AppendLine();
            // Unencoded: this part is never parsed as markup, and an &amp; here would break a
            // pasted URL.
            text.AppendLine(resetUrl);
            text.AppendLine();
            text.AppendLine("This link expires in 1 hour and can be used once.");
            text.AppendLine();
            text.AppendLine("Didn't ask for this? Ignore this email and your password will stay as it is.");
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
