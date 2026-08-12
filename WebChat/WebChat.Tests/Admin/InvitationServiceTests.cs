using System;
using System.Linq;
using System.Threading.Tasks;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using WebChat.Connection;
using WebChat.Models;
using WebChat.Services;
using WebChat.Services.Email;

namespace WebChat.Tests.Admin
{
    /// <summary>
    /// Invitations: issuing, rotating, revoking and redeeming.
    ///
    /// The decisions these pin, all of which could reasonably have gone the other way and
    /// are therefore worth asserting rather than trusting:
    ///
    /// - A resend **rotates** the token, so the previous link dies. That is what bounds how
    ///   long any one mailed secret stays live, and it is why extend and resend are a single
    ///   operation - rotating without re-sending would break the link the invitee holds.
    /// - Links are **bearer**: whoever opens one joins, and the audit records who actually
    ///   redeemed rather than who was invited.
    /// - Redemption is race-safe, which is the only one of these that a plausible
    ///   implementation gets wrong by accident.
    /// </summary>
    public class InvitationServiceTests : IDisposable
    {
        private readonly SqliteConnection connection = new("DataSource=:memory:");
        private readonly WebChatContext ctx;
        private readonly InvitationService service;
        private readonly AuthService auth = new("test-only-signing-key-at-least-32-bytes-long", 3600);

        public InvitationServiceTests()
        {
            this.connection.Open();
            this.ctx = new WebChatContext(new DbContextOptionsBuilder<WebChatContext>()
                .UseSqlite(this.connection).Options);
            this.ctx.Database.EnsureCreated();

            this.service = new InvitationService(
                this.ctx,
                new InvitationTokenService(TimeSpan.FromDays(30)),
                new AuditService(this.ctx),
                this.auth,
                new EmailOptions());
        }

        private User Add(string name, string role = WorkspaceRole.Member, string status = AccountStatus.Active)
        {
            var user = new User
            {
                Id = Guid.NewGuid().ToString(),
                Username = name,
                Email = name + "@example.com",
                Password = "hashed",
                Role = role,
                Status = status,
                EmailConfirmed = true,
                CreatedOn = DateTime.UtcNow,
                SecurityStamp = Guid.NewGuid().ToString(),
            };

            this.ctx.User.Add(user);
            this.ctx.SaveChanges();
            return user;
        }

        // --- issuing ------------------------------------------------------------------

        [Fact]
        public async Task Sending_creates_a_pending_account_and_an_open_invitation()
        {
            var owner = this.Add("owner", WorkspaceRole.Owner);

            var result = await this.service.SendAsync(owner.Id, new[] { "ben@acme.com" }, WorkspaceRole.Member);

            Assert.True(result.Ok);
            Assert.Single(result.Issued);
            Assert.Single(result.Invitations);

            var pending = this.ctx.User.AsNoTracking().Single(u => u.Email == "ben@acme.com");
            Assert.Equal(AccountStatus.Pending, pending.Status);
        }

        /// <summary>
        /// The invitation was mailed to the address, so opening it proves the address is
        /// reachable - which is the whole thing confirmation proves. Asking again would be
        /// asking them to prove it twice.
        /// </summary>
        [Fact]
        public async Task An_invited_account_does_not_have_to_confirm_its_address()
        {
            var owner = this.Add("owner", WorkspaceRole.Owner);

            await this.service.SendAsync(owner.Id, new[] { "ben@acme.com" }, WorkspaceRole.Member);

            Assert.True(this.ctx.User.AsNoTracking().Single(u => u.Email == "ben@acme.com").EmailConfirmed);
        }

        /// <summary>
        /// Nine of ten, not none. The administrator pasted a list out of a spreadsheet and
        /// cannot be expected to have deduped it against the workspace first.
        /// </summary>
        [Fact]
        public async Task An_address_that_is_already_a_member_is_skipped_not_fatal()
        {
            var owner = this.Add("owner", WorkspaceRole.Owner);
            var maya = this.Add("maya");

            var result = await this.service.SendAsync(
                owner.Id, new[] { maya.Email, "ben@acme.com" }, WorkspaceRole.Member);

            Assert.True(result.Ok);
            Assert.Equal(new[] { maya.Email }, result.Skipped);
            Assert.Single(result.Issued);
            Assert.Equal("ben@acme.com", result.Issued[0].Email);
        }

        [Fact]
        public async Task An_invitation_cannot_hand_over_the_workspace()
        {
            var owner = this.Add("owner", WorkspaceRole.Owner);

            var result = await this.service.SendAsync(owner.Id, new[] { "ben@acme.com" }, WorkspaceRole.Owner);

            Assert.Equal(InvitationError.InvalidRole, result.Error);
            Assert.Empty(this.ctx.Invitation.AsNoTracking().ToList());
        }

        [Fact]
        public async Task Duplicates_in_one_send_produce_one_invitation()
        {
            var owner = this.Add("owner", WorkspaceRole.Owner);

            var result = await this.service.SendAsync(
                owner.Id, new[] { "ben@acme.com", "BEN@acme.com" }, WorkspaceRole.Member);

            Assert.Single(result.Issued);
            Assert.Single(this.ctx.Invitation.AsNoTracking().ToList());
        }

        /// <summary>
        /// Two live links to one pending account would mean revoke could not honestly claim
        /// to have closed it.
        /// </summary>
        [Fact]
        public async Task Re_inviting_a_pending_address_supersedes_the_previous_link()
        {
            var owner = this.Add("owner", WorkspaceRole.Owner);
            var first = await this.service.SendAsync(owner.Id, new[] { "ben@acme.com" }, WorkspaceRole.Member);

            await this.service.SendAsync(owner.Id, new[] { "ben@acme.com" }, WorkspaceRole.Member);

            Assert.Equal(InvitationError.NotOpen,
                (await this.service.InspectAsync(first.Issued[0].Token)).Error);
            Assert.Single(await this.service.ListAsync());
        }

        // --- rotation -----------------------------------------------------------------

        /// <summary>
        /// The decision this slice was blocked on. The 30-day cap bounds how long a mailed
        /// secret stays live; extending it silently would extend exactly that exposure.
        /// </summary>
        [Fact]
        public async Task Resending_kills_the_previous_link()
        {
            var owner = this.Add("owner", WorkspaceRole.Owner);
            var sent = await this.service.SendAsync(owner.Id, new[] { "ben@acme.com" }, WorkspaceRole.Member);
            var oldToken = sent.Issued[0].Token;
            var id = (await this.service.ListAsync()).Single().Id;

            var resent = await this.service.ResendAsync(owner.Id, id);

            Assert.True(resent.Ok);
            Assert.NotEqual(oldToken, resent.Issued[0].Token);
            Assert.True((await this.service.InspectAsync(resent.Issued[0].Token)).Ok);

            // NotFound rather than NotOpen, and the distinction is the point: rotation
            // overwrites the stored hash, so the old token no longer identifies any row at
            // all. The previous secret is not marked closed - it is gone.
            Assert.Equal(InvitationError.NotFound, (await this.service.InspectAsync(oldToken)).Error);
        }

        [Fact]
        public async Task Resending_always_returns_a_token_to_mail()
        {
            var owner = this.Add("owner", WorkspaceRole.Owner);
            await this.service.SendAsync(owner.Id, new[] { "ben@acme.com" }, WorkspaceRole.Member);
            var id = (await this.service.ListAsync()).Single().Id;

            // Rotating without re-sending would leave the invitee holding a dead link and no
            // way to know. The token coming back is what makes that impossible to forget.
            Assert.Single((await this.service.ResendAsync(owner.Id, id)).Issued);
        }

        /// <summary>
        /// An expired invitation can be resent - that is exactly how an administrator revives
        /// one for somebody who was on leave. A redeemed or revoked one cannot.
        /// </summary>
        [Fact]
        public async Task An_expired_invitation_can_still_be_revived()
        {
            var owner = this.Add("owner", WorkspaceRole.Owner);
            await this.service.SendAsync(owner.Id, new[] { "ben@acme.com" }, WorkspaceRole.Member);

            var invitation = this.ctx.Invitation.Single();
            invitation.ExpiresAtUtc = DateTime.UtcNow.AddDays(-1);
            this.ctx.SaveChanges();

            var resent = await this.service.ResendAsync(owner.Id, invitation.Id);

            Assert.True(resent.Ok);
            Assert.True((await this.service.InspectAsync(resent.Issued[0].Token)).Ok);
        }

        // --- revoking -----------------------------------------------------------------

        [Fact]
        public async Task Revoking_kills_the_link_and_deactivates_the_pending_account()
        {
            var owner = this.Add("owner", WorkspaceRole.Owner);
            var sent = await this.service.SendAsync(owner.Id, new[] { "ben@acme.com" }, WorkspaceRole.Member);
            var id = (await this.service.ListAsync()).Single().Id;

            var result = await this.service.RevokeAsync(owner.Id, id);

            Assert.True(result.Ok);
            Assert.Empty(result.Invitations);
            Assert.Equal(InvitationError.NotOpen, (await this.service.InspectAsync(sent.Issued[0].Token)).Error);
            Assert.Equal(AccountStatus.Deactivated,
                this.ctx.User.AsNoTracking().Single(u => u.Email == "ben@acme.com").Status);
        }

        /// <summary>
        /// Revoking something already used would be a lie - the person is in. Removing them
        /// is a member action, and a different, audited one.
        ///
        /// This failed first, and not because the check was missing: redemption claims the
        /// row with a conditional UPDATE that goes around the change tracker, so the tracked
        /// copy still read as open and revoke acted on that. Hidden in production, where each
        /// request gets its own context, and waiting for the first caller that does both.
        /// </summary>
        [Fact]
        public async Task A_redeemed_invitation_cannot_be_revoked()
        {
            var owner = this.Add("owner", WorkspaceRole.Owner);
            var sent = await this.service.SendAsync(owner.Id, new[] { "ben@acme.com" }, WorkspaceRole.Member);
            var pendingId = this.ctx.Invitation.Single().PendingUserId;
            await this.service.RedeemAsync(sent.Issued[0].Token, pendingId);

            var result = await this.service.RevokeAsync(owner.Id, this.ctx.Invitation.Single().Id);

            Assert.Equal(InvitationError.NotOpen, result.Error);
        }

        // --- redemption, and the race -------------------------------------------------

        /// <summary>
        /// **The assertion this whole design turns on.** A read-then-write implementation
        /// passes every other test in this file and fails this one, and the ordinary way it
        /// happens in production is somebody double-clicking the link in their email.
        /// </summary>
        [Fact]
        public async Task A_link_redeemed_twice_is_only_claimed_once()
        {
            var owner = this.Add("owner", WorkspaceRole.Owner);
            var sent = await this.service.SendAsync(owner.Id, new[] { "ben@acme.com" }, WorkspaceRole.Member);
            var token = sent.Issued[0].Token;
            var pendingId = this.ctx.Invitation.Single().PendingUserId;

            var first = await this.service.RedeemAsync(token, pendingId);
            var second = await this.service.RedeemAsync(token, pendingId);

            Assert.True(first.Ok);
            Assert.Equal(InvitationError.NotOpen, second.Error);
            Assert.Single(this.ctx.Invitation.AsNoTracking().Where(i => i.RedeemedAtUtc != null));
        }

        [Fact]
        public async Task Redeeming_activates_the_pending_account()
        {
            var owner = this.Add("owner", WorkspaceRole.Owner);
            var sent = await this.service.SendAsync(owner.Id, new[] { "ben@acme.com" }, WorkspaceRole.Member);
            var pendingId = this.ctx.Invitation.Single().PendingUserId;

            await this.service.RedeemAsync(sent.Issued[0].Token, pendingId);

            Assert.Equal(AccountStatus.Active,
                this.ctx.User.AsNoTracking().Single(u => u.Id == pendingId).Status);
        }

        /// <summary>
        /// Bearer links, chosen so forwarding works. The compensation is that the log names
        /// who actually walked through the door, not who was invited.
        /// </summary>
        [Fact]
        public async Task A_forwarded_link_works_and_the_audit_names_who_used_it()
        {
            var owner = this.Add("owner", WorkspaceRole.Owner);
            var maya = this.Add("maya");
            var sent = await this.service.SendAsync(owner.Id, new[] { "ben@acme.com" }, WorkspaceRole.Member);

            var result = await this.service.RedeemAsync(sent.Issued[0].Token, maya.Id);

            Assert.True(result.Ok);
            Assert.Equal(maya.Id, this.ctx.Invitation.AsNoTracking().Single().RedeemedByUserId);

            var entry = this.ctx.AuditEntry.AsNoTracking()
                .Single(e => e.Action == AuditAction.Activate);
            Assert.Equal(maya.Id, entry.ActorId);
            Assert.Contains("ben@acme.com", entry.DetailJson);
        }

        /// <summary>An owner who opens a member invitation must not be demoted by it.</summary>
        [Fact]
        public async Task Redeeming_never_lowers_an_existing_role()
        {
            var owner = this.Add("owner", WorkspaceRole.Owner);
            var sent = await this.service.SendAsync(owner.Id, new[] { "ben@acme.com" }, WorkspaceRole.Member);

            await this.service.RedeemAsync(sent.Issued[0].Token, owner.Id);

            Assert.Equal(WorkspaceRole.Owner,
                this.ctx.User.AsNoTracking().Single(u => u.Id == owner.Id).Role);
        }

        [Fact]
        public async Task An_expired_link_is_refused()
        {
            var owner = this.Add("owner", WorkspaceRole.Owner);
            var sent = await this.service.SendAsync(owner.Id, new[] { "ben@acme.com" }, WorkspaceRole.Member);

            var invitation = this.ctx.Invitation.Single();
            var pendingId = invitation.PendingUserId;
            invitation.ExpiresAtUtc = DateTime.UtcNow.AddMinutes(-1);
            this.ctx.SaveChanges();

            Assert.Equal(InvitationError.NotOpen,
                (await this.service.RedeemAsync(sent.Issued[0].Token, pendingId)).Error);
        }

        [Theory]
        [InlineData("")]
        [InlineData("not-a-real-token")]
        public async Task A_token_that_matches_nothing_is_not_found(string token)
        {
            Assert.Equal(InvitationError.NotFound, (await this.service.InspectAsync(token)).Error);
        }

        public void Dispose()
        {
            this.ctx.Dispose();
            this.connection.Dispose();
            GC.SuppressFinalize(this);
        }
    }
}
