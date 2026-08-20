using System;
using System.Collections.Generic;
using System.Text;
using WebChat.Models;
using WebChat.Models.ViewModels;
using WebChat.Services.Inerfaces;

namespace WebChat.Services.Helpers
{
    public class MappingService : IMappingService
    {

        public Message MapMessageViewModelToMessageModel(MessageViewModel model)
        {
            var messageModel = new Message()
            {
                Id = model.Id,
                Text = model.Text,
                SenderId = model.SenderId,
                ThreadId = model.ThreadId,
                CreatedOn = DateTime.UtcNow
            };

            return messageModel;
        }

        public MessageViewModel MapMessageModelToMessageViewModel(Message model)
        {
            var messageViewModel = new MessageViewModel()
            {
                Id = model.Id,
                SenderId = model.SenderId,
                //Username = this.userService.GetUserNameById(model.SenderId),
                Text = model.Text,
                Time = model.CreatedOn,
                ThreadId = model.ThreadId
            };
            return messageViewModel;
        }

        public IEnumerable<MessageViewModel> MapMessageModelCollectionToMessageViewModelCollection(IEnumerable<Message> collection)
        {
            var viewModelCollection = new List<MessageViewModel>();

            foreach (var model in collection)
            {
                var viewModel = this.MapMessageModelToMessageViewModel(model);
                viewModelCollection.Add(viewModel);
            }

            return viewModelCollection;
        }

        public ThreadViewModel MapThreadModelToThreadViewModel(Thread model)
        {
            var threadVM = new ThreadViewModel()
            {
                Id = model.Id,
                Owner = model.OwnerId,
                //Oponent = model.OponentId
            };
            return threadVM;
        }

        public Thread MapThreadViewModelToThreadModel(ThreadViewModel model)
        {
            var threadModel = new Thread()
            {
                Id = model.Id,
                OwnerId = model.Owner,
                OponentId = model.OponentVM.Id
            };

            return threadModel;
        }

        public UserViewModel MapUserModelToUserViewModel(User model)
        {
            return new UserViewModel()
            {
                Id = model.Id,
                // Not model.AvatarFileName: a removed photo (#89) keeps its key in the row so
                // Undo can restore it exactly, so every read path has to ask the rule rather
                // than the column. See AvatarVisibility.
                AvatarFileName = AvatarVisibility.For(model),
                Username = model.Username
            };
        }

        public ProfileViewModel MapUserModelRoProfileViewModel(User model)
        {
            // A pending removal hides all three together, and it has to. The photo, the
            // "Adjust crop" affordance and the rectangle it would restore describe one thing;
            // telling the client there is an original to adjust while showing no avatar offers
            // a crop of a photo that, as far as this user is concerned, does not exist.
            var removed = model.AvatarRemovedAt != null;

            return new ProfileViewModel()
            {
                Id = model.Id,
                Username = model.Username,
                Email = model.Email,
                AvatarFileName = AvatarVisibility.For(model),
                Role = model.Role,
                // The key itself never leaves the server; the client only needs to know
                // whether "Adjust crop" is possible. See ProfileViewModel.HasOriginalPhoto.
                HasOriginalPhoto = !removed && !string.IsNullOrWhiteSpace(model.AvatarOriginalFileName),
                AvatarCrop = removed
                    ? null
                    : AvatarCropViewModel.From(
                        model.AvatarCropX,
                        model.AvatarCropY,
                        model.AvatarCropWidth,
                        model.AvatarCropHeight),
            };
        }
    }
}
