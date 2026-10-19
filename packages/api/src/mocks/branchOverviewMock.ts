import { branchDayKey, instantFromZonedClock, zonedParts, type TimeZone } from '@yalla/format';
import type { WeeklyHours } from '../contracts/branchSettings';
import type {
  BranchOverview,
  OverviewBooking,
  OverviewLoadHour,
  ReservationChannel,
} from '../contracts/branchOverview';
import { openStateFrom } from '../contracts/openState';
import type { TableStatus } from '../contracts/service';
import { localDateAndTime } from './approvalWindow';

/**
 * The console mock's Overview: today's bookings for a branch, seeded relative
 * to the mock's clock, and the one read the screen makes, worked out from
 * them the way `BranchOverviewQuery` works it out from the database.
 *
 * Its own module so `consoleMock.ts` keeps only the state and the guards.
 */

/** A table, as the overview needs it. */
export interface OverviewTable {
  readonly id: string;
  readonly label: string;
  readonly seats: number;
  readonly isActive: boolean;
  readonly status: TableStatus;
}

/**
 * Today at a branch, as the artboard draws it: two parties seated, one late,
 * a few still to come, one finished, one the diner called off (counted, not
 * listed, as on the server), and one confirmed booking whose guest asked to
 * move it — listed at the slot it keeps until the venue answers. Minutes from
 * the mock's now, rounded to the quarter hour, so every status is reachable
 * whenever the mock is opened — a row that would fall on another day is left
 * out, as the server's "today" would leave it.
 */
const TODAY: readonly {
  readonly offset: number;
  readonly guest: string;
  readonly party: number;
  readonly channel: ReservationChannel;
  readonly status: OverviewBooking['status'];
  readonly changeRequested?: boolean;
}[] = [
  { offset: -195, guest: 'Tigran Avetisyan', party: 2, channel: 'web', status: 'completed' },
  { offset: -75, guest: 'Մարիամ Ս.', party: 2, channel: 'app', status: 'seated' },
  { offset: -45, guest: 'Hovhannes K.', party: 4, channel: 'web', status: 'seated' },
  { offset: -12, guest: 'Արմեն Դ.', party: 3, channel: 'app', status: 'confirmed' },
  { offset: 20, guest: 'Narine T.', party: 2, channel: 'app', status: 'confirmed' },
  { offset: 65, guest: 'Gor A.', party: 4, channel: 'staff', status: 'confirmed' },
  { offset: 95, guest: 'Ruzanna M.', party: 2, channel: 'app', status: 'cancelledByDiner' },
  { offset: 110, guest: 'Սոնա Վ.', party: 4, channel: 'web', status: 'confirmed' },
  {
    offset: 140,
    guest: 'Lilit B.',
    party: 2,
    channel: 'app',
    status: 'pendingApproval',
    changeRequested: true,
  },
];

/** How long the app waits past the start before it asks "still coming?". */
const LATE_NUDGE_MINUTES = 10;
/** How long a late booking's table is held. */
const HOLD_MINUTES = 15;
/** A walk-in party sitting at the first free table, so the room is not only bookings. */
const WALK_IN_PARTY = 3;
/** What a sitting spends, roughly, for the tab and revenue figures. */
const DRAM_PER_GUEST = 8_500;
/** The day's takings before the bookings on screen, so revenue is not only theirs. */
const REVENUE_BASE_AMD = 180_000;
/** Last week was this much quieter, give or take: the arrow points up. */
const LAST_WEEK_RATIO = 0.92;

const QUARTER_MS = 15 * 60_000;

export function seedTodayBookings(input: {
  readonly branchId: string;
  readonly timeZoneId: string;
  readonly now: Date;
  readonly tables: readonly OverviewTable[];
  readonly turnTimeMinutes: number;
}): OverviewBooking[] {
  const zone = input.timeZoneId as TimeZone;
  const today = branchDayKey(input.now, zone);
  const base = Math.floor(input.now.getTime() / QUARTER_MS) * QUARTER_MS;
  const tables = input.tables.filter((table) => table.isActive);
  const prefix = input.branchId.replace(/^b-/u, '').slice(0, 2).toUpperCase();

  return TODAY.flatMap((row, index) => {
    const table = tables[index % Math.max(1, tables.length)];
    if (!table) return [];
    const start = new Date(base + row.offset * 60_000);
    const { localDate, localStartTime } = localDateAndTime(start.toISOString(), zone);
    if (localDate !== today) return [];
    const late = row.status === 'confirmed' && start.getTime() <= input.now.getTime();
    const booking: OverviewBooking = {
      id: `ov-${input.branchId}-${index + 1}`,
      code: `${prefix}${String.fromCharCode(65 + index)}${row.party}`,
      status: row.status,
      startUtc: start.toISOString(),
      endUtc: new Date(start.getTime() + input.turnTimeMinutes * 60_000).toISOString(),
      localDate,
      localStartTime,
      partySize: row.party,
      guestName: row.guest,
      tableId: table.id,
      tableLabel: table.label,
      tableStatus: row.status === 'seated' ? 'occupied' : late ? 'held' : 'free',
      roomName: null,
      channel: row.channel,
      changeRequested: row.changeRequested ?? false,
      holdExpiresAtUtc: late
        ? new Date(start.getTime() + HOLD_MINUTES * 60_000).toISOString()
        : null,
      lateNudgeAtUtc:
        row.channel === 'app' && row.status === 'confirmed'
          ? new Date(start.getTime() + LATE_NUDGE_MINUTES * 60_000).toISOString()
          : null,
      // Worked out on every read, against the clock: see `branchOverviewFrom`.
      lateNudgeSent: null,
    };
    return [booking];
  });
}

/**
 * The table a walk-in party sits at: the first active table in service that
 * no booking of today uses. Its sitting is nobody's booking, so finishing a
 * booking there is refused (`table-sitting-changed`), and seating one there
 * too (`table-state-conflict`).
 */
export function walkInTable(
  tables: readonly OverviewTable[],
  bookings: readonly OverviewBooking[],
): OverviewTable | undefined {
  return tables.find(
    (table) =>
      table.isActive &&
      table.status !== 'outOfService' &&
      !bookings.some((row) => row.tableId === table.id),
  );
}

/** Cancelled bookings are counted on the server, never listed. */
export function isCancelled(row: OverviewBooking): boolean {
  return row.status === 'cancelledByDiner' || row.status === 'cancelledByVenue';
}

/** The start of a local hour of today, as an instant. */
function hourStart(today: string, hour: number, zone: TimeZone): number {
  const [year, month, day] = today.split('-').map(Number) as [number, number, number];
  return instantFromZonedClock({ year, month, day, hour, minute: 0 }, zone).getTime();
}

function clockOf(instant: string, zone: TimeZone): string {
  const parts = zonedParts(new Date(instant), zone);
  const two = (value: number) => String(value).padStart(2, '0');
  return `${two(parts.hour)}:${two(parts.minute)}:00`;
}

/**
 * `BranchOverviewQuery`, over the mock's rows: every count from one list, so
 * the cards, the chart and the table can never disagree.
 */
export function branchOverviewFrom(input: {
  readonly branchId: string;
  readonly timeZoneId: string;
  readonly now: Date;
  readonly weeklyHours: WeeklyHours;
  readonly tables: readonly OverviewTable[];
  readonly bookings: readonly OverviewBooking[];
  readonly graceMinutes: number;
}): BranchOverview {
  const zone = input.timeZoneId as TimeZone;
  const now = input.now;
  const today = branchDayKey(now, zone);
  const rows = [...input.bookings].sort((a, b) => a.startUtc.localeCompare(b.startUtc));
  const shown = rows
    .filter((row) => !isCancelled(row))
    .map((row) => {
      // The hold and the nudge belong to a confirmed booking only; the nudge
      // has gone out once its time has passed.
      const confirmed = row.status === 'confirmed';
      const nudgeAt = confirmed ? row.lateNudgeAtUtc : null;
      return {
        ...row,
        holdExpiresAtUtc: confirmed ? row.holdExpiresAtUtc : null,
        lateNudgeAtUtc: nudgeAt,
        lateNudgeSent: nudgeAt === null ? null : Date.parse(nudgeAt) <= now.getTime(),
      };
    });
  // A change waiting for an answer keeps its slot: it counts as confirmed.
  const asConfirmed = (row: OverviewBooking) =>
    row.status === 'confirmed' || (row.status === 'pendingApproval' && row.changeRequested);
  const waiting = (row: OverviewBooking) =>
    row.status === 'pendingApproval' && !row.changeRequested;
  const count = (status: OverviewBooking['status']) =>
    shown.filter((row) => row.status === status).length;
  const holding = shown.filter((row) =>
    ['pendingApproval', 'confirmed', 'seated', 'completed'].includes(row.status),
  );

  const active = input.tables.filter((table) => table.isActive);
  const seated = shown.filter((row) => row.status === 'seated');
  const seatedTables = new Set(seated.map((row) => row.tableId));
  const walkIn = walkInTable(input.tables, rows);
  const people = seated.reduce((sum, row) => sum + row.partySize, 0) + (walkIn ? WALK_IN_PARTY : 0);
  const occupiedTables = seatedTables.size + (walkIn ? 1 : 0);

  const completedPeople = shown
    .filter((row) => row.status === 'completed')
    .reduce((sum, row) => sum + row.partySize, 0);
  const todayAmd = REVENUE_BASE_AMD + completedPeople * DRAM_PER_GUEST * 2;
  const lastWeekAmd = Math.round((todayAmd * LAST_WEEK_RATIO) / 500) * 500;
  const lastWeekDate = new Date(Date.parse(`${today}T12:00:00Z`) - 7 * 86_400_000)
    .toISOString()
    .slice(0, 10);

  const open = openStateFrom(input.weeklyHours, now, zone);
  const closesAt = open.closesAtUtc ? clockOf(open.closesAtUtc, zone) : null;
  const opensLaterToday =
    open.opensAtUtc && branchDayKey(open.opensAtUtc, zone) === today ? open.opensAtUtc : null;

  // Booked people per hour: every sitting that touches the hour, from the
  // first booked hour to the last, contiguous.
  const load: OverviewLoadHour[] = [];
  if (holding.length > 0) {
    const hourOf = (instant: string) => zonedParts(new Date(instant), zone).hour;
    const first = Math.min(...holding.map((row) => hourOf(row.startUtc)));
    const last = Math.max(
      ...holding.map((row) => (branchDayKey(row.endUtc, zone) === today ? hourOf(row.endUtc) : 23)),
    );
    for (let hour = first; hour <= last; hour += 1) {
      const from = hourStart(today, hour, zone);
      const to = from + 3_600_000;
      const during = holding.filter(
        (row) => Date.parse(row.startUtc) < to && Date.parse(row.endUtc) > from,
      );
      const party = (unanswered: boolean) =>
        during
          .filter((row) => waiting(row) === unanswered)
          .reduce((sum, row) => sum + row.partySize, 0);
      // Confirmed (kept slots too), seated and finished parties; the unanswered requests apart.
      load.push({ hour, people: party(false), pendingPeople: party(true) });
    }
  }

  const two = (value: number) => String(value).padStart(2, '0');
  const local = zonedParts(now, zone);

  return {
    branchId: input.branchId,
    timeZoneId: input.timeZoneId,
    asOfUtc: now.toISOString(),
    localDate: today,
    serviceDate: today,
    localTime: `${two(local.hour)}:${two(local.minute)}:00`,
    hours: {
      isOpen: open.isOpen,
      closesAt,
      closesNextDay: open.closesAtUtc ? branchDayKey(open.closesAtUtc, zone) !== today : false,
      opensAt: opensLaterToday ? clockOf(opensLaterToday, zone) : null,
    },
    bookings: {
      total: holding.length + count('noShow'),
      pendingApproval: shown.filter(waiting).length,
      confirmed: shown.filter(asConfirmed).length,
      late: shown.filter(
        (row) => row.status === 'confirmed' && Date.parse(row.startUtc) <= now.getTime(),
      ).length,
      seated: count('seated'),
      completed: count('completed'),
      noShow: count('noShow'),
      cancelled: rows.filter(isCancelled).length,
      people: holding.reduce((sum, row) => sum + row.partySize, 0),
      pendingChanges: shown.filter((row) => row.changeRequested).length,
    },
    inRoom: {
      people,
      occupiedTables,
      tables: active.length,
      outOfServiceTables: active.filter((table) => table.status === 'outOfService').length,
    },
    openTabs: { count: occupiedTables, unpaidAmd: people * DRAM_PER_GUEST },
    revenue: {
      todayAmd,
      lastWeekAmd,
      lastWeekDate,
      changePercent:
        lastWeekAmd > 0 ? Math.round(((todayAmd - lastWeekAmd) / lastWeekAmd) * 1000) / 10 : null,
      sinceUtc: firstOpening(input.weeklyHours, today, zone),
    },
    load: {
      capacity: active
        .filter((table) => table.status !== 'outOfService')
        .reduce((sum, table) => sum + table.seats, 0),
      hours: load,
    },
    todayBookings: shown,
    todayBookingsTruncated: false,
    graceMinutes: input.graceMinutes,
  };
}

/** The service day's first opening, or its midnight when it has no hours. */
function firstOpening(weeklyHours: WeeklyHours, today: string, zone: TimeZone): string {
  const weekday = new Date(`${today}T12:00:00Z`).getUTCDay();
  const opens = (weeklyHours.find((entry) => entry.day === weekday)?.blocks ?? [])
    .map((block) => block.opensAt)
    .sort()[0];
  const [hour, minute] = (opens ?? '00:00').split(':').map(Number) as [number, number];
  const [year, month, day] = today.split('-').map(Number) as [number, number, number];
  return instantFromZonedClock({ year, month, day, hour, minute }, zone).toISOString();
}
