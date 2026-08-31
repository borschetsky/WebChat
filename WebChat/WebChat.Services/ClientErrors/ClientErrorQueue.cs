using System.Collections.Generic;
using System.Threading;
using System.Threading.Channels;

namespace WebChat.Services.ClientErrors
{
    /// <summary>
    /// The hand-off between the endpoint and the writer.
    ///
    /// The endpoint answers 202 the instant a report is queued and never touches the database
    /// on the request thread. That is the whole contract: a browser reporting a crash is
    /// already having a bad time, and making it wait on a write - or fail because the database
    /// is busy - would turn one broken screen into a slower broken screen.
    /// </summary>
    public interface IClientErrorQueue
    {
        /// <summary>
        /// Queues a report, or silently drops it when the queue is full.
        ///
        /// Deliberately returns nothing. There is no answer the caller could act on: the
        /// endpoint answers 202 either way, because a client cannot usefully retry a dropped
        /// crash report and asking it to would be the retry storm the queue exists to absorb.
        /// </summary>
        void Enqueue(ClientErrorReport report);

        /// <summary>Reports to write, in arrival order. Completes when the host stops.</summary>
        IAsyncEnumerable<ClientErrorReport> ReadAllAsync(CancellationToken cancellationToken);

        /// <summary>
        /// How many reports have been dropped for want of room since the process started.
        ///
        /// A non-zero value is information, not a fault: it says the app was producing errors
        /// faster than they could be written, which is itself worth knowing. The ingest
        /// service logs it as it moves.
        /// </summary>
        long Dropped { get; }
    }

    /// <summary>
    /// A bounded <see cref="Channel{T}"/> with <see cref="BoundedChannelFullMode.DropWrite"/>.
    ///
    /// **Shedding load rather than growing is the point.** An unbounded channel turns a client
    /// stuck in a render loop into unbounded memory growth in the server process, and the
    /// failure arrives long after the cause. Bounded and dropping, the worst case is that some
    /// occurrences of an error already firing hundreds of times a second are not counted - by
    /// which point the issue is recorded, its count is alarming, and the missing increments
    /// change no decision anybody would make.
    ///
    /// <c>DropWrite</c> and not <c>DropOldest</c>: the reports already queued belong to
    /// whoever got there first, and dropping those would let one looping client evict everyone
    /// else's errors. It also keeps the write non-blocking, which is what lets the endpoint
    /// answer immediately.
    ///
    /// **The trap in <c>DropWrite</c> is that <c>TryWrite</c> returns <c>true</c> for an item
    /// it just threw away** - the channel counts "accepted and discarded" as a successful
    /// write, so a drop counter built on the return value reads zero forever. The
    /// <c>itemDropped</c> callback is the only thing that sees them.
    ///
    /// Singleton, and process-local: a second instance would have its own queue and its own
    /// drain loop, both writing to the same database, and its own drop count.
    /// </summary>
    public class ClientErrorQueue : IClientErrorQueue
    {
        private readonly Channel<ClientErrorReport> channel;
        private long dropped;

        public ClientErrorQueue(ClientErrorOptions options)
        {
            this.channel = Channel.CreateBounded<ClientErrorReport>(
                new BoundedChannelOptions(options.QueueCapacity)
                {
                    FullMode = BoundedChannelFullMode.DropWrite,

                    // One drain loop, so an upsert of a given fingerprint never races itself
                    // inside this process. Many request threads write.
                    SingleReader = true,
                    SingleWriter = false,
                },
                _ => Interlocked.Increment(ref this.dropped));
        }

        public long Dropped => Interlocked.Read(ref this.dropped);

        public void Enqueue(ClientErrorReport report)
        {
            // False here means the channel is completed - the host is shutting down - which is
            // the one case the callback above does not cover.
            if (!this.channel.Writer.TryWrite(report)) Interlocked.Increment(ref this.dropped);
        }

        public IAsyncEnumerable<ClientErrorReport> ReadAllAsync(CancellationToken cancellationToken) =>
            this.channel.Reader.ReadAllAsync(cancellationToken);
    }
}
