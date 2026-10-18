import type { AwaitingApproval } from '@yalla/api';
import type { TFunction } from 'i18next';

/**
 * The words on a booking request, and which requests are new.
 *
 * Pure, so the card's sentences and the chime's trigger are tested without a
 * tablet. The card is read standing up from a metre away, in a hurry: one line
 * for the booking, then one line each for what the table is doing around it.
 */

/** "Table 7 · Windows" — the room when the table is in one. */
export function requestTable(request: AwaitingApproval, t: TFunction): string {
  return request.roomName
    ? t('approvals.tableInRoom', { label: request.tableLabel, room: request.roomName })
    : t('table.title', { label: request.tableLabel });
}

/** "19:45 · 2 guests · Lilit Manukyan". */
export function requestLine(
  request: AwaitingApproval,
  t: TFunction,
  time: (iso: string) => string,
): string {
  return t('approvals.line', {
    time: time(request.startUtc),
    count: request.partySize,
    name: request.guestName,
  });
}

/** One line of what the table is doing around the request. */
export interface ContextLine {
  readonly kind: 'before' | 'next' | 'sitting';
  readonly text: string;
  /** Who to ring about it, when the line is about somebody with a number. */
  readonly call: { readonly phoneE164: string; readonly name: string } | null;
}

/**
 * "Before: 18:00 · 4 guests · Anna", "Sitting now: since 18:10 · 4 guests",
 * "Next: 21:30 · 3 guests" — in the order a waiter reasons about the table:
 * who had it, whether they are still there, who comes after.
 */
export function contextLines(
  request: AwaitingApproval,
  t: TFunction,
  time: (iso: string) => string,
): readonly ContextLine[] {
  const lines: ContextLine[] = [];
  const before = request.previousBooking;
  if (before) {
    lines.push({
      kind: 'before',
      text: t('approvals.before', {
        time: time(before.startUtc),
        count: before.partySize,
        name: before.guestName,
      }),
      call: before.guestPhone ? { phoneE164: before.guestPhone, name: before.guestName } : null,
    });
  }
  const sitting = request.currentSitting;
  if (sitting) {
    lines.push({
      kind: 'sitting',
      text:
        sitting.partySize === null
          ? t('approvals.sittingNow', { time: time(sitting.sinceUtc) })
          : t('approvals.sittingNowParty', {
              time: time(sitting.sinceUtc),
              count: sitting.partySize,
            }),
      call: null,
    });
  }
  const next = request.nextBooking;
  if (next) {
    lines.push({
      kind: 'next',
      text: t('approvals.next', { time: time(next.startUtc), count: next.partySize }),
      call: null,
    });
  }
  return lines;
}

/**
 * The requests that were not on screen at the last read.
 *
 * Nothing on the first read: a floor opened with three requests already
 * waiting has nothing *new* to chime about — they are all on screen at once —
 * and a chime on every page load teaches people to mute it.
 */
export function newArrivals(
  seen: ReadonlySet<string> | null,
  current: readonly Pick<AwaitingApproval, 'id'>[],
): readonly string[] {
  if (seen === null) return [];
  return current.filter((request) => !seen.has(request.id)).map((request) => request.id);
}

/** "New booking request: table 7 at 19:45, 2 guests." — for the live region. */
export function arrivalAnnouncement(
  arrived: readonly AwaitingApproval[],
  t: TFunction,
  time: (iso: string) => string,
): string {
  return arrived
    .map((request) =>
      t('approvals.arrived', {
        label: request.tableLabel,
        time: time(request.startUtc),
        count: request.partySize,
      }),
    )
    .join(' ');
}
