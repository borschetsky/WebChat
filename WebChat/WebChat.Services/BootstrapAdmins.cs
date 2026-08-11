using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using WebChat.Connection;
using WebChat.Models;

namespace WebChat.Services
{
    /// <summary>
    /// Promotes configured addresses to workspace owner at startup.
    ///
    /// This solves the bootstrap problem: the admin console can only be opened by an owner,
    /// and there is no owner until somebody makes one. Every other way of making the first
    /// one is worse.
    ///
    /// - **Manual SQL** works once, is unrepeatable, leaves no record of *why* someone is an
    ///   owner, and on App Platform means reaching a managed database from a laptop.
    /// - **Seeding a user in a migration** bakes a person into schema history and cannot
    ///   differ between environments - which is the one thing environment config is for.
    /// - **"First registered user wins"** is the common shortcut and a real hole here:
    ///   registration is open, so on a fresh deployment whoever reaches it first owns the
    ///   workspace.
    ///
    /// Configured as a list, so it reads the same in every runner - <c>appsettings</c>,
    /// <c>WebChat/.env</c>, or App Platform environment variables:
    ///
    ///     Admin__BootstrapOwners__0=someone@example.com
    ///
    /// Idempotent: it promotes only users who are not already owners, so it is safe to leave
    /// configured forever and does nothing on every subsequent boot.
    /// </summary>
    public static class BootstrapAdmins
    {
        public const string ConfigKey = "Admin:BootstrapOwners";

        public static async Task PromoteAsync(
            WebChatContext context,
            IConfiguration configuration,
            ILogger logger,
            CancellationToken cancellationToken = default)
        {
            var configured = configuration
                .GetSection(ConfigKey)
                .Get<string[]>()
                ?.Where(e => !string.IsNullOrWhiteSpace(e))
                .Select(e => e.Trim())
                .ToList() ?? new List<string>();

            if (configured.Count == 0)
            {
                return;
            }

            foreach (var email in configured)
            {
                // Case-insensitive: an address typed into a deployment console will not
                // reliably match the casing someone registered with.
                var user = await context.User
                    .FirstOrDefaultAsync(u => u.Email.ToLower() == email.ToLower(), cancellationToken);

                if (user == null)
                {
                    // Not an error. The address is allowed to be configured before the person
                    // has registered - they are promoted on the next boot after they do.
                    logger.LogInformation(
                        "Bootstrap owner {Email} has no account yet; nothing to promote.", email);
                    continue;
                }

                // A confirmed address only. Promoting an unconfirmed one would mean anyone who
                // learns a configured address can register it and inherit the workspace -
                // which is the whole attack this list is supposed to avoid.
                if (!user.EmailConfirmed)
                {
                    logger.LogWarning(
                        "Bootstrap owner {Email} is registered but unconfirmed; not promoting.", email);
                    continue;
                }

                if (user.Role == WorkspaceRole.Owner)
                {
                    continue;
                }

                var previous = user.Role;
                user.Role = WorkspaceRole.Owner;

                // Deliberately no security-stamp rotation. The role is read from this row on
                // every authenticated request, so the change is live immediately; rotating the
                // stamp is the password-reset path and would sign them out of every device.
                await context.SaveChangesAsync(cancellationToken);

                logger.LogWarning(
                    "Promoted {Email} from {Previous} to workspace owner via {ConfigKey}.",
                    email, previous, ConfigKey);
            }
        }
    }
}
