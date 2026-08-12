using System.Collections.Generic;
using System.Threading.Tasks;
using WebChat.Models.ViewModels;

namespace WebChat.Services
{
    /// <summary>Why a member action was refused. Maps to the API's error codes.</summary>
    public enum MemberAdminError
    {
        None,

        /// <summary>No such account.</summary>
        NotFound,

        /// <summary>An administrator acting on their own account.</summary>
        SelfAction,

        /// <summary>Would leave the workspace with no owner.</summary>
        LastOwner,

        /// <summary>Not one of <c>AccountStatus</c>.</summary>
        InvalidStatus,

        /// <summary>Not one of <c>WorkspaceRole</c>.</summary>
        InvalidRole,

        /// <summary>Only an owner may appoint or remove owners and admins.</summary>
        OwnerOnly,
    }

    public class MemberAdminResult
    {
        public MemberAdminError Error { get; init; } = MemberAdminError.None;

        public bool Ok => this.Error == MemberAdminError.None;

        /// <summary>The workspace as it now stands, so the client re-renders from truth.</summary>
        public IReadOnlyList<AdminMemberViewModel> Members { get; init; } = new List<AdminMemberViewModel>();

        public static MemberAdminResult Fail(MemberAdminError error) => new() { Error = error };
    }

    /// <summary>
    /// The admin console's view of the workspace's people.
    ///
    /// **Nothing here grants authority inside a group.** Deactivation removes an account from
    /// its groups, which looks like an exception and is not: it is the account ceasing to
    /// participate anywhere, not an administrator reaching into a conversation. The system
    /// message it leaves behind says so - see <c>SystemKind.MemberDeactivated</c>.
    /// </summary>
    public interface IMemberAdminService
    {
        Task<IReadOnlyList<AdminMemberViewModel>> ListAsync();

        /// <summary>
        /// Moves one or more accounts to a status. Bulk because the members table has a bulk
        /// action bar; one audit entry is written per account, not one per call, so a search
        /// for a person finds everything done to them.
        /// </summary>
        Task<MemberAdminResult> SetStatusAsync(string actorId, IReadOnlyList<string> targetIds, string status);

        Task<MemberAdminResult> SetRoleAsync(string actorId, string actorRole, string targetId, string role);
    }
}
