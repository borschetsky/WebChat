using System.ComponentModel.DataAnnotations;

namespace WebChat.ViewModels
{
    public class LoginViewModel
    {
        /// <summary>
        /// An email address or a username.
        ///
        /// Deliberately not annotated with [EmailAddress]. That attribute is what made
        /// signing in with a username impossible: validation rejected the value before any
        /// lookup could run.
        /// </summary>
        [Required]
        public string Identifier { get; set; }

        [Required]
        [MinLength(6)]
        public string Password { get; set; }
    }
}
