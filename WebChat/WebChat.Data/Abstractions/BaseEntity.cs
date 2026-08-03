using System;
using System.Collections.Generic;
using System.ComponentModel.DataAnnotations;
using System.Text;
using WebChat.Models.Interfaces;

namespace WebChat.Models.Abstractions
{
    /// <summary>
    /// Base for the audited entities.
    ///
    /// Every <see cref="DateTime"/> below must be UTC. PostgreSQL maps them to
    /// `timestamp with time zone`, and Npgsql throws outright when handed a value whose Kind
    /// is Local or Unspecified - so `DateTime.Now` is not merely inaccurate here, it fails at
    /// insert time. Use `DateTime.UtcNow`.
    ///
    /// This also fixes what the SQL Server setup did silently: it stored the server's local
    /// time with no offset, which every client then read as its own local time.
    /// </summary>
    public abstract class BaseEntity : IAuditable, IDeletable
    {
        [Key]
        public string Id {  get; set; }

        public bool isDeleted { get; set; }

        [DataType(DataType.DateTime)]
        public DateTime? DeletedOn { get; set; }


        [DataType(DataType.DateTime)]
        public DateTime CreatedOn { get; set; }

        [DataType(DataType.DateTime)]
        public DateTime? ModifiedOn { get; set; }
    }
}
