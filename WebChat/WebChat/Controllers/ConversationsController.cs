using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.SignalR;
using Newtonsoft.Json;
using WebChat.Hubs;
using WebChat.Hubs.Interfaces;
using WebChat.Models;
using WebChat.Services;
using WebChat.ViewModels;

namespace WebChat.Controllers
{
    /// <summary>
    /// Group management, per <c>SPEC-group-wire-contract.md</c> §1.
    ///
    /// Every mutation is a compare-and-swap on the group's version, sent as <c>If-Match</c>.
    /// A stale token is answered with <c>409 VERSION_CONFLICT</c> **and the current group
    /// attached** - the spec is specific about that, because it is what lets the UI correct
    /// itself without a refetch.
    ///
    /// This controller only translates: it reads the caller, delegates the decision to
    /// <see cref="IGroupService"/>, maps the outcome to a status code, and pushes the event.
    /// </summary>
    [Authorize]
    [ApiController]
    [Route("api/conversations/{groupId}")]
    public class ConversationsController : ControllerBase
    {
        private readonly IGroupService groups;
        private readonly IUserService users;
        private readonly IHubContext<ChatHub> hub;
        private readonly IConnectionMapping<string> connections;

        public ConversationsController(
            IGroupService groups,
            IUserService users,
            IHubContext<ChatHub> hub,
            IConnectionMapping<string> connections)
        {
            this.groups = groups;
            this.users = users;
            this.hub = hub;
            this.connections = connections;
        }

        /// <summary>
        /// The client's copy of the version. Absent means "no opinion", which the service
        /// treats as a match - the HTTP layer always sends one, so this only matters to a
        /// caller that has none.
        /// </summary>
        private int? IfMatch()
        {
            var raw = Request.Headers["If-Match"].ToString()?.Trim('"', ' ');
            return int.TryParse(raw, out var version) ? version : null;
        }

        private string Caller => User.Identity.Name;

        /// <summary>The Group shape from the contract, with members expanded.</summary>
        private object GroupView(Thread thread)
        {
            var members = this.groups.Members(thread.Id).Select(p => new
            {
                userId = p.UserId,
                displayName = p.User?.Username,
                gRole = p.GRole,
                joinedAt = p.CreatedOn,

                // Beyond the contract's Member shape, and additive on purpose: the member list
                // in the info drawer draws a face and a presence dot per row, and without
                // these it would have to cross-reference getthreads - which excludes the
                // caller and carries no roles, so neither list is a superset of the other.
                // Not p.User?.AvatarFileName: a removed photo (#89) keeps its key in the row
                // so Undo can restore it exactly, so the rule decides, not the column.
                avatarFileName = AvatarVisibility.For(p.User),

                // Presence is not a column - it is whether the hub currently holds a
                // connection for them, the same source getthreads and the directory use.
                isOnline = this.connections.GetConnections(p.UserId).Any(),
            });

            return new
            {
                id = thread.Id,
                // Null for an auto-named group. Never a computed name - the client derives the
                // display name from members, and sending one here would freeze it again.
                name = thread.Name,
                named = thread.Named,
                version = thread.Version,
                perms = new
                {
                    rename = thread.PermRename,
                    invite = thread.PermInvite,
                    remove = thread.PermRemove,
                },
                members,
            };
        }

        private object MessageView(Message m) => m == null ? null : new
        {
            id = m.Id,
            conversationId = m.ThreadId,
            type = m.Type,
            senderId = m.SenderId,
            systemKind = m.SystemKind,
            // Re-parsed so the client receives an object rather than a string of JSON.
            systemData = m.SystemData == null ? null : JsonConvert.DeserializeObject(m.SystemData),

            // The ids inside, resolved to names. The client resolves against the thread's
            // current members, and the person a system message is about has often just left
            // it - "You removed Maya" would otherwise read "You removed someone".
            systemNames = SystemDataJson.NamesFor(m.SystemData, this.users.GetUserNameById),
            // `text`, not the spec.s `body`: getmessages already returns this field under
            // that name, and system messages arrive through it too, so two names for one
            // field would mean the client reading a different key depending on the route.
            text = m.Text,
            createdAt = m.CreatedOn,
        };

        /// <summary>Maps a refusal onto the contract's status codes and error envelope.</summary>
        private IActionResult Problem(GroupResult result)
        {
            var (status, code) = result.Error switch
            {
                GroupError.PermissionDenied => (403, "PERMISSION_DENIED"),
                GroupError.VersionConflict => (409, "VERSION_CONFLICT"),
                GroupError.LastOwner => (409, "LAST_OWNER"),
                GroupError.NotAMember => (404, "NOT_A_MEMBER"),
                GroupError.UserNotFound => (404, "USER_NOT_FOUND"),
                GroupError.NameInvalid => (422, "NAME_INVALID"),
                _ => (400, "BAD_REQUEST"),
            };

            var error = new Dictionary<string, object>
            {
                ["code"] = code,
                ["message"] = Explain(result.Error),
            };

            // The current group travels with every conflict, so the client can reconcile
            // rather than refetch and guess.
            if (result.Thread != null && status == 409)
            {
                error["group"] = GroupView(result.Thread);
            }

            return StatusCode(status, new { error });
        }

        private static string Explain(GroupError error) => error switch
        {
            GroupError.PermissionDenied => "You do not have permission to do that in this group.",
            GroupError.VersionConflict => "This group changed while you were looking at it. Try again.",
            GroupError.LastOwner => "Transfer ownership before leaving or removing the owner.",
            GroupError.NotAMember => "That person is not in this group.",
            GroupError.UserNotFound => "One of those people no longer exists.",
            GroupError.NameInvalid => "That name is not allowed. Use 1 to 80 characters.",
            _ => "That request could not be completed.",
        };

        /// <summary>Pushes to every member except the actor, who already has the response.</summary>
        private async Task Broadcast(Thread thread, string actorId, object payload)
        {
            var audience = this.groups.Members(thread.Id)
                .Select(p => p.UserId)
                .Where(id => id != actorId)
                .ToList();

            if (audience.Count > 0)
            {
                await this.hub.Clients.Users(audience).SendAsync("ReciveGroupEvent", payload);
            }
        }

        /// <summary>
        /// The group, for the info drawer. Not in the contract's list of five mutations, but
        /// the client cannot send <c>If-Match</c> without a version and cannot draw §3's
        /// read-only markup without <c>perms</c> and the caller's own role - and
        /// <c>getthreads</c> carries none of that.
        /// </summary>
        [HttpGet]
        public IActionResult Get(string groupId)
        {
            var result = this.groups.Get(groupId, Caller);
            return result.Ok ? Ok(new { group = GroupView(result.Thread) }) : Problem(result);
        }

        [HttpPatch("name")]
        public async Task<IActionResult> Rename(string groupId, [FromBody] RenameGroupViewModel model)
        {
            var result = this.groups.Rename(groupId, Caller, model?.Name, IfMatch());
            if (!result.Ok) return Problem(result);

            if (result.SystemMessage != null)
            {
                await Broadcast(result.Thread, Caller, new
                {
                    type = "group.renamed",
                    groupId,
                    version = result.Thread.Version,
                    actorId = Caller,
                    name = result.Thread.Name,
                    named = result.Thread.Named,
                    systemMessage = MessageView(result.SystemMessage),
                });
            }

            return Ok(new { group = GroupView(result.Thread), systemMessage = MessageView(result.SystemMessage) });
        }

        [HttpPost("members")]
        public async Task<IActionResult> AddMembers(string groupId, [FromBody] AddMembersViewModel model)
        {
            var result = this.groups.AddMembers(groupId, Caller, model?.UserIds, IfMatch());
            if (!result.Ok) return Problem(result);

            if (result.SystemMessage != null)
            {
                await Broadcast(result.Thread, Caller, new
                {
                    type = "group.members_added",
                    groupId,
                    version = result.Thread.Version,
                    actorId = Caller,
                    added = result.Added,
                    systemMessage = MessageView(result.SystemMessage),
                });

                // The added users have no local copy of this conversation, so they get the
                // whole thing rather than a patch.
                await this.hub.Clients.Users(result.Added).SendAsync("ReciveGroupEvent", new
                {
                    type = "conversation.joined",
                    groupId,
                    group = GroupView(result.Thread),
                });
            }

            return Ok(new
            {
                group = GroupView(result.Thread),
                added = result.Added,
                skipped = result.Skipped.Select(id => new { userId = id, reason = "ALREADY_MEMBER" }),
                systemMessages = result.SystemMessage == null
                    ? Array.Empty<object>()
                    : new[] { MessageView(result.SystemMessage) },
            });
        }

        [HttpDelete("members/{userId}")]
        public async Task<IActionResult> RemoveMember(string groupId, string userId)
        {
            var leaving = userId == Caller;
            var result = this.groups.RemoveMember(groupId, Caller, userId, IfMatch());
            if (!result.Ok) return Problem(result);

            if (result.SystemMessage != null)
            {
                await Broadcast(result.Thread, Caller, new
                {
                    type = leaving ? "group.member_left" : "group.member_removed",
                    groupId,
                    version = result.Thread.Version,
                    actorId = Caller,
                    userId,
                    systemMessage = MessageView(result.SystemMessage),
                });

                // A distinct event for the person removed: their client has to close the
                // thread, drop it from the list and stop subscribing. They deliberately do not
                // receive the system message announcing their own removal - they are no longer
                // a member and should get no further group traffic.
                if (!leaving)
                {
                    await this.hub.Clients.User(userId).SendAsync("ReciveGroupEvent", new
                    {
                        type = "conversation.removed",
                        groupId,
                    });
                }
            }

            return Ok(new { group = GroupView(result.Thread), systemMessage = MessageView(result.SystemMessage) });
        }

        [HttpPut("members/{userId}/role")]
        public async Task<IActionResult> SetRole(string groupId, string userId, [FromBody] SetRoleViewModel model)
        {
            var result = this.groups.SetRole(groupId, Caller, userId, model?.GRole, IfMatch());
            if (!result.Ok) return Problem(result);

            if (result.SystemMessage != null)
            {
                await Broadcast(result.Thread, Caller, new
                {
                    type = "group.role_changed",
                    groupId,
                    version = result.Thread.Version,
                    actorId = Caller,
                    userId,
                    gRole = model?.GRole,
                    systemMessage = MessageView(result.SystemMessage),
                });
            }

            return Ok(new { group = GroupView(result.Thread), systemMessage = MessageView(result.SystemMessage) });
        }

        [HttpPost("owner")]
        public async Task<IActionResult> TransferOwnership(string groupId, [FromBody] TransferOwnerViewModel model)
        {
            var previous = Caller;
            var result = this.groups.TransferOwnership(groupId, Caller, model?.UserId, IfMatch());
            if (!result.Ok) return Problem(result);

            if (result.SystemMessage != null)
            {
                await Broadcast(result.Thread, Caller, new
                {
                    type = "group.owner_transferred",
                    groupId,
                    version = result.Thread.Version,
                    actorId = Caller,
                    fromUserId = previous,
                    toUserId = model?.UserId,
                    systemMessage = MessageView(result.SystemMessage),
                });
            }

            return Ok(new { group = GroupView(result.Thread), systemMessage = MessageView(result.SystemMessage) });
        }

        [HttpPatch("perms")]
        public async Task<IActionResult> SetPermissions(string groupId, [FromBody] SetPermsViewModel model)
        {
            var result = this.groups.SetPermissions(
                groupId, Caller, model?.Rename, model?.Invite, model?.Remove, IfMatch());

            if (!result.Ok) return Problem(result);

            // Quiet by design: configuration, not an event in the conversation. Still pushed,
            // so an open info drawer re-renders its capabilities immediately.
            await Broadcast(result.Thread, Caller, new
            {
                type = "group.perms_changed",
                groupId,
                version = result.Thread.Version,
                actorId = Caller,
                perms = new
                {
                    rename = result.Thread.PermRename,
                    invite = result.Thread.PermInvite,
                    remove = result.Thread.PermRemove,
                },
            });

            return Ok(new { group = GroupView(result.Thread) });
        }
    }
}
