using System;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

namespace WebChat.Services.ClientErrors
{
    /// <summary>
    /// Drains <see cref="IClientErrorQueue"/> into the database, one report at a time.
    ///
    /// **One loop, deliberately.** The upsert reads an issue by fingerprint and then writes it,
    /// which two concurrent writers would race into a unique-constraint violation on the
    /// fingerprint index. A single reader removes that race inside the process for free; across
    /// two instances it can still happen, which is why the loop treats a failed write as a lost
    /// report rather than as something to retry forever.
    ///
    /// **Nothing here may throw out of <c>ExecuteAsync</c>.** A <see cref="BackgroundService"/>
    /// that faults stops running, silently, and the app carries on answering 202 to reports
    /// that will never be written - the worst possible shape of failure for this feature.
    /// </summary>
    public class ClientErrorIngestService : BackgroundService
    {
        private readonly IClientErrorQueue queue;
        private readonly IServiceScopeFactory scopes;
        private readonly ILogger<ClientErrorIngestService> logger;

        private long reportedDrops;

        public ClientErrorIngestService(
            IClientErrorQueue queue,
            IServiceScopeFactory scopes,
            ILogger<ClientErrorIngestService> logger)
        {
            this.queue = queue;
            this.scopes = scopes;
            this.logger = logger;
        }

        protected override async Task ExecuteAsync(CancellationToken stoppingToken)
        {
            try
            {
                await foreach (var report in this.queue.ReadAllAsync(stoppingToken))
                {
                    await this.WriteAsync(report, stoppingToken);
                    this.LogDrops();
                }
            }
            catch (OperationCanceledException)
            {
                // Shutdown. Anything still queued is discarded, which is the right trade: a
                // crash report is not worth delaying a deployment for.
            }
        }

        private async Task WriteAsync(ClientErrorReport report, CancellationToken stoppingToken)
        {
            // A scope per report rather than one for the loop: the DbContext is scoped, and one
            // held for the process lifetime would accumulate every entity it ever tracked.
            using var scope = this.scopes.CreateScope();

            try
            {
                var service = scope.ServiceProvider.GetRequiredService<IClientErrorService>();
                await service.RecordAsync(report, stoppingToken);
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                throw;
            }
            catch (Exception ex)
            {
                // Deliberately swallowed after logging. The alternatives are both worse: a
                // rethrow stops the whole ingest loop for the life of the process, and a retry
                // of a report the database has just refused is most likely to be refused
                // again - while the queue behind it keeps filling.
                this.logger.LogWarning(ex, "Dropped a client error report: it could not be written.");
            }
        }

        /// <summary>
        /// Logs the drop count when it moves, and not otherwise. Logging per drop would mean
        /// an error loop producing a second flood in the log file, which is the same failure
        /// one layer down.
        /// </summary>
        private void LogDrops()
        {
            var dropped = this.queue.Dropped;
            if (dropped == this.reportedDrops) return;

            this.logger.LogWarning(
                "Client error reports dropped for want of queue room: {Dropped} since start.",
                dropped);

            this.reportedDrops = dropped;
        }
    }
}
