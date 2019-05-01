using System.Text;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.IdentityModel.Tokens;
using Newtonsoft.Json.Converters;
using Newtonsoft.Json.Serialization;
using WebChat.Connection;
using WebChat.Hubs;
using WebChat.Services;


namespace WebChat
{
    public class Startup
    {
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

            services.AddCors();

            services.AddMvc().SetCompatibilityVersion(CompatibilityVersion.Version_2_2)
                .AddJsonOptions(option =>
                    {
                        option.SerializerSettings.ContractResolver = new CamelCasePropertyNamesContractResolver();
                        option.SerializerSettings.Converters.Add(new StringEnumConverter());
                    }
                );
            services.AddDbContext<WebChatContext>(options => 
            {
                var connectionString = Configuration.GetConnectionString("DefaultConnection");
                options.UseSqlServer(connectionString);
            });

            services.AddSignalR();

            
        }

        private void RegisterAuthentication(IServiceCollection services)
        {
            services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme).
                AddJwtBearer(options => 
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
                            if (string.IsNullOrEmpty(accessToken) == false)
                            {
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

            services.AddTransient<IUserService, UserService>();
            services.AddTransient<IMessageService, MessageService>();
            services.AddTransient<IThreadService, ThreadService>();
        }

        // This method gets called by the runtime. Use this method to configure the HTTP request pipeline.
        public void Configure(IApplicationBuilder app, IHostingEnvironment env)
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
            app.UseCors(builder => builder.WithOrigins("http://localhost:3000", "https://ui-avatars.com/api/")
            
            .AllowAnyMethod()
            .AllowAnyHeader()
            .AllowCredentials()
            );

            //app.UseHttpsRedirection();
            
            app.UseAuthentication();

            app.UseSignalR(routes => 
            {
                routes.MapHub<ChatHub>("/chat");
            });

            app.UseMvc();

        }
    }
}
