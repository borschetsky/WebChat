using System;
using System.Linq;
using WebChat.Services.Email;
using Xunit;

namespace WebChat.Tests.Email
{
    /// <summary>
    /// The token is the whole security boundary of email activation: whoever holds one can
    /// confirm the account it belongs to. These tests pin the properties that make holding
    /// the database insufficient to forge one.
    /// </summary>
    public class EmailConfirmationTokenServiceTests
    {
        private static EmailConfirmationTokenService NewService(TimeSpan? lifetime = null) =>
            new EmailConfirmationTokenService(lifetime ?? TimeSpan.FromHours(24));

        [Fact]
        public void Issue_returns_a_token_that_verifies_against_its_own_hash()
        {
            var service = NewService();
            var issued = service.Issue();

            Assert.True(service.Verify(issued.Token, issued.Hash, DateTime.UtcNow));
        }

        [Fact]
        public void Issue_never_returns_the_same_token_twice()
        {
            var service = NewService();
            var tokens = Enumerable.Range(0, 200).Select(_ => service.Issue().Token).ToList();

            Assert.Equal(tokens.Count, tokens.Distinct().Count());
        }

        [Fact]
        public void Issued_token_carries_at_least_256_bits_of_entropy()
        {
            // Guards against someone "simplifying" this to Guid.NewGuid(), which is not a
            // CSPRNG and whose output is partly structural - version and variant bits are
            // fixed, so it carries well under its 128 bits of apparent size.
            var issued = NewService().Issue();
            var decoded = Base64UrlBytes(issued.Token);

            Assert.True(decoded.Length >= 32, $"token decoded to {decoded.Length} bytes, expected >= 32");
        }

        [Fact]
        public void Stored_hash_is_not_the_token()
        {
            // The point of hashing: a leaked database must not hand over the ability to
            // activate every pending account.
            var issued = NewService().Issue();

            Assert.NotEqual(issued.Token, issued.Hash);
            Assert.DoesNotContain(issued.Token, issued.Hash);
        }

        [Fact]
        public void Verify_rejects_a_token_that_does_not_match_the_hash()
        {
            var service = NewService();
            var mine = service.Issue();
            var theirs = service.Issue();

            Assert.False(service.Verify(theirs.Token, mine.Hash, DateTime.UtcNow));
        }

        [Theory]
        [InlineData("")]
        [InlineData("   ")]
        [InlineData("not-a-real-token")]
        [InlineData("!!!not base64!!!")]
        public void Verify_rejects_malformed_input_without_throwing(string candidate)
        {
            var service = NewService();
            var issued = service.Issue();

            // A confirmation link is attacker-controlled input; a throw here would be a 500
            // on a public endpoint rather than a clean rejection.
            Assert.False(service.Verify(candidate, issued.Hash, DateTime.UtcNow));
        }

        [Fact]
        public void Verify_rejects_a_null_token()
        {
            // Its own fact rather than an InlineData(null): xUnit's analyser objects to a
            // null literal for a non-nullable parameter, and the repo builds at 0 warnings.
            var service = NewService();
            var issued = service.Issue();

            Assert.False(service.Verify(null, issued.Hash, DateTime.UtcNow));
        }

        [Fact]
        public void Verify_rejects_an_empty_stored_hash()
        {
            var service = NewService();
            var issued = service.Issue();

            Assert.False(service.Verify(issued.Token, string.Empty, DateTime.UtcNow));
        }

        [Fact]
        public void Verify_rejects_when_no_hash_is_stored()
        {
            // A user with no pending confirmation has a null hash. Treating that as a match
            // would let an empty token confirm an arbitrary account.
            var service = NewService();
            var issued = service.Issue();

            Assert.False(service.Verify(issued.Token, null, DateTime.UtcNow));
        }

        [Fact]
        public void Verify_rejects_a_token_past_its_lifetime()
        {
            var service = NewService(TimeSpan.FromHours(24));
            var issued = service.Issue();
            var sentAt = DateTime.UtcNow.AddHours(-25);

            Assert.False(service.Verify(issued.Token, issued.Hash, sentAt));
        }

        [Fact]
        public void Verify_accepts_a_token_inside_its_lifetime()
        {
            var service = NewService(TimeSpan.FromHours(24));
            var issued = service.Issue();
            var sentAt = DateTime.UtcNow.AddHours(-23);

            Assert.True(service.Verify(issued.Token, issued.Hash, sentAt));
        }

        [Fact]
        public void Verify_rejects_when_no_send_time_is_recorded()
        {
            var service = NewService();
            var issued = service.Issue();

            Assert.False(service.Verify(issued.Token, issued.Hash, null));
        }

        [Fact]
        public void Token_is_safe_to_put_in_a_url()
        {
            // It travels in a query string. Anything needing escaping invites a class of bug
            // where the link works in one mail client and not another.
            var token = NewService().Issue().Token;

            Assert.Equal(token, Uri.EscapeDataString(token));
        }

        private static byte[] Base64UrlBytes(string value)
        {
            var padded = value.Replace('-', '+').Replace('_', '/');
            padded = padded.PadRight(padded.Length + (4 - padded.Length % 4) % 4, '=');
            return Convert.FromBase64String(padded);
        }
    }
}
