using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using Microsoft.EntityFrameworkCore;
using WebChat.Connection;
using WebChat.Models;
using WebChat.Models.ViewModels;
using WebChat.Services.Email;

namespace WebChat.Services
{
    /// <inheritdoc />
    public class InvitationService : IInvitationService
    {
        private readonly WebChatContext ctx;
        private readonly IInvitationTokenService tokens;
        private readonly IAuditService audit;
        private readonly IAuthService auth;
        private readonly TimeSpan lifetime;

        public InvitationService(
            WebChatContext ctx,
            IInvitationTokenService tokens,
            IAuditService audit,
            IAuthService auth,
            EmailOptions options)
        {
            this.ctx = ctx;
            this.tokens = tokens;
            this.audit = audit;
            this.auth = auth;
            this.lifetime = TimeSpan.FromDays(options?.InvitationLifetimeDays ?? 30);
        }

        public async Task<IReadOnlyList<AdminInvitationViewModel>> ListAsync()
        {
            var now = DateTime.UtcNow;

            // Outstanding only. A redeemed or revoked invitation is history, and history
            // belongs in the audit log - a list that accumulates every invitation ever sent
            // stops being something anyone scans.
            var open = await this.ctx.Invitation
                .AsNoTracking()
                .Where(i => i.RedeemedAtUtc == null && i.RevokedAtUtc == null && i.ExpiresAtUtc > now)
                .OrderByDescending(i => i.SentAtUtc)
                .Join(
                    this.ctx.User.AsNoTracking(),
                    i => i.InvitedByUserId,
                    u => u.Id,
                    (i, u) => new AdminInvitationViewModel
                    {
                        Id = i.Id,
                        Email = i.Email,
                        By = u.Username,
                        Role = i.Role,
                        SentAtUtc = i.SentAtUtc,
                        ExpiresAtUtc = i.ExpiresAtUtc,
                    })
                .ToListAsync();

            return open;
        }

        public async Task<InvitationResult> SendAsync(
            string actorId, IReadOnlyList<string> emails, string role)
        {
            role = string.IsNullOrWhiteSpace(role) ? WorkspaceRole.Member : role.Trim().ToLowerInvariant();

            // Owner is deliberately not invitable: an invitation cannot hand over the
            // workspace. Promotion to owner is a separate, deliberate act by an owner.
            if (!WorkspaceRole.IsValid(role) || role == WorkspaceRole.Owner)
            {
                return InvitationResult.Fail(InvitationError.InvalidRole);
            }

            var addresses = (emails ?? Array.Empty<string>())
                .Where(e => !string.IsNullOrWhiteSpace(e))
                .Select(e => e.Trim())
                .Where(e => e.Contains('@'))
                .GroupBy(e => e.ToLowerInvariant())
                .Select(g => g.First())
                .ToList();

            if (addresses.Count == 0) return InvitationResult.Fail(InvitationError.NoRecipients);

            var lowered = addresses.Select(e => e.ToLowerInvariant()).ToList();

            var existing = await this.ctx.User
                .Where(u => !u.isDeleted && lowered.Contains(u.Email.ToLower()))
                .Select(u => new { u.Id, u.Email, u.Status })
                .ToListAsync();

            var actorName = await this.ctx.User
                .Where(u => u.Id == actorId)
                .Select(u => u.Username)
                .FirstOrDefaultAsync();

            var now = DateTime.UtcNow;
            var result = new InvitationResult();

            foreach (var email in addresses)
            {
                var match = existing.FirstOrDefault(u =>
                    string.Equals(u.Email, email, StringComparison.OrdinalIgnoreCase));

                // Someone with a usable account does not need inviting, and re-inviting them
                // would create a second account against the same address. A *pending* one is
                // different: that is an invitation already outstanding, and this is a resend
                // in all but name, so it gets a fresh token below.
                if (match != null && match.Status != AccountStatus.Pending)
                {
                    result.Skipped.Add(email);
                    continue;
                }

                var pendingUserId = match?.Id;

                if (pendingUserId == null)
                {
                    // The pending account is created here, not at redemption. It is what puts
                    // an invited person in the members table before they have signed in, and
                    // what makes "revoking deactivates the pending account" expressible.
                    var pending = new User
                    {
                        Id = Guid.NewGuid().ToString(),
                        Username = email,
                        Email = email,

                        // No password until they set one. Never null - the column is required
                        // and a null would be indistinguishable from "not yet hashed" at the
                        // point where a hash is compared.
                        Password = this.auth.HashPassword(Guid.NewGuid().ToString()),
                        Role = role,
                        Status = AccountStatus.Pending,

                        // The invitation was mailed to this address, so opening it proves the
                        // address is reachable - the same thing confirmation proves. Making
                        // them confirm afterwards would be asking them to prove it twice.
                        EmailConfirmed = true,
                        SecurityStamp = Guid.NewGuid().ToString(),
                        CreatedOn = now,
                    };

                    this.ctx.User.Add(pending);
                    pendingUserId = pending.Id;
                }

                // Any invitation already outstanding for this address is superseded, so its
                // link stops working. Two live links to one pending account would mean revoke
                // could not honestly claim to have closed it.
                var superseded = await this.ctx.Invitation
                    .Where(i => i.PendingUserId == pendingUserId && i.RedeemedAtUtc == null && i.RevokedAtUtc == null)
                    .ToListAsync();

                foreach (var old in superseded) old.RevokedAtUtc = now;

                var issued = this.tokens.Issue();

                this.ctx.Invitation.Add(new Invitation
                {
                    Id = Guid.NewGuid().ToString(),
                    Email = email,
                    TokenHash = issued.Hash,
                    SentAtUtc = now,
                    ExpiresAtUtc = now.Add(this.lifetime),
                    InvitedByUserId = actorId,
                    Role = role,
                    PendingUserId = pendingUserId,
                    CreatedOn = now,
                });

                this.audit.Record(actorId, AuditAction.Invite, "invitation", pendingUserId, new
                {
                    email,
                    role,
                    @event = "sent",
                });

                result.Issued.Add(new IssuedInvitation
                {
                    Email = email,
                    Token = issued.Token,
                    InvitedByName = actorName,
                });
            }

            await this.ctx.SaveChangesAsync();

            return new InvitationResult
            {
                Invitations = await this.ListAsync(),
                Skipped = result.Skipped,
                Issued = result.Issued,
            };
        }

        public async Task<InvitationResult> ResendAsync(string actorId, string invitationId)
        {
            var invitation = await this.ctx.Invitation.FirstOrDefaultAsync(i => i.Id == invitationId);
            if (invitation == null) return InvitationResult.Fail(InvitationError.NotFound);

            // A redeemed or revoked invitation is finished. An *expired* one is not: resending
            // is exactly how an administrator revives it, and refusing here would leave them
            // no way to help somebody who was on leave.
            if (invitation.RedeemedAtUtc != null || invitation.RevokedAtUtc != null)
            {
                return InvitationResult.Fail(InvitationError.NotOpen);
            }

            var now = DateTime.UtcNow;
            var issued = this.tokens.Issue();

            // Rotating is what makes this safe to do repeatedly: the previous link dies here,
            // so the 30-day window bounds one secret's life rather than the invitation's.
            invitation.TokenHash = issued.Hash;
            invitation.SentAtUtc = now;
            invitation.ExpiresAtUtc = now.Add(this.lifetime);
            invitation.ModifiedOn = now;

            var actorName = await this.ctx.User
                .Where(u => u.Id == actorId)
                .Select(u => u.Username)
                .FirstOrDefaultAsync();

            this.audit.Record(actorId, AuditAction.Invite, "invitation", invitation.PendingUserId, new
            {
                email = invitation.Email,
                role = invitation.Role,
                @event = "resent",
            });

            await this.ctx.SaveChangesAsync();

            return new InvitationResult
            {
                Invitations = await this.ListAsync(),
                Issued = new List<IssuedInvitation>
                {
                    new() { Email = invitation.Email, Token = issued.Token, InvitedByName = actorName },
                },
            };
        }

        public async Task<InvitationResult> RevokeAsync(string actorId, string invitationId)
        {
            var invitation = await this.ctx.Invitation.FirstOrDefaultAsync(i => i.Id == invitationId);
            if (invitation == null) return InvitationResult.Fail(InvitationError.NotFound);

            if (invitation.RedeemedAtUtc != null)
            {
                // Revoking something already used would be a lie: the person is in. Removing
                // them is a member action, and a different, audited one.
                return InvitationResult.Fail(InvitationError.NotOpen);
            }

            var now = DateTime.UtcNow;
            invitation.RevokedAtUtc = now;
            invitation.ModifiedOn = now;

            // "Revoking deactivates the pending account immediately". Only a pending one: if
            // the address has since become a real member by another route, revoking a stale
            // invitation must not touch their account.
            var pending = await this.ctx.User.FirstOrDefaultAsync(u =>
                u.Id == invitation.PendingUserId && u.Status == AccountStatus.Pending);

            if (pending != null)
            {
                pending.Status = AccountStatus.Deactivated;
                pending.SecurityStamp = Guid.NewGuid().ToString();
                pending.ModifiedOn = now;
            }

            this.audit.Record(actorId, AuditAction.Invite, "invitation", invitation.PendingUserId, new
            {
                email = invitation.Email,
                role = invitation.Role,
                @event = "revoked",
            });

            await this.ctx.SaveChangesAsync();

            return new InvitationResult { Invitations = await this.ListAsync() };
        }

        public async Task<RedemptionResult> InspectAsync(string token)
        {
            var invitation = await this.FindAsync(token);
            if (invitation == null) return RedemptionResult.Fail(InvitationError.NotFound);

            return invitation.IsOpen(DateTime.UtcNow)
                ? new RedemptionResult { Invitation = invitation }
                : RedemptionResult.Fail(InvitationError.NotOpen);
        }

        public async Task<RedemptionResult> RedeemAsync(string token, string userId)
        {
            var invitation = await this.FindAsync(token);
            if (invitation == null) return RedemptionResult.Fail(InvitationError.NotFound);

            var now = DateTime.UtcNow;

            // **The race.** A read-then-write here lets a double-clicked link - the ordinary
            // way this happens - redeem twice. This is one conditional UPDATE whose WHERE
            // re-checks every condition, and the affected row count is what decides: exactly
            // one caller can move RedeemedAtUtc from null, and everybody else is told the
            // invitation is closed.
            //
            // Raw SQL because EF's change tracker cannot express "update only if the row
            // still looks like this" without an explicit concurrency token, and adding one
            // here would be a second mechanism for a single statement to do.
            var claimed = await this.ctx.Database.ExecuteSqlInterpolatedAsync($@"
                UPDATE ""Invitation""
                SET ""RedeemedAtUtc"" = {now}, ""RedeemedByUserId"" = {userId}, ""ModifiedOn"" = {now}
                WHERE ""Id"" = {invitation.Id}
                  AND ""RedeemedAtUtc"" IS NULL
                  AND ""RevokedAtUtc"" IS NULL
                  AND ""ExpiresAtUtc"" > {now}");

            if (claimed != 1) return RedemptionResult.Fail(InvitationError.NotOpen);

            // The conditional update went around the change tracker, so the tracked copy
            // still says the invitation is open. Anything else touching it in this same
            // scope - a revoke arriving moments later, in a request that also read it -
            // would act on that stale copy and believe the invitation was never redeemed.
            // Reloading keeps the context from lying about a row it is holding.
            await this.ctx.Entry(invitation).ReloadAsync();

            var redeemer = await this.ctx.User.FirstOrDefaultAsync(u => u.Id == userId);
            if (redeemer == null) return RedemptionResult.Fail(InvitationError.NotFound);

            // Bearer link: whoever opened it is now a member, and it may well not be the
            // invited address. Their own role is only raised, never lowered - an owner who
            // opens a member invitation does not get demoted by it.
            if (redeemer.Status == AccountStatus.Pending)
            {
                redeemer.Status = AccountStatus.Active;
            }

            this.audit.Record(userId, AuditAction.Activate, "user", userId, new
            {
                userId,
                email = redeemer.Email,
                invitedAs = invitation.Email,
                role = invitation.Role,
                @event = "redeemed",
            });

            await this.ctx.SaveChangesAsync();

            // Re-read so the caller sees the claimed row rather than the stale tracked copy
            // the conditional update went around.
            return new RedemptionResult
            {
                Invitation = await this.ctx.Invitation.AsNoTracking()
                    .FirstOrDefaultAsync(i => i.Id == invitation.Id),
            };
        }

        /// <summary>
        /// Finds by hash, never by scanning. The token is not stored, so the hash *is* the
        /// lookup key - which is also why its index is unique.
        /// </summary>
        private async Task<Invitation> FindAsync(string token)
        {
            var hash = this.tokens.HashFor(token);
            if (hash == null) return null;

            return await this.ctx.Invitation.FirstOrDefaultAsync(i => i.TokenHash == hash);
        }
    }
}
