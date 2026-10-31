import type { GuestRecord } from '../../contracts/guestRecord';

/**
 * Bookings by time only on the floor's mock (2026-10-29): confirmed, on no
 * table, until a waiter seats one at the table they choose — which is then
 * that booking's table, as `Reservation.AssignTable` makes it on the server.
 */

/** A booking by time only, as the mock keeps one. */
export interface MockBookingWithoutTable {
  readonly id: string;
  readonly code: string;
  readonly guestName: string;
  readonly guestPhone: string;
  readonly partySize: number;
  readonly startUtc: string;
  readonly endUtc: string;
  readonly note: string | null;
  readonly guestRecord: GuestRecord | null;
  readonly phoneUnverified: boolean;
  readonly guestConfirmedOnWayAtUtc: string | null;
  readonly guestRunningLateMinutes: number | null;
  /** The table a waiter seated it at; `null` until then. */
  tableId: string | null;
  /** How it was let go, once it was: a no-show, or the guest cancelled. */
  releasedAs: 'noShow' | 'guestCancelled' | null;
  /** How many no-shows the guest already has in the last 72 hours. */
  readonly recentNoShows?: number;
}

/** A booking by time only, for tests: relative to the mock's start. */
export interface StaffWithoutTableSeed {
  readonly id: string;
  readonly code?: string;
  readonly guestName: string;
  readonly guestPhone?: string;
  readonly partySize: number;
  /** Minutes from the mock's first clock reading; negative for one already started. */
  readonly startsInMinutes: number;
  readonly note?: string | null;
  /** The guest said "on my way" this many minutes before the mock's start. */
  readonly onMyWayMinutesAgo?: number;
  readonly runningLateMinutes?: number;
}

/** A sitting at such a branch: the mock's turn time. */
export const WITHOUT_TABLE_TURN_MINUTES = 120;

/**
 * Mock mode's door, in the design's words: a couple due in ten minutes who
 * asked for the window, a birthday of six in forty minutes who would like a
 * quiet corner, and a party of four later on who said they are on the way.
 */
export const WITHOUT_TABLE_SHOWCASE: readonly StaffWithoutTableSeed[] = [
  {
    id: 'res-time-1',
    code: 'Y3150',
    guestName: 'Նարեկ Գրիգորյան',
    guestPhone: '+37491223344',
    partySize: 2,
    startsInMinutes: 10,
    note: 'Պատուհանի մոտ, եթե հնարավոր է',
  },
  {
    id: 'res-time-2',
    code: 'Y3152',
    guestName: 'Lilit Sargsyan',
    guestPhone: '+37493556677',
    partySize: 6,
    startsInMinutes: 40,
    note: 'Ծննդյան ընթրիք է, հանգիստ անկյուն կուզենայինք',
  },
  {
    id: 'res-time-3',
    code: 'Y3157',
    guestName: 'Arman Petrosyan',
    guestPhone: '+37477334455',
    partySize: 4,
    startsInMinutes: 95,
    onMyWayMinutesAgo: 3,
  },
];

export function createWithoutTableBook(start: Date) {
  const bookings = new Map<string, MockBookingWithoutTable>();
  const at = (minutes: number) => new Date(start.getTime() + minutes * 60_000).toISOString();

  function seed(input: StaffWithoutTableSeed): void {
    bookings.set(input.id, {
      id: input.id,
      code: input.code ?? input.id.toUpperCase().slice(-5),
      guestName: input.guestName,
      guestPhone: input.guestPhone ?? '',
      partySize: input.partySize,
      startUtc: at(input.startsInMinutes),
      endUtc: at(input.startsInMinutes + WITHOUT_TABLE_TURN_MINUTES),
      note: input.note?.trim() ? input.note.trim() : null,
      guestRecord: null,
      phoneUnverified: false,
      guestConfirmedOnWayAtUtc:
        input.onMyWayMinutesAgo === undefined ? null : at(-input.onMyWayMinutesAgo),
      guestRunningLateMinutes: input.runningLateMinutes ?? null,
      tableId: null,
      releasedAs: null,
    });
  }

  return { bookings, seed };
}
