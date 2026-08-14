using System;
using System.Collections.Generic;

namespace WebChat.Services
{
    /// <summary>
    /// Holds the parsed policies so that reading one is not a database round trip.
    ///
    /// It exists because of where policies get read: <c>POST /hey/creategroup</c> consults one
    /// on a request that is otherwise a couple of inserts, and future policies will land on
    /// paths that are hotter than that. A settings row read per request would be a query
    /// answering the same question thousands of times between changes.
    ///
    /// **Process-local, like <c>IConnectionAborter</c>, and with the same consequence.** A
    /// write invalidates the cache in the process that served it and in no other, so on a
    /// second instance the change would never be noticed - which is why this expires as well
    /// as being invalidated. The TTL is the only thing bounding how long two instances
    /// disagree, so it is short enough that "it took a moment" is the worst outcome, and it is
    /// deliberately not configurable: a knob here would eventually be set to an hour by
    /// somebody optimising a query count.
    /// </summary>
    public sealed class WorkspacePolicyCache
    {
        /// <summary>How long a snapshot is trusted on an instance that did not write it.</summary>
        public static readonly TimeSpan Ttl = TimeSpan.FromSeconds(30);

        private readonly object gate = new();

        private IReadOnlyDictionary<string, bool> snapshot;
        private DateTime expiresAtUtc;

        /// <summary>
        /// The cached policies, or null if there is nothing usable. Null means "go and read",
        /// never "no policies are set" - the two are different and conflating them would make
        /// an empty cache silently apply every default.
        /// </summary>
        public IReadOnlyDictionary<string, bool> Current
        {
            get
            {
                lock (this.gate)
                {
                    if (this.snapshot == null || DateTime.UtcNow >= this.expiresAtUtc) return null;
                    return this.snapshot;
                }
            }
        }

        public void Store(IReadOnlyDictionary<string, bool> policies)
        {
            lock (this.gate)
            {
                this.snapshot = policies;
                this.expiresAtUtc = DateTime.UtcNow.Add(Ttl);
            }
        }

        /// <summary>Drops the snapshot after a write, so this instance is right immediately.</summary>
        public void Invalidate()
        {
            lock (this.gate)
            {
                this.snapshot = null;
            }
        }
    }
}
