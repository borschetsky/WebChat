namespace WebChat.Controllers
{
    /// <summary>
    /// The 400 body returned when an identifier is already taken.
    ///
    /// It lives here, as two factories, because **two endpoints must answer identically**:
    /// register has refused a duplicate since the beginning, and profile update now does too
    /// (#100). The client has one code path for both, so a second, hand-written spelling of
    /// the same object would be a wire difference nobody notices until a message stops being
    /// rendered.
    ///
    /// Anonymous types compare structurally, so a test can assert a controller's body equals
    /// <c>UsernameTaken()</c> rather than re-typing the literal - which is the difference
    /// between checking the contract and checking that the author can write the same string
    /// twice.
    /// </summary>
    public static class UniquenessProblem
    {
        public const string EmailTakenMessage = "user with this email already exists";

        public const string UsernameTakenMessage = "user with this username already exists";

        /// <summary>The register-era shape: one property, named for the field at fault.</summary>
        public static object EmailTaken() => new { email = EmailTakenMessage };

        /// <inheritdoc cref="EmailTaken"/>
        public static object UsernameTaken() => new { username = UsernameTakenMessage };
    }
}
