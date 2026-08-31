using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using WebChat.Connection;
using WebChat.Hubs.Interfaces;
using WebChat.Models;
using WebChat.Models.ViewModels;
using WebChat.Services.Inerfaces;

namespace WebChat.Services
{
    public class UserService : IUserService
    {
        private readonly WebChatContext ctx;
        private readonly IAuthService authService;
        private readonly IThreadService threadService;
        private readonly IMappingService mappingService;
        private readonly IConnectionMapping<string> connectionMapping;

        public UserService(
            WebChatContext ctx, 
            IAuthService authService, 
            IThreadService threadService, 
            IMappingService mappingService, 
            IConnectionMapping<string> connectionMapping)
        {
            this.ctx = ctx ?? throw new ArgumentNullException("Context can not be null");
            this.authService = authService ?? throw new ArgumentNullException("Authorization service can not be null");  
            this.threadService = threadService ?? throw new ArgumentNullException("Thread service service can not be null");
            this.mappingService = mappingService ?? throw new ArgumentNullException("Mapping service service can not be null");
            this.connectionMapping = connectionMapping ?? throw new ArgumentNullException(nameof(connectionMapping));
        }

        public ProfileUpdate UpdateProfile(string userId, ProfileViewModel model)
        {
            // Keyed on the caller's id, never on `model.Id` (#99) - see the comment in
            // UsersController.UpdateProfile for what taking it from the body allowed.
            var entity = this.ctx.User.FirstOrDefault(u => u.Id == userId);

            // The token outlived its user. Reported rather than thrown, so the controller can
            // answer 401 - which is what GetProfile already does for that case.
            if (entity == null) return ProfileUpdate.Of(ProfileUpdateOutcome.NoSuchUser);

            // #100. Register has always called these; update called neither, and there was no
            // unique index either, so the rule held at the front door and nowhere else - you
            // could not register as an existing username but you could rename yourself into
            // one. `userId` is the exclusion, and it is the difference between a check and a
            // bug: without it, every save of an unchanged profile collides with the caller's
            // own row.
            //
            // Case-insensitive, because UserQueries' lookups are. An exact-match check would
            // let `Victim94` sit beside `victim94` - one person as far as sign-in, password
            // reset and every member list are concerned.
            //
            // Email first, matching register's order, so a request that collides on both
            // names the address: it is the identifier a reset link is delivered to.
            if (!UserQueries.IsEmailAvailable(this.ctx.User, model.Email, userId))
            {
                return ProfileUpdate.Of(ProfileUpdateOutcome.EmailTaken);
            }

            if (!UserQueries.IsUsernameAvailable(this.ctx.User, model.Username, userId))
            {
                return ProfileUpdate.Of(ProfileUpdateOutcome.UsernameTaken);
            }

            entity.Email = model.Email;
            entity.Username = model.Username;
            ctx.User.Update(entity);
            ctx.SaveChanges();

            // Projected after the save, from the entity rather than from `model` (#94). The
            // caller broadcasts this to every connected client, and the request body is the
            // wrong thing to send them twice over: it carries the email address and the
            // workspace role, and its other fields - the avatar key especially - are whatever
            // the caller wrote, since nothing here persists them.
            return ProfileUpdate.Written(
                this.mappingService.MapUserModelToProfileBroadcastViewModel(entity));
        }

        public IEnumerable<UserViewModel> FindUserByMatch(string match, string curentUser)
        {
            if (string.IsNullOrEmpty(curentUser)) throw new ArgumentNullException("Current user Id can not be null");

            var queryResult = ctx.User.Where(u => u.Username.IndexOf(match) > -1 && u.Id != curentUser);
            var searchResult = new List<UserViewModel>();
            foreach (var user in queryResult)
            {
                //Check is current user has any connection to provide online/offline status
                List<string> userConnections = connectionMapping.GetConnections(user.Id).ToList();

                var userVm = mappingService.MapUserModelToUserViewModel(user);
                userVm.IsOnline = userConnections.Count == 0 ? false : true;
                searchResult.Add(userVm);
            }
            return searchResult;
        }

        public AvatarUpdate SetAvatar(string userId, string avatarFileName, string originalFileName, AvatarCropViewModel crop)
        {
            var user = ctx.User.FirstOrDefault(u => u.Id == userId);
            if (user == null)
            {
                // Used to dereference null here. A token whose user is gone is routine enough
                // that GetUserProfile already handles it; an upload should answer 401, not
                // throw a NullReferenceException out of the service.
                return AvatarUpdate.NoSuchUser();
            }

            var previousAvatar = user.AvatarFileName;
            var previousOriginal = user.AvatarOriginalFileName;

            user.AvatarFileName = avatarFileName;
            user.AvatarOriginalFileName = originalFileName;
            ApplyCrop(user, crop);

            // A new photo ends any pending removal (#89), and it also disposes of what the
            // removal was retaining: `previousAvatar` and `previousOriginal` are read from the
            // row above regardless of the marker, so the caller deletes them exactly as it
            // would for any replacement. That is what bounds the orphans a removal can leave
            // to "removed and never uploaded again".
            user.AvatarRemovedAt = null;

            ctx.User.Update(user);
            ctx.SaveChanges();

            // Both surrendered: this is a different photo, so the old original is no longer the
            // source of anything the user can see.
            return AvatarUpdate.Written(previousAvatar, previousOriginal);
        }

        public AvatarUpdate SetAvatarCrop(string userId, string avatarFileName, AvatarCropViewModel crop)
        {
            var user = ctx.User.FirstOrDefault(u => u.Id == userId);
            if (user == null)
            {
                return AvatarUpdate.NoSuchUser();
            }

            var previousAvatar = user.AvatarFileName;

            user.AvatarFileName = avatarFileName;
            ApplyCrop(user, crop);

            ctx.User.Update(user);
            ctx.SaveChanges();

            // AvatarOriginalFileName is deliberately untouched, and the second argument is
            // deliberately null: the original is what makes the next adjustment possible.
            return AvatarUpdate.Written(previousAvatar, null);
        }

        // Null while a removal is pending, even though the key is still in the row. Everything
        // this feeds - the recrop guard and GET /avatars/original - is about a photo the user
        // currently has, and they currently have none; allowing a re-crop here would make
        // "Adjust crop" a second, undocumented way to undo a removal.
        public string GetAvatarOriginalFileName(string userId) =>
            ctx.User
                .Where(u => u.Id == userId && u.AvatarRemovedAt == null)
                .Select(u => u.AvatarOriginalFileName)
                .FirstOrDefault();

        /// <summary>
        /// Sets the retention marker. Nothing else moves - see
        /// <see cref="IUserService.RemoveAvatar"/> for why the keys and the crop stay.
        /// </summary>
        public AvatarRemoveOutcome RemoveAvatar(string userId)
        {
            var user = ctx.User.FirstOrDefault(u => u.Id == userId);
            if (user == null)
            {
                return AvatarRemoveOutcome.NoSuchUser;
            }

            // Already pending: return without writing, so the timestamp keeps naming the moment
            // the user actually removed the photo. Re-stamping it would quietly extend
            // retention every time a client repeated the call.
            if (user.AvatarRemovedAt != null)
            {
                return AvatarRemoveOutcome.AlreadyRemoved;
            }

            // Nothing to remove. Deliberately not an error, and deliberately not a marker
            // either: a marker over a null avatar would mean RestoreAvatar had something to
            // clear and nothing to show for it.
            if (string.IsNullOrWhiteSpace(user.AvatarFileName))
            {
                return AvatarRemoveOutcome.NoPhoto;
            }

            // UtcNow, not Now: the column is `timestamp with time zone` and Npgsql throws on a
            // Local or Unspecified Kind, so this is an insert-time failure rather than a value
            // that is merely wrong.
            user.AvatarRemovedAt = DateTime.UtcNow;
            user.ModifiedOn = DateTime.UtcNow;

            ctx.User.Update(user);
            ctx.SaveChanges();

            return AvatarRemoveOutcome.Removed;
        }

        /// <summary>
        /// Clears the retention marker. The photo and the crop come back exactly, because
        /// neither was ever changed.
        /// </summary>
        public AvatarRestore RestoreAvatar(string userId)
        {
            var user = ctx.User.FirstOrDefault(u => u.Id == userId);
            if (user == null)
            {
                return AvatarRestore.Of(AvatarRestoreOutcome.NoSuchUser);
            }

            if (user.AvatarRemovedAt == null)
            {
                // Undo pressed twice, or pressed in a tab whose snackbar outlived the state.
                // Having a photo already is the outcome that was asked for, so it is reported
                // as one - while having none is the case where saying "restored" would be a
                // lie the user discovers by looking at their own avatar.
                return string.IsNullOrWhiteSpace(user.AvatarFileName)
                    ? AvatarRestore.Of(AvatarRestoreOutcome.NothingToRestore)
                    : AvatarRestore.Of(AvatarRestoreOutcome.NotRemoved, user.AvatarFileName);
            }

            user.AvatarRemovedAt = null;
            user.ModifiedOn = DateTime.UtcNow;

            ctx.User.Update(user);
            ctx.SaveChanges();

            return AvatarRestore.Of(AvatarRestoreOutcome.Restored, user.AvatarFileName);
        }

        /// <summary>
        /// All four columns move together, including to null - a crop left over from the
        /// previous photo would restore the cropper to a rectangle taken from an image that is
        /// no longer there.
        /// </summary>
        private static void ApplyCrop(User user, AvatarCropViewModel crop)
        {
            user.AvatarCropX = crop?.X;
            user.AvatarCropY = crop?.Y;
            user.AvatarCropWidth = crop?.Width;
            user.AvatarCropHeight = crop?.Height;
        }

        public void AddUser(User newUser)
        {
            if (newUser == null)
            {
                throw new ArgumentNullException("User Entity can not be null");
            }

            newUser.CreatedOn = DateTime.UtcNow;

            ctx.User.Add(newUser);
            ctx.SaveChanges();
        }

        public void SetEmailConfirmation(string userId, string tokenHash, DateTime sentAt)
        {
            var user = ctx.User.FirstOrDefault(u => u.Id == userId);
            if (user == null)
            {
                return;
            }

            // Overwriting rather than adding: a resend must invalidate the link already in
            // the user's inbox, or every old email stays usable until it expires.
            user.EmailConfirmationTokenHash = tokenHash;
            user.EmailConfirmationSentAt = sentAt;
            ctx.User.Update(user);
            ctx.SaveChanges();
        }

        public User GetUserByConfirmationHash(string tokenHash)
        {
            // Guarded, because a null hash matches every row that has no pending confirmation
            // - which is most of them, and would confirm an arbitrary account.
            if (string.IsNullOrWhiteSpace(tokenHash))
            {
                return null;
            }

            return ctx.User.FirstOrDefault(u => u.EmailConfirmationTokenHash == tokenHash);
        }

        public void ConfirmEmail(string userId)
        {
            var user = ctx.User.FirstOrDefault(u => u.Id == userId);
            if (user == null)
            {
                return;
            }

            user.EmailConfirmed = true;

            // Clearing these is what makes the link single-use. Leaving them would let the
            // same URL be replayed until it expired.
            user.EmailConfirmationTokenHash = null;
            user.EmailConfirmationSentAt = null;
            user.ModifiedOn = DateTime.UtcNow;

            ctx.User.Update(user);
            ctx.SaveChanges();
        }

        public void SetPasswordReset(string userId, string tokenHash, DateTime sentAt)
        {
            var user = ctx.User.FirstOrDefault(u => u.Id == userId);
            if (user == null)
            {
                return;
            }

            // Overwrites any previous request, so asking again invalidates the link already
            // sent rather than leaving several usable at once.
            user.PasswordResetTokenHash = tokenHash;
            user.PasswordResetSentAt = sentAt;
            ctx.User.Update(user);
            ctx.SaveChanges();
        }

        public User GetUserByPasswordResetHash(string tokenHash)
        {
            // Guarded: a null hash matches every row with no reset pending, which is nearly
            // all of them, and would hand over an arbitrary account.
            if (string.IsNullOrWhiteSpace(tokenHash))
            {
                return null;
            }

            return ctx.User.FirstOrDefault(u => u.PasswordResetTokenHash == tokenHash);
        }

        public string ResetPassword(string userId, string newPasswordHash)
        {
            var user = ctx.User.FirstOrDefault(u => u.Id == userId);
            if (user == null)
            {
                return null;
            }

            user.Password = newPasswordHash;

            // Rotating this is what actually ends the compromise: every token signed with the
            // previous stamp stops authenticating on its next request. Without it a reset
            // changes the password while an attacker keeps their session for up to a week.
            user.SecurityStamp = Guid.NewGuid().ToString();

            // Clearing these makes the link single-use.
            user.PasswordResetTokenHash = null;
            user.PasswordResetSentAt = null;

            // Opening a link sent to that mailbox is the same proof activation asks for, so
            // someone who resets should not then be told to go and confirm.
            user.EmailConfirmed = true;
            user.EmailConfirmationTokenHash = null;
            user.EmailConfirmationSentAt = null;

            user.ModifiedOn = DateTime.UtcNow;
            ctx.User.Update(user);
            ctx.SaveChanges();

            return user.SecurityStamp;
        }

        public User CreateUser(string username, string email, string password)
        {

            var newUser = new User()
            {
                Id = Guid.NewGuid().ToString(),
                Username = username,
                Email = email,
                Password = authService.HashPassword(password),

                // Explicit, not left to the column default. #63 taught this the hard way: a
                // migration backfilled every existing row and hid that the write path still
                // wrote whatever the default happened to be. Nobody registers into a
                // privileged role; promotion is a separate, deliberate act.
                Role = WorkspaceRole.Member,

                // Active, not pending. Pending means "invited, never activated" and belongs
                // to the invitation flow (#72); someone who registered themselves has an
                // account from this moment - the email confirmation they still owe is
                // tracked by EmailConfirmed, which is a different question and already has
                // its own answer.
                Status = AccountStatus.Active,

                // Present from creation: a null stamp would make the very first token
                // unverifiable against the user it was issued for.
                SecurityStamp = Guid.NewGuid().ToString()
            };

            return newUser;
        }

        public string GetOponentIdByTheadId(string senderId, string threadId)
        {
            //Get thread from thread service
            Thread currentThread = this.threadService.GetThreadById(threadId);
            if (currentThread.OwnerId == senderId)
            {
                return currentThread.OponentId;
            }
            return currentThread.OwnerId;
            throw new NotImplementedException();
        }

        public User GetUserByEmail(string email)
        {
            // Email only - see UserQueries.ByEmail for why reset and resend must not accept a
            // username. No longer throws on empty input either: these endpoints pass
            // user-supplied values straight in, and a throw there is a 500 where a null is a
            // clean "no such user".
            return UserQueries.ByEmail(ctx.User, email);
        }

        public User FindByEmailOrUsername(string identifier)
        {
            return UserQueries.ByEmailOrUsername(ctx.User, identifier);
        }

        public string GetUserIdByName(string name)
        {
            return ctx.User.FirstOrDefault(u => u.Username == name)?.Id;
        }

        /// <summary>
        /// The username, or null when there is no such user.
        ///
        /// Null rather than an exception, because a missing user here is ordinary rather than
        /// exceptional. Every caller before the audit log passed an id taken from a thread's
        /// current members or a message's sender - ids that exist by construction - so the
        /// missing `?.` went unnoticed for as long as that stayed true. The audit log breaks
        /// it deliberately: an entry naming a deactivated account is precisely the entry worth
        /// keeping, and resolving names at read time is why the endpoint asks at all. One such
        /// row turned the whole page into a 500.
        ///
        /// Callers already treat null as "leave the name out", and the client renders
        /// "someone" for an id it cannot resolve - so there is exactly one fallback, on the
        /// side that displays it.
        /// </summary>
        public string GetUserNameById(string id)
        {
            return ctx.User.FirstOrDefault(u => u.Id == id)?.Username;
        }

        public ProfileViewModel GetUserProfile(string userId)
        {
            var model = ctx.User.FirstOrDefault(u => u.Id == userId);

            // A signed token whose user no longer exists is not an exceptional case: it
            // happens whenever the database is rebuilt while a browser still holds a session,
            // which the move off SQL Server made routine. Returning null lets the controller
            // answer 401 instead of throwing a NullReferenceException out of the mapper.
            if (model == null)
            {
                return null;
            }

            var viewModel = this.mappingService.MapUserModelRoProfileViewModel(model);
            viewModel.Username = GetUserNameById(userId);

            return viewModel;

        }
        //TODO: Check opponent's status
        public OponentViewModel GetOponentProfile(string id)
        {
            var userConnections = connectionMapping.GetConnections(id);

            var profile = (from u in ctx.User
                           where u.Id == id
                           select new OponentViewModel
                           {
                               Id = u.Id, Username = u.Username,
                               // The AvatarVisibility rule, written inline because it has to
                               // translate to SQL: a removed photo (#89) keeps its key so Undo
                               // can restore it, so the column is not the answer.
                               AvatarFileName = u.AvatarRemovedAt == null ? u.AvatarFileName : null,
                               IsOnline = userConnections.Count() > 0 ? true : false
                           }).FirstOrDefault();
            return profile;
        }

        public ICollection<User> GetUsers()
        {
            return ctx.User.ToList();
        }

        // Both are now case-insensitive. Comparing exactly let `User@x.com` and `user@x.com`
        // register as two accounts, after which sign-in resolved to whichever the database
        // happened to return first.
        public bool isEmailUniq(string email)
        {
            return UserQueries.IsEmailAvailable(ctx.User, email);
        }

        public bool isUsernameUniq(string userName)
        {
            return UserQueries.IsUsernameAvailable(ctx.User, userName);
        }


    }
}
