import type { AdminFunnelStage } from '@/types/admin';

/**
 * The Overview's wording, extracted from the component so it can be asserted.
 *
 * It lives here for a specific reason. Every one of these strings used to be a literal
 * inside `AdminOverview.jsx` - `"+3 in the last 30 days"`, `"2 expire within a week"`, and a
 * footnote reading `"…Two expire within seven days"` - carried over from the design handoff
 * and shipped next to numbers that were real. Nothing failed, because nothing asserted
 * anything: there was no test for this screen at all. An invented number on a dashboard is
 * the worst kind of fiction - specific, plausible, and nobody cross-checks a stat card - and
 * the only durable defence is that the wording is a pure function of the data with a test
 * that reads it back.
 *
 * Same split as `auditSentence.ts`: keys and counts cross the wire, sentences are built here.
 */

/**
 * The funnel's wording and colour, keyed by the stage the server sends.
 *
 * A stage the server sends that this build has no entry for keeps its raw key rather than
 * vanishing, so a client one deploy behind shows something odd instead of a funnel that
 * quietly loses a bar.
 */
export const FUNNEL_STAGE: Record<string, { label: string; color: string }> = {
  registered: { label: 'Registered', color: '#1976d2' },
  confirmed: { label: 'Confirmed their address', color: '#00838f' },
  joined: { label: 'In a conversation', color: '#2e7d32' },
  wrote: { label: 'Sent a message', color: '#7b1fa2' },
};

export interface FunnelBar extends AdminFunnelStage {
  label: string;
  color: string;
}

/**
 * Written as an explicit lookup rather than `{...defaults, ...FUNNEL_STAGE[key]}` because a
 * `Record<string, …>` indexes to an always-defined type, so the spread form told the
 * compiler the defaults were unreachable (TS2783) - the exact fallback this function exists
 * for, reported as dead code.
 */
export const funnelBars = (stages: AdminFunnelStage[]): FunnelBar[] =>
  stages.map((stage) => {
    const known = FUNNEL_STAGE[stage.key] as { label: string; color: string } | undefined;
    return {
      ...stage,
      label: known?.label ?? stage.key,
      color: known?.color ?? 'text.disabled',
    };
  });

/**
 * "M", "T", "W" … from an instant.
 *
 * Derived here rather than sent, for the same reason every other timestamp on this screen
 * is: the server does not know the reader's timezone, and a letter computed in UTC is wrong
 * for anyone who is not in it.
 */
export const weekdayLetter = (iso: string): string => {
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? ''
    : date.toLocaleDateString('en-GB', { weekday: 'narrow' });
};

/** "+3 in the last 30 days" — counted, and honest when the count is zero. */
export const joinedHint = (joinedRecently: number): string =>
  joinedRecently > 0 ? `+${joinedRecently} in the last 30 days` : 'None in the last 30 days';

/** The hint under "Awaiting activation". */
export const expiringHint = (expiringSoon: number): string => {
  if (expiringSoon === 0) return 'Nothing expiring soon';
  return `${expiringSoon} expire${expiringSoon === 1 ? 's' : ''} within a week`;
};

/**
 * The funnel's footnote — the one that used to read "…Two expire within seven days" beside a
 * real count. A true half lending an invented half its credibility is worse than a wholly
 * fabricated panel, which is at least uniformly untrustworthy.
 */
export const invitationFootnote = (pending: number, expiringSoon: number): string => {
  if (pending === 0) return 'Nobody has an invitation outstanding.';

  const opening = `${pending} ${pending === 1 ? 'person has' : 'people have'} an open invitation.`;

  if (expiringSoon === 0) return `${opening} None expire in the next seven days.`;

  const one = expiringSoon === 1;
  return (
    `${opening} ${expiringSoon} ${one ? 'expires' : 'expire'} within seven days — ` +
    `extend ${one ? 'it' : 'them'} from the Invitations tab before ${one ? 'it lapses' : 'they lapse'}.`
  );
};
