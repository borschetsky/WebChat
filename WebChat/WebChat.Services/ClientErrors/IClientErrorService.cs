using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;
using WebChat.Models.ViewModels;

namespace WebChat.Services.ClientErrors
{
    /// <summary>
    /// Everything that touches the client-error tables. Scoped, because it holds a
    /// <c>DbContext</c> - the background services resolve it inside a scope of their own.
    /// </summary>
    public interface IClientErrorService
    {
        /// <summary>
        /// Folds one report into its issue: creates the row on first sight, and otherwise
        /// bumps the counters and refreshes the sample. Writes an occurrence either way.
        ///
        /// **Saves.** Unlike <c>IAuditService.Record</c> this is not part of somebody else's
        /// transaction - the caller is a drain loop with nothing else in flight, and there is
        /// no action here for an entry to be paired with.
        /// </summary>
        Task RecordAsync(ClientErrorReport report, CancellationToken cancellationToken = default);

        /// <summary>
        /// The issues an administrator triages, newest activity first, with the sparkline,
        /// distinct users and browsers filled in from the retained occurrences.
        /// </summary>
        Task<IReadOnlyList<AdminErrorViewModel>> ListAsync();

        /// <summary>
        /// Moves an issue to a triage status and returns the whole list back, so the screen
        /// re-renders from what the server now holds rather than from a guess.
        ///
        /// Returns null when the id is unknown or the status is not one of
        /// <c>ClientErrorStatus</c>'s, which the controller turns into a refusal - the two are
        /// not distinguished because neither is reachable from the screen.
        /// </summary>
        Task<IReadOnlyList<AdminErrorViewModel>> SetStatusAsync(string actorId, string id, string status);

        /// <summary>
        /// Deletes what retention says is past keeping, and returns how much of each. Safe to
        /// call at any time and safe to call twice.
        /// </summary>
        Task<(int Events, int Issues)> PruneAsync(CancellationToken cancellationToken = default);
    }
}
