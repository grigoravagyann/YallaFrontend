import {
  ADMITTED,
  type FloorChangeSignal,
  type TabAdmission,
  type TabAdmissionReason,
  type TabAdmissionStatus,
  type TabAwaitingAdmission,
} from '../contracts/admission';
import {
  DEVICE_HAS_ACTIVE_BOOKING_CODE,
  DeviceHasActiveBookingError,
  PHONE_HAS_ACTIVE_BOOKING_CODE,
  PhoneHasActiveBookingError,
  SCAN_TURNED_AWAY_CODE,
  ScanTurnedAwayError,
  TAB_ADMISSION_DECIDED_CODE,
  TAB_AWAITING_ADMISSION_CODE,
  TabAdmissionDecidedError,
  TabAwaitingAdmissionError,
  UNVERIFIED_PARTY_TOO_LARGE_CODE,
  UNVERIFIED_QUEUE_FULL_CODE,
  UnverifiedPartyTooLargeError,
  UnverifiedQueueFullError,
  type HeldBooking,
} from '../contracts/errors';
import { ApiError } from '../errors';
import type { components } from '../generated/schema';

/**
 * The unverified-guests wire (2026-10-20), read once for every surface: the
 * tab's admission, the floor's awaiting list, the change stream's signal, and
 * the refusals the booking and ordering routes answer with.
 *
 * Every reader is lenient in the same direction. A field a server does not
 * send reads as the state before the feature — an admitted tab, no signal, a
 * verified booking — so an older backend never locks a table out of ordering
 * or puts a badge on every booking.
 */

type Schemas = components['schemas'];
type WireAdmission = Schemas['Yalla.Application.Tabs.TabAdmissionView'];
type WireAwaiting = Schemas['Yalla.Application.Tabs.TabAwaitingAdmissionView'];

const STATUS: Readonly<Record<number, TabAdmissionStatus>> = {
  1: 'awaiting',
  2: 'admitted',
  3: 'rejected',
};

const REASON: Readonly<Record<number, TabAdmissionReason>> = {
  1: 'waiter',
  2: 'verifiedHost',
  3: 'openedByStaff',
  4: 'booker',
  5: 'notRequired',
};

const SIGNAL: Readonly<Record<number, FloorChangeSignal>> = {
  1: 'tabAwaitingAdmission',
  2: 'tabAdmitted',
  3: 'tabAdmissionRejected',
};

export function admissionStatus(value: number | null | undefined): TabAdmissionStatus {
  if (value === null || value === undefined) return 'admitted';
  return STATUS[value] ?? 'unknown';
}

export function admissionReason(value: number | null | undefined): TabAdmissionReason | null {
  if (value === null || value === undefined) return null;
  return REASON[value] ?? 'unknown';
}

/** `TabView.admission` / `TabStaffView.admission`; absent reads as admitted. */
export function admissionFromWire(wire: WireAdmission | null | undefined): TabAdmission {
  if (!wire) return ADMITTED;
  return {
    status: admissionStatus(wire.status),
    admittedBecause: admissionReason(wire.admittedBecause),
    decidedAtUtc: wire.decidedAtUtc ?? null,
    decidedByStaffId: wire.decidedByStaffId ?? null,
    tableFreed: wire.tableFreed ?? null,
  };
}

/** `BranchChange.signal`; null on every ordinary change. */
export function floorChangeSignal(value: number | null | undefined): FloorChangeSignal | null {
  if (value === null || value === undefined) return null;
  return SIGNAL[value] ?? 'unknown';
}

export function tabAwaitingAdmissionFromWire(wire: WireAwaiting): TabAwaitingAdmission {
  return {
    tabId: wire.tabId,
    tableId: wire.tableId,
    tableLabel: wire.tableLabel,
    roomName: wire.roomName?.trim() ? wire.roomName.trim() : null,
    openedAtUtc: wire.openedAtUtc,
    hostDisplayName: wire.hostDisplayName?.trim() ? wire.hostDisplayName.trim() : null,
    participantCount: wire.participantCount,
    sittingSeatedByScan: wire.sittingSeatedByScan,
  };
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null;
}

/**
 * The booking a 409 `phone-has-active-booking` names, when it names one —
 * only ever the caller's own. Null unless every field a sentence needs is there.
 */
export function heldBookingFrom(context: Readonly<Record<string, unknown>>): HeldBooking | null {
  const reservationId = text(context['reservationId']);
  const code = text(context['code']);
  const startUtc = text(context['startUtc']);
  const localDate = text(context['localDate']);
  const localStartTime = text(context['localStartTime']);
  if (!reservationId || !code || !startUtc || !localDate || !localStartTime) return null;
  return {
    reservationId,
    code,
    startUtc,
    localDate,
    // "19:30:00" as the server writes a branch wall clock; said as "19:30".
    localStartTime: localStartTime.slice(0, 5),
    venueName: text(context['venueName']) ?? '',
    branchName: text(context['branchName']) ?? '',
  };
}

/**
 * The booking refusals the unverified-guests rules add, as typed errors; null
 * for anything else, which the caller maps as it always has. Shared by the
 * diner's booking route, the public page's unverified one and the manage link.
 */
export function unverifiedBookingRefusal(
  error: unknown,
  command: { readonly partySize: number },
): ApiError | null {
  if (!(error instanceof ApiError) || !error.problem) return null;
  const context = error.problem.context ?? {};
  const base = { url: error.url, requestId: error.requestId };
  switch (error.problem.code) {
    case PHONE_HAS_ACTIVE_BOOKING_CODE:
      return new PhoneHasActiveBookingError({ ...base, held: heldBookingFrom(context) });
    case DEVICE_HAS_ACTIVE_BOOKING_CODE:
      return new DeviceHasActiveBookingError(base);
    case UNVERIFIED_QUEUE_FULL_CODE:
      return new UnverifiedQueueFullError(base);
    case UNVERIFIED_PARTY_TOO_LARGE_CODE: {
      const max = Number(context['maxPartySize']);
      const size = Number(context['partySize']);
      return new UnverifiedPartyTooLargeError({
        ...base,
        partySize: Number.isFinite(size) && size > 0 ? size : command.partySize,
        // A refusal that does not say the cap still refuses; one under the party asked for.
        maxPartySize: Number.isFinite(max) && max > 0 ? max : Math.max(1, command.partySize - 1),
      });
    }
    default:
      return null;
  }
}

/**
 * The two admission refusals on a tab route, as typed errors; null for
 * anything else. `tabId` stands in when the 409 does not name the tab.
 */
export function admissionRefusal(error: unknown, tabId: string): ApiError | null {
  if (!(error instanceof ApiError) || !error.problem) return null;
  const context = error.problem.context ?? {};
  const base = { url: error.url, requestId: error.requestId };
  switch (error.problem.code) {
    case TAB_AWAITING_ADMISSION_CODE:
      return new TabAwaitingAdmissionError({ ...base, tabId: text(context['tabId']) ?? tabId });
    case TAB_ADMISSION_DECIDED_CODE:
      return new TabAdmissionDecidedError({
        ...base,
        tabId: text(context['tabId']) ?? tabId,
        admission: admissionStatus(decidedStatus(context['admission'])),
      });
    default:
      return null;
  }
}

/**
 * The status a `tab-admission-decided` names: the bare number, or the tab's
 * admission view (`{ status, … }`) — read either way, so the wording does not
 * hang on which the server sends.
 */
function decidedStatus(value: unknown): number | undefined {
  if (typeof value === 'number') return value;
  if (value && typeof value === 'object') {
    const status = (value as { readonly status?: unknown }).status;
    if (typeof status === 'number') return status;
  }
  return undefined;
}

/** A scan refused because a waiter just turned this phone or table away; null for anything else. */
export function scanTurnedAway(error: unknown): ScanTurnedAwayError | null {
  if (!(error instanceof ApiError) || error.problem?.code !== SCAN_TURNED_AWAY_CODE) return null;
  return new ScanTurnedAwayError({
    url: error.url,
    requestId: error.requestId,
    retryAfterUtc: text(error.problem.context?.['retryAfterUtc']),
  });
}
