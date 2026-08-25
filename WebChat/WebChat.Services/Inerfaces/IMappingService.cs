using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using WebChat.Models;
using WebChat.Models.ViewModels;

namespace WebChat.Services.Inerfaces
{
    public interface IMappingService
    {
        MessageViewModel MapMessageModelToMessageViewModel(Message model);

        Message MapMessageViewModelToMessageModel(MessageViewModel model);

        IEnumerable<MessageViewModel> MapMessageModelCollectionToMessageViewModelCollection(IEnumerable<Message> collection);

        ThreadViewModel MapThreadModelToThreadViewModel(Thread model);

        Thread MapThreadViewModelToThreadModel(ThreadViewModel model);

        UserViewModel MapUserModelToUserViewModel(User model);

        ProfileViewModel MapUserModelRoProfileViewModel(User model);

        /// <summary>
        /// The three fields other clients are allowed to learn when this user's profile
        /// changes - see <see cref="ProfileBroadcastViewModel"/>. Separate from
        /// <see cref="MapUserModelRoProfileViewModel"/> because the audiences differ: a
        /// profile goes to its owner, this goes to everyone.
        /// </summary>
        ProfileBroadcastViewModel MapUserModelToProfileBroadcastViewModel(User model);
    }
}
