import { instantFromZonedClock, type TimeZone } from '@yalla/format';
import type { ReservationStatusCode } from '../../contracts/push';
import {
  BookingRejectedError,
  LeadTimeExceededError,
  OnMyWayNotOpenError,
  TableTakenError,
} from '../../contracts/errors';
import type {
  BookingToCall,
  CreateStaffBookingCommand,
  MarkGuestComingCommand,
  StaffBooking,
  StaffDaySlot,
  StaffDaySlots,
  StaffDaySlotsQuery,
  StaffDaySlotTable,
} from '../../contracts/staffBookings';
import { inToCallWindow, toCallOrder } from '../../contracts/staffBookings';
import { onMyWayOpensAtUtc } from '../../contracts/onMyWay';
import { ApiError, NotFoundError } from '../../errors';
import { ProblemCodes } from '../../generated/problemCodes';
import type { StaffGateway } from '../../staffGateway';
import { localDateAndTime } from '../approvalWindow';
import { requireClientCommandId, validationFailed } from '../problems';
import type { MockStaffBooking, StaffMockContext } from './context';
import { WITHOUT_TABLE_TURN_MINUTES } from './withoutTableBook';

/**
 * Bookings taken by hand on the floor's mock (2026-10-31): the day's times
 * with the staff rules, taking one (which becomes the table's next booking,
 * or joins the door's list at a time-only branch), the call list, and
 * "the guest says they are coming".
 *
 * The mock room keeps the cafe's hours — 09:00 to 23:00 on the branch's
 * clock — two-hour sittings, and takes twenty guests at once where it books
 * by time only. It refuses what the server refuses: a past time, a shut one,
 * a table whose evening is taken, a party no table seats, a time with no room.
 */

/** The mock room's hours, on the branch's clock. */
const OPENS_MINUTES = 9 * 60;
const CLOSES_MINUTES = 23 * 60;
const STEP_MINUTES = 15;
const TURN_MS = WITHOUT_TABLE_TURN_MINUTES * 60_000;
/** How far ahead the mock room books. */
const WINDOW_DAYS = 30;
/** At a time-only branch: how many guests the room takes at once (`ReservationPolicy.GuestsAtOnce`). */
const GUESTS_AT_ONCE = 20;
/** The branch's grace after a start, when the options do not say. */
const DEFAULT_GRACE_MINUTES = 15;

function dateParts(date: string): [number, number, number] | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(date);
  if (!match) return null;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const probe = new Date(Date.UTC(year, month - 1, day));
  if (probe.getUTCMonth() !== month - 1 || probe.getUTCDate() !== day) return null;
  return [year, month, day];
}

function timeParts(time: string): [number, number] | null {
  const match = /^(\d{2}):(\d{2})(?::\d{2})?$/u.exec(time);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  return hour > 23 || minute > 59 ? null : [hour, minute];
}

export function staffBookingsMethods(
  ctx: StaffMockContext,
): Pick<
  StaffGateway,
  'getStaffDaySlots' | 'createStaffBooking' | 'listBookingsToCall' | 'markGuestComing'
> {
  const {
    calm,
    derive,
    id,
    label,
    me,
    now,
    options,
    plan,
    preOrderBook,
    preOrderBookingOf,
    preOrderChanged,
    record,
    requireSession,
    reservations,
    settle,
    staffBookings,
    tables,
    withoutTable,
  } = ctx;
  const zone = plan.timeZoneId as TimeZone;
  const mode = options.bookingMode ?? 'chooseTable';
  const graceMinutes = options.graceMinutes ?? DEFAULT_GRACE_MINUTES;

  /** Commands by id: a second send answers the first booking, `wasReplay`. */
  const created = new Map<string, string>();
  /** "Coming" commands by id, the same way. */
  const coming = new Map<string, string>();

  /** The instant a branch day and clock name. */
  function instantOf(date: string, time: string): Date | null {
    const day = dateParts(date);
    const clock = timeParts(time);
    if (!day || !clock) return null;
    const [year, month, dayOfMonth] = day;
    const [hour, minute] = clock;
    return instantFromZonedClock({ year, month, day: dayOfMonth, hour, minute }, zone);
  }

  /** Every sitting on the floor that has not been let go: start and party, by table. */
  function sittings(): readonly {
    readonly id: string;
    readonly tableId: string | null;
    readonly startMs: number;
    readonly partySize: number;
  }[] {
    const rows: { id: string; tableId: string | null; startMs: number; partySize: number }[] = [];
    for (const reservation of reservations.values()) {
      if (reservation.released) continue;
      rows.push({
        id: reservation.id,
        tableId: reservation.tableId,
        startMs: Date.parse(reservation.startUtc),
        partySize: reservation.partySize,
      });
    }
    for (const booking of withoutTable.bookings.values()) {
      if (booking.releasedAs !== null) continue;
      rows.push({
        id: booking.id,
        tableId: booking.tableId,
        startMs: Date.parse(booking.startUtc),
        partySize: booking.partySize,
      });
    }
    return rows;
  }

  const overlaps = (a: number, b: number) => Math.abs(a - b) < TURN_MS;

  /** The in-service tables free for a whole sitting from `startMs` that seat the party. */
  function freeTablesAt(startMs: number, partySize: number, at: Date): StaffDaySlotTable[] {
    const taken = sittings();
    const soon = startMs < at.getTime() + TURN_MS;
    return plan.tables
      .filter((table) => {
        const state = tables.get(table.id);
        if (!state || state.physicalStatus === 'outOfService') return false;
        if (table.seats < partySize) return false;
        // A sitting that would start while somebody is still at the table.
        if (soon && state.physicalStatus !== 'free') return false;
        return !taken.some((row) => row.tableId === table.id && overlaps(row.startMs, startMs));
      })
      .map((table) => ({
        tableId: table.id,
        label: table.label,
        seats: table.seats,
        roomName: table.floorAreaName,
      }));
  }

  /** At a time-only branch: how many more guests fit for a sitting from `startMs`. */
  function guestsLeftAt(startMs: number): number {
    const seated = sittings()
      .filter((row) => overlaps(row.startMs, startMs))
      .reduce((sum, row) => sum + row.partySize, 0);
    return Math.max(0, GUESTS_AT_ONCE - seated);
  }

  /** Whether a day is within the room's window, and why not when not. */
  function dayRefusal(date: string, at: Date): StaffDaySlots['unavailableReason'] {
    const today = localDateAndTime(at.toISOString(), zone).localDate;
    if (date < today) return 'pastLeadTime';
    const last = new Date(at.getTime() + WINDOW_DAYS * 86_400_000);
    if (date > localDateAndTime(last.toISOString(), zone).localDate) return 'tooFarAhead';
    return null;
  }

  function statusOf(booking: MockStaffBooking): ReservationStatusCode {
    if (booking.tableId === null) {
      const unseated = withoutTable.bookings.get(booking.id);
      if (!unseated) return 'unknown';
      if (unseated.releasedAs === 'noShow') return 'noShow';
      if (unseated.releasedAs === 'guestCancelled') return 'cancelledByVenue';
      return unseated.tableId === null ? 'confirmed' : 'seated';
    }
    const reservation = reservations.get(booking.id);
    if (!reservation) return 'unknown';
    if (reservation.released) {
      return reservation.releasedAs === 'noShow' ? 'noShow' : 'cancelledByVenue';
    }
    // Seated: the table's next booking moved on without the booking being let go.
    const state = tables.get(reservation.tableId);
    return state && state.nextReservationId !== booking.id && state.physicalStatus === 'occupied'
      ? 'seated'
      : 'confirmed';
  }

  function onWayAt(booking: MockStaffBooking): string | null {
    if (booking.tableId === null) {
      return withoutTable.bookings.get(booking.id)?.guestConfirmedOnWayAtUtc ?? null;
    }
    return preOrderBook.onMyWayAt(booking.id);
  }

  function view(booking: MockStaffBooking, wasReplay = false): StaffBooking {
    const seatedAt =
      booking.tableId === null ? (withoutTable.bookings.get(booking.id)?.tableId ?? null) : null;
    const tableId = booking.tableId ?? seatedAt;
    return {
      id: booking.id,
      code: booking.code,
      status: statusOf(booking),
      guestName: booking.guestName,
      guestPhone: booking.guestPhone,
      partySize: booking.partySize,
      startUtc: booking.startUtc,
      endUtc: booking.endUtc,
      ...localDateAndTime(booking.startUtc, zone),
      tableId,
      tableLabel: tableId ? label(tableId) : null,
      bookedWithoutTable: booking.tableId === null,
      note: booking.note,
      channel: 'staff',
      takenByStaffId: booking.takenByStaffId,
      takenByName: booking.takenByName,
      guestConfirmedOnWayAtUtc: onWayAt(booking),
      wasReplay,
    };
  }

  return {
    // --- Bookings taken by staff (2026-10-31) --------------------------------

    async getStaffDaySlots({ branchId, date, partySize }: StaffDaySlotsQuery) {
      const url = `/api/branches/${branchId}/reservations/slots`;
      requireSession(url);
      if (!dateParts(date)) {
        throw validationFailed(url, [
          { field: 'date', message: 'date must be a calendar day, YYYY-MM-DD.', bound: 'range' },
        ]);
      }
      if (!Number.isInteger(partySize) || partySize < 1 || partySize > 100) {
        throw validationFailed(url, [
          { field: 'party', message: 'party must be 1 to 100.', bound: 'range', min: 1, max: 100 },
        ]);
      }
      const at = now();
      const refused = dayRefusal(date, at);
      const slots: StaffDaySlot[] = [];
      // Every quarter hour whose whole sitting fits the hours.
      for (
        let minutes = OPENS_MINUTES;
        minutes + WITHOUT_TABLE_TURN_MINUTES <= CLOSES_MINUTES;
        minutes += STEP_MINUTES
      ) {
        const time = `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(
          minutes % 60,
        ).padStart(2, '0')}`;
        const instant = instantOf(date, time);
        if (!instant) continue;
        const startMs = instant.getTime();
        const past = startMs <= at.getTime();
        const open = !refused && !past;
        const tablesFree = open && mode !== 'timeOnly' ? freeTablesAt(startMs, partySize, at) : [];
        const guestsLeft = mode === 'timeOnly' ? (open ? guestsLeftAt(startMs) : 0) : null;
        const available =
          open && (mode === 'timeOnly' ? (guestsLeft ?? 0) >= partySize : tablesFree.length > 0);
        slots.push({
          time,
          slotUtc: instant.toISOString(),
          isAvailable: available,
          // A time gone is "too soon" as the server words it; a full one is booked out.
          unavailableReason: available ? null : (refused ?? (past ? 'pastLeadTime' : 'alreadyBooked')),
          tables: tablesFree,
          guestsLeft,
        });
      }
      return calm({
        branchId,
        date,
        partySize,
        bookingMode: mode,
        stepMinutes: STEP_MINUTES,
        unavailableReason: refused,
        slots,
      });
    },

    async createStaffBooking(command: CreateStaffBookingCommand): Promise<StaffBooking> {
      const url = `/api/branches/${command.branchId}/reservations/staff`;
      requireSession(url);
      requireClientCommandId(url, command.clientCommandId);
      const replayed = created.get(command.clientCommandId);
      if (replayed) {
        const earlier = staffBookings.get(replayed);
        if (earlier) return settle(view(earlier, true));
      }

      // The request's own shape first, as the binder would refuse it.
      const guestName = command.guestName.trim();
      const guestPhone = command.guestPhone.replace(/\s+/gu, '');
      if (!guestName || guestName.length > 200) {
        throw validationFailed(url, [
          { field: 'guestName', message: 'The guest’s name is required.', bound: 'required' },
        ]);
      }
      if (!guestPhone || guestPhone.length > 32) {
        throw validationFailed(url, [
          { field: 'guestPhone', message: 'The guest’s phone is required.', bound: 'required' },
        ]);
      }
      if (!Number.isInteger(command.partySize) || command.partySize < 1 || command.partySize > 100) {
        throw validationFailed(url, [
          { field: 'partySize', message: 'partySize must be 1 to 100.', bound: 'range', min: 1, max: 100 },
        ]);
      }
      const instant = instantOf(command.date, command.time);
      if (!instant) {
        throw validationFailed(url, [
          { field: 'time', message: 'date and time must name a moment on the branch’s clock.', bound: 'range' },
        ]);
      }
      const at = now();
      const startMs = instant.getTime();
      // A past time is refused as too soon: `ReservationRules.CheckTiming`, lead time nil.
      if (startMs <= at.getTime()) {
        throw new LeadTimeExceededError({
          url,
          leadTimeMinutes: 0,
          earliestSlotUtc: at.toISOString(),
        });
      }
      const dayReason = dayRefusal(command.date, at);
      if (dayReason === 'tooFarAhead') {
        throw new BookingRejectedError({ url, reason: 'tooFarAhead', partySize: command.partySize });
      }
      const clock = timeParts(command.time)!;
      const minutes = clock[0] * 60 + clock[1];
      if (minutes < OPENS_MINUTES || minutes + WITHOUT_TABLE_TURN_MINUTES > CLOSES_MINUTES) {
        throw new BookingRejectedError({ url, reason: 'closed', partySize: command.partySize });
      }

      const taker = me();
      const bookingId = id('res-staff');
      const code = `Y${4100 + staffBookings.size + 1}`;
      const note = command.note?.trim() ? command.note.trim() : null;
      const startUtc = instant.toISOString();
      const endUtc = new Date(startMs + TURN_MS).toISOString();

      if (mode === 'timeOnly') {
        const guestsLeft = guestsLeftAt(startMs);
        if (guestsLeft < command.partySize) {
          throw new ApiError('No room for that party at that time.', {
            url,
            status: 409,
            problem: {
              type: 'about:blank',
              title: 'Time full',
              status: 409,
              detail: `Only ${guestsLeft} more guests fit at ${command.time}.`,
              code: ProblemCodes.TimeFull,
              traceId: 'mock',
              context: { branchId: command.branchId, partySize: command.partySize, guestsLeft },
            },
          });
        }
        withoutTable.seed({
          id: bookingId,
          code,
          guestName,
          guestPhone,
          partySize: command.partySize,
          startUtc,
          note,
          takenBy: taker,
        });
      } else {
        if (!command.tableId) {
          throw validationFailed(url, [
            { field: 'tableId', message: 'This branch books tables: choose one.', bound: 'required' },
          ]);
        }
        const table = plan.tables.find((candidate) => candidate.id === command.tableId);
        const state = tables.get(command.tableId);
        if (!table || !state) throw new NotFoundError({ url });
        if (state.physicalStatus === 'outOfService') {
          throw new BookingRejectedError({ url, reason: 'outOfService', partySize: command.partySize });
        }
        if (table.seats < command.partySize) {
          throw new BookingRejectedError({ url, reason: 'tooSmall', partySize: command.partySize });
        }
        const soon = startMs < at.getTime() + TURN_MS;
        if (soon && state.physicalStatus !== 'free') {
          throw new TableTakenError({
            url,
            tableId: table.id,
            tableLabel: table.label,
            reason: 'occupied',
            floor: null,
          });
        }
        if (sittings().some((row) => row.tableId === table.id && overlaps(row.startMs, startMs))) {
          throw new TableTakenError({
            url,
            tableId: table.id,
            tableLabel: table.label,
            reason: 'alreadyBooked',
            floor: null,
          });
        }
        reservations.set(bookingId, {
          id: bookingId,
          tableId: table.id,
          code,
          guestName,
          guestPhone,
          partySize: command.partySize,
          startUtc,
          released: false,
        });
        // The table's next booking, when this is sooner than what it had.
        if (
          !state.nextReservationStartUtc ||
          startMs < Date.parse(state.nextReservationStartUtc)
        ) {
          state.nextReservationId = bookingId;
          state.nextReservationStartUtc = startUtc;
          state.nextReservationPartySize = command.partySize;
          state.freeUntilUtc = startUtc;
        }
        const from = state.physicalStatus;
        state.version += 1;
        state.derived = derive(state, at);
        record(state, from, at, { tabId: state.tabId, signal: 'bookingChanged', reservationId: bookingId });
      }

      const booking: MockStaffBooking = {
        id: bookingId,
        code,
        guestName,
        guestPhone,
        partySize: command.partySize,
        startUtc,
        endUtc,
        tableId: mode === 'timeOnly' ? null : command.tableId,
        note,
        takenByStaffId: taker.id,
        takenByName: taker.name,
        clientCommandId: command.clientCommandId,
        onWayRecordedByStaffId: null,
      };
      staffBookings.set(bookingId, booking);
      created.set(command.clientCommandId, bookingId);
      return settle(view(booking));
    },

    async listBookingsToCall(branchId): Promise<readonly BookingToCall[]> {
      requireSession(`/api/branches/${branchId}/reservations/to-call`);
      const at = now();
      const self = me();
      const rows = [...staffBookings.values()]
        .filter(
          (booking) =>
            statusOf(booking) === 'confirmed' &&
            onWayAt(booking) === null &&
            inToCallWindow(booking.startUtc, at, graceMinutes),
        )
        .map((booking): BookingToCall => {
          const seatedAt =
            booking.tableId === null
              ? (withoutTable.bookings.get(booking.id)?.tableId ?? null)
              : null;
          const tableId = booking.tableId ?? seatedAt;
          return {
            reservationId: booking.id,
            code: booking.code,
            guestName: booking.guestName,
            guestPhone: booking.guestPhone,
            partySize: booking.partySize,
            startUtc: booking.startUtc,
            ...localDateAndTime(booking.startUtc, zone),
            tableId,
            tableLabel: tableId ? label(tableId) : null,
            note: booking.note,
            takenByStaffId: booking.takenByStaffId,
            takenByName: booking.takenByName,
            isMine: booking.takenByStaffId === self.id,
          };
        });
      return calm(toCallOrder(rows));
    },

    async markGuestComing({ reservationId, clientCommandId }: MarkGuestComingCommand) {
      const url = `/api/reservations/${reservationId}/guest-coming`;
      requireSession(url);
      requireClientCommandId(url, clientCommandId);
      const booking = staffBookings.get(reservationId);
      if (!booking) throw new NotFoundError({ url });
      if (coming.get(clientCommandId) === reservationId) return settle(view(booking, true));

      const at = now();
      const status = statusOf(booking);
      const opensAtUtc = onMyWayOpensAtUtc(booking.startUtc);
      // The guest's own window: from two hours before the start, while confirmed.
      if (status !== 'confirmed' || at.getTime() < Date.parse(opensAtUtc)) {
        throw new OnMyWayNotOpenError({
          url,
          reservationId,
          bookingStatus: status,
          opensAtUtc,
        });
      }
      if (booking.tableId === null) {
        const unseated = withoutTable.bookings.get(reservationId);
        if (unseated && unseated.guestConfirmedOnWayAtUtc === null) {
          unseated.guestConfirmedOnWayAtUtc = at.toISOString();
        }
      } else {
        const reservation = reservations.get(reservationId);
        if (reservation) {
          preOrderBook.confirmOnMyWay(url, preOrderBookingOf(reservation));
          preOrderChanged(reservationId, at);
        }
      }
      booking.onWayRecordedByStaffId = me().id;
      coming.set(clientCommandId, reservationId);
      return settle(view(booking));
    },
  };
}
