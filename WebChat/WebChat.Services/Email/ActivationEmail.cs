using System;
using System.Collections.Generic;
using System.IO;
using System.Net;
using System.Reflection;
using System.Text;

namespace WebChat.Services.Email
{
    /// <summary>
    /// Renders the account-activation email from the design handoff.
    ///
    /// The HTML is an embedded resource rather than a string in code: it is a real email
    /// template with MSO conditionals, a dark-mode block and table layout, and every edit to
    /// it would otherwise mean escaping a wall of markup. Keeping it as a file also means the
    /// designer's output can be replaced wholesale without touching C#.
    /// </summary>
    public static class ActivationEmail
    {
        private const string ResourceName = "WebChat.Services.Email.Templates.ActivateAccount.html";

        public static string Subject(string productName) => $"Activate your {productName} account";

        public static (string Html, string Text) Render(string productName, string username, string activationUrl, string appUrl)
        {
            var tokens = new Dictionary<string, string>
            {
                // Encoded, not interpolated. A username is user-supplied and lands inside
                // markup: without this, registering as `<img onerror=...>` would put script
                // into an email delivered under our own domain's reputation.
                ["{{Username}}"] = WebUtility.HtmlEncode(username ?? string.Empty),
                ["{{ProductName}}"] = WebUtility.HtmlEncode(productName ?? string.Empty),
                ["{{ActivationUrl}}"] = WebUtility.HtmlEncode(activationUrl ?? string.Empty),
                ["{{AppUrl}}"] = WebUtility.HtmlEncode(appUrl ?? string.Empty),
            };

            var html = LoadTemplate();
            foreach (var token in tokens)
            {
                html = html.Replace(token.Key, token.Value);
            }

            return (html, RenderText(productName, username, activationUrl));
        }

        /// <summary>
        /// The text alternative is not politeness. A message with no text part is measurably
        /// more likely to be filtered, and this one has to reach an inbox on the first attempt
        /// or the account cannot be used at all.
        ///
        /// The raw URL goes in unencoded here - this part is never parsed as markup.
        /// </summary>
        private static string RenderText(string productName, string username, string activationUrl)
        {
            var text = new StringBuilder();
            text.AppendLine($"Welcome to {productName}, {username}");
            text.AppendLine();
            text.AppendLine("Your account is ready. Activate it to start messaging.");
            text.AppendLine();
            text.AppendLine(activationUrl);
            text.AppendLine();
            text.AppendLine("This link expires in 24 hours and can be used once.");
            text.AppendLine();
            text.AppendLine("Didn't create this account? Ignore this email and nothing will be activated.");
            return text.ToString();
        }

        private static string LoadTemplate()
        {
            var assembly = Assembly.GetExecutingAssembly();
            using var stream = assembly.GetManifestResourceStream(ResourceName);

            if (stream == null)
            {
                // Almost always a build configuration problem rather than a runtime one, so
                // name what is actually embedded - guessing at the resource name from a null
                // reference is a miserable way to spend an afternoon.
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
