import type { AdminAudit } from '@/types/admin';
import { POLICY_GROUPS } from './policyCatalogue';

/**
 * Turns an audit entry's facts into the sentence a person reads.
 *
 * The server sends `kind` and a `data` object and never a rendered string - the same rule
 * system messages follow (`features/messages/systemMessage.ts`), for the same reason: a
 * sentence stored at write time is frozen in the phrasing, and the language, of whoever
 * happened to be an admin that day. Correcting the wording of a year of history should be
 * an edit here, not a migration.
 *
 * This deliberately mirrors `systemMessage.ts` rather than sharing with it. The two
 * vocabularies are unrelated - one is about a group, the other about the workspace - and
 * merging them would mean one switch statement growing every case of both.
 */

/** A name for an id, or the fallback the whole design rests on. */
const nameOf = (entry: AdminAudit, id: string | null | undefined): string => {
  if (!id) return 'someone';
  return entry.names?.[id] ?? 'someone';
};

const field = (entry: AdminAudit, key: string): string | null => {
  const value = entry.data?.[key];
  return typeof value === 'string' ? value : null;
};

const number = (entry: AdminAudit, key: string): number | null => {
  const value = entry.data?.[key];
  return typeof value === 'number' ? value : null;
};

const plural = (count: number, one: string): string => `${count} ${one}${count === 1 ? '' : 's'}`;

/**
 * A policy's wording, lower-cased to sit inside a sentence.
 *
 * Falls back to the raw key, which is right for two cases that both happen: a policy retired
 * since the entry was written, and a client older than the server. Both should read as odd
 * rather than as nothing.
 */
const policyLabel = (key: string): string => {
  const row = POLICY_GROUPS.flatMap((group) => group.rows).find((r) => r.key === key);
  if (!row) return key;

  // Only the first character, so "Require two-factor authentication" lower-cases cleanly
  // without touching an acronym later in the label.
  return row.label.charAt(0).toLowerCase() + row.label.slice(1);
};

/**
 * The main line. Returns an empty string for a kind this build does not know, which
 * `AuditRow` renders as nothing rather than as "undefined" - a client one deploy behind the
 * server should show a gap, not a lie.
 */
export const auditSentence = (entry: AdminAudit): string => {
  const actor = nameOf(entry, entry.actorId);
  const target = nameOf(entry, entry.targetId);

  switch (entry.kind) {
    case 'block':
      return `${actor} blocked ${target}`;
    case 'unblock':
      return `${actor} unblocked ${target}`;
    case 'deactivate':
      return `${actor} deactivated ${target}`;
    case 'activate':
      // Self-activation is the common case - somebody opening their invitation - and
      // "Elena activated Elena" is the kind of sentence that makes a log look broken.
      return entry.actorId === entry.targetId
        ? `${actor} activated their account`
        : `${actor} activated ${target}`;
    case 'role': {
      const to = field(entry, 'to');
      return to
        ? `${actor} made ${target} ${article(to)} ${to}`
        : `${actor} changed ${target}'s role`;
    }
    case 'invite': {
      const email = field(entry, 'email') ?? 'someone';
      switch (field(entry, 'event')) {
        case 'revoked':
          return `${actor} revoked the invitation for ${email}`;
        case 'resent':
          return `${actor} resent the invitation to ${email}`;
        default:
          return `${actor} invited ${email}`;
      }
    }
    case 'policy': {
      const policy = field(entry, 'policy');
      if (!policy) return `${actor} changed a workspace policy`;

      // The stored fact is the policy *key*, so this reads it through the same catalogue the
      // Policies screen renders from. Storing the label instead would freeze a year of history
      // in whatever wording was current the day each entry was written - the rule every other
      // kind here follows, and the reason none of them store a sentence.
      return `${actor} turned ${entry.data?.value === true ? 'on' : 'off'} ${policyLabel(policy)}`;
    }
    case 'login': {
      const email = field(entry, 'email') ?? 'an unknown address';
      return `Failed sign-in for ${email}`;
    }
    default:
      return '';
  }
};

/** "an admin", "a member" - only ever applied to a role name. */
const article = (word: string): string => ('aeiou'.includes(word[0]?.toLowerCase()) ? 'an' : 'a');

/**
 * The dimmer second line: the detail that makes the entry defensible without cluttering the
 * sentence. Empty when there is nothing worth saying - the row hides the line rather than
 * reserving space for it.
 */
export const auditMeta = (entry: AdminAudit): string => {
  const parts: string[] = [];

  const email = field(entry, 'email');
  if (email && entry.kind !== 'invite' && entry.kind !== 'login') parts.push(email);

  switch (entry.kind) {
    case 'block': {
      // `connectionsClosed`, not the mock's `sessionsEnded`. A JWT cannot be counted once
      // issued, so "4 sessions ended" was never a number the server could produce; live hub
      // connections closed is a fact, and zero is the ordinary case - most people are not
      // connected when they are blocked - so it is worth stating rather than hiding.
      const closed = number(entry, 'connectionsClosed');
      if (closed !== null) {
        parts.push(closed === 0 ? 'no live connections' : `${plural(closed, 'connection')} closed`);
      }
      break;
    }
    case 'deactivate': {
      const groups = number(entry, 'groupsRemoved');
      if (groups !== null) parts.push(`removed from ${plural(groups, 'group')}`);
      break;
    }
    case 'role': {
      const from = field(entry, 'from');
      const to = field(entry, 'to');
      if (from && to) parts.push(`${from} → ${to}`);
      break;
    }
    case 'invite': {
      const role = field(entry, 'role');
      if (role) parts.push(`Role: ${role}`);
      break;
    }
    case 'policy':
      parts.push('Workspace policy');
      break;
    case 'login': {
      const attempts = number(entry, 'attempts');
      if (attempts !== null) parts.push(plural(attempts, 'attempt'));
      const ip = field(entry, 'ip');
      if (ip) parts.push(ip);
      break;
    }
    default:
      break;
  }

  return parts.join(' · ');
};
