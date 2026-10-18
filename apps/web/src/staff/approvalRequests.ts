import {
  earlierGuestFreeByUtc,
  type AwaitingApproval,
  type ReservationStatusCode,
} from '@yalla/api';
import { branchDayKey } from '@yalla/format';
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

/**
 * "19:45 · 2 guests · Lilit Manukyan" — and "Tue 20 Oct · 19:45 · 2 guests ·
 * Carmen QA" for a booking that is not for the branch's today: a bare 19:45
 * reads as tonight, and the floor would hold tonight's table for it.
 */
export function requestLine(
  request: AwaitingApproval,
  t: TFunction,
  time: (iso: string) => string,
  days?: BranchToday,
): string {
  const date = otherDay(request.startUtc, days);
  return t('approvals.line', {
    time: date ? `${date} · ${time(request.startUtc)}` : time(request.startUtc),
    count: request.partySize,
    name: request.guestName,
  });
}

/**
 * "Approved: table 3 at 19:45. The guest has been told." — the floor's notice
 * once an answer lands, dated like the card when the booking is not today.
 */
export function decidedNotice(
  request: AwaitingApproval,
  approved: boolean,
  t: TFunction,
  time: (iso: string) => string,
  days?: BranchToday,
): string {
  const date = otherDay(request.startUtc, days);
  const params = { label: request.tableLabel, time: time(request.startUtc) };
  return date
    ? t(approved ? 'approvals.approvedNoticeOn' : 'approvals.declinedNoticeOn', {
        ...params,
        date,
      })
    : t(approved ? 'approvals.approvedNotice' : 'approvals.declinedNotice', params);
}

/** One line of what the table is doing around the request. */
export interface ContextLine {
  /** `ask`: ring the guest before about leaving in time (booking times). */
  readonly kind: 'before' | 'ask' | 'next' | 'sitting';
  readonly text: string;
  /** Who to ring about it, when the line is about somebody with a number. */
  readonly call: { readonly phoneE164: string; readonly name: string } | null;
}

/**
 * Where the booking before stands, in the word a waiter would use. The ones
 * the server sends for it: still to come (or late), at the table, gone home,
 * never came, or itself still waiting. Anything else says nothing rather than
 * guessing.
 */
const PREVIOUS_STATUS: Partial<Record<ReservationStatusCode, string>> = {
  confirmed: 'confirmed',
  seated: 'seated',
  completed: 'completed',
  noShow: 'noShow',
  pendingApproval: 'pendingApproval',
};

/**
 * Whether ringing the guest before is any use: only while their booking is
 * still about the table — coming, sitting there, or waiting. A party that has
 * gone home, or never came, has nothing to say about tonight.
 */
function worthCalling(status: ReservationStatusCode): boolean {
  return status !== 'completed' && status !== 'noShow';
}

/** The branch's day of an instant, and its date for print — for a line about another day. */
export interface BranchDays {
  /** `YYYY-MM-DD` on the branch's calendar. */
  readonly dayKey: (iso: string) => string;
  /** "Mon 19 Oct", on the branch's calendar. */
  readonly date: (iso: string) => string;
}

/** {@link BranchDays}, and which of them is the branch's today. */
export interface BranchToday extends BranchDays {
  /** `YYYY-MM-DD`: the branch's today. */
  readonly today: string;
}

/** The branch's days in its own time zone, today read at `now`. */
export function branchToday(
  timeZoneId: string,
  date: (iso: string) => string,
  now: Date,
): BranchToday {
  return {
    dayKey: (iso) => branchDayKey(iso, timeZoneId),
    date,
    today: branchDayKey(now, timeZoneId),
  };
}

/** "Tue 20 Oct" for an instant on another of the branch's days; `null` for today, or unknown days. */
function otherDay(iso: string, days: BranchToday | undefined): string | null {
  return days && days.dayKey(iso) !== days.today ? days.date(iso) : null;
}

/**
 * "Before: 18:00 · 4 guests · Anna · seated now", "Sitting now: since 18:10 ·
 * 4 guests", "Next: 21:30 · 3 guests" — in the order a waiter reasons about
 * the table: who had it and where they stand, whether somebody is there now,
 * who comes after.
 *
 * The booking before is the one being asked while a question is open,
 * whatever day it is on: a 23:00 before a 00:30 is the day before's, and with
 * `days` it is printed with its date rather than as tonight's 23:00.
 */
export function contextLines(
  request: AwaitingApproval,
  t: TFunction,
  time: (iso: string) => string,
  days?: BranchDays,
): readonly ContextLine[] {
  const lines: ContextLine[] = [];
  const before = request.previousBooking;
  const when = (iso: string) =>
    days && days.dayKey(iso) !== days.dayKey(request.startUtc)
      ? `${days.date(iso)} ${time(iso)}`
      : time(iso);
  // Booking times: the floor asks the guest before — an earlier-guest request
  // the floor decides, or a short-notice one within three hours of theirs.
  const askBy =
    request.earlierGuestFreeByUtc ??
    (request.because === 'earlierGuestConsent' ? earlierGuestFreeByUtc(request.startUtc) : null);
  const asking = askBy !== null;
  if (before) {
    const status = PREVIOUS_STATUS[before.status];
    const head = t('approvals.before', {
      time: when(before.startUtc),
      count: before.partySize,
      name: before.guestName,
    });
    const said = status ? `${head} · ${t(`approvals.previousStatus.${status}`)}` : head;
    const call =
      before.guestPhone && worthCalling(before.status)
        ? { phoneE164: before.guestPhone, name: before.guestName }
        : null;
    lines.push({
      kind: 'before',
      text: before.promisedFreeByUtc
        ? `${said} · ${t('approvals.leavesBy', { time: time(before.promisedFreeByUtc) })}`
        : said,
      // Asking them is its own line, with the Call on it.
      call: asking ? null : call,
    });
    if (askBy !== null) {
      lines.push({
        kind: 'ask',
        text: t('approvals.askBefore', { name: before.guestName, time: time(askBy) }),
        call,
      });
    }
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
    const head = t('approvals.next', { time: time(next.startUtc), count: next.partySize });
    lines.push({
      kind: 'next',
      // This booking was taken on the promise to free the table before it.
      text: request.promisedFreeByUtc
        ? `${head} · ${t('table.mustFreeBy', { time: time(request.promisedFreeByUtc) })}`
        : head,
      call: null,
    });
  }
  return lines;
}

/**
 * The floor's next-booking line — "21:30", "tomorrow 21:30" — with the
 * promise the party before it made: "21:30 · must free by 21:25".
 */
export function nextBookingLine(
  t: TFunction,
  when: string,
  promisedFreeByUtc: string | null | undefined,
  time: (iso: string) => string,
): string {
  return promisedFreeByUtc
    ? `${when} · ${t('table.mustFreeBy', { time: time(promisedFreeByUtc) })}`
    : when;
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

/**
 * "New booking request: table 7 at 19:45, 2 guests." — for the live region;
 * "… table 7 on Tue 20 Oct at 19:45 …" for a booking not for today.
 */
export function arrivalAnnouncement(
  arrived: readonly AwaitingApproval[],
  t: TFunction,
  time: (iso: string) => string,
  days?: BranchToday,
): string {
  return arrived
    .map((request) => {
      const date = otherDay(request.startUtc, days);
      const params = {
        label: request.tableLabel,
        time: time(request.startUtc),
        count: request.partySize,
      };
      return date ? t('approvals.arrivedOn', { ...params, date }) : t('approvals.arrived', params);
    })
    .join(' ');
}
