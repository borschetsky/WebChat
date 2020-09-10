using Microsoft.AspNetCore;
using Microsoft.AspNetCore.Hosting;

namespace WebChat
{
    public class Program
    {
        public static void Main(string[] args)
        {
            CreateWebHostBuilder(args).Build().Run();
        }

        public static IWebHostBuilder CreateWebHostBuilder(string[] args) =>
            WebHost.CreateDefaultBuilder(args)
                .UseStartup<Startup>();
            //.UseWebRoot("static")
            //.UseUrls("http://localhost:4000");
    }
}
