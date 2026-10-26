import type { FloorTable, TableAvailability } from '@yalla/api';
import type { AnotherTime, BookingChange } from '../components/bookings/changeBooking';
import type { Place, PlaceRoom, TablePhotoMarker } from '../places/model';
import { roomsAtSlot } from '../places/rooms';
import { SLOT_MINUTES, clockOf, timeSlots, type TimeSlot } from '../places/slots';
import { positiveInt } from './params';

/** The party sizes offered as chips; the last one opens the larger sizes. */
export const PARTY_SIZES = [2, 3, 4] as const;
export const PARTY_MORE_FROM = 5;
export const PARTY_MAX = 12;
/** The gap between a row of choices, and four days in view at once. */
export const SLOT_GAP = 6;
/** The quick chips after "In 10 min": the nearest free times. */
export const QUICK_TIMES = 3;
/** After a "no" to freeing the table by a time: how many nearby times are asked about. */
export const PROBE_TIMES = 6;
/** The value of the "5+" radio: it opens the larger sizes under the row. */
export const MORE = 'more';

/** The table the diner picked, with the seats it takes. */
export interface ChosenTable {
  readonly tableId: string;
  readonly label: string;
  readonly capacityMin: number;
  readonly capacityMax: number;
  /** Its pin on the live rooms, when it is on them. */
  readonly live: TablePhotoMarker | null;
}

/** The table the route arrived with, as its params carry it. */
export interface RouteTable {
  readonly tableId?: string | undefined;
  readonly tableLabel?: string | undefined;
  readonly capacityMin?: string | undefined;
  readonly capacityMax?: string | undefined;
}

/**
 * The picked table: the one the diner came with — whose label and seats the
 * route carries — or one tapped here, read from the live pins.
 */
export function resolveChosenTable(
  pickedTableId: string | null,
  params: RouteTable,
  tables: readonly TablePhotoMarker[],
): ChosenTable | null {
  if (!pickedTableId) return null;
  const live = tables.find((table) => table.tableId === pickedTableId);
  // The route's figures are for the table the diner arrived with only.
  const fromRoute = pickedTableId === params.tableId;
  const min = (fromRoute ? positiveInt(params.capacityMin) : null) ?? live?.capacityMin ?? 1;
  const max =
    (fromRoute ? positiveInt(params.capacityMax) : null) ?? live?.capacityMax ?? PARTY_MAX;
  return {
    tableId: pickedTableId,
    label: (fromRoute ? params.tableLabel : undefined) ?? live?.label ?? '',
    capacityMin: min,
    capacityMax: Math.max(min, max),
    live: live ?? null,
  };
}

/** Whether a party of `size` fits between the bounds; a missing bound holds anyone. */
export function partyFits(size: number, min: number | null, max: number | null): boolean {
  return (min === null || size >= min) && (max === null || size <= max);
}

/**
 * The party a booking opens with: the changed booking's, a declined one's,
 * else the smallest chip the chosen table seats.
 */
export function initialPartySize(
  change: Pick<BookingChange, 'partySize'> | null,
  anotherTime: Pick<AnotherTime, 'partySize'> | null,
  chosenTable: Pick<ChosenTable, 'capacityMin' | 'capacityMax'> | null,
): number {
  if (change?.partySize) return change.partySize;
  if (anotherTime?.partySize) return anotherTime.partySize;
  const min = chosenTable?.capacityMin ?? PARTY_SIZES[0];
  return Math.min(Math.max(min, PARTY_SIZES[0]), chosenTable?.capacityMax ?? PARTY_MAX);
}

/**
 * The table one press books when the diner tapped none: one that is free with
 * no limit and nobody's request first, then the one the next booking cuts the
 * least, then a requestable one — so a table that would need a promise or an
 * answer is never chosen while a plain one is to be had.
 */
export function preferredTable(tables: readonly TableAvailability[]): TableAvailability | null {
  const bookable = tables.filter((table) => table.isBookable);
  const plain = bookable.filter((table) => !table.isRequestable);
  return (
    plain.find((table) => !table.mustFreeByUtc) ??
    [...plain].sort(
      (a, b) => Date.parse(b.mustFreeByUtc ?? '') - Date.parse(a.mustFreeByUtc ?? ''),
    )[0] ??
    bookable[0] ??
    null
  );
}

/**
 * "In 10 min" as a time of the day: the instant `soonMs`, offered only today,
 * on a day the server did not refuse, while the place is open then.
 */
export function soonCandidateFor(input: {
  readonly isToday: boolean;
  readonly activeDateKey: string | null;
  readonly dayRefused: boolean;
  readonly place: Pick<Place, 'hours' | 'timeZoneId' | 'specialDays'>;
  readonly soonMs: number;
}): TimeSlot | null {
  const { isToday, activeDateKey, dayRefused, place, soonMs } = input;
  if (!isToday || !activeDateKey || dayRefused) return null;
  const open = timeSlots(place, activeDateKey, new Date(0), 0).some(
    (slot) => slot.at.getTime() <= soonMs && soonMs < slot.at.getTime() + SLOT_MINUTES * 60_000,
  );
  if (!open) return null;
  const at = new Date(soonMs);
  return { key: clockOf(at, place.timeZoneId), at };
}

/** One table's answer at the slot, as far as the rooms drawn at it need it. */
type SlotTableVerdict = Pick<
  TableAvailability,
  'tableId' | 'isBookable' | 'unavailableReason' | 'isRequestable' | 'requiresEarlierGuestConsent'
>;

/**
 * The rooms as they will be at the slot: every pin coloured by its state then,
 * and bookable only where the server would give it to this party. Rooms with
 * no table on any photo are left out.
 */
export function slotRoomsFor(
  rooms: readonly PlaceRoom[],
  plan: readonly FloorTable[] | undefined,
  tables: readonly SlotTableVerdict[] | undefined,
): PlaceRoom[] {
  if (!plan) return [];
  const verdicts = new Map((tables ?? []).map((table) => [table.tableId, table]));
  return roomsAtSlot(
    rooms,
    plan,
    (tableId) => verdicts.get(tableId)?.isBookable ?? false,
    (tableId) => verdicts.get(tableId)?.unavailableReason ?? null,
    (tableId) => {
      const verdict = verdicts.get(tableId);
      if (!verdict?.isRequestable) return null;
      return verdict.requiresEarlierGuestConsent ? 'earlierGuest' : 'venue';
    },
  ).filter((room) => room.photos.some((photo) => photo.tables.length > 0));
}

/** Whether any pin on the rooms is a request — the legend then explains the question mark. */
export function anyRequestIn(rooms: readonly PlaceRoom[]): boolean {
  return rooms.some((room) =>
    room.photos.some((photo) => photo.tables.some((table) => Boolean(table.request))),
  );
}
