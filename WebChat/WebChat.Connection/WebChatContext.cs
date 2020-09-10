using Microsoft.EntityFrameworkCore;
using WebChat.Models;

namespace WebChat.Connection
{
    public class WebChatContext : DbContext
    {
        public WebChatContext(DbContextOptions<WebChatContext> options) : base(options)
        {

        }

        public DbSet<User> User { get; set; }

        public DbSet<Message> Message {get; set;}

        public DbSet<Thread> Thread { get; set; }

        protected override void OnModelCreating(ModelBuilder builder)
        {
            builder.Entity<Message>()
                .HasOne(m => m.Thread)
                .WithMany(t => t.Messages)
                .HasForeignKey(m => m.ThreadId)
                .OnDelete(DeleteBehavior.Restrict);

            builder.Entity<Message>()
                .HasOne(m => m.Sender)
                .WithMany(s => s.Messages)
                .HasForeignKey(m => m.SenderId)
                .OnDelete(DeleteBehavior.Restrict);



           



            //base.OnModelCreating(builder);
        }

    }
}
