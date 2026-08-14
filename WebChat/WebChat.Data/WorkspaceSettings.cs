using System;
using System.ComponentModel.DataAnnotations;

namespace WebChat.Models
{
    /// <summary>
    /// The workspace's configuration. One row, ever.
    ///
    /// **A jsonb blob rather than a column per policy**, so that adding a policy is a product
    /// decision rather than a migration. The set of switches on an admin screen is exactly the
    /// kind of thing that changes often and in small increments, and a column each turns every
    /// one of those into a schema change plus a deployment ordering problem.
    ///
    /// The cost is that nothing constrains the contents, which is why
    /// <see cref="WorkspacePolicy"/> is the only thing that writes keys into it and unknown
    /// keys are refused at the endpoint. The blob is data the application defines, not data
    /// the database does.
    ///
    /// **Deliberately not a <c>BaseEntity</c>.** That base brings <c>isDeleted</c> and
    /// <c>DeletedOn</c>, and a soft-deleted settings row is a contradiction - reading it would
    /// have to mean "the workspace has no configuration", which is not a state that exists.
    /// A missing row already means exactly that, and means it more simply: every policy is at
    /// its default.
    /// </summary>
    public class WorkspaceSettings
    {
        /// <summary>
        /// The only id this table ever holds.
        ///
        /// A fixed key rather than an auto-generated one is what makes "one row" enforceable:
        /// every read and every write names it, so a concurrent first write collides on the
        /// primary key instead of quietly creating a second configuration that half the
        /// process then reads.
        /// </summary>
        public const string SingletonId = "workspace";

        [Key]
        [MaxLength(50)]
        public string Id { get; set; }

        /// <summary>
        /// A JSON object of policy key to boolean. Absent keys are at their default, so this
        /// stores decisions rather than state - a policy nobody has touched leaves no trace,
        /// and its default can still be changed in code.
        /// </summary>
        public string PoliciesJson { get; set; }

        /// <summary>
        /// UTC, like every other stored instant here - the column is
        /// <c>timestamp with time zone</c> and Npgsql throws on a Local or Unspecified Kind.
        /// </summary>
        [DataType(DataType.DateTime)]
        public DateTime? ModifiedOn { get; set; }
    }
}
