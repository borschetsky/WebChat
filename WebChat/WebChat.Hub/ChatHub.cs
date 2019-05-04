using System;
using System.Threading.Tasks;
using System.Linq;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.SignalR;
using Microsoft.AspNetCore.Server.Kestrel.Core.Internal.Infrastructure;
using WebChat.Hubs.ConnectionMapper;
using WebChat.Hubs.Interfaces;

namespace WebChat.Hubs
{
    [Authorize]
    public class ChatHub : Hub
    {
        private readonly IConnectionMapping<string> connections;

        //public readonly static ConnectionMapping<string> _connections = new ConnectionMapping<string>();
        public ChatHub(IConnectionMapping<string> connections)
        {
            this.connections = connections;
        }
        

        public override Task OnConnectedAsync()
        {
            connections.Add(Context.User.Identity.Name, Context.ConnectionId);
            var userID = Context.User.Identity.Name;
            Clients.User(Context.User.Identity.Name).SendAsync("ReciveConnectionId", Context.ConnectionId);
            return base.OnConnectedAsync();
        }

        public override Task OnDisconnectedAsync(Exception exception)
        {
            Groups.RemoveFromGroupAsync(Context.ConnectionId, Context.User.Identity.Name);
            //Here we can check is user have any connectons if not SendMessage to the Client side
            return base.OnDisconnectedAsync(exception);
        }
    }
}
