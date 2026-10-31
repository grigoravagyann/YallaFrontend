import { staffRoleToUserRole } from '../auth/endpoints';
import type {
  StaffNotificationSettings,
  StaffPushConfig,
  StaffToday,
} from '../contracts/staffPhone';
import type { components } from '../generated/schema';

type Schemas = components['schemas'];

export type WireStaffToday = Schemas['Yalla.Application.Staff.StaffToday'];
export type WireStaffNotificationSettings =
  Schemas['Yalla.Application.Notifications.StaffNotificationSettings'];
export type WireStaffPushConfig = Schemas['Yalla.Application.Notifications.StaffPushConfig'];

/** `HH:mm:ss` off the wire as the screens print it. */
const hhmm = (time: string) => time.slice(0, 5);

export function staffPushConfigFromWire(wire: WireStaffPushConfig): StaffPushConfig {
  return {
    enabled: wire.enabled && Boolean(wire.publicKey),
    publicKey: wire.publicKey ?? null,
  };
}

export function staffNotificationSettingsFromWire(
  wire: WireStaffNotificationSettings,
): StaffNotificationSettings {
  return {
    approvals: wire.approvals,
    guestMessages: wire.guestMessages,
    tableCalls: wire.tableCalls,
    takeaway: wire.takeaway,
    kitchenReady: wire.kitchenReady,
    bookingToCall: wire.bookingToCall,
    onlyDuringShift: wire.onlyDuringShift,
    locale: wire.locale ?? null,
    subscribed: wire.subscribed,
    isDefault: wire.isDefault,
  };
}

/** Field for field, so a renamed wire member fails here rather than as an `undefined` tile. */
export function staffTodayFromWire(wire: WireStaffToday): StaffToday {
  return {
    branchId: wire.branchId,
    branchName: wire.branchName,
    venueName: wire.venueName,
    timeZoneId: wire.timeZoneId,
    asOfUtc: wire.asOfUtc,
    serviceDate: wire.serviceDate,
    localTime: hhmm(wire.localTime),
    branches: wire.branches.map((branch) => ({ branchId: branch.branchId, name: branch.name })),
    revenue: {
      totalAmd: wire.revenue.totalAmd,
      hallAmd: wire.revenue.hallAmd,
      takeawayAmd: wire.revenue.takeawayAmd,
      takeawayOrders: wire.revenue.takeawayOrders,
      sinceUtc: wire.revenue.sinceUtc,
    },
    guests: {
      total: wire.guests.total,
      withBooking: wire.guests.withBooking,
      walkIn: wire.guests.walkIn,
    },
    bookings: {
      total: wire.bookings.total,
      came: wire.bookings.came,
      expected: wire.bookings.expected,
      late: wire.bookings.late,
      noShow: wire.bookings.noShow,
      pendingApproval: wire.bookings.pendingApproval,
    },
    room: {
      occupiedTables: wire.room.occupiedTables,
      tables: wire.room.tables,
      people: wire.room.people,
    },
    needsYou: {
      pendingApprovals: wire.needsYou.pendingApprovals,
      oldestApprovalRequestedAtUtc: wire.needsYou.oldestApprovalRequestedAtUtc ?? null,
      soonestApprovalDeadlineUtc: wire.needsYou.soonestApprovalDeadlineUtc ?? null,
      unansweredMessages: wire.needsYou.unansweredMessages,
      oldestUnansweredMessageAtUtc: wire.needsYou.oldestUnansweredMessageAtUtc ?? null,
    },
    shifts: wire.shifts.map((shift) => ({
      staffMemberId: shift.staffMemberId,
      fullName: shift.fullName,
      role: staffRoleToUserRole(shift.role),
      startsAt: hhmm(shift.startsAt),
      endsAt: hhmm(shift.endsAt),
      endsNextDay: shift.endsNextDay,
      startsAtUtc: shift.startsAtUtc,
      endsAtUtc: shift.endsAtUtc,
      onShiftNow: shift.onShiftNow,
      signedIn: shift.signedIn,
    })),
  };
}
