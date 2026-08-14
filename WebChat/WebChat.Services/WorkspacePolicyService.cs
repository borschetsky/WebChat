using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.Json;
using System.Threading.Tasks;
using Microsoft.EntityFrameworkCore;
using WebChat.Connection;
using WebChat.Models;

namespace WebChat.Services
{
    /// <summary>
    /// Reads and writes the workspace's policies.
    ///
    /// <c>System.Text.Json</c> for the stored blob, matching <c>AuditService.DetailJson</c>.
    /// CLAUDE.md's rule about Newtonsoft is about what crosses the wire - non-string
    /// dictionary keys the client parses as dates - and does not reach a column nothing but
    /// this class reads.
    /// </summary>
    public class WorkspacePolicyService : IWorkspacePolicyService
    {
        private readonly WebChatContext ctx;
        private readonly IAuditService audit;
        private readonly WorkspacePolicyCache cache;

        public WorkspacePolicyService(WebChatContext ctx, IAuditService audit, WorkspacePolicyCache cache)
        {
            this.ctx = ctx;
            this.audit = audit;
            this.cache = cache;
        }

        public async Task<IReadOnlyDictionary<string, bool>> GetAsync()
        {
            var cached = this.cache.Current;
            if (cached != null) return cached;

            var stored = await this.ctx.WorkspaceSettings
                .AsNoTracking()
                .Where(s => s.Id == WorkspaceSettings.SingletonId)
                .Select(s => s.PoliciesJson)
                .FirstOrDefaultAsync();

            var policies = Merge(stored);
            this.cache.Store(policies);
            return policies;
        }

        public async Task<bool> IsEnabledAsync(string key)
        {
            var policies = await this.GetAsync();

            // A retired key behaves as it did before the policy existed. Throwing here would
            // let a removed policy take down the endpoint that used to consult it.
            return policies.TryGetValue(key, out var value)
                ? value
                : WorkspacePolicy.Defaults.TryGetValue(key, out var fallback) && fallback;
        }

        public async Task<PolicySetResult> SetAsync(string actorId, string key, bool value)
        {
            if (!WorkspacePolicy.IsKnown(key)) return PolicySetResult.Fail(PolicyError.UnknownPolicy);

            var settings = await this.ctx.WorkspaceSettings
                .FirstOrDefaultAsync(s => s.Id == WorkspaceSettings.SingletonId);

            var current = Merge(settings?.PoliciesJson);
            var previous = current[key];

            var updated = new Dictionary<string, bool>(current) { [key] = value };
            var json = JsonSerializer.Serialize(updated);

            if (settings == null)
            {
                // Created on first write rather than seeded by the migration. A seeded row
                // would have to carry the defaults as data, which then disagrees with the
                // defaults in code the first time one of those is changed.
                this.ctx.WorkspaceSettings.Add(new WorkspaceSettings
                {
                    Id = WorkspaceSettings.SingletonId,
                    PoliciesJson = json,
                    ModifiedOn = DateTime.UtcNow,
                });
            }
            else
            {
                settings.PoliciesJson = json;
                settings.ModifiedOn = DateTime.UtcNow;
            }

            // Both values, because "turned off X" is a fact and "turned off X, which was on"
            // is the one that answers whether an administrator actually changed anything.
            this.audit.Record(actorId, AuditAction.Policy, "policy", key, new
            {
                policy = key,
                value,
                previous,
            });

            await this.ctx.SaveChangesAsync();

            // After the save, never before: an invalidation that beat a failed write would
            // leave every instance re-reading the old value and believing it was fresh.
            this.cache.Invalidate();

            return new PolicySetResult { Policies = updated };
        }

        /// <summary>
        /// Stored decisions on top of the defaults.
        ///
        /// Unknown keys in the stored JSON are dropped rather than surfaced: they are what a
        /// retired policy leaves behind, and passing them on would put a switch back on the
        /// screen for something nothing enforces any more.
        /// </summary>
        private static IReadOnlyDictionary<string, bool> Merge(string storedJson)
        {
            var merged = new Dictionary<string, bool>(WorkspacePolicy.Defaults);

            if (string.IsNullOrWhiteSpace(storedJson)) return merged;

            Dictionary<string, bool> stored = null;
            try
            {
                stored = JsonSerializer.Deserialize<Dictionary<string, bool>>(storedJson);
            }
            catch (JsonException)
            {
                // Unparseable settings fall back to the defaults rather than failing every
                // request that consults a policy. The row is one hand-edit away from being
                // malformed, and the defaults are a safe answer by construction: they are
                // what the app did before any of this existed.
                return merged;
            }

            if (stored == null) return merged;

            foreach (var pair in stored)
            {
                if (WorkspacePolicy.IsKnown(pair.Key)) merged[pair.Key] = pair.Value;
            }

            return merged;
        }
    }
}
