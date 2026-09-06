import type { AdjustmentKind } from '../contracts/ordering';
import type {
  AdjustmentLine,
  Compared,
  MenuItemPerformance,
  MenuReport,
  OccupancyReport,
  ReportScope,
  ReservationReport,
  RevenueReport,
  StaffReport,
  TurnTimeDistribution,
  VoidLine,
} from '../contracts/reports';
import type { components } from '../generated/schema';

type Schemas = components['schemas'];

/**
 * Report wire shapes to screen shapes.
 *
 * Thin on purpose. The screens are typed almost exactly as the server answers,
 * so this file mostly turns optional-nullable wire fields into the explicit
 * `| null` the console renders against — and that one conversion is the whole
 * point of it existing.
 *
 * **Absent and zero are different everywhere in this file.** The wire omits
 * `previous` when there is no prior period at all, and a mapper that defaulted
 * it to 0 would turn a venue's first week into a 100% collapse. `undefined`
 * becomes `null` and never a number.
 */

/** 1 Discount, 2 Comp. */
function adjustmentKind(value: number): AdjustmentKind {
  return value === 2 ? 'comp' : 'discount';
}

/**
 * One measure and its comparison.
 *
 * `previous` and `changeFraction` are carried independently rather than one
 * derived from the other, because the server nulls the fraction in a case where
 * `previous` is present: a previous period of exactly zero has no percentage
 * change, and every client that has computed one has printed something absurd.
 */
export function compared(wire: Schemas['Yalla.Application.Reports.Compared']): Compared {
  return {
    value: wire.value,
    previous: wire.previous ?? null,
    changeFraction: wire.changeFraction ?? null,
  };
}

function scope(wire: Schemas['Yalla.Application.Reports.ReportScope']): ReportScope {
  return {
    branchIds: wire.branchIds,
    fromLocalDate: wire.range.fromLocalDate,
    toLocalDate: wire.range.toLocalDate,
    timeZoneId: wire.timeZoneId,
  };
}

function turnTime(
  wire: Schemas['Yalla.Application.Reports.TurnTimeDistribution'],
): TurnTimeDistribution {
  return {
    policyTurnTimeMinutes: wire.policyTurnTimeMinutes,
    medianMinutes: wire.medianMinutes ?? null,
    p90Minutes: wire.p90Minutes ?? null,
    buckets: wire.buckets.map((bucket) => ({
      upToMinutes: bucket.upToMinutes,
      sessions: bucket.sessions,
    })),
    overPolicyFraction: wire.overPolicyFraction,
    closedSessions: wire.closedSessions,
  };
}

export function occupancyReport(
  wire: Schemas['Yalla.Application.Reports.OccupancyReport'],
): OccupancyReport {
  return {
    scope: scope(wire.scope),
    sessions: compared(wire.sessions),
    byHour: wire.byHour.map((bucket) => ({ hour: bucket.hour, sessions: bucket.sessions })),
    byWeekday: wire.byWeekday.map((bucket) => ({ day: bucket.day, sessions: bucket.sessions })),
    turnTime: turnTime(wire.turnTime),
    seatsFilled: compared(wire.seatsFilled),
    seatsAvailable: wire.seatsAvailable,
    walkIns: compared(wire.walkIns),
    fromReservations: compared(wire.fromReservations),
  };
}

export function reservationReport(
  wire: Schemas['Yalla.Application.Reports.ReservationReport'],
): ReservationReport {
  return {
    scope: scope(wire.scope),
    booked: compared(wire.booked),
    seated: compared(wire.seated),
    cancelled: compared(wire.cancelled),
    noShow: compared(wire.noShow),
    noShowRate: compared(wire.noShowRate),
    cancellationRate: compared(wire.cancellationRate),
    lateCancellations: compared(wire.lateCancellations),
    leadTime: wire.leadTime.map((bucket) => ({
      upToHours: bucket.upToHours,
      bookings: bucket.bookings,
    })),
    webBookingsWithoutAnApp: compared(wire.webBookingsWithoutAnApp),
  };
}

function adjustment(wire: Schemas['Yalla.Application.Reports.AdjustmentLine']): AdjustmentLine {
  return {
    reason: wire.reason,
    kind: adjustmentKind(wire.kind),
    staffMemberId: wire.staffMemberId,
    staffName: wire.staffName,
    count: wire.count,
    totalAmd: wire.totalAmd,
  };
}

export function revenueReport(
  wire: Schemas['Yalla.Application.Reports.RevenueReport'],
): RevenueReport {
  return {
    scope: scope(wire.scope),
    totalAmd: compared(wire.totalAmd),
    serviceChargeAmd: compared(wire.serviceChargeAmd),
    averageTabAmd: compared(wire.averageTabAmd),
    averagePerHeadAmd: compared(wire.averagePerHeadAmd),
    byDay: wire.byDay.map((day) => ({
      localDate: day.localDate,
      revenueAmd: day.revenueAmd,
      tabs: day.tabs,
    })),
    byHour: wire.byHour.map((hour) => ({ hour: hour.hour, revenueAmd: hour.revenueAmd })),
    cashAmd: compared(wire.cashAmd),
    inAppAmd: compared(wire.inAppAmd),
    adjustments: wire.adjustments.map(adjustment),
    adjustmentsTotalAmd: compared(wire.adjustmentsTotalAmd),
  };
}

function performance(
  wire: Schemas['Yalla.Application.Reports.MenuItemPerformance'],
): MenuItemPerformance {
  return {
    menuItemId: wire.menuItemId,
    name: wire.name,
    categoryName: wire.categoryName,
    quantity: wire.quantity,
    revenueAmd: wire.revenueAmd,
  };
}

function voidLine(wire: Schemas['Yalla.Application.Reports.VoidLine']): VoidLine {
  return {
    menuItemId: wire.menuItemId,
    name: wire.name,
    reason: wire.reason,
    count: wire.count,
  };
}

export function menuReport(wire: Schemas['Yalla.Application.Reports.MenuReport']): MenuReport {
  return {
    scope: scope(wire.scope),
    topByCount: wire.topByCount.map(performance),
    topByRevenue: wire.topByRevenue.map(performance),
    neverOrdered: wire.neverOrdered.map(performance),
    voids: wire.voids.map(voidLine),
  };
}

export function staffReport(wire: Schemas['Yalla.Application.Reports.StaffReport']): StaffReport {
  return {
    scope: scope(wire.scope),
    ordersEntered: compared(wire.ordersEntered),
    tablesTurned: compared(wire.tablesTurned),
    activeStaff: wire.activeStaff,
  };
}

/**
 * The filename the server told us to save under.
 *
 * Read from `Content-Disposition` rather than rebuilt from the range, so the
 * naming convention lives in exactly one codebase. The fallback is only for a
 * server or a proxy that stripped the header; it is not a second implementation
 * of the rule, it is the last thing before saving a file called "download".
 */
export function fileNameFrom(header: string | null, fallback: string): string {
  if (!header) return fallback;

  // RFC 5987 first: `filename*=UTF-8''name.csv` carries the encoded name, and a
  // report of an Armenian venue is exactly where a plain `filename=` would have
  // been mangled on the way out.
  const encoded = /filename\*=UTF-8''([^;]+)/iu.exec(header);
  if (encoded?.[1]) {
    try {
      return decodeURIComponent(encoded[1].trim());
    } catch {
      // A malformed encoding is not worth failing an export over.
    }
  }

  const plain = /filename="?([^";]+)"?/iu.exec(header);
  return plain?.[1]?.trim() ?? fallback;
}
