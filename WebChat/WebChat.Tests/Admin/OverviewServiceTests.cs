using System;
using System.Linq;
using System.Threading.Tasks;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using WebChat.Connection;
using WebChat.Models;
using WebChat.Services;

namespace WebChat.Tests.Admin
{
    /// <summary>
    /// The Overview's numbers.
    ///
    /// Worth testing rather than eyeballing because a dashboard is read at a glance and
    /// believed: a count that is quietly wrong is more damaging here than almost anywhere
    /// else in the app, since nobody cross-checks it. These replace two hardcoded hints the
    /// screen used to carry - "+3 in the last 30 days" and "2 expire within a week" - which
    /// were exactly that failure with no bug behind them.
    /// </summary>
    public class OverviewServiceTests : IDisposable
    {
        private readonly SqliteConnection connection = new("DataSource=:memory:");
        private readonly WebChatContext ctx;
        private readonly OverviewService service;

        public OverviewServiceTests()
        {
            this.connection.Open();
            this.ctx = new WebChatContext(new DbContextOptionsBuilder<WebChatContext>()
                .UseSqlite(this.connection).Options);
            this.ctx.Database.EnsureCreated();
            this.service = new OverviewService(this.ctx);
        }

        private User Add(
            string name,
            string status = AccountStatus.Active,
            bool confirmed = true,
            DateTime? created = null)
        {
            var user = new User
            {
                Id = Guid.NewGuid().ToString(),
                Username = name,
                Email = name + "@example.com",
                Password = "hashed",
                Role = WorkspaceRole.Member,
                Status = status,
                EmailConfirmed = confirmed,
                CreatedOn = created ?? DateTime.UtcNow,
                SecurityStamp = Guid.NewGuid().ToString(),
            };

            this.ctx.User.Add(user);
            this.ctx.SaveChanges();
            return user;
        }

        private Models.Thread AddThreadWith(params User[] members)
        {
            var thread = new Models.Thread
            {
                Id = Guid.NewGuid().ToString(),
                IsGroup = true,
                OwnerId = members[0].Id,
                CreatedOn = DateTime.UtcNow,
            };
            this.ctx.Thread.Add(thread);

            foreach (var member in members)
            {
                this.ctx.ThreadParticipant.Add(new ThreadParticipant
                {
                    Id = Guid.NewGuid().ToString(),
                    ThreadId = thread.Id,
                    UserId = member.Id,
                    CreatedOn = DateTime.UtcNow,
                });
            }

            this.ctx.SaveChanges();
            return thread;
        }

        private void AddMessage(User sender, Models.Thread thread, DateTime at, string type = MessageType.User)
        {
            this.ctx.Message.Add(new Message
            {
                Id = Guid.NewGuid().ToString(),
                ThreadId = thread.Id,
                SenderId = sender.Id,
                Text = type == MessageType.System ? null : "hello",
                Type = type,
                CreatedOn = at,
            });
            this.ctx.SaveChanges();
        }

        // --- the stat cards ------------------------------------------------------------

        [Fact]
        public async Task Counts_accounts_by_status()
        {
            this.Add("a");
            this.Add("b");
            this.Add("c", AccountStatus.Pending);
            this.Add("d", AccountStatus.Blocked);
            this.Add("e", AccountStatus.Deactivated);

            var overview = await this.service.GetAsync();

            Assert.Equal(5, overview.Total);
            Assert.Equal(2, overview.Active);
            Assert.Equal(1, overview.Pending);

            // Blocked and deactivated share a card: both mean sign-in is refused, which is
            // the question the card answers.
            Assert.Equal(2, overview.Blocked);
        }

        [Fact]
        public async Task Counts_only_recent_joins_for_the_hint()
        {
            this.Add("new", created: DateTime.UtcNow.AddDays(-3));
            this.Add("alsonew", created: DateTime.UtcNow.AddDays(-29));
            this.Add("old", created: DateTime.UtcNow.AddDays(-31));

            Assert.Equal(2, (await this.service.GetAsync()).JoinedRecently);
        }

        // --- the chart -----------------------------------------------------------------

        /// <summary>
        /// Gap-filling is the point. Without it a quiet day vanishes and the bars re-space,
        /// so two charts of the same fortnight look like different data.
        /// </summary>
        [Fact]
        public async Task The_chart_always_has_fourteen_days_including_empty_ones()
        {
            var chart = (await this.service.GetAsync()).Chart;

            Assert.Equal(14, chart.Count);
            Assert.All(chart, point => Assert.Equal(0, point.Value));
            Assert.Equal(chart.OrderBy(p => p.DayUtc).Select(p => p.DayUtc), chart.Select(p => p.DayUtc));
        }

        [Fact]
        public async Task The_chart_counts_messages_into_the_right_day()
        {
            var user = this.Add("writer");
            var thread = this.AddThreadWith(user);
            var today = DateTime.UtcNow.Date;

            this.AddMessage(user, thread, today.AddHours(9));
            this.AddMessage(user, thread, today.AddHours(17));
            this.AddMessage(user, thread, today.AddDays(-1).AddHours(12));

            var chart = (await this.service.GetAsync()).Chart;

            Assert.Equal(2, chart.Single(p => p.DayUtc == today).Value);
            Assert.Equal(1, chart.Single(p => p.DayUtc == today.AddDays(-1)).Value);
        }

        /// <summary>
        /// System messages are bookkeeping, not conversation. Counting them would make a
        /// busy day of administration look like a busy day of chat.
        /// </summary>
        [Fact]
        public async Task The_chart_ignores_system_messages()
        {
            var user = this.Add("writer");
            var thread = this.AddThreadWith(user);

            this.AddMessage(user, thread, DateTime.UtcNow, MessageType.System);

            Assert.All((await this.service.GetAsync()).Chart, p => Assert.Equal(0, p.Value));
        }

        [Fact]
        public async Task The_chart_drops_anything_older_than_the_window()
        {
            var user = this.Add("writer");
            var thread = this.AddThreadWith(user);

            this.AddMessage(user, thread, DateTime.UtcNow.Date.AddDays(-20));

            Assert.All((await this.service.GetAsync()).Chart, p => Assert.Equal(0, p.Value));
        }

        // --- the funnel ----------------------------------------------------------------

        /// <summary>
        /// Every stage must be a subset of the one above it. A stage that is not produces a
        /// shape that looks like a funnel and cannot be read as one.
        /// </summary>
        [Fact]
        public async Task The_funnel_narrows_at_every_stage()
        {
            var wrote = this.Add("wrote");
            var joined = this.Add("joined");
            this.Add("confirmed");
            this.Add("unconfirmed", confirmed: false);

            var thread = this.AddThreadWith(wrote, joined);
            this.AddMessage(wrote, thread, DateTime.UtcNow);

            var funnel = (await this.service.GetAsync()).Funnel;

            Assert.Equal(new[] { "registered", "confirmed", "joined", "wrote" },
                funnel.Select(s => s.Key));
            Assert.Equal(new[] { 4, 3, 2, 1 }, funnel.Select(s => s.Value));
        }

        /// <summary>
        /// The subset rule has to hold even for data that breaks the expected order - an
        /// unconfirmed account somehow in a conversation must not widen a lower stage.
        /// </summary>
        [Fact]
        public async Task An_unconfirmed_account_in_a_thread_does_not_widen_the_funnel()
        {
            var unconfirmed = this.Add("unconfirmed", confirmed: false);
            var thread = this.AddThreadWith(unconfirmed);
            this.AddMessage(unconfirmed, thread, DateTime.UtcNow);

            var funnel = (await this.service.GetAsync()).Funnel;
            var values = funnel.Select(s => s.Value).ToList();

            Assert.Equal(new[] { 1, 0, 0, 0 }, values);
            for (var i = 1; i < values.Count; i++) Assert.True(values[i] <= values[i - 1]);
        }

        [Fact]
        public async Task A_system_message_does_not_count_as_having_written()
        {
            var user = this.Add("quiet");
            var thread = this.AddThreadWith(user);
            this.AddMessage(user, thread, DateTime.UtcNow, MessageType.System);

            var funnel = (await this.service.GetAsync()).Funnel;

            Assert.Equal(1, funnel.Single(s => s.Key == "joined").Value);
            Assert.Equal(0, funnel.Single(s => s.Key == "wrote").Value);
        }

        // --- invitations expiring -------------------------------------------------------

        [Fact]
        public async Task Counts_only_open_invitations_lapsing_within_a_week()
        {
            var owner = this.Add("owner");

            void Invite(string email, double expiresInDays, bool revoked = false, bool redeemed = false)
            {
                this.ctx.Invitation.Add(new Invitation
                {
                    Id = Guid.NewGuid().ToString(),
                    Email = email,
                    TokenHash = Guid.NewGuid().ToString(),
                    SentAtUtc = DateTime.UtcNow,
                    ExpiresAtUtc = DateTime.UtcNow.AddDays(expiresInDays),
                    InvitedByUserId = owner.Id,
                    PendingUserId = Guid.NewGuid().ToString(),
                    Role = WorkspaceRole.Member,
                    RevokedAtUtc = revoked ? DateTime.UtcNow : null,
                    RedeemedAtUtc = redeemed ? DateTime.UtcNow : null,
                    CreatedOn = DateTime.UtcNow,
                });
            }

            Invite("soon@example.com", 3);
            Invite("alsosoon@example.com", 6.5);
            Invite("later@example.com", 20);
            Invite("lapsed@example.com", -1);
            Invite("revoked@example.com", 3, revoked: true);
            Invite("redeemed@example.com", 3, redeemed: true);
            this.ctx.SaveChanges();

            Assert.Equal(2, (await this.service.GetAsync()).ExpiringSoon);
        }

        public void Dispose()
        {
            this.ctx.Dispose();
            this.connection.Dispose();
            GC.SuppressFinalize(this);
        }
    }
}
