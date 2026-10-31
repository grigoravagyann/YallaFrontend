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
  /** "On my way": the guest's own answer, or the taker's "they are coming" (2026-10-31). */
  guestConfirmedOnWayAtUtc: string | null;
  readonly guestRunningLateMinutes: number | null;
  /** The table a waiter seated it at; `null` until then. */
  tableId: string | null;
  /** How it was let go, once it was: a no-show, or the guest cancelled. */
  releasedAs: 'noShow' | 'guestCancelled' | null;
  /** How many no-shows the guest already has in the last 72 hours. */
  readonly recentNoShows?: number;
  /** Where it came from: `staff` for one a member of staff took by hand (2026-10-31). */
  readonly channel: 'app' | 'web' | 'staff';
  /** Who took it, when staff did. */
  readonly takenByStaffId: string | null;
  readonly takenByName: string | null;
}

/** A booking by time only, for tests: relative to the mock's start. */
export interface StaffWithoutTableSeed {
  readonly id: string;
  readonly code?: string;
  readonly guestName: string;
  readonly guestPhone?: string;
  readonly partySize: number;
  /** Minutes from the mock's first clock reading; negative for one already started. */
  readonly startsInMinutes?: number;
  /** Or the start itself, as the sheet books one (2026-10-31): wins over the minutes. */
  readonly startUtc?: string;
  readonly note?: string | null;
  /** The guest said "on my way" this many minutes before the mock's start. */
  readonly onMyWayMinutesAgo?: number;
  readonly runningLateMinutes?: number;
  /** Taken by hand by this member of staff (2026-10-31); the guest's own booking when absent. */
  readonly takenBy?: { readonly id: string; readonly name: string } | undefined;
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
    const startMs = input.startUtc
      ? Date.parse(input.startUtc)
      : start.getTime() + (input.startsInMinutes ?? 0) * 60_000;
    bookings.set(input.id, {
      id: input.id,
      code: input.code ?? input.id.toUpperCase().slice(-5),
      guestName: input.guestName,
      guestPhone: input.guestPhone ?? '',
      partySize: input.partySize,
      startUtc: new Date(startMs).toISOString(),
      endUtc: new Date(startMs + WITHOUT_TABLE_TURN_MINUTES * 60_000).toISOString(),
      note: input.note?.trim() ? input.note.trim() : null,
      guestRecord: null,
      phoneUnverified: false,
      guestConfirmedOnWayAtUtc:
        input.onMyWayMinutesAgo === undefined ? null : at(-input.onMyWayMinutesAgo),
      guestRunningLateMinutes: input.runningLateMinutes ?? null,
      tableId: null,
      releasedAs: null,
      channel: input.takenBy ? 'staff' : 'app',
      takenByStaffId: input.takenBy?.id ?? null,
      takenByName: input.takenBy?.name ?? null,
    });
  }

  return { bookings, seed };
}
