using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using System;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using WebChat.Connection;

namespace WebChat.Seed
{
    /// <summary>
    /// Code-first database bootstrap. Creates the database if it does not exist and applies
    /// any pending migrations, before the host starts serving requests.
    /// </summary>
    public static class PrepDB
    {
        public static async Task MigrateDatabaseAsync(IHost host, CancellationToken cancellationToken = default)
        {
            using var scope = host.Services.CreateScope();
            var services = scope.ServiceProvider;

            var configuration = services.GetRequiredService<IConfiguration>();
            var logger = services.GetRequiredService<ILoggerFactory>().CreateLogger("WebChat.Seed.PrepDB");

            if (!configuration.GetValue("Database:AutoMigrate", true))
            {
                logger.LogInformation("Database:AutoMigrate is disabled - skipping database bootstrap.");
                return;
            }

            var maxAttempts = Math.Max(1, configuration.GetValue("Database:MigrateRetryCount", 10));
            var retryDelay = TimeSpan.FromSeconds(configuration.GetValue("Database:MigrateRetryDelaySeconds", 5));

            var context = services.GetRequiredService<WebChatContext>();

            for (var attempt = 1; ; attempt++)
            {
                try
                {
                    // MigrateAsync creates the database when it is missing, and is a no-op
                    // when the schema is already current.
                    await context.Database.MigrateAsync(cancellationToken);

                    var applied = (await context.Database.GetAppliedMigrationsAsync(cancellationToken)).ToList();
                    logger.LogInformation(
                        "Database ready ({Count} migration(s) applied): {Migrations}",
                        applied.Count,
                        string.Join(", ", applied));
                    return;
                }
                catch (Exception ex) when (attempt < maxAttempts)
                {
                    // Mostly for containers, where SQL Server is still starting up while the
                    // API is already running. A genuine schema error will exhaust the retries
                    // and rethrow rather than being swallowed.
                    logger.LogWarning(
                        "Database not ready (attempt {Attempt}/{MaxAttempts}): {Message}. Retrying in {Delay}s.",
                        attempt, maxAttempts, ex.Message, retryDelay.TotalSeconds);

                    await Task.Delay(retryDelay, cancellationToken);
                }
            }
        }
    }
}
