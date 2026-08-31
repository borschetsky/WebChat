using System;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

namespace WebChat.Services.ClientErrors
{
    /// <summary>
    /// Prunes old client errors on a timer.
    ///
    /// **This is the half of the feature that makes the other half affordable.** The production
    /// database is 512 MB and holds every account, thread and message as well; an occurrence
    /// table with no ceiling is the only part of client-error ingestion that grows without
    /// bound, and a bug that fires on every render can fill it in an afternoon.
    ///
    /// It runs on a schedule rather than only at start-up - an instance that stays up for a
    /// month would otherwise prune once - and it starts by running immediately, so a fresh
    /// deploy does not wait six hours to find out whether pruning works at all.
    ///
    /// Like the ingest loop, it must never throw out of <c>ExecuteAsync</c>: a faulted
    /// <see cref="BackgroundService"/> stops silently, and "retention has not run for three
    /// weeks" is not something anyone notices until the disk is full.
    /// </summary>
    public class ClientErrorRetentionService : BackgroundService
    {
        private readonly IServiceScopeFactory scopes;
        private readonly ClientErrorOptions options;
        private readonly ILogger<ClientErrorRetentionService> logger;

        public ClientErrorRetentionService(
            IServiceScopeFactory scopes,
            ClientErrorOptions options,
            ILogger<ClientErrorRetentionService> logger)
        {
            this.scopes = scopes;
            this.options = options;
            this.logger = logger;
        }

        protected override async Task ExecuteAsync(CancellationToken stoppingToken)
        {
            if (!this.options.PruningEnabled)
            {
                this.logger.LogWarning(
                    "Client error retention is disabled (ClientErrors:PruningEnabled). " +
                    "Nothing will be pruned for the life of this process.");
                return;
            }

            // At least an hour apart however it is configured. A zero or negative interval
            // would turn this into a hot loop issuing DELETEs against a shared database.
            var interval = TimeSpan.FromHours(Math.Max(1, this.options.PruneIntervalHours));

            while (!stoppingToken.IsCancellationRequested)
            {
                await this.PruneAsync(stoppingToken);

                try
                {
                    await Task.Delay(interval, stoppingToken);
                }
                catch (OperationCanceledException)
                {
                    return;
                }
            }
        }

        private async Task PruneAsync(CancellationToken stoppingToken)
        {
            using var scope = this.scopes.CreateScope();

            try
            {
                var service = scope.ServiceProvider.GetRequiredService<IClientErrorService>();
                var (events, issues) = await service.PruneAsync(stoppingToken);

                // Only when something was actually removed. On a healthy workspace the answer
                // is (0, 0) every six hours, and logging that would train everyone to skip it.
                if (events > 0 || issues > 0)
                {
                    this.logger.LogInformation(
                        "Pruned client errors: {Events} occurrences and {Issues} issues.",
                        events,
                        issues);
                }
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
            }
            catch (Exception ex)
            {
                // The next pass is in a few hours and will try the same work again, so a
                // transient database fault costs nothing but this log line.
                this.logger.LogWarning(ex, "Client error retention pass failed; will retry.");
            }
        }
    }
}
