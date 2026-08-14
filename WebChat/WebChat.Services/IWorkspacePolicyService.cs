using System.Collections.Generic;
using System.Threading.Tasks;

namespace WebChat.Services
{
    /// <summary>Why a policy change was refused.</summary>
    public enum PolicyError
    {
        None = 0,

        /// <summary>
        /// The key is not one this build enforces. Refused rather than stored, because storing
        /// it would put a value in the database that nothing reads - which is the thing this
        /// whole slice exists to stop.
        /// </summary>
        UnknownPolicy,
    }

    public class PolicySetResult
    {
        public bool Ok => this.Error == PolicyError.None;

        public PolicyError Error { get; set; }

        /// <summary>Every enforced policy after the change, so the caller re-renders from truth.</summary>
        public IReadOnlyDictionary<string, bool> Policies { get; set; }

        public static PolicySetResult Fail(PolicyError error) => new() { Error = error };
    }

    public interface IWorkspacePolicyService
    {
        /// <summary>
        /// Every enforced policy and its current value, defaults included. The result always
        /// has one entry per key in <c>WorkspacePolicy.Defaults</c>, so a caller never has to
        /// decide what a missing key means.
        /// </summary>
        Task<IReadOnlyDictionary<string, bool>> GetAsync();

        /// <summary>
        /// One policy, for an enforcement point.
        ///
        /// Returns the default for a key this build does not know, rather than throwing: an
        /// enforcement point asking about a policy that has been retired should behave as it
        /// did before the policy existed, not fail the request it was checking.
        /// </summary>
        Task<bool> IsEnabledAsync(string key);

        /// <summary>
        /// Changes one policy and records it. Saves, unlike <c>IAuditService.Record</c> - there
        /// is no larger operation here for the write to join, the policy change *is* the
        /// operation.
        /// </summary>
        Task<PolicySetResult> SetAsync(string actorId, string key, bool value);
    }
}
