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
            services.AddTransient<AvatarWriter.Interface.IAvatarWriter,
                                  AvatarWriter.AvatarWriter>();
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
