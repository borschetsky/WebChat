using System.Collections.Generic;

namespace WebChat.ViewModels
{
    /// <summary>
    /// Request bodies for group management. Deliberately not annotated `[Required]`:
    /// every one of these has a meaningful empty case that the service decides on, and a
    /// model-binding rejection would answer with ASP.NET's problem-details shape rather than
    /// the error envelope the wire contract specifies.
    /// </summary>
    public class RenameGroupViewModel
    {
        /// <summary>The new name, or **null to revert to auto-naming**.</summary>
        public string Name { get; set; }
    }

    public class AddMembersViewModel
    {
        /// <summary>Batch. Already-present users are reported as skipped, not errored.</summary>
        public List<string> UserIds { get; set; }
    }

    public class SetRoleViewModel
    {
        /// <summary>'admin' or 'member'. 'owner' is refused - that is a transfer.</summary>
        public string GRole { get; set; }
    }

    public class TransferOwnerViewModel
    {
        public string UserId { get; set; }
    }

    /// <summary>Partial: an omitted level is left unchanged.</summary>
    public class SetPermsViewModel
    {
        public string Rename { get; set; }

        public string Invite { get; set; }

        public string Remove { get; set; }
    }
}
