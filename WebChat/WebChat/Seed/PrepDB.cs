using Microsoft.AspNetCore.Builder;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using WebChat.Connection;

namespace WebChat.Seed
{
    public static class PrepDB
    {
            public static void PrepPopulation(IApplicationBuilder app)
            {
                using (var serviceScope = app.ApplicationServices.CreateScope())
                {
                    SeedData(serviceScope.ServiceProvider.GetService<WebChatContext>());
                }
            }

            public static void SeedData(WebChatContext ctx)
            {
                Console.WriteLine("Applying migrations...");
                ctx.Database.Migrate();
            }
    }
}
