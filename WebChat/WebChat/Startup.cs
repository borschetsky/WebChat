using Amazon.Runtime;
using Amazon.S3;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.IdentityModel.Tokens;
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

        public Startup(IConfiguration configuration)
        {
            Configuration = configuration;
        }

        public IConfiguration Configuration { get; }

        // This method gets called by the runtime. Use this method to add services to the container.
        public void ConfigureServices(IServiceCollection services)
        {
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

            services.AddSpaStaticFiles(configuration =>
            {
                // Vite's default build output directory (CRA used "build").
                configuration.RootPath = "ClientApp/dist";
            });

            services.AddDbContext<WebChatContext>(options =>
            {
                var connectionString = Configuration.GetConnectionString("DefaultConnection");
                // Retry on transient faults - the containerised SQL Server drops connections
                // while it is starting, and Azure SQL throttles.
                options.UseSqlServer(connectionString, sql => sql.EnableRetryOnFailure());
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
            if (env.IsDevelopment())
            {
                app.UseDeveloperExceptionPage();
            }
            else
            {
                // The default HSTS value is 30 days. You may want to change this for production scenarios, see https://aka.ms/aspnetcore-hsts.
                app.UseHsts();
            }

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
