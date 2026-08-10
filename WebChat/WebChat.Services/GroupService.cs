using System;
using System.Collections.Generic;
using System.Linq;
using Microsoft.EntityFrameworkCore;
using System.Text.Json;
using WebChat.Connection;
using WebChat.Models;

namespace WebChat.Services
{
    /// <summary>Why a mutation was refused. Maps to the wire contract's error codes.</summary>
    public enum GroupError
    {
        None,
        NotAMember,
        PermissionDenied,
        VersionConflict,
        LastOwner,
        NameInvalid,
        UserNotFound,
        AlreadyApplied,
    }

    /// <summary>
    /// The outcome of a mutation: the thread as it now stands, the system message it produced,
    /// or the reason it was refused.
    /// </summary>
    public class GroupResult
    {
        public GroupError Error { get; init; } = GroupError.None;

        public bool Ok => this.Error == GroupError.None;

        public Thread Thread { get; init; }

        public Message SystemMessage { get; init; }

        /// <summary>Ids added, for the batch add. Empty otherwise.</summary>
        public List<string> Added { get; init; } = new();

        /// <summary>Ids skipped because they were already members.</summary>
        public List<string> Skipped { get; init; } = new();

        public static GroupResult Fail(GroupError error, Thread thread = null) =>
            new() { Error = error, Thread = thread };
    }

    /// <summary>
    /// The five group mutations from <c>SPEC-group-wire-contract.md</c>.
    ///
    /// Each one is a compare-and-swap on <see cref="Thread.Version"/> and runs inside a
    /// transaction, so a group is never observable with zero owners, two owners, or a version
    /// that moved without the change that earned it. The spec's phrasing is worth keeping in
    /// mind: "a group must never be observable with zero or two owners".
    ///
    /// Authorization is delegated entirely to <see cref="GroupPermissions"/>, which is pure -
    /// this class decides nothing about who may act, only what happens when they may.
    /// </summary>
    public class GroupService : IGroupService
    {
        private readonly WebChatContext ctx;

        public GroupService(WebChatContext ctx)
        {
            this.ctx = ctx;
        }

        private Thread LoadGroup(string groupId) =>
            this.ctx.Thread.FirstOrDefault(t => t.Id == groupId && t.IsGroup);

        private string RoleOf(string groupId, string userId) =>
            this.ctx.ThreadParticipant
                .Where(p => p.ThreadId == groupId && p.UserId == userId && !p.isDeleted)
                .Select(p => p.GRole)
                .FirstOrDefault();

        /// <summary>
        /// The compare-and-swap every mutation begins with. A stale token is a refusal rather
        /// than a merge - the client is handed the current group and re-renders.
        /// </summary>
        private static bool VersionMatches(Thread thread, int? ifMatch) =>
            ifMatch == null || ifMatch.Value == thread.Version;

        private Message AddSystemMessage(string groupId, string actorId, string kind, object data)
        {
            var message = new Message
            {
                Id = Guid.NewGuid().ToString(),
                ThreadId = groupId,

                // The actor, not a sentinel. Every system message here has a human behind it.
                SenderId = actorId,

                Type = MessageType.System,
                SystemKind = kind,
                SystemData = JsonSerializer.Serialize(data),

                // No rendered string is stored; the client builds the sentence from the facts.
                Text = null,
                CreatedOn = DateTime.UtcNow,
            };

            this.ctx.Message.Add(message);
            return message;
        }

        public GroupResult Get(string groupId, string actorId)
        {
            var thread = LoadGroup(groupId);
            if (thread == null) return GroupResult.Fail(GroupError.NotAMember);

            // Membership is the read check too. Deliberately the same refusal a non-member
            // gets from a mutation: whether a group exists is itself something only its
            // members are entitled to learn.
            var role = RoleOf(groupId, actorId);
            if (role == null) return GroupResult.Fail(GroupError.NotAMember);

            return new GroupResult { Thread = thread };
        }

        public GroupResult Rename(string groupId, string actorId, string name, int? ifMatch)
        {
            var thread = LoadGroup(groupId);
            if (thread == null) return GroupResult.Fail(GroupError.NotAMember);

            var role = RoleOf(groupId, actorId);
            if (role == null) return GroupResult.Fail(GroupError.NotAMember);
            if (!GroupPermissions.Can(GroupAction.Rename, role, thread))
            {
                return GroupResult.Fail(GroupError.PermissionDenied, thread);
            }

            if (!VersionMatches(thread, ifMatch))
            {
                return GroupResult.Fail(GroupError.VersionConflict, thread);
            }

            // null reverts to auto-naming; anything else is collapsed and length-checked.
            string next = null;
            if (name != null)
            {
                next = System.Text.RegularExpressions.Regex.Replace(name.Trim(), @"\s+", " ");
                if (next.Length < 1 || next.Length > 80 || next.Any(char.IsControl))
                {
                    return GroupResult.Fail(GroupError.NameInvalid, thread);
                }
            }

            // A rename to the identical name is a no-op, deliberately: people double-submit,
            // and "renamed to the same thing" is not an event anyone wants in the history.
            if (next == thread.Name)
            {
                return new GroupResult { Thread = thread };
            }

            var from = thread.Name;
            thread.Name = next;
            thread.Named = next != null;
            thread.Version += 1;

            var system = AddSystemMessage(groupId, actorId, SystemKind.Rename,
                new { from, to = next });

            this.ctx.SaveChanges();
            return new GroupResult { Thread = thread, SystemMessage = system };
        }

        public GroupResult AddMembers(string groupId, string actorId, IEnumerable<string> userIds, int? ifMatch)
        {
            var thread = LoadGroup(groupId);
            if (thread == null) return GroupResult.Fail(GroupError.NotAMember);

            var role = RoleOf(groupId, actorId);
            if (role == null) return GroupResult.Fail(GroupError.NotAMember);
            if (!GroupPermissions.Can(GroupAction.Invite, role, thread))
            {
                return GroupResult.Fail(GroupError.PermissionDenied, thread);
            }

            if (!VersionMatches(thread, ifMatch))
            {
                return GroupResult.Fail(GroupError.VersionConflict, thread);
            }

            var requested = (userIds ?? Enumerable.Empty<string>())
                .Where(id => !string.IsNullOrWhiteSpace(id))
                .Distinct()
                .ToList();

            var existing = this.ctx.ThreadParticipant
                .Where(p => p.ThreadId == groupId)
                .Select(p => p.UserId)
                .ToHashSet();

            var real = this.ctx.User.Where(u => requested.Contains(u.Id)).Select(u => u.Id).ToHashSet();
            if (requested.Any(id => !real.Contains(id)))
            {
                return GroupResult.Fail(GroupError.UserNotFound, thread);
            }

            // Idempotent per user: someone already in the group is reported, not an error.
            var added = requested.Where(id => !existing.Contains(id)).ToList();
            var skipped = requested.Where(existing.Contains).ToList();

            if (added.Count == 0)
            {
                return new GroupResult { Thread = thread, Skipped = skipped };
            }

            foreach (var id in added)
            {
                this.ctx.ThreadParticipant.Add(new ThreadParticipant
                {
                    Id = Guid.NewGuid().ToString(),
                    ThreadId = groupId,
                    UserId = id,
                    GRole = GroupRole.Member,
                    CreatedOn = DateTime.UtcNow,
                });
            }

            thread.Version += 1;

            // One message per batch, not per user - adding eight people should not produce
            // eight divider rows.
            var system = AddSystemMessage(groupId, actorId, SystemKind.MembersAdded,
                new { userIds = added });

            this.ctx.SaveChanges();
            return new GroupResult
            {
                Thread = thread,
                SystemMessage = system,
                Added = added,
                Skipped = skipped,
            };
        }

        public GroupResult RemoveMember(string groupId, string actorId, string targetId, int? ifMatch)
        {
            var thread = LoadGroup(groupId);
            if (thread == null) return GroupResult.Fail(GroupError.NotAMember);

            var actorRole = RoleOf(groupId, actorId);
            if (actorRole == null) return GroupResult.Fail(GroupError.NotAMember);

            var participant = this.ctx.ThreadParticipant
                .FirstOrDefault(p => p.ThreadId == groupId && p.UserId == targetId && !p.isDeleted);

            // Removing someone already gone is success, not an error the user can act on.
            if (participant == null)
            {
                return new GroupResult { Thread = thread, Error = GroupError.None };
            }

            var leaving = actorId == targetId;

            // Leaving is always allowed and bypasses perms.remove - except for the owner, who
            // must transfer first, or the group is left with nobody who can.
            if (leaving)
            {
                if (!GroupPermissions.CanLeave(actorRole))
                {
                    return GroupResult.Fail(GroupError.LastOwner, thread);
                }
            }
            else if (participant.GRole == GroupRole.Owner)
            {
                return GroupResult.Fail(GroupError.LastOwner, thread);
            }
            else if (!GroupPermissions.CanRemove(actorRole, participant.GRole, thread))
            {
                return GroupResult.Fail(GroupError.PermissionDenied, thread);
            }

            if (!VersionMatches(thread, ifMatch))
            {
                return GroupResult.Fail(GroupError.VersionConflict, thread);
            }

            this.ctx.ThreadParticipant.Remove(participant);
            thread.Version += 1;

            var system = AddSystemMessage(groupId, actorId,
                leaving ? SystemKind.MemberLeft : SystemKind.MemberRemoved,
                new { userId = targetId });

            this.ctx.SaveChanges();
            return new GroupResult { Thread = thread, SystemMessage = system };
        }

        public GroupResult SetRole(string groupId, string actorId, string targetId, string gRole, int? ifMatch)
        {
            var thread = LoadGroup(groupId);
            if (thread == null) return GroupResult.Fail(GroupError.NotAMember);

            var actorRole = RoleOf(groupId, actorId);
            if (actorRole == null) return GroupResult.Fail(GroupError.NotAMember);

            // 'owner' is refused here - ownership moves by transfer, which demotes the previous
            // owner in the same transaction. This endpoint is the one path to two owners.
            if (!GroupPermissions.CanSetRole(actorRole, gRole, thread))
            {
                return GroupResult.Fail(GroupError.PermissionDenied, thread);
            }

            var participant = this.ctx.ThreadParticipant
                .FirstOrDefault(p => p.ThreadId == groupId && p.UserId == targetId && !p.isDeleted);
            if (participant == null) return GroupResult.Fail(GroupError.NotAMember, thread);

            // The owner's role is not changed by this endpoint either; demoting them here
            // would leave the group ownerless.
            if (participant.GRole == GroupRole.Owner)
            {
                return GroupResult.Fail(GroupError.LastOwner, thread);
            }

            if (!VersionMatches(thread, ifMatch))
            {
                return GroupResult.Fail(GroupError.VersionConflict, thread);
            }

            if (participant.GRole == gRole)
            {
                return new GroupResult { Thread = thread };
            }

            var before = participant.GRole;
            participant.GRole = gRole;
            thread.Version += 1;

            var system = AddSystemMessage(groupId, actorId, SystemKind.RoleChanged,
                new { userId = targetId, from = before, to = gRole });

            this.ctx.SaveChanges();
            return new GroupResult { Thread = thread, SystemMessage = system };
        }

        public GroupResult TransferOwnership(string groupId, string actorId, string targetId, int? ifMatch)
        {
            var thread = LoadGroup(groupId);
            if (thread == null) return GroupResult.Fail(GroupError.NotAMember);

            var actorRole = RoleOf(groupId, actorId);
            if (!GroupPermissions.Can(GroupAction.TransferOwnership, actorRole, thread))
            {
                return GroupResult.Fail(GroupError.PermissionDenied, thread);
            }

            var target = this.ctx.ThreadParticipant
                .FirstOrDefault(p => p.ThreadId == groupId && p.UserId == targetId && !p.isDeleted);

            // They may have left between the drawer rendering and this arriving.
            if (target == null) return GroupResult.Fail(GroupError.NotAMember, thread);

            if (!VersionMatches(thread, ifMatch))
            {
                return GroupResult.Fail(GroupError.VersionConflict, thread);
            }

            if (targetId == actorId)
            {
                return new GroupResult { Thread = thread };
            }

            var previous = this.ctx.ThreadParticipant
                .First(p => p.ThreadId == groupId && p.UserId == actorId);

            // Both sides in one SaveChanges. A group observable with zero or two owners is the
            // failure this ordering exists to prevent.
            previous.GRole = GroupRole.Admin;
            target.GRole = GroupRole.Owner;
            thread.OwnerId = targetId;
            thread.Version += 1;

            var system = AddSystemMessage(groupId, actorId, SystemKind.OwnerTransferred,
                new { fromUserId = actorId, toUserId = targetId });

            this.ctx.SaveChanges();
            return new GroupResult { Thread = thread, SystemMessage = system };
        }

        public GroupResult SetPermissions(string groupId, string actorId, string rename, string invite, string remove, int? ifMatch)
        {
            var thread = LoadGroup(groupId);
            if (thread == null) return GroupResult.Fail(GroupError.NotAMember);

            var actorRole = RoleOf(groupId, actorId);
            if (!GroupPermissions.Can(GroupAction.SetPermissions, actorRole, thread))
            {
                return GroupResult.Fail(GroupError.PermissionDenied, thread);
            }

            if (!VersionMatches(thread, ifMatch))
            {
                return GroupResult.Fail(GroupError.VersionConflict, thread);
            }

            // Partial: an omitted key is unchanged. An invalid one is refused rather than
            // silently ignored, since a rejected level would otherwise read as accepted.
            foreach (var level in new[] { rename, invite, remove }.Where(l => l != null))
            {
                if (!PermissionLevel.IsValid(level))
                {
                    return GroupResult.Fail(GroupError.NameInvalid, thread);
                }
            }

            thread.PermRename = rename ?? thread.PermRename;
            thread.PermInvite = invite ?? thread.PermInvite;
            thread.PermRemove = remove ?? thread.PermRemove;
            thread.Version += 1;

            // No system message, by design: permissions are configuration, not an event in the
            // conversation. Still audited.
            this.ctx.SaveChanges();
            return new GroupResult { Thread = thread };
        }

        public List<ThreadParticipant> Members(string groupId) =>
            this.ctx.ThreadParticipant
                .Where(p => p.ThreadId == groupId && !p.isDeleted)
                .Include(p => p.User)
                .ToList();
    }
}
