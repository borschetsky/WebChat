using System;
using System.Collections.Generic;
using System.Linq;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;
using WebChat.Models.ViewModels;

namespace WebChat
{
    /// <summary>
    /// Prepares a system message for the wire: parses its stored JSON, and resolves the user
    /// ids inside it to display names.
    ///
    /// **The parse.** The column holds a JSON *string*. Sent as-is the client would receive a
    /// quoted string from <c>getmessages</c> and an object from the group endpoints - the same
    /// message needing two different parses depending on which route it arrived by.
    ///
    /// **The names.** The client renders the sentence from ids, and resolves those ids against
    /// the thread's *current* members - which is wrong for exactly the people system messages
    /// are most often about. "You removed Maya" became "You removed someone" the instant Maya
    /// was removed, and every historical "made Maya an admin" degraded with it. The spec keeps
    /// system messages in the history deliberately; a history that forgets who it is about is
    /// not much of one.
    ///
    /// Resolved at read time rather than stored, which is the whole point: a display name that
    /// changes later shows the new one, and nothing is frozen in the actor's language.
    ///
    /// This lives in the host because this is the project that references Newtonsoft, and
    /// Newtonsoft is what serializes the result - handing it a JObject means the JSON comes
    /// back out unchanged, which a System.Text.Json JsonElement would not.
    /// </summary>
    public static class SystemDataJson
    {
        /// <summary>Keys in <c>systemData</c> that hold a user id, per the contract's §2 schemas.</summary>
        private static readonly string[] IdKeys = { "userId", "fromUserId", "toUserId" };

        private static readonly string[] IdListKeys = { "userIds" };

        private static JToken Parse(object systemData) =>
            systemData is string raw && raw.Length > 0 ? JsonConvert.DeserializeObject<JToken>(raw) : null;

        private static Dictionary<string, string> NamesIn(JToken data, Func<string, string> nameOf)
        {
            if (data is not JObject obj || nameOf == null) return null;

            var ids = new List<string>();

            foreach (var key in IdKeys)
            {
                if (obj[key]?.Type == JTokenType.String) ids.Add(obj[key].Value<string>());
            }

            foreach (var key in IdListKeys)
            {
                if (obj[key] is JArray list) ids.AddRange(list.Select(t => t.Value<string>()));
            }

            var names = new Dictionary<string, string>();
            foreach (var id in ids.Where(id => !string.IsNullOrWhiteSpace(id)).Distinct())
            {
                // A deleted account resolves to nothing, and the client's own "someone"
                // fallback covers it - better than inventing a placeholder here.
                var name = nameOf(id);
                if (name != null) names[id] = name;
            }

            return names.Count > 0 ? names : null;
        }

        /// <summary>
        /// The stored JSON as an object, for callers that build their own wire shape. Returns
        /// null for null or empty, which serializes as <c>null</c> rather than <c>""</c> -
        /// the client checks for the object's absence, not for an empty string.
        ///
        /// A JToken and not a JsonElement on purpose: Newtonsoft serializes the former back
        /// out unchanged, and Newtonsoft is what serializes responses here.
        /// </summary>
        public static object Data(string json) => Parse(json);

        /// <summary>
        /// The name map for a raw <c>systemData</c> string, for callers that build their own
        /// message shape rather than going through a view model.
        /// </summary>
        public static Dictionary<string, string> NamesFor(string systemData, Func<string, string> nameOf) =>
            NamesIn(Parse(systemData), nameOf);

        public static void Expand(MessageViewModel message, Func<string, string> nameOf = null)
        {
            if (message?.SystemData is not string) return;

            var data = Parse(message.SystemData);
            message.SystemNames = NamesIn(data, nameOf);
            message.SystemData = data;
        }

        public static void Expand(LastMessageViewModel message, Func<string, string> nameOf = null)
        {
            if (message?.SystemData is not string) return;

            var data = Parse(message.SystemData);
            message.SystemNames = NamesIn(data, nameOf);
            message.SystemData = data;
        }

        public static Dictionary<DateTime, List<MessageViewModel>> Expand(
            Dictionary<DateTime, List<MessageViewModel>> byDay,
            Func<string, string> nameOf = null)
        {
            if (byDay == null) return null;

            foreach (var day in byDay.Values)
            {
                foreach (var message in day)
                {
                    Expand(message, nameOf);
                }
            }

            return byDay;
        }

        /// <summary>Every thread's preview, for the getthreads response.</summary>
        public static List<ThreadViewModel> Expand(
            List<ThreadViewModel> threads,
            Func<string, string> nameOf = null)
        {
            foreach (var thread in threads ?? new List<ThreadViewModel>())
            {
                Expand(thread.LastMessage, nameOf);
            }

            return threads;
        }
    }
}
