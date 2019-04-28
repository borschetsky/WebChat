using System;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.SignalR;


namespace WebChat.Hubs
{
    [Authorize]
    public class ChatHub : Hub
    {
        public async Task SendMessage(string user, string message)
        {
            var dt = DateTime.Now;

            var newMessage = $"{message} connectionId: {Context.ConnectionId} SendAt: {string.Format("{0:ddd, MMM d HH:mm:ss }", dt)}";
            await Clients.All.SendAsync("SendMessage", user, newMessage);
            //await Clients.All.SendAsync("SendMessage", user, message);
        }

        public override Task OnConnectedAsync()
        {
            Groups.AddToGroupAsync(Context.ConnectionId, Context.User.Identity.Name);
            
            return base.OnConnectedAsync();
        }
    }
}
