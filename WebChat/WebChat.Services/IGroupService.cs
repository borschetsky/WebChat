using System.Collections.Generic;
using WebChat.Models;

namespace WebChat.Services
{
    /// <summary>
    /// The group mutations from <c>SPEC-group-wire-contract.md</c> §1.
    ///
    /// Every method takes <c>ifMatch</c> - the client's copy of <see cref="Thread.Version"/> -
    /// and refuses a stale one with <see cref="GroupError.VersionConflict"/> rather than
    /// merging. Null skips the check, which exists only for callers that have no version to
    /// send; the HTTP layer always sends one.
    /// </summary>
    public interface IGroupService
    {
        /// <summary>Rename, or pass null to revert to auto-naming.</summary>
        GroupResult Rename(string groupId, string actorId, string name, int? ifMatch);

        /// <summary>Batch, idempotent per user. Already-present users are skipped, not errors.</summary>
        GroupResult AddMembers(string groupId, string actorId, IEnumerable<string> userIds, int? ifMatch);

        /// <summary>Removing yourself is "leave", and bypasses the remove permission.</summary>
        GroupResult RemoveMember(string groupId, string actorId, string targetId, int? ifMatch);

        /// <summary>Promote or demote. Refuses 'owner' - that is a transfer.</summary>
        GroupResult SetRole(string groupId, string actorId, string targetId, string gRole, int? ifMatch);

        /// <summary>Owner only, one transaction: target becomes owner, actor becomes admin.</summary>
        GroupResult TransferOwnership(string groupId, string actorId, string targetId, int? ifMatch);

        /// <summary>Owner only. Partial - omitted levels are unchanged. No system message.</summary>
        GroupResult SetPermissions(string groupId, string actorId, string rename, string invite, string remove, int? ifMatch);

        List<ThreadParticipant> Members(string groupId);
    }
}
