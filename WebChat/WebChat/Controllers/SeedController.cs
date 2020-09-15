using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using System.Threading.Tasks;
using WebChat.Connection;

namespace WebChat.Controllers
{
    [Route("api")]
    [ApiController]
    public class SeedController : ControllerBase
    {
       
        private readonly WebChatContext ctx;

        public SeedController(WebChatContext ctx)
        {
            
            this.ctx = ctx;
        }

        [HttpGet("seed")]
        public async Task<IActionResult> CreateDb()
        {
            await ctx.Database.MigrateAsync();
            return Ok();
        }
        
    }
}
