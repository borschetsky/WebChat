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
            var curentUserId = Context.User.Identity.Name;
            var count = connections.GetConnections(curentUserId).Count();
            if(count == 0)
            {
                Clients.All.SendAsync("ReciveConnectedStatus", curentUserId);
            }

            connections.Add(curentUserId, Context.ConnectionId);
            
            return base.OnConnectedAsync();
        }

        public override Task OnDisconnectedAsync(Exception exception)
        {
            Groups.RemoveFromGroupAsync(Context.ConnectionId, Context.User.Identity.Name);
            connections.Remove(Context.User.Identity.Name, Context.ConnectionId);
            var connectionsCount = connections.GetConnections(Context.User.Identity.Name);
            //Cheking does this user has any connetctions, if not send status to front end
            if(connectionsCount.Count() == 0)
            {
                Clients.All.SendAsync("ReciveDisconnectedStatus", Context.User.Identity.Name);
            }
            //Here we can check is user have any connectons if not SendMessage to the Client side
            return base.OnDisconnectedAsync(exception);
        }
    }
}
