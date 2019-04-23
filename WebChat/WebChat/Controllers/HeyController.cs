using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using WebChat.Models;

namespace WebChat.Controllers
{
    [Authorize]
    [Route("api/[controller]")]
    [ApiController]
    public class HeyController : ControllerBase
    {
        [HttpGet("get")]
        public ActionResult<User> Get ()
        {
            return Ok(new { message = "Accessed :)" });
        }

    }
}
