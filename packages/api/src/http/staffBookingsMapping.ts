import type { TableUnavailableReason } from '../contracts/booking';
import type {
  BookingToCall,
  CreateStaffBookingCommand,
  StaffBooking,
  StaffBookingMode,
  StaffDaySlot,
  StaffDaySlotTable,
  StaffDaySlots,
} from '../contracts/staffBookings';
import type { components } from '../generated/schema';
import { reservationStatus } from './dinerMapping';
import { unavailableReason } from './mapping';

/**
 * The staff-taken bookings wire (Yalla `feat/staff-bookings`, 2026-10-31).
 *
 * The four routes are ahead of `generated/schema.ts`: their shapes are typed
 * here by hand from the spec, read leniently, and replaced by the generated
 * types once `api:generate` has run against the backend branch. `ReservationView`
 * is the generated one, with the three members the branch adds.
 */

type Schemas = components['schemas'];

/** `ReservationView` with what the staff-bookings branch adds to it. */
export type WireStaffReservationView = Schemas['Yalla.Application.Reservations.ReservationView'] & {
  /** `ReservationChannel`: 0 Unknown, 1 App, 2 Web, 3 Staff. */
  readonly channel?: number | null | undefined;
  readonly takenByStaffId?: string | null | undefined;
  readonly takenByName?: string | null | undefined;
};

export interface WireStaffDaySlotTable {
  readonly tableId: string;
  readonly label: string;
  readonly seats: number;
  readonly roomName?: string | null | undefined;
}

export interface WireStaffDaySlot {
  readonly time: string;
  readonly startUtc: string;
  readonly isAvailable: boolean;
  /** `ReservationRejectionReason`, as the public day slots number it. */
  readonly unavailableReason?: number | null | undefined;
  readonly tables?: readonly WireStaffDaySlotTable[] | null | undefined;
  readonly guestsLeft?: number | null | undefined;
}

export interface WireStaffDaySlots {
  readonly branchId: string;
  readonly date: string;
  readonly partySize: number;
  /** `BookingMode`: 1 ChooseTable, 2 TimeOnly. */
  readonly bookingMode?: number | string | null | undefined;
  readonly stepMinutes?: number | null | undefined;
  readonly unavailableReason?: number | null | undefined;
  readonly slots?: readonly WireStaffDaySlot[] | null | undefined;
}

export interface WireBookingToCall {
  readonly reservationId: string;
  readonly code: string;
  readonly guestName: string;
  readonly guestPhone?: string | null | undefined;
  readonly partySize: number;
  readonly startUtc: string;
  readonly localDate: string;
  readonly localStartTime: string;
  readonly tableId?: string | null | undefined;
  readonly tableLabel?: string | null | undefined;
  readonly note?: string | null | undefined;
  readonly takenByStaffId?: string | null | undefined;
  readonly takenByName?: string | null | undefined;
  readonly isMine?: boolean | null | undefined;
}

/** `StaffCreateReservationRequest`, as the route takes it. */
export interface WireStaffCreateReservationRequest {
  readonly guestName: string;
  readonly guestPhone: string;
  readonly partySize: number;
  readonly date: string;
  readonly time: string;
  readonly tableId: string | null;
  readonly note: string | null;
  readonly clientCommandId: string;
}

const CHANNEL: Readonly<Record<number, StaffBooking['channel']>> = {
  1: 'app',
  2: 'web',
  3: 'staff',
};

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null;
}

/** `TimeOnly` (2, or the word) books by time; anything else chooses a table. */
function bookingModeOf(value: WireStaffDaySlots['bookingMode']): StaffBookingMode {
  if (value === 2 || value === 'timeOnly' || value === 'TimeOnly') return 'timeOnly';
  return 'chooseTable';
}

function tableFromWire(wire: WireStaffDaySlotTable): StaffDaySlotTable {
  return {
    tableId: wire.tableId,
    label: wire.label,
    seats: wire.seats,
    roomName: text(wire.roomName),
  };
}

export function staffDaySlotsFromWire(wire: WireStaffDaySlots): StaffDaySlots {
  const dayReason: TableUnavailableReason | null = unavailableReason(
    wire.unavailableReason ?? null,
    'free',
  );
  const mode = bookingModeOf(wire.bookingMode);
  return {
    branchId: wire.branchId,
    date: wire.date,
    partySize: wire.partySize,
    bookingMode: mode,
    stepMinutes: wire.stepMinutes ?? 15,
    unavailableReason: dayReason,
    slots: [...(wire.slots ?? [])]
      .sort((a, b) => Date.parse(a.startUtc) - Date.parse(b.startUtc))
      .map((slot): StaffDaySlot => {
        const tables = dayReason === null ? (slot.tables ?? []).map(tableFromWire) : [];
        const guestsLeft =
          mode === 'timeOnly'
            ? dayReason === null
              ? typeof slot.guestsLeft === 'number'
                ? slot.guestsLeft
                : 0
              : 0
            : null;
        const available = dayReason === null && slot.isAvailable === true;
        return {
          // Seconds are noise on a chip: "19:30:00" and "19:30" are one time.
          time: slot.time.slice(0, 5),
          slotUtc: slot.startUtc,
          isAvailable: available,
          unavailableReason: available
            ? null
            : (unavailableReason(slot.unavailableReason ?? null, 'free') ?? dayReason),
          tables,
          guestsLeft,
        };
      }),
  };
}

export function staffBookingFromWire(view: WireStaffReservationView): StaffBooking {
  return {
    id: view.id,
    code: view.code,
    status: reservationStatus(view.status),
    guestName: view.guestName,
    guestPhone: view.guestPhone?.trim() ?? '',
    partySize: view.partySize,
    startUtc: view.startUtc,
    endUtc: view.endUtc,
    localDate: view.localDate,
    localStartTime: view.localStartTime,
    tableId: view.tableId ?? null,
    tableLabel: text(view.tableLabel),
    bookedWithoutTable: view.bookedWithoutTable === true,
    note: text(view.note),
    channel: typeof view.channel === 'number' ? (CHANNEL[view.channel] ?? 'unknown') : 'unknown',
    takenByStaffId: text(view.takenByStaffId),
    takenByName: text(view.takenByName),
    guestConfirmedOnWayAtUtc: text(view.guestConfirmedOnWayAtUtc),
    wasReplay: view.wasReplay === true,
  };
}

export function bookingToCallFromWire(wire: WireBookingToCall): BookingToCall {
  return {
    reservationId: wire.reservationId,
    code: wire.code,
    guestName: wire.guestName,
    guestPhone: wire.guestPhone?.trim() ?? '',
    partySize: wire.partySize,
    startUtc: wire.startUtc,
    localDate: wire.localDate,
    localStartTime: wire.localStartTime,
    tableId: wire.tableId ?? null,
    tableLabel: text(wire.tableLabel),
    note: text(wire.note),
    takenByStaffId: text(wire.takenByStaffId),
    takenByName: text(wire.takenByName),
    isMine: wire.isMine === true,
  };
}

/** The request as the route takes it: trimmed, the note `null` when blank. */
export function staffBookingRequest(
  command: CreateStaffBookingCommand,
): WireStaffCreateReservationRequest {
  return {
    guestName: command.guestName.trim(),
    guestPhone: command.guestPhone.replace(/\s+/gu, ''),
    partySize: command.partySize,
    date: command.date,
    time: command.time,
    tableId: command.tableId,
    note: text(command.note),
    clientCommandId: command.clientCommandId,
  };
}
