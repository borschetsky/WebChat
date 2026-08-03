using Microsoft.AspNetCore.Hosting;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Configuration.EnvironmentVariables;
using Microsoft.Extensions.Hosting;
using System.Collections.Generic;
using System.Threading.Tasks;
using WebChat.Seed;

namespace WebChat
{
    public class Program
    {
        public static async Task Main(string[] args)
        {
            var host = CreateHostBuilder(args).Build();

            // Code-first bootstrap: create/migrate the database before serving traffic.
            await PrepDB.MigrateDatabaseAsync(host);

            await host.RunAsync();
        }

        public static IHostBuilder CreateHostBuilder(string[] args) =>
            Host.CreateDefaultBuilder(args)
                .ConfigureAppConfiguration((_, config) =>
                {
                    // Local credentials, kept out of source control. optional: true so a fresh
                    // clone still runs without one - see appsettings.Secrets.example.json.
                    config.AddJsonFile("appsettings.Secrets.json", optional: true, reloadOnChange: true);

                    // A provider added here lands last and would therefore outrank environment
                    // variables. That is the wrong way round: env vars are how a deployed
                    // instance is configured, and `docker compose build` copies the working
                    // tree, so a developer's untracked secrets file can end up inside an image.
                    // Move it ahead of the env-var provider so deployment always wins.
                    var justAdded = config.Sources[config.Sources.Count - 1];
                    config.Sources.RemoveAt(config.Sources.Count - 1);

                    var envIndex = config.Sources.Count;
                    for (var i = 0; i < config.Sources.Count; i++)
                    {
                        if (config.Sources[i] is EnvironmentVariablesConfigurationSource)
                        {
                            envIndex = i;
                            break;
                        }
                    }

                    config.Sources.Insert(envIndex, justAdded);
                })
                .ConfigureWebHostDefaults(webBuilder => webBuilder.UseStartup<Startup>());
    }
}
