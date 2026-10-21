import {
  ADMITTED,
  type FloorChangeSignal,
  type TabAdmission,
  type TabAdmissionReason,
  type TabAdmissionStatus,
  type TabAwaitingAdmission,
} from '../contracts/admission';
import {
  SCAN_TURNED_AWAY_CODE,
  ScanTurnedAwayError,
  TAB_ADMISSION_DECIDED_CODE,
  TAB_AWAITING_ADMISSION_CODE,
  TabAdmissionDecidedError,
  TabAwaitingAdmissionError,
} from '../contracts/errors';
import { ApiError } from '../errors';
import type { components } from '../generated/schema';

/**
 * The tab-admission wire (2026-10-20), read once for every surface: the tab's
 * admission, the floor's awaiting list, the change stream's signal, and the
 * refusals the ordering routes answer with. (The booking refusals of that day
 * went with the guest record: `guestRecordMapping.ts`.)
 *
 * Every reader is lenient in the same direction. A field a server does not
 * send reads as the state before the feature — an admitted tab, no signal —
 * so an older backend never locks a table out of ordering.
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
  4: 'bookingCancelledByBlock',
  5: 'bookingChanged',
  6: 'preOrderChanged',
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
