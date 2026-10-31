import { specialDayFromWire } from './venueSettingsMapping';
import type {
  BranchOverview,
  OverviewBooking,
  ReservationChannel,
} from '../contracts/branchOverview';
import type { TableStatus } from '../contracts/service';
import type { components } from '../generated/schema';
import { reservationStatus } from './dinerMapping';
import { guestRecordFromWire } from './guestRecordMapping';

/** `GET /api/branches/{branchId}/overview`, as the generated schema has it. */
type Schemas = components['schemas'];
export type WireBranchOverview = Schemas['Yalla.Application.Overview.BranchOverview'];
/** With the taker the staff-bookings branch adds, read leniently until the schema carries it. */
type WireOverviewBooking = Schemas['Yalla.Application.Overview.OverviewBooking'] & {
  readonly takenByName?: string | null | undefined;
};

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
  const nudgeAt = wire.lateNudgeAtUtc ?? null;
  return {
    id: wire.id,
    code: wire.code,
    status: reservationStatus(wire.status),
    startUtc: wire.startUtc,
    endUtc: wire.endUtc,
    localDate: wire.localDate,
    localStartTime: wire.localStartTime,
    partySize: wire.partySize,
    guestName: wire.guestName,
    // None, with the status, for a booking made by time only that nobody has seated.
    tableId: wire.tableId ?? null,
    tableLabel: wire.tableLabel ?? null,
    tableStatus: wire.tableStatus == null ? null : (TABLE_STATUS[wire.tableStatus] ?? null),
    roomName: wire.roomName ?? null,
    channel: CHANNEL[wire.channel] ?? 'unknown',
    takenByName:
      typeof wire.takenByName === 'string' && wire.takenByName.trim()
        ? wire.takenByName.trim()
        : null,
    changeRequested: wire.changeRequested,
    holdExpiresAtUtc: wire.holdExpiresAtUtc ?? null,
    lateNudgeAtUtc: nudgeAt,
    // Only with a nudge: "sent" says nothing without one.
    lateNudgeSent: nudgeAt === null ? null : wire.lateNudgeSent === true,
    guestRecord: guestRecordFromWire(wire.guestRecord),
  };
}

export function branchOverviewFromWire(wire: WireBranchOverview): BranchOverview {
  return {
    branchId: wire.branchId,
    timeZoneId: wire.timeZoneId,
    asOfUtc: wire.asOfUtc,
    localDate: wire.localDate,
    serviceDate: wire.serviceDate,
    localTime: wire.localTime,
    hours: {
      isOpen: wire.hours.isOpen,
      closesAt: wire.hours.closesAt ?? null,
      closesNextDay: wire.hours.closesNextDay,
      opensAt: wire.hours.opensAt ?? null,
      specialDay: wire.hours.specialDay ? specialDayFromWire(wire.hours.specialDay) : null,
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
      sinceUtc: wire.revenue.sinceUtc,
    },
    load: {
      capacity: wire.load.capacity,
      hours: wire.load.hours.map((hour) => ({
        hour: hour.hour,
        people: hour.people,
        pendingPeople: hour.pendingPeople,
      })),
    },
    todayBookings: wire.todayBookings.map(bookingFromWire),
    todayBookingsTruncated: wire.todayBookingsTruncated,
    graceMinutes: wire.graceMinutes,
  };
}
