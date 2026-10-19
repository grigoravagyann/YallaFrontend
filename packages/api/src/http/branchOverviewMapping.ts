import type {
  ReservationChannel,
  BranchOverview,
  OverviewBooking,
} from '../contracts/branchOverview';
import type { TableStatus } from '../contracts/service';
import { declineReason } from './approvalMapping';
import { reservationStatus } from './dinerMapping';

/*
 * The Overview's wire shapes (VC2 wire, `feat/venue-console-2`), written here
 * by hand until `generated/schema.ts` is regenerated against the backend that
 * serves `GET /api/branches/{branchId}/overview`. Then these become
 * `Schemas[...]` aliases, and the `gateway-schema: awaiting-route` marker in
 * the gateway comes off.
 *
 * Nulls are omitted on the wire (the house rule), so every optional field is
 * absent when there is none, and mapped to `null` here.
 */

export interface WireBranchOverview {
  readonly branchId: string;
  readonly timeZoneId: string;
  readonly asOfUtc: string;
  readonly localDate: string;
  /** Absent from a server before the overnight service day: then it is `localDate`. */
  readonly serviceDate?: string | null;
  readonly localTime: string;
  readonly hours: {
    readonly isOpen: boolean;
    readonly closesAt?: string | null;
    readonly closesNextDay?: boolean | null;
    readonly opensAt?: string | null;
  };
  readonly bookings: {
    readonly total: number;
    readonly pendingApproval: number;
    readonly confirmed: number;
    readonly late: number;
    readonly seated: number;
    readonly completed: number;
    readonly noShow: number;
    readonly cancelled: number;
    readonly people: number;
  };
  readonly inRoom: {
    readonly people: number;
    readonly occupiedTables: number;
    readonly tables: number;
    readonly outOfServiceTables: number;
  };
  readonly openTabs: { readonly count: number; readonly unpaidAmd: number };
  readonly revenue: {
    readonly todayAmd: number;
    readonly lastWeekAmd: number;
    readonly lastWeekDate: string;
    readonly changePercent?: number | null;
  };
  readonly load: {
    readonly capacity: number;
    readonly hours?: readonly {
      readonly hour: number;
      readonly people: number;
      readonly pendingPeople: number;
    }[];
  };
  readonly todayBookings?: readonly WireOverviewBooking[];
  readonly todayBookingsTruncated?: boolean | null;
  readonly graceMinutes?: number | null;
}

export interface WireOverviewBooking {
  readonly id: string;
  readonly code: string;
  /** `ReservationStatus`. */
  readonly status: number;
  readonly startUtc: string;
  readonly endUtc: string;
  readonly localStartTime: string;
  readonly partySize: number;
  readonly guestName: string;
  readonly tableId: string;
  readonly tableLabel: string;
  /** `TableStatus`: 1 Free, 2 Held, 4 Occupied, 5 OutOfService. */
  readonly tableStatus: number;
  readonly roomName?: string | null;
  /** `ReservationChannel`: 0 Unknown, 1 App, 2 Web, 3 Staff. */
  readonly channel: number;
  readonly declinedBecause?: number | null;
  readonly holdExpiresAtUtc?: string | null;
  readonly lateNudgeAtUtc?: string | null;
}

/** `ReservationChannel`: 0 Unknown, 1 App, 2 Web, 3 Staff (a phone call, the door). */
const CHANNEL: Readonly<Record<number, ReservationChannel>> = { 1: 'app', 2: 'web', 3: 'staff' };

/**
 * The table's status as the wire numbers it. Unlike the floor's mapping, an
 * unknown value is `null`, not "out of service": nothing here acts on it, and
 * the row only says what it is.
 */
const TABLE_STATUS: Readonly<Record<number, TableStatus>> = {
  1: 'free',
  2: 'held',
  4: 'occupied',
  5: 'outOfService',
};

function bookingFromWire(wire: WireOverviewBooking): OverviewBooking {
  return {
    id: wire.id,
    code: wire.code,
    status: reservationStatus(wire.status),
    startUtc: wire.startUtc,
    endUtc: wire.endUtc,
    localStartTime: wire.localStartTime,
    partySize: wire.partySize,
    guestName: wire.guestName,
    tableId: wire.tableId,
    tableLabel: wire.tableLabel,
    tableStatus: TABLE_STATUS[wire.tableStatus] ?? null,
    roomName: wire.roomName ?? null,
    channel: CHANNEL[wire.channel] ?? 'unknown',
    declinedBecause: declineReason(wire.declinedBecause),
    holdExpiresAtUtc: wire.holdExpiresAtUtc ?? null,
    lateNudgeAtUtc: wire.lateNudgeAtUtc ?? null,
  };
}

export function branchOverviewFromWire(wire: WireBranchOverview): BranchOverview {
  return {
    branchId: wire.branchId,
    timeZoneId: wire.timeZoneId,
    asOfUtc: wire.asOfUtc,
    localDate: wire.localDate,
    serviceDate: wire.serviceDate ?? wire.localDate,
    localTime: wire.localTime,
    hours: {
      isOpen: wire.hours.isOpen,
      closesAt: wire.hours.closesAt ?? null,
      closesNextDay: wire.hours.closesNextDay ?? false,
      opensAt: wire.hours.opensAt ?? null,
    },
    bookings: { ...wire.bookings },
    inRoom: { ...wire.inRoom },
    openTabs: { count: wire.openTabs.count, unpaidAmd: wire.openTabs.unpaidAmd },
    revenue: {
      todayAmd: wire.revenue.todayAmd,
      lastWeekAmd: wire.revenue.lastWeekAmd,
      lastWeekDate: wire.revenue.lastWeekDate,
      changePercent:
        typeof wire.revenue.changePercent === 'number' ? wire.revenue.changePercent : null,
    },
    load: {
      capacity: wire.load.capacity,
      hours: (wire.load.hours ?? []).map((hour) => ({
        hour: hour.hour,
        people: hour.people,
        pendingPeople: hour.pendingPeople,
      })),
    },
    todayBookings: (wire.todayBookings ?? []).map(bookingFromWire),
    todayBookingsTruncated: wire.todayBookingsTruncated ?? false,
    graceMinutes: typeof wire.graceMinutes === 'number' ? wire.graceMinutes : null,
  };
}
