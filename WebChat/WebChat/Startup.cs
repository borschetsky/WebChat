using Amazon.Runtime;
using Amazon.S3;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Http.Features;
using Microsoft.AspNetCore.HttpOverrides;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.IdentityModel.Tokens;
using System;
using System.Collections.Generic;
using System.Text;
using System.Threading.Tasks;
using WebChat.Connection;
using WebChat.Handler;
using WebChat.Hubs;
using WebChat.Hubs.ConnectionMapper;
using WebChat.Hubs.Interfaces;
using WebChat.Services;
using WebChat.Services.Helpers;
using WebChat.Services.Inerfaces;

namespace WebChat
{
    public class Startup
    {
        private const string CorsPolicyName = "WebChatCors";

        private readonly IWebHostEnvironment environment;

        public Startup(IConfiguration configuration, IWebHostEnvironment environment)
        {
            Configuration = configuration;
            this.environment = environment;
        }

        public IConfiguration Configuration { get; }

        /// <summary>
        /// Stops a deployment that is missing a secret, before it can serve a single request.
        ///
        /// The development values live in appsettings.Development.json, which is loaded only
        /// in that environment, so anything else inherits nothing at all. Without this check a
        /// production instance would sign tokens with a null key - or, if a default were ever
        /// reintroduced to appsettings.json, with one published on GitHub. Both fail silently,
        /// which is the reason to fail here instead.
        /// </summary>
        private void ValidateRequiredConfiguration()
        {
            if (this.environment.IsDevelopment())
            {
                return;
            }

            var missing = new List<string>();

            if (string.IsNullOrWhiteSpace(Configuration.GetValue<string>("JWTSecretKey")))
            {
                missing.Add("JWTSecretKey");
            }

            if (string.IsNullOrWhiteSpace(Configuration.GetConnectionString("DefaultConnection")))
            {
                missing.Add("ConnectionStrings__DefaultConnection");
            }

            if (missing.Count > 0)
            {
                throw new InvalidOperationException(
                    $"Missing required configuration for the {this.environment.EnvironmentName} environment: " +
                    $"{string.Join(", ", missing)}. Supply these as environment variables - " +
                    "WebChat/.env.example lists every one the app reads.");
            }
        }

        // This method gets called by the runtime. Use this method to add services to the container.
        public void ConfigureServices(IServiceCollection services)
        {
            this.ValidateRequiredConfiguration();
            this.RegisterAuthentication(services);
            this.RegisterServices(services);

            services.AddCors(options =>
            {
                // A policy with no origins allows nothing, so the origins have to come from
                // configuration. Credentials are required because SignalR sends the auth cookie/token.
                var allowedOrigins = Configuration.GetSection("Cors:AllowedOrigins").Get<string[]>()
                                     ?? new[] { "http://localhost:3000", "https://localhost:3000" };

                options.AddPolicy(CorsPolicyName, policy => policy
                    .WithOrigins(allowedOrigins)
                    .AllowAnyMethod()
                    .AllowAnyHeader()
                    .AllowCredentials());
            });

            services.AddControllers().AddNewtonsoftJson();
            services.AddSwaggerGen();
            services.AddRazorPages();
            services.AddHealthChecks();

            services.AddSpaStaticFiles(configuration =>
            {
                // Vite's default build output directory (CRA used "build").
                configuration.RootPath = "ClientApp/dist";
            });

            services.AddDbContext<WebChatContext>(options =>
            {
                var connectionString = Configuration.GetConnectionString("DefaultConnection");
                // Retry on transient faults - a containerised database drops connections while
                // it is starting, and managed instances throttle.
                options.UseNpgsql(connectionString, npgsql => npgsql.EnableRetryOnFailure());
            });

            services.AddSignalR();
        }

        private void RegisterAuthentication(IServiceCollection services)
        {
            services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
                .AddJwtBearer(options =>
                {
                    options.TokenValidationParameters = new TokenValidationParameters
                    {
                        ValidateIssuer = false,
                        ValidateAudience = false,
                        ValidateLifetime = true,
                        ValidateIssuerSigningKey = true,

                        IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(Configuration.GetValue<string>("JWTSecretKey")))
                    };
                    options.Events = new JwtBearerEvents
                    {
                        OnMessageReceived = context =>
                        {
                            var accessToken = context.Request.Query["access_token"];

                            // If the request is for our hub...
                            var path = context.HttpContext.Request.Path;
                            if (!string.IsNullOrEmpty(accessToken) &&
                                (path.StartsWithSegments("/chat")))
                            {
                                // Read the token out of the query string
                                context.Token = accessToken;
                            }
                            return Task.CompletedTask;
                        }
                    };
                });
        }

        private void RegisterServices(IServiceCollection services)
        {
            services.AddSingleton<IAuthService>
                (
                    new AuthService(
                        Configuration.GetValue<string>("JWTSecretKey"),
                        Configuration.GetValue<int>("JWTLifespan")
                        )
                );
            services.AddSingleton<IUserIdProvider, NameUserIdProvider>();
            services.AddTransient<IUserService, UserService>();
            services.AddTransient<IMessageService, MessageService>();
            services.AddTransient<IThreadService, ThreadService>();
            services.AddTransient<IMappingService, MappingService>();
            services.AddTransient<IValidator, Validator>();
            services.AddSingleton(typeof(IConnectionMapping<string>), typeof(ConnectionMapping<string>));
            services.AddTransient<IImageHandler, ImageHandler>();
            AddAvatarStorage(services);
            AddEmail(services);
        }

        /// <summary>
        /// Mail goes over SMTP when credentials are present, and to the log otherwise.
        ///
        /// The fallback is the same bargain <see cref="AddAvatarStorage"/> makes for R2: a
        /// developer cloning this repo has no Brevo account, and registration should still
        /// work rather than fail on the first signup. The confirmation link is written to the
        /// log at Warning, so the whole flow stays exercisable offline.
        ///
        /// SmtpUser and SmtpKey are credentials and must come from appsettings.Secrets.json,
        /// .env, or platform environment variables - never appsettings.json.
        /// </summary>
        private void AddEmail(IServiceCollection services)
        {
            var email = new WebChat.Services.Email.EmailOptions();
            Configuration.GetSection(WebChat.Services.Email.EmailOptions.SectionName).Bind(email);
            services.AddSingleton(email);

            services.AddSingleton<WebChat.Services.Email.IEmailConfirmationTokenService>(
                new WebChat.Services.Email.EmailConfirmationTokenService(
                    TimeSpan.FromHours(email.ConfirmationLifetimeHours)));

            if (email.IsConfigured)
            {
                services.AddTransient<WebChat.Services.Email.IEmailSender,
                                      WebChat.Services.Email.SmtpEmailSender>();
            }
            else
            {
                services.AddTransient<WebChat.Services.Email.IEmailSender,
                                      WebChat.Services.Email.LoggingEmailSender>();
            }
        }

        /// <summary>
        /// Avatars go to Cloudflare R2 when credentials are present, and to wwwroot/images
        /// otherwise. The fallback is deliberate: a developer cloning this repo has no R2 keys,
        /// and the app should still run rather than fail on the first upload.
        ///
        /// Credentials must come from user secrets or environment variables - only the bucket
        /// name and URL lifetime belong in appsettings.json.
        /// </summary>
        private void AddAvatarStorage(IServiceCollection services)
        {
            var avatars = new AvatarWriter.AvatarOptions();
            Configuration.GetSection(AvatarWriter.AvatarOptions.SectionName).Bind(avatars);
            services.AddSingleton(avatars);
            services.AddTransient<AvatarWriter.Interface.IAvatarImageProcessor,
                                  AvatarWriter.AvatarImageProcessor>();

            // Reject oversized uploads at the multipart parser rather than after buffering
            // them. The default limit is 128 MB, so without this the processor's own check
            // only fires once the whole body is already in memory.
            services.Configure<FormOptions>(o => o.MultipartBodyLengthLimit = avatars.MaxUploadBytes);

            var r2 = new AvatarWriter.R2Options();
            Configuration.GetSection(AvatarWriter.R2Options.SectionName).Bind(r2);

            if (!r2.IsConfigured)
            {
                services.AddTransient<AvatarWriter.Interface.IAvatarWriter,
                                      AvatarWriter.AvatarWriter>();
                services.AddSingleton<AvatarWriter.Interface.IAvatarUrlProvider,
                                      AvatarWriter.LocalAvatarUrlProvider>();
                return;
            }

            services.AddSingleton(r2);
            services.AddSingleton<IAmazonS3>(_ => new AmazonS3Client(
                new BasicAWSCredentials(r2.AccessKeyId, r2.SecretAccessKey),
                new AmazonS3Config
                {
                    ServiceURL = r2.ServiceUrl,
                    // R2 has a single global region and addresses buckets by path, not by
                    // subdomain. Both differ from S3's defaults and both are required.
                    AuthenticationRegion = "auto",
                    ForcePathStyle = true,
                }));

            services.AddTransient<AvatarWriter.R2AvatarWriter>();
            services.AddTransient<AvatarWriter.Interface.IAvatarWriter>(
                sp => sp.GetRequiredService<AvatarWriter.R2AvatarWriter>());
            services.AddTransient<AvatarWriter.Interface.IAvatarUrlProvider>(
                sp => sp.GetRequiredService<AvatarWriter.R2AvatarWriter>());
        }

        // This method gets called by the runtime. Use this method to configure the HTTP request pipeline.
        public void Configure(IApplicationBuilder app, IWebHostEnvironment env)
        {
            // Must run before anything that reads the scheme or the client address.
            //
            // A TLS-terminating platform - App Platform, a load balancer, an ingress - answers
            // HTTPS itself and forwards plain HTTP to the container, recording the original
            // scheme in X-Forwarded-Proto. Without this middleware UseHttpsRedirection below
            // sees `http`, answers 307 to `https`, the proxy terminates that and forwards
            // `http` again: an infinite redirect the app cannot escape. It is invisible until
            // the app is actually behind a proxy, because direct HTTPS requests never hit it.
            if (Configuration.GetValue<bool>("ForwardedHeaders:Enabled"))
            {
                var forwarded = new ForwardedHeadersOptions
                {
                    ForwardedHeaders = ForwardedHeaders.XForwardedProto | ForwardedHeaders.XForwardedFor,
                };
                // The defaults trust only loopback, and the proxy is neither loopback nor at a
                // known address, so the headers would be dropped without a word. Clearing the
                // lists means trusting X-Forwarded-* from any caller - which is why this whole
                // block is opt-in, and must stay off unless something in front of the app is
                // guaranteed to overwrite those headers.
                forwarded.KnownIPNetworks.Clear();
                forwarded.KnownProxies.Clear();
                app.UseForwardedHeaders(forwarded);
            }

            if (env.IsDevelopment())
            {
                app.UseDeveloperExceptionPage();
            }
            else
            {
                // The default HSTS value is 30 days. You may want to change this for production scenarios, see https://aka.ms/aspnetcore-hsts.
                app.UseHsts();
            }

            // Deliberately ahead of UseHttpsRedirection, so it answers regardless of scheme.
            //
            // A hosting platform probes this over plain HTTP from inside its own network,
            // where there is no TLS to terminate and no X-Forwarded-Proto to set. Behind
            // UseHttpsRedirection such a probe is answered with a 307, which a health check
            // counts as a failure - so a perfectly healthy instance gets marked unhealthy and
            // the deployment is rolled back, with the app itself giving no sign of trouble.
            //
            // The check is shallow on purpose: it reports that the process is up and serving,
            // nothing more. The app already refuses to start without a reachable database -
            // PrepDB migrates before the host runs - so probing the database here would only
            // add a way for a transient fault to have a working instance killed.
            app.UseHealthChecks("/health");

            app.UseHttpsRedirection();
            app.UseStaticFiles();
            app.UseSpaStaticFiles();

            app.UseSwagger();
            app.UseSwaggerUI(c =>
            {
                c.SwaggerEndpoint("/swagger/v1/swagger.json", "my API v.1");
            });

            app.UseRouting();
            app.UseCors(CorsPolicyName);
            app.UseAuthentication();
            app.UseAuthorization();

            app.UseEndpoints(endpoints =>
            {
                endpoints.MapControllerRoute(
                    name: "default",
                    pattern: "{controller=Home}/{action=Index}/{id?}");
                endpoints.MapRazorPages();
                endpoints.MapHub<ChatHub>("/chat");
            });

            app.UseSpa(spa =>
            {
                spa.Options.SourcePath = "ClientApp";
                if (env.IsDevelopment())
                {
                    // Overridable so the same image works both in docker compose (react-app)
                    // and when running the SPA on the host.
                    var devServer = Configuration.GetValue<string>("SpaDevServerUrl") ?? "http://localhost:3000";
                    spa.UseProxyToSpaDevelopmentServer(devServer);
                }
            });
        }
    }
}
