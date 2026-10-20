import type { TableUnavailableReason } from '../contracts/booking';
import {
  BOOKING_OVERLAPS_OWN_CODE,
  BookingBusyError,
  BookingCommandInUseError,
  BookingNotChangeableError,
  BookingOverlapsOwnError,
  BookingRejectedError,
  BookingsNotAcceptedError,
  BranchUnavailableError,
  FreeByRequiredError,
  LeadTimeExceededError,
  PhoneNotVerifiedError,
  TableTakenError,
} from '../contracts/errors';
import { ApiError } from '../errors';
import type { components } from '../generated/schema';
import { numberRuleRefusal } from './guestRecordMapping';
import { floorFromAvailability } from './mapping';

/**
 * A refused booking or change, as the error the screen branches on — shared by
 * the diner's own routes (`httpGateway`) and the manage link's change
 * (`publicHttpGateway`), so a refusal reads the same whichever door it came
 * through.
 */

type Schemas = components['schemas'];

/**
 * The refusal that asks for the promise: a 422 (or 409) naming
 * `acceptsFreeByUtc`, or carrying the `requiredFreeByUtc` it needs. Read
 * leniently — the field's name in either case, in `field` or among `fields` —
 * because the one thing that matters is the time to ask about.
 */
export function freeByRefusal(error: ApiError): FreeByRequiredError | null {
  if (error.status !== 422 && error.status !== 409) return null;
  const context = error.problem?.context ?? {};
  const instant = (value: unknown) =>
    typeof value === 'string' && value.trim() !== '' ? value : null;
  const named = (value: unknown) =>
    typeof value === 'string' && value.toLowerCase() === 'acceptsfreebyutc';
  const fields = Array.isArray(context['fields']) ? (context['fields'] as unknown[]) : [];
  const required = context['requiredFreeByUtc'];
  const blamed =
    error.problem?.code === 'reservation-free-by-required' ||
    named(context['field']) ||
    fields.some((entry) => named((entry as { field?: unknown } | null)?.field)) ||
    Object.keys(error.problem?.errors ?? {}).some(named);
  if (!blamed && typeof required !== 'string') return null;
  return new FreeByRequiredError({
    url: error.url,
    requestId: error.requestId,
    requiredFreeByUtc: instant(required),
    nextBookingStartUtc: instant(context['nextBookingStartUtc']),
  });
}

/**
 * Every 422 `reservation-*` refusal, in the table sheet's vocabulary, so the
 * confirm screen says the sentence the sheet would have said. The lead-time
 * one is handled apart because it carries the earliest time that still works.
 */
const REJECTION_REASON: Readonly<Record<string, TableUnavailableReason>> = {
  'reservation-outside-booking-window': 'tooFarAhead',
  'reservation-outside-opening-hours': 'closed',
  'reservation-party-exceeds-capacity': 'tooSmall',
  'reservation-seat-overhang-exceeded': 'tooLarge',
  'reservation-table-not-bookable': 'notBookable',
  'reservation-table-out-of-service': 'outOfService',
  'reservation-local-time-does-not-exist': 'invalidTime',
};

/**
 * A refused booking, as the error the confirm screen branches on.
 *
 * Every code the create route answers with gets its own type, because each
 * has a different next step: a taken table sends the diner back to the room
 * (with the room from the 409, when it came), a lead-time refusal names the
 * earliest time that works, a rule names itself, a lock timeout asks for
 * another tap with the same command id. Anything else is rethrown as the
 * client mapped it, and the screen treats it as an unknown outcome.
 */
export function rethrowBookingRefusal(
  error: unknown,
  command: {
    readonly branchId: string | null;
    readonly tableId: string;
    readonly partySize: number;
  },
): never {
  if (!(error instanceof ApiError) || !error.problem) throw error;
  const context = error.problem.context ?? {};
  const code = error.problem.code;
  const base = { url: error.url, requestId: error.requestId };

  // Before every other reading: it is a 422 like a validation failure, and
  // what the screen does next is ask, not show an error.
  const freeBy = freeByRefusal(error);
  if (freeBy) throw freeBy;

  // The number rules (guest record, 2026-10-20): at most three active
  // bookings per proved number, and the week's block after three no-shows.
  const numberRule = numberRuleRefusal(error);
  if (numberRule) throw numberRule;

  switch (code) {
    case 'phone-not-verified':
      throw new PhoneNotVerifiedError(base);
    case 'reservation-not-changeable':
      throw new BookingNotChangeableError({
        ...base,
        reservationId:
          typeof context['reservationId'] === 'string' ? context['reservationId'] : undefined,
      });
    case 'bookings-not-accepted':
      throw new BookingsNotAcceptedError({
        ...base,
        branchId: typeof context['branchId'] === 'string' ? context['branchId'] : command.branchId,
      });
    case 'table-currently-occupied':
    case 'table-already-booked': {
      const room = context['availability'] as
        Schemas['Yalla.Application.Reservations.BranchAvailability'] | undefined;
      throw new TableTakenError({
        ...base,
        tableId: String(context['tableId'] ?? command.tableId),
        tableLabel: String(context['tableLabel'] ?? ''),
        reason: code === 'table-currently-occupied' ? 'occupied' : 'alreadyBooked',
        floor: room && Array.isArray(room.tables) ? floorFromAvailability(room) : null,
      });
    }
    case 'reservation-lead-time-too-short':
      throw new LeadTimeExceededError({
        ...base,
        leadTimeMinutes: Number(context['minLeadMinutes'] ?? 0),
        earliestSlotUtc: String(context['earliestStartUtc'] ?? ''),
      });
    case BOOKING_OVERLAPS_OWN_CODE: {
      // The booking the diner already holds there, to name it: "19:30 (table 2)".
      const text = (value: unknown) =>
        typeof value === 'string' && value.trim() !== '' ? value.trim() : null;
      throw new BookingOverlapsOwnError({
        ...base,
        problem: error.problem,
        existingReservationId: text(context['reservationId']),
        existingCode: text(context['code']),
        // "2026-10-20", the branch's day: said when it is not the day being booked.
        localDate: text(context['localDate']),
        // "19:30:00" as the server writes a branch wall clock; said as "19:30".
        localStartTime: text(context['localStartTime'])?.slice(0, 5) ?? null,
        tableLabel: text(context['tableLabel']),
        // Where it is: an overlap at another venue (half an hour apart) names it.
        venueName: text(context['venueName']),
        branchName: text(context['branchName']),
      });
    }
    case 'reservation-lock-timeout':
      throw new BookingBusyError(base);
    case 'client-command-id-in-use':
      throw new BookingCommandInUseError(base);
    case 'branch-unavailable':
      throw new BranchUnavailableError(base);
    default:
      if (code && error.status === 422 && code.startsWith('reservation-')) {
        throw new BookingRejectedError({
          ...base,
          reason: REJECTION_REASON[code] ?? code,
          partySize: command.partySize,
        });
      }
      throw error;
  }
}
