using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.Json;
using System.Threading.Tasks;
using Microsoft.EntityFrameworkCore;
using WebChat.Connection;
using WebChat.Hubs.Interfaces;
using WebChat.Models;
using WebChat.Models.ViewModels;

namespace WebChat.Services
{
    /// <inheritdoc />
    public class MemberAdminService : IMemberAdminService
    {
        private readonly WebChatContext ctx;
        private readonly IAuditService audit;
        private readonly IConnectionAborter aborter;
        private readonly IConnectionMapping<string> connections;

        public MemberAdminService(
            WebChatContext ctx,
            IAuditService audit,
            IConnectionAborter aborter,
            IConnectionMapping<string> connections)
        {
            this.ctx = ctx;
            this.audit = audit;
            this.aborter = aborter;
            this.connections = connections;
        }

        public async Task<IReadOnlyList<AdminMemberViewModel>> ListAsync()
        {
            var users = await this.ctx.User
                .AsNoTracking()
                .Where(u => !u.isDeleted)
                .OrderBy(u => u.Username)
                .Select(u => new
                {
                    u.Id,
                    u.Username,
                    u.Email,
                    u.Role,
                    u.Status,
                    // The AvatarVisibility rule inline, because it has to translate to SQL: a
                    // removed photo (#89) keeps its key in the row, and the member list is a
                    // read like any other. Removing someone else's photo is *not* in #89 -
                    // this only stops the console showing one its owner has removed.
                    AvatarFileName = u.AvatarRemovedAt == null ? u.AvatarFileName : null,
                    u.EmailConfirmed,
                    u.CreatedOn,

                    // Two aggregates in the same round trip rather than N+1 over the list.
                    Groups = this.ctx.ThreadParticipant
                        .Count(p => p.UserId == u.Id && !p.isDeleted && p.Thread.IsGroup),

                    LastMessageAt = this.ctx.Message
                        .Where(m => m.SenderId == u.Id)
                        .Max(m => (DateTime?)m.CreatedOn),
                })
                .ToListAsync();

            // Presence is process state, not database state, so it is joined on afterwards.
            return users.Select(u => new AdminMemberViewModel
            {
                Id = u.Id,
                Name = u.Username,
                Email = u.Email,
                Role = u.Role,
                Status = u.Status,
                AvatarFileName = u.AvatarFileName,
                EmailConfirmed = u.EmailConfirmed,
                JoinedUtc = u.CreatedOn,
                LastActiveUtc = u.LastMessageAt,
                Groups = u.Groups,
                Connections = this.connections.GetConnections(u.Id).Count(),
                Online = this.connections.GetConnections(u.Id).Any(),
            }).ToList();
        }

        public async Task<MemberAdminResult> SetStatusAsync(
            string actorId, IReadOnlyList<string> targetIds, string status)
        {
            if (!AccountStatus.IsValid(status)) return MemberAdminResult.Fail(MemberAdminError.InvalidStatus);

            var ids = (targetIds ?? Array.Empty<string>()).Where(id => !string.IsNullOrWhiteSpace(id)).Distinct().ToList();
            if (ids.Count == 0) return MemberAdminResult.Fail(MemberAdminError.NotFound);

            // Refused before anything is written, so a bulk action containing the actor is
            // rejected outright rather than half-applied. An administrator locking themselves
            // out is not recoverable from inside the product.
            if (ids.Contains(actorId)) return MemberAdminResult.Fail(MemberAdminError.SelfAction);

            var targets = await this.ctx.User.Where(u => ids.Contains(u.Id) && !u.isDeleted).ToListAsync();
            if (targets.Count != ids.Count) return MemberAdminResult.Fail(MemberAdminError.NotFound);

            if (await this.WouldStrandTheWorkspace(targets, status))
            {
                return MemberAdminResult.Fail(MemberAdminError.LastOwner);
            }

            foreach (var target in targets)
            {
                if (target.Status == status) continue;

                var previous = target.Status;
                target.Status = status;
                target.ModifiedOn = DateTime.UtcNow;

                var detail = new Dictionary<string, object>
                {
                    ["userId"] = target.Id,
                    ["email"] = target.Email,
                    ["from"] = previous,
                    ["to"] = status,
                };

                if (AccountStatus.EndsSessions(status))
                {
                    // What "all sessions ended" actually means, in two halves. Rotating the
                    // stamp refuses every token already issued - see the note on
                    // User.SecurityStamp - and aborting the live connections closes the
                    // sockets that would otherwise keep delivering messages without ever
                    // presenting a token again.
                    target.SecurityStamp = Guid.NewGuid().ToString();
                    detail["connectionsClosed"] = this.aborter.AbortAll(target.Id);
                }

                if (status == AccountStatus.Deactivated)
                {
                    detail["groupsRemoved"] = await this.RemoveFromEveryGroup(target.Id);
                }

                this.audit.Record(
                    actorId,
                    ActionFor(previous, status),
                    "user",
                    target.Id,
                    detail);
            }

            // One save for the status changes, the group departures, the system messages and
            // every audit entry. That is the point: an audit row for something that did not
            // happen, and a change with no audit row, are both impossible here.
            await this.ctx.SaveChangesAsync();

            return new MemberAdminResult { Members = await this.ListAsync() };
        }

        public async Task<MemberAdminResult> SetRoleAsync(
            string actorId, string actorRole, string targetId, string role)
        {
            if (!WorkspaceRole.IsValid(role)) return MemberAdminResult.Fail(MemberAdminError.InvalidRole);
            if (actorId == targetId) return MemberAdminResult.Fail(MemberAdminError.SelfAction);

            var target = await this.ctx.User.FirstOrDefaultAsync(u => u.Id == targetId && !u.isDeleted);
            if (target == null) return MemberAdminResult.Fail(MemberAdminError.NotFound);

            // WorkspaceRole says only an owner appoints and removes admins, so an admin can
            // neither promote anyone into the administering tier nor demote someone out of
            // it. Without the second half an admin could demote the owner and take the
            // workspace, which is the whole reason this check is on both sides of the change.
            var touchesAdministration =
                WorkspaceRole.CanAdminister(role) || WorkspaceRole.CanAdminister(target.Role);

            if (touchesAdministration && actorRole != WorkspaceRole.Owner)
            {
                return MemberAdminResult.Fail(MemberAdminError.OwnerOnly);
            }

            if (target.Role == role) return new MemberAdminResult { Members = await this.ListAsync() };

            if (target.Role == WorkspaceRole.Owner && await this.IsLastOwner(target.Id))
            {
                return MemberAdminResult.Fail(MemberAdminError.LastOwner);
            }

            var previous = target.Role;
            target.Role = role;
            target.ModifiedOn = DateTime.UtcNow;

            // No stamp rotation. A role change is not a revocation, and the role is read from
            // the database on every request rather than carried in the token - so it takes
            // effect on the target's next request without signing them out of every device.
            this.audit.Record(actorId, AuditAction.Role, "user", target.Id, new
            {
                userId = target.Id,
                email = target.Email,
                from = previous,
                to = role,
            });

            await this.ctx.SaveChangesAsync();

            return new MemberAdminResult { Members = await this.ListAsync() };
        }

        /// <summary>
        /// Which audit action a status transition is. The log records what happened in the
        /// vocabulary an administrator recognises, not a generic "status changed".
        /// </summary>
        private static string ActionFor(string previous, string next) => next switch
        {
            AccountStatus.Blocked => AuditAction.Block,
            AccountStatus.Deactivated => AuditAction.Deactivate,
            AccountStatus.Active when previous == AccountStatus.Blocked => AuditAction.Unblock,
            _ => AuditAction.Activate,
        };

        private async Task<bool> IsLastOwner(string userId) =>
            !await this.ctx.User.AnyAsync(u =>
                u.Id != userId && u.Role == WorkspaceRole.Owner && !u.isDeleted &&
                u.Status == AccountStatus.Active);

        /// <summary>
        /// Whether this change would leave the workspace with no owner who can sign in.
        ///
        /// Checked across the whole batch, not per account: blocking two owners one at a time
        /// is refused on the second, but a single bulk call naming both would otherwise pass
        /// every individual check and still strand the workspace.
        /// </summary>
        private async Task<bool> WouldStrandTheWorkspace(List<User> targets, string status)
        {
            if (AccountStatus.CanSignIn(status)) return false;

            var affected = targets.Where(t => t.Role == WorkspaceRole.Owner).Select(t => t.Id).ToList();
            if (affected.Count == 0) return false;

            return !await this.ctx.User.AnyAsync(u =>
                !affected.Contains(u.Id) && u.Role == WorkspaceRole.Owner && !u.isDeleted &&
                u.Status == AccountStatus.Active);
        }

        /// <summary>
        /// Takes a deactivated account out of every group, leaving a system message so the
        /// group can see why somebody vanished rather than silently losing a member.
        ///
        /// Ownership is handed on first where it has to be. A group whose owner is removed
        /// has nobody who can rename it, manage it, or transfer it again - which is the
        /// ownerless-group bug #63 already paid for, arrived at from the other direction.
        /// Direct threads are left alone: they have two participants and no roles, and
        /// removing one would destroy the other person's history.
        /// </summary>
        private async Task<int> RemoveFromEveryGroup(string userId)
        {
            var memberships = await this.ctx.ThreadParticipant
                .Include(p => p.Thread)
                .Where(p => p.UserId == userId && !p.isDeleted && p.Thread.IsGroup)
                .ToListAsync();

            foreach (var membership in memberships)
            {
                var others = await this.ctx.ThreadParticipant
                    .Where(p => p.ThreadId == membership.ThreadId && p.UserId != userId && !p.isDeleted)
                    .ToListAsync();

                if (membership.GRole == GroupRole.Owner && others.Count > 0)
                {
                    // An existing admin first, then the longest-standing member: the person
                    // most likely to already be running the group, and failing that the one
                    // with the most history in it.
                    var heir = others
                        .OrderByDescending(p => p.GRole == GroupRole.Admin)
                        .ThenBy(p => p.CreatedOn)
                        .First();

                    heir.GRole = GroupRole.Owner;

                    // Both, because ownership is stored twice: ThreadParticipant.GRole is
                    // what GroupPermissions reads, and Thread.OwnerId is what the thread's
                    // own mapping exposes. GroupService.TransferOwnership sets the pair, and
                    // setting only one here would leave a group whose permissions say one
                    // person owns it and whose row says a deactivated account does.
                    membership.Thread.OwnerId = heir.UserId;

                    this.AddSystemMessage(membership.ThreadId, userId, SystemKind.OwnerTransferred,
                        new { fromUserId = userId, toUserId = heir.UserId });
                }

                this.ctx.ThreadParticipant.Remove(membership);
                membership.Thread.Version += 1;

                this.AddSystemMessage(membership.ThreadId, userId, SystemKind.MemberDeactivated,
                    new { userId });
            }

            return memberships.Count;
        }

        /// <summary>
        /// A system message is a real row with Text = null, carrying structured facts the
        /// client turns into a sentence. Mirrors GroupService.AddSystemMessage; it is not
        /// shared because that one is bound to the group-mutation flow's version handling.
        /// </summary>
        private void AddSystemMessage(string threadId, string senderId, string kind, object data)
        {
            this.ctx.Message.Add(new Message
            {
                Id = Guid.NewGuid().ToString(),
                ThreadId = threadId,
                SenderId = senderId,
                Text = null,
                Type = MessageType.System,
                SystemKind = kind,
                SystemData = JsonSerializer.Serialize(data),
                CreatedOn = DateTime.UtcNow,
            });
        }
    }
}
