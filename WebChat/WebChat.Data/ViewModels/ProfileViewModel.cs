using System;
using System.Collections.Generic;
using System.ComponentModel.DataAnnotations;
using System.Text;

namespace WebChat.Models.ViewModels
{
    public class ProfileViewModel
    {
        [Required]
        public string Id { get; set; }
        [Required]
        public string Username { get; set; }
        [Required]
        public string Email { get; set; }

        public string AvatarFileName { get; set; }

        /// <summary>
        /// Workspace role, so the settings drawer can render the role chip and decide whether
        /// to show the admin console row at all. Presentation only - every admin endpoint
        /// re-checks server-side, because hiding a row is not authorization.
        /// </summary>
        public string Role { get; set; }

        /// <summary>
        /// Whether an un-cropped original is stored for this user, and therefore whether
        /// "Adjust crop" can work at all.
        ///
        /// A boolean, not the key. The client never needs the key - the original is read back
        /// from an endpoint that resolves it from the caller's own row - and putting it in a
        /// profile payload would scatter a private object's name through logs, caches and the
        /// Redux store for no gain.
        ///
        /// False for every account that has not uploaded since #88 shipped, which is exactly
        /// the state the client must render as "no Adjust crop": the control has to be absent
        /// when it cannot work, rather than present and failing.
        /// </summary>
        public bool HasOriginalPhoto { get; set; }

        /// <summary>
        /// The crop that produced the current avatar, in percentages, or null. Feeds
        /// react-easy-crop's <c>initialCroppedAreaPercentages</c> so re-opening the cropper
        /// starts where the user left it rather than on the whole photo.
        /// </summary>
        public AvatarCropViewModel AvatarCrop { get; set; }
    }
}
