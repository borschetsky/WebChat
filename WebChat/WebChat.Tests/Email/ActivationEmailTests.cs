using WebChat.Services.Email;
using Xunit;

namespace WebChat.Tests.Email
{
    public class ActivationEmailTests
    {
        private const string Url = "https://webchat.example/api/auth/confirm?token=abc123";

        [Fact]
        public void Renders_the_embedded_template()
        {
            // Also proves the EmbeddedResource item in the csproj is wired correctly. Without
            // it this throws, and it would otherwise only be discovered by a user who never
            // receives their activation email.
            var (html, _) = ActivationEmail.Render("WebChat", "alex", Url, "https://webchat.example");

            Assert.Contains("<!DOCTYPE html>", html);
            Assert.True(html.Length > 5000, "the real template is ~13 KB; something replaced it");
        }

        [Fact]
        public void Substitutes_every_placeholder()
        {
            var (html, _) = ActivationEmail.Render("WebChat", "alex", Url, "https://webchat.example");

            Assert.DoesNotContain("{{", html);
            Assert.Contains("WebChat", html);
            Assert.Contains("alex", html);
        }

        [Fact]
        public void Puts_the_activation_url_in_the_html()
        {
            var (html, _) = ActivationEmail.Render("WebChat", "alex", Url, "https://webchat.example");

            // Encoded on the way in, so the ampersand-free URL above appears verbatim.
            Assert.Contains("abc123", html);
        }

        [Fact]
        public void Encodes_a_username_that_contains_markup()
        {
            // A username is user-supplied and lands inside HTML delivered under our own
            // sending reputation. Interpolating it raw would put attacker-controlled script
            // into an email we vouch for.
            var (html, _) = ActivationEmail.Render("WebChat", "<script>alert(1)</script>", Url, "https://webchat.example");

            Assert.DoesNotContain("<script>alert(1)</script>", html);
            Assert.Contains("&lt;script&gt;", html);
        }

        [Fact]
        public void Encodes_an_ampersand_in_the_activation_url()
        {
            // A real confirmation link will carry more than one query parameter sooner or
            // later, and a bare & inside an href is invalid markup that some clients mangle.
            var (html, _) = ActivationEmail.Render(
                "WebChat", "alex", "https://webchat.example/confirm?token=a&next=/chat", "https://webchat.example");

            Assert.Contains("token=a&amp;next=", html);
        }

        [Fact]
        public void Text_alternative_carries_the_raw_link()
        {
            // Never parsed as markup, so it must not be encoded - an &amp; here would be
            // pasted into a browser literally and break the link.
            var (_, text) = ActivationEmail.Render(
                "WebChat", "alex", "https://webchat.example/confirm?token=a&next=/chat", "https://webchat.example");

            Assert.Contains("token=a&next=/chat", text);
            Assert.DoesNotContain("&amp;", text);
        }

        [Fact]
        public void Text_alternative_is_not_empty()
        {
            // A message with no text part is measurably more likely to be filtered, and this
            // one has to arrive first time or the account cannot be used at all.
            var (_, text) = ActivationEmail.Render("WebChat", "alex", Url, "https://webchat.example");

            Assert.False(string.IsNullOrWhiteSpace(text));
            Assert.Contains("alex", text);
        }

        [Fact]
        public void Subject_names_the_product()
        {
            Assert.Equal("Activate your WebChat account", ActivationEmail.Subject("WebChat"));
        }

        [Fact]
        public void Handles_null_inputs_without_throwing()
        {
            var (html, text) = ActivationEmail.Render(null, null, null, null);

            Assert.DoesNotContain("{{", html);
            Assert.NotNull(text);
        }
    }
}
