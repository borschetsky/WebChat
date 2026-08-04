using System.ComponentModel.DataAnnotations;

namespace WebChat.ViewModels
{
    public class ResendConfirmationViewModel
    {
        [Required]
        [EmailAddress]
        public string Email { get; set; }
    }
}
