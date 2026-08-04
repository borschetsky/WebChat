using System.Threading.Tasks;

namespace WebChat.Services.Email
{
    /// <summary>The outcome of an attempt to send. Failure is expected, not exceptional.</summary>
    public readonly struct EmailResult
    {
        private EmailResult(bool sent, string error)
        {
            Sent = sent;
            Error = error;
        }

        public bool Sent { get; }

        public string Error { get; }

        public static EmailResult Ok() => new EmailResult(true, null);

        public static EmailResult Failed(string error) => new EmailResult(false, error);
    }

    /// <summary>
    /// Sends mail. Implementations must not throw: a provider being unreachable is a normal
    /// condition, and registration deliberately succeeds when mail cannot be sent - the user
    /// is offered a resend instead. Coupling signup to a third party's uptime is the worse
    /// trade. See issue #25.
    /// </summary>
    public interface IEmailSender
    {
        Task<EmailResult> SendAsync(string toAddress, string subject, string htmlBody, string textBody);
    }
}
