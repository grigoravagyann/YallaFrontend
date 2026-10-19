import type { DerivedTableState, FloorTable, StaffTableDetail } from '@yalla/api';
import type { TFunction } from 'i18next';
import { seatedMinutes } from './seatedMinutes';

/**
 * The five looks a table card takes, one per state.
 *
 * Held is its own look now (the Main artboard): booked-soon is "somebody is
 * coming at 19:00", held is "they are late and we are keeping it", and a
 * waiter acts differently on each.
 */
export type TableTone = 'free' | 'booked' | 'held' | 'occupied' | 'out';

export function tableTone(state: DerivedTableState): TableTone {
  switch (state) {
    case 'free':
      return 'free';
    case 'reservedSoon':
      return 'booked';
    case 'held':
      return 'held';
    case 'occupied':
      return 'occupied';
    case 'outOfService':
      return 'out';
  }
}

/** What a card says, in the order it is read. */
export interface TableCardText {
  /** The state in words: "Free", "Reserved 19:00", "Seated 48 min". */
  readonly state: string;
  /** The line under it, or null: the party, the debt, what the booking is. */
  readonly sub: string | null;
  /**
   * Sitting past the time the table was promised for — the next booking's
   * turnaround, or the time the party said it would leave by. Said in the
   * words ("· long") as well as the weight.
   */
  readonly long: boolean;
  /**
   * A booking whose time has passed with nobody seated: said in words ("Late
   * · booked 17:05") and in amber, so a waiter sees it from across the room
   * rather than reading it as one still to come (live QA 2026-10-19).
   */
  readonly late?: boolean;
}

export interface TableCardInput {
  readonly table: FloorTable;
  readonly detail: StaffTableDetail | undefined;
  /** Money left owing on this table when it was freed, already formatted. */
  readonly debt: string | null;
  readonly now: Date;
  readonly t: TFunction;
  /** The branch's clock. */
  readonly time: (iso: string) => string;
  /** Whole minutes since a UTC instant, on the branch's clock. */
  readonly minutesSince: (iso: string) => number;
}

/**
 * The words on a table card (Main artboard, `stOf`), from what the floor read
 * already carries. Nothing here asks the server for more: a guest's name and
 * a tab's balance are not on the floor, so the card says what is.
 */
export function tableCardText({
  table,
  detail,
  debt,
  now,
  t,
  time,
  minutesSince,
}: TableCardInput): TableCardText {
  const party = (count: number | null | undefined) =>
    count ? t('floor.card.party', { count }) : null;

  switch (table.state) {
    case 'free':
      return {
        state: t('common:tableStatus.free'),
        sub: debt
          ? t('floor.card.debt', { amount: debt })
          : table.isBookable
            ? null
            : t('floor.card.walkInOnly'),
        long: false,
      };
    case 'reservedSoon': {
      const start = table.nextReservationStartUtc;
      if (start && minutesSince(start) > 0) {
        return {
          state: t('floor.card.late', { time: time(start) }),
          sub: party(detail?.nextReservationPartySize),
          long: false,
          late: true,
        };
      }
      return {
        state: start
          ? t('floor.card.booked', { time: time(start) })
          : t('common:tableStatus.reservedSoon'),
        sub: party(detail?.nextReservationPartySize),
        long: false,
      };
    }
    case 'held': {
      const start = detail?.nextReservationStartUtc ?? table.nextReservationStartUtc;
      return {
        state: t('floor.card.held'),
        sub: start ? t('floor.card.heldFor', { time: time(start) }) : null,
        long: false,
      };
    }
    case 'occupied': {
      const minutes = table.occupiedSinceUtc
        ? seatedMinutes(minutesSince(table.occupiedSinceUtc))
        : null;
      const past = (iso: string | null | undefined) =>
        iso ? Date.parse(iso) < now.getTime() : false;
      // Overstaying the next booking's turnaround needs to have sat down before
      // it began: a walk-in seated after it did has overstayed nothing — the
      // booking is what is at risk, and the waiter chose that.
      const freeUntil = detail?.freeUntilUtc;
      const sittingSince = table.occupiedSinceUtc ?? detail?.seatedAtUtc ?? null;
      const overTurnaround =
        past(freeUntil) &&
        (sittingSince === null || Date.parse(sittingSince) < Date.parse(freeUntil!));
      const long = overTurnaround || past(detail?.sittingPromisedFreeByUtc);
      return {
        state:
          minutes === null
            ? t('common:tableStatus.occupied')
            : t(long ? 'floor.card.seatedLong' : 'floor.card.seated', { count: minutes }),
        sub: party(detail?.partySize),
        long: minutes !== null && long,
      };
    }
    case 'outOfService':
      return { state: t('common:tableStatus.outOfService'), sub: null, long: false };
  }
}
