using System;
using System.Collections.Generic;
using System.Linq;
using WebChat.Models;

namespace WebChat.Services.ClientErrors
{
    /// <summary>One breadcrumb as the browser reported it.</summary>
    public class ClientErrorCrumb
    {
        /// <summary>Wall-clock time on the reporting machine - "12:04:02".</summary>
        public string T { get; set; }

        public string K { get; set; }

        public string V { get; set; }
    }

    /// <summary>
    /// What the browser sends to <c>POST api/client-errors</c>, after the controller has
    /// stamped on the things the browser is not trusted to state.
    ///
    /// **<see cref="UserId"/>, <see cref="Browser"/> and <see cref="OccurredAtUtc"/> are set
    /// server-side and are not part of the request body.** The id comes from the token, for
    /// the same reason every other endpoint here takes it from the token: an id in a body
    /// never decides which row is written. The browser is parsed from the User-Agent header,
    /// and the time is when the report arrived - a client clock can be anything at all, and
    /// one set a year ahead would silently pin the sparkline's last bucket forever.
    ///
    /// Everything else is untrusted text, and <see cref="Truncate"/> is what bounds it. The
    /// transport (`fetch` with `keepalive`) caps a body at 64 KiB, so a stack plus breadcrumbs
    /// has to be cut down before sending - but the server cannot rely on the client having
    /// done it.
    /// </summary>
    public class ClientErrorReport
    {
        /// <summary>Longest error name kept. Longer than any real one; a guard, not a limit.</summary>
        public const int NameLength = 100;

        /// <summary>Longest message kept. Displayed on one line, and never grouped on.</summary>
        public const int MessageLength = 500;

        public const int ComponentLength = 100;

        public const int FunctionLength = 100;

        public const int RouteLength = 200;

        public const int ReleaseLength = 50;

        /// <summary>Deep enough to reach the frame that matters, short enough to store.</summary>
        public const int MaxStackFrames = 40;

        public const int StackFrameLength = 300;

        /// <summary>Matches the ring buffer the client keeps.</summary>
        public const int MaxCrumbs = 12;

        public const int CrumbFieldLength = 200;

        public string Level { get; set; }

        public string Name { get; set; }

        public string Message { get; set; }

        /// <summary>
        /// A **literal** boundary name, never a component's runtime name: the minifier renames
        /// `AdminOverviewCard` to `t`, so anything read off `componentStack` would be a single
        /// letter that changes every deploy. Part of the fingerprint.
        /// </summary>
        public string Component { get; set; }

        /// <summary>Part of the fingerprint. "render" for a boundary catch.</summary>
        public string Function { get; set; }

        public string Route { get; set; }

        public string Release { get; set; }

        public List<string> Stack { get; set; }

        public List<ClientErrorCrumb> Crumbs { get; set; }

        /// <summary>Set by the controller from the token. Never read from the body.</summary>
        public string UserId { get; set; }

        /// <summary>Set by the controller from the User-Agent header.</summary>
        public string Browser { get; set; }

        /// <summary>Set by the controller. Server time, not the client's - see the class note.</summary>
        public DateTime OccurredAtUtc { get; set; }

        /// <summary>
        /// Cuts every field to what will be stored, in place.
        ///
        /// Runs on the request thread rather than in the drain loop, on purpose: a 60 KiB
        /// stack should not sit in the bounded queue taking up the space of a hundred normal
        /// reports while it waits to be shortened.
        /// </summary>
        public void Truncate()
        {
            this.Level = ClientErrorLevel.Normalise(this.Level);
            this.Name = Cut(this.Name, NameLength) ?? "Error";
            this.Message = Cut(this.Message, MessageLength) ?? string.Empty;
            this.Component = Cut(this.Component, ComponentLength) ?? "unknown";
            this.Function = Cut(this.Function, FunctionLength) ?? "unknown";
            this.Route = Cut(this.Route, RouteLength) ?? string.Empty;
            this.Release = Cut(this.Release, ReleaseLength) ?? string.Empty;

            this.Stack = (this.Stack ?? new List<string>())
                .Where(frame => !string.IsNullOrWhiteSpace(frame))
                .Take(MaxStackFrames)
                .Select(frame => Cut(frame, StackFrameLength))
                .ToList();

            this.Crumbs = (this.Crumbs ?? new List<ClientErrorCrumb>())
                // The *last* few, not the first: the breadcrumbs closest to the failure are
                // the ones worth keeping, and a client that sent more than the ring buffer
                // holds is sending its oldest as padding.
                .Where(crumb => crumb != null)
                .TakeLast(MaxCrumbs)
                .Select(crumb => new ClientErrorCrumb
                {
                    T = Cut(crumb.T, 20),
                    K = Cut(crumb.K, 40),
                    V = Cut(crumb.V, CrumbFieldLength),
                })
                .ToList();
        }

        private static string Cut(string value, int length)
        {
            if (string.IsNullOrWhiteSpace(value)) return null;

            var trimmed = value.Trim();
            return trimmed.Length <= length ? trimmed : trimmed.Substring(0, length);
        }
    }
}
