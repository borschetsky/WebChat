using System.ComponentModel.DataAnnotations;

namespace WebChat.ViewModels
{
    public class ResetPasswordViewModel
    {
        [Required]
        public string Token { get; set; }

        /// <summary>
        /// Same rule as registration. Keeping them in step matters: a weaker limit here would
        /// make reset the cheapest way to get a password the register form would refuse.
        /// </summary>
        [Required]
        [StringLength(60, MinimumLength = 6)]
        public string Password { get; set; }
    }
}
