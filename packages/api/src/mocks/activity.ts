import { branchDayKey, instantFromZonedClock, zonedParts, type TimeZone } from '@yalla/format';
import {
  ACTIVITY_PAGE_SIZE,
  STAFF_RECENT_PAGE_SIZE,
  activityViolations,
  compareActivityEntries,
  matchesActivitySearch,
  medianSeconds,
  type ActivityActor,
  type ActivityBookingHeader,
  type ActivityCategory,
  type ActivityDevice,
  type ActivityEntry,
  type ActivityFilters,
  type ActivityLine,
  type ActivityPage,
  type ActivityParams,
  type ActivityPerson,
  type ActivityQuery,
  type ActivitySubject,
  type ActivitySubjectType,
  type ActivityTakeawayHeader,
  type ActivityTimeline,
  type ActivityTimelineLine,
  type DailySales,
  type PerformanceFigures,
  type PerformanceRange,
  type StaffMemberPerformance,
  type StaffPerformance,
  type StaffPerformanceRow,
  type StaffPerformanceTotals,
  type StaffRecentList,
  type StaffRecentPage,
} from '../contracts/activity';
import type { StaffRole } from '../contracts/console';
import { addLocalDays } from '../contracts/messageHistory';
import type { ReportExport } from '../contracts/reports';
import type { StaffMember } from '../contracts/staff';
import { validationFailed } from './problems';

/**
 * Activity history and staff results for the console mock (2026-10-24), in
 * the backend's own words (Yalla `docs/activity.md`): its action codes, its
 * summaries, its timeline and its results rules. A month of a branch's floor,
 * seeded once per branch relative to the mock's clock, deterministic (a PRNG
 * keyed by the branch id) so a reload and a test see the same history.
 *
 * Today is the boards' own day, moved so its last entry is two minutes ago:
 * table 4's bill that Lilit seated, handed to Aram at the end of her shift,
 * with a dish the manager voided and paid in cash with a tip (the Check
 * board); a 10 % discount, a booking SHURJ declined because nobody answered
 * in time, a price change from the console, takeaway T-482 accepted, guests'
 * messages answered and calls claimed. The thirty days before it are
 * generated: every waiter's tables, orders, payments, calls and replies, the
 * odd transfer, void and discount.
 *
 * The results follow the server: a bill counts on the day it closed, its total
 * split over the waiters who held its lines (largest remainder); the table and
 * its guests count for each of them and the closing waiter; the tip is the
 * closing waiter's, the cash whoever took it (takeaway's too).
 *
 * The people are the branch's own staff (the console mock's list), so a name
 * opens their page and the "Who" filter matches: its waiters (the seeded
 * activity waiters first), its manager and its kitchen.
 */

export interface MockActivityOptions {
  readonly now: () => Date;
  /** The branch's clock, or `null` for a branch this world does not have. */
  readonly timeZoneOf: (branchId: string) => string | null;
  /** The active staff who work at the branch (its own and the venue-wide). */
  readonly staffAt: (branchId: string) => readonly StaffMember[];
}

interface Person {
  readonly id: string;
  readonly name: string;
  readonly role: StaffRole;
  /** The person's own phone, as the venue named it. */
  readonly phone: string;
}

type DeviceKey = 'hall' | 'kitchen' | 'phone' | 'console' | 'none';

interface Rec {
  readonly entry: ActivityEntry;
  /** The branch's calendar day. */
  readonly day: string;
}

interface BillLine extends ActivityTimelineLine {
  readonly addedAtMs: number;
}

interface Bill {
  readonly id: string;
  readonly sessionId: string;
  readonly tableLabel: string;
  readonly partySize: number;
  readonly openedAtMs: number;
  closedAtMs: number | null;
  /** Owners in time order: who seated it, then every transfer. */
  readonly owners: { readonly atMs: number; readonly person: Person }[];
  readonly lines: BillLine[];
  discountAmd: number;
  discountBy: Person | null;
  discountAtMs: number | null;
  serviceChargeAmd: number;
  paidAmd: number;
  tipAmd: number;
  paidByPerson: Person | null;
}

interface Takeaway extends ActivityTakeawayHeader {
  readonly collectedBy: Person | null;
}

interface World {
  readonly zone: TimeZone;
  /** Newest first. */
  readonly records: Rec[];
  readonly bills: Map<string, Bill>;
  readonly bookings: Map<string, ActivityBookingHeader>;
  readonly takeaways: Map<string, Takeaway>;
  readonly people: readonly Person[];
}

/** The server's `subjectType` words, for the CSV. */
const SUBJECT_WORD: Readonly<Record<ActivitySubjectType, string>> = {
  tab: 'tab',
  reservation: 'reservation',
  takeaway: 'takeaway',
  tableSession: 'table-session',
  table: 'table',
  order: 'order',
  serviceRequest: 'service-request',
  conversation: 'conversation',
  menuItem: 'menu-item',
  staffMember: 'staff',
  branch: 'branch',
  device: 'device',
  other: 'other',
};

/** `ServiceRequestPreset`: 1 napkins, 2 water, 3 the bill, 4 other. */
const PRESET = { napkins: 1, water: 2, bill: 3, waiter: 4 } as const;

/** The recent lists' codes (Yalla `StaffPerformanceRules.ActionsOf`). */
const RECENT: Readonly<Record<StaffRecentList, readonly string[]>> = {
  orders: [
    'order.sent',
    'order.pre-order-sent',
    'order.line-voided',
    'payment.cash',
    'payment.discount',
    'payment.comp',
  ],
  messages: ['message.sent', 'message.asked-on-my-way'],
  bookings: ['booking.approved', 'booking.declined', 'booking.seated', 'booking.no-show'],
  cash: ['payment.cash', 'takeaway.collected'],
  calls: ['table.call-claimed'],
};

const MINUTE = 60_000;

const DISHES = [
  { name: 'Խաշլամա', price: 4_800 },
  { name: 'Տաբուլե', price: 2_400 },
  { name: 'Խոզի խորոված', price: 4_800 },
  { name: 'Լյուլյա քաբաբ', price: 3_600 },
  { name: 'Թան', price: 700 },
  { name: 'Ժենգյալով հաց', price: 2_200 },
  { name: 'Ամառային աղցան', price: 2_600 },
  { name: 'Տոլմա', price: 3_900 },
  { name: 'Գաթա', price: 1_500 },
  { name: 'Սուրճ', price: 900 },
  { name: 'Լիմոնադ', price: 1_200 },
  { name: 'Խորոված ձուկ', price: 6_400 },
] as const;

const GUESTS = [
  'Անի Մարտիրոսյան',
  'Կարեն Սարգսյան',
  'Մարիամ Կարապետյան',
  'Դավիթ Հովհաննիսյան',
  'Լուսինե Ավետիսյան',
  'Արման Գևորգյան',
  'Նարինե Պողոսյան',
  'Տիգրան Մկրտչյան',
  'Սոնա Հարությունյան',
  'Մանե Ղազարյան',
  'Հայկ Ստեփանյան',
  'Էլեն Մանուկյան',
] as const;

const REPLIES = [
  'Այո, սեղանը պատշգամբում է',
  'Այո, աթոռը կդնենք սեղանի մոտ',
  'Իհարկե, տորթը կպահենք',
  'Այո, կարող եք',
  'Լավ, սպասում ենք',
] as const;

const VOID_REASONS = ['Հյուրը փոխեց պատվերը', 'Սխալ ուտեստ', 'Խոհանոցի սխալ'] as const;
const DECLINE_REASONS = ['Տեղ չունենք', 'Այդ ժամին փակ ենք'] as const;
const TABLES = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10'] as const;

/** mulberry32: a small, fast, seedable PRNG. */
function random(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

function hash(text: string): number {
  let value = 2_166_136_261;
  for (let index = 0; index < text.length; index += 1) {
    value = Math.imul(value ^ text.charCodeAt(index), 16_777_619);
  }
  return value >>> 0;
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

function firstName(name: string): string {
  return name.split(/\s+/u)[0] ?? name;
}

/** RFC 4180, a BOM, no formulas: the server's CSV writer's rules. */
function csvCell(value: string | number | null): string {
  if (value === null) return '';
  if (typeof value === 'number') return String(value);
  const safe = /^[=+\-@\t\r]/u.test(value) ? `'${value}` : value;
  return /[",\r\n]/u.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe;
}

function csv(
  fileName: string,
  header: readonly string[],
  rows: readonly (readonly (string | number | null)[])[],
): ReportExport {
  const text = `\uFEFF${[header, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n')}\r\n`;
  return {
    fileName,
    contentType: 'text/csv; charset=utf-8',
    bytes: new Blob([text], { type: 'text/csv;charset=utf-8' }),
  };
}

/** Splits a bill's total over its waiters by their lines' worth, the shares summing exactly (largest remainder). */
function split(
  totalAmd: number,
  weights: readonly { readonly id: string; readonly weight: number }[],
  fallback: string,
): Map<string, number> {
  const positive = weights.filter((one) => one.weight > 0);
  const whole = positive.reduce((sum, one) => sum + one.weight, 0);
  if (whole <= 0 || totalAmd === 0) return new Map([[fallback, totalAmd]]);
  const shares = positive.map((one, index) => {
    const exact = (totalAmd * one.weight) / whole;
    return { id: one.id, amd: Math.floor(exact), remainder: exact - Math.floor(exact), index };
  });
  let left = totalAmd - shares.reduce((sum, one) => sum + one.amd, 0);
  for (const one of [...shares].sort((a, b) => b.remainder - a.remainder || a.index - b.index)) {
    if (left <= 0) break;
    one.amd += 1;
    left -= 1;
  }
  const out = new Map<string, number>();
  for (const one of shares) out.set(one.id, (out.get(one.id) ?? 0) + one.amd);
  return out;
}

export function createMockActivity(options: MockActivityOptions) {
  const worlds = new Map<string, World>();

  function zoneOf(branchId: string): TimeZone {
    return (options.timeZoneOf(branchId) ?? 'Asia/Yerevan') as TimeZone;
  }

  function dayOf(ms: number, zone: TimeZone): string {
    const parts = zonedParts(new Date(ms), zone);
    return `${parts.year}-${pad(parts.month)}-${pad(parts.day)}`;
  }

  function localOf(ms: number, zone: TimeZone): string {
    const parts = zonedParts(new Date(ms), zone);
    return `${parts.year}-${pad(parts.month)}-${pad(parts.day)} ${pad(parts.hour)}:${pad(parts.minute)}`;
  }

  function atClock(date: string, minuteOfDay: number, zone: TimeZone): number {
    const [year, month, day] = date.split('-').map(Number) as [number, number, number];
    return instantFromZonedClock(
      { year, month, day, hour: Math.floor(minuteOfDay / 60), minute: minuteOfDay % 60 },
      zone,
    ).getTime();
  }

  /** The branch's people for the boards' parts, the activity waiters first. */
  function castOf(branchId: string): {
    readonly waiters: readonly Person[];
    readonly manager: Person;
    readonly kitchen: Person;
    readonly owner: Person | null;
    readonly all: readonly Person[];
  } {
    const staff = options.staffAt(branchId).filter((member) => member.isActive);
    const person = (member: StaffMember): Person => ({
      id: member.id,
      name: member.fullName,
      role: member.role,
      // As the server labels a personal phone (in English, worded on screen).
      phone: `${firstName(member.fullName)}'s phone`,
    });
    const waiters = staff
      .filter((member) => member.role === 'waiter')
      .sort((a, b) => Number(b.id.includes('-act-')) - Number(a.id.includes('-act-')))
      .map(person);
    const managers = staff.filter((member) => member.role === 'manager').map(person);
    const kitchen = staff.filter((member) => member.role === 'kitchen').map(person);
    const owners = staff.filter((member) => member.role === 'owner').map(person);
    const fallback: Person = {
      id: `${branchId}-act-manager`,
      name: 'Manager',
      role: 'manager',
      phone: '',
    };
    const manager = managers[0] ?? owners[0] ?? fallback;
    const servers = waiters.length > 0 ? waiters : [manager];
    const all = [...servers, ...managers, ...kitchen, ...owners];
    return {
      waiters: servers,
      manager,
      kitchen: kitchen[0] ?? manager,
      owner: owners[0] ?? null,
      all: all.filter((one, index) => all.findIndex((other) => other.id === one.id) === index),
    };
  }

  function seed(branchId: string): World {
    const zone = zoneOf(branchId);
    const now = options.now().getTime();
    const today = dayOf(now, zone);
    const cast = castOf(branchId);
    const [aram, lilit, gor] = [0, 1, 2].map(
      (index) => cast.waiters[index % cast.waiters.length]!,
    ) as [Person, Person, Person];
    const nare = cast.manager;
    const records: Rec[] = [];
    const bills = new Map<string, Bill>();
    const bookings = new Map<string, ActivityBookingHeader>();
    const takeaways = new Map<string, Takeaway>();
    let sequence = 0;

    const devices = {
      hall: { id: `${branchId}-dev-hall`, label: 'Սրահի պլանշետ' },
      kitchen: { id: `${branchId}-dev-kitchen`, label: 'Խոհանոցի պլանշետ' },
    };

    // As the server sends them: the English label, and the same as parts.
    function deviceFor(key: DeviceKey, who: Person | null): ActivityDevice {
      const none: ActivityDevice = {
        id: null,
        label: '',
        isConsole: false,
        kind: null,
        ownerName: null,
      };
      switch (key) {
        case 'hall':
          return { ...devices.hall, isConsole: false, kind: 'tablet', ownerName: null };
        case 'kitchen':
          return { ...devices.kitchen, isConsole: false, kind: 'tablet', ownerName: null };
        case 'phone':
          return who
            ? {
                id: `${branchId}-dev-phone-${who.id}`,
                label: who.phone,
                isConsole: false,
                kind: 'phone',
                ownerName: who.name,
              }
            : none;
        case 'console':
          return { id: null, label: 'Console', isConsole: true, kind: 'console', ownerName: null };
        default:
          return none;
      }
    }

    interface Add {
      readonly at: number;
      readonly by: Person | 'system' | { readonly guest: string };
      readonly device?: DeviceKey;
      readonly category: ActivityCategory;
      readonly action: string;
      readonly subject: ActivitySubject;
      readonly session?: string | null;
      readonly table?: string | null;
      readonly guest?: string | null;
      readonly items?: readonly string[];
      readonly amount?: number | null;
      readonly money?: boolean;
      readonly before?: ActivityParams | null;
      readonly after?: ActivityParams | null;
      readonly reason?: string | null;
      readonly params?: ActivityParams;
      readonly lines?: readonly ActivityLine[];
      readonly seconds?: number | null;
    }

    function add(input: Add): void {
      if (input.at > now) return;
      sequence += 1;
      const actor: ActivityActor =
        input.by === 'system'
          ? { kind: 'system', staffMemberId: null, name: '' }
          : 'guest' in input.by
            ? { kind: 'guest', staffMemberId: null, name: input.by.guest }
            : { kind: 'staff', staffMemberId: input.by.id, name: input.by.name };
      const who = typeof input.by === 'object' && !('guest' in input.by) ? input.by : null;
      const entry: ActivityEntry = {
        id: `${branchId}-act-${String(sequence).padStart(6, '0')}`,
        occurredAtUtc: new Date(input.at).toISOString(),
        local: localOf(input.at, zone),
        actor,
        device: deviceFor(input.device ?? (who ? 'hall' : 'none'), who),
        category: input.category,
        action: input.action,
        subject: { code: null, ...input.subject },
        tableSessionId: input.session ?? null,
        tableLabel: input.table ?? null,
        guestName: input.guest ?? null,
        itemNames: input.items && input.items.length > 0 ? input.items.join(', ') : null,
        amountAmd: input.amount ?? null,
        isMoney: input.money ?? false,
        before: input.before ?? null,
        after: input.after ?? null,
        reason: input.reason ?? null,
        params: input.params ?? {},
        lines: input.lines ?? [],
        seconds: input.seconds ?? null,
      };
      records.push({ entry, day: dayOf(input.at, zone) });
    }

    // --- A bill, step by step -------------------------------------------------

    interface BillPlan {
      readonly id: string;
      readonly table: string;
      readonly party: number;
      /** A booking's guest: the seat is the booking's. */
      readonly guest?: string | null;
      readonly server: Person;
      readonly seatAt: number;
      readonly seatDevice?: DeviceKey;
      readonly rounds: readonly {
        readonly at: number;
        readonly by?: Person;
        readonly device?: DeviceKey;
        readonly lines: readonly (readonly [number, number])[];
        readonly preOrder?: boolean;
      }[];
      readonly transfer?: { readonly at: number; readonly to: Person; readonly device?: DeviceKey };
      readonly ready?: readonly { readonly at: number; readonly round: number }[];
      readonly voids?: readonly {
        readonly at: number;
        readonly by: Person;
        readonly device?: DeviceKey;
        readonly round: number;
        readonly line: number;
        readonly reason: string;
      }[];
      readonly discount?: {
        readonly at: number;
        readonly by: Person;
        readonly device?: DeviceKey;
        readonly percent: number;
        readonly reason: string;
      };
      readonly calls?: readonly {
        readonly at: number;
        readonly by: Person;
        readonly reason: keyof typeof PRESET;
        readonly seconds: number;
        readonly device?: DeviceKey;
      }[];
      readonly pay?: {
        readonly at: number;
        readonly by: Person;
        readonly device?: DeviceKey;
        readonly tip: number;
        readonly service?: number;
      };
    }

    function bill(plan: BillPlan): void {
      if (plan.seatAt > now) return;
      const sessionId = `${plan.id}-sitting`;
      const record: Bill = {
        id: plan.id,
        sessionId,
        tableLabel: plan.table,
        partySize: plan.party,
        openedAtMs: plan.seatAt,
        closedAtMs: null,
        owners: [{ atMs: plan.seatAt, person: plan.server }],
        lines: [],
        discountAmd: 0,
        discountBy: null,
        discountAtMs: null,
        serviceChargeAmd: 0,
        paidAmd: 0,
        tipAmd: 0,
        paidByPerson: null,
      };
      bills.set(plan.id, record);
      const subject = { type: 'tab' as const, id: plan.id };
      const table = plan.table;
      const on = { session: sessionId, table };
      const tableId = `${branchId}-table-${table}`;
      if (plan.guest) {
        const reservationId = `${plan.id}-booking`;
        const startLocal = localOf(plan.seatAt, zone);
        bookings.set(reservationId, {
          reservationId,
          code: `B-${String((hash(reservationId) % 9000) + 1000)}`,
          guestName: plan.guest,
          partySize: plan.party,
          localDate: startLocal.slice(0, 10),
          localTime: startLocal.slice(11, 16),
          status: 4,
          tableLabel: table,
          tabId: plan.id,
        });
        add({
          at: plan.seatAt,
          by: plan.server,
          device: plan.seatDevice ?? 'hall',
          category: 'booking',
          action: 'booking.seated',
          subject: {
            type: 'reservation',
            id: reservationId,
            code: bookings.get(reservationId)!.code,
          },
          ...on,
          guest: plan.guest,
          params: { tableId, partySize: plan.party, source: 'booking', reservationId },
        });
      } else {
        add({
          at: plan.seatAt,
          by: plan.server,
          device: plan.seatDevice ?? 'hall',
          category: 'table',
          action: 'table.seated',
          subject: { type: 'tableSession', id: sessionId },
          ...on,
          params: { tableId, partySize: plan.party, source: 'walk-in', reservationId: null },
        });
      }
      add({
        at: plan.seatAt,
        by: plan.server,
        device: plan.seatDevice ?? 'hall',
        category: 'table',
        action: 'table.tab-opened',
        subject,
        ...on,
        params: { tableId, partySize: plan.party },
      });
      if (plan.transfer && plan.transfer.at <= now) {
        record.owners.push({ atMs: plan.transfer.at, person: plan.transfer.to });
      }
      const ownerAt = (at: number): Person =>
        [...record.owners].reverse().find((owner) => owner.atMs <= at)?.person ?? plan.server;
      const total = () =>
        record.lines
          .filter((line) => !line.voided)
          .reduce((sum, line) => sum + line.lineTotalAmd, 0) - record.discountAmd;
      plan.rounds.forEach((round, roundIndex) => {
        if (round.at > now) return;
        const by = round.by ?? ownerAt(round.at);
        const server = ownerAt(round.at);
        const orderId = `${plan.id}-o${roundIndex}`;
        const lines: ActivityLine[] = [];
        let amount = 0;
        let count = 0;
        round.lines.forEach(([dish, quantity], lineIndex) => {
          const meal = DISHES[dish % DISHES.length]!;
          record.lines.push({
            lineId: `${plan.id}-l${roundIndex}-${lineIndex}`,
            orderId,
            name: meal.name,
            quantity,
            unitPriceAmd: meal.price,
            lineTotalAmd: meal.price * quantity,
            addedAtUtc: new Date(round.at).toISOString(),
            addedBy: { staffMemberId: by.id, name: by.name },
            addedByGuest: false,
            serverStaffMemberId: server.id,
            voided: false,
            voidedAtUtc: null,
            voidedBy: null,
            voidReason: null,
            addedAtMs: round.at,
          });
          lines.push({ name: meal.name, quantity });
          amount += meal.price * quantity;
          count += quantity;
        });
        add({
          at: round.at,
          by,
          device: round.device ?? 'phone',
          category: 'order',
          action: round.preOrder ? 'order.pre-order-sent' : 'order.sent',
          subject,
          ...on,
          guest: plan.guest ?? null,
          items: lines.map((line) => line.name),
          amount,
          lines,
          params: round.preOrder
            ? { reservationId: `${plan.id}-booking`, items: count, amountAmd: amount, seated: true }
            : { orderId, items: count, amountAmd: amount, serverStaffMemberId: server.id },
        });
      });
      if (plan.transfer && plan.transfer.at <= now) {
        const from = record.owners[record.owners.length - 2]!.person;
        const to = plan.transfer.to;
        add({
          at: plan.transfer.at,
          by: from,
          device: plan.transfer.device ?? 'phone',
          category: 'table',
          action: 'table.transferred',
          subject,
          ...on,
          before: { staffMemberId: from.id, name: from.name },
          after: { staffMemberId: to.id, name: to.name },
          params: {
            fromStaffMemberId: from.id,
            fromName: from.name,
            toStaffMemberId: to.id,
            toName: to.name,
          },
        });
      }
      for (const ready of plan.ready ?? []) {
        const orderLines = record.lines.filter(
          (line) => line.orderId === `${plan.id}-o${ready.round}`,
        );
        if (orderLines.length === 0 || ready.at > now) continue;
        add({
          at: ready.at,
          by: cast.kitchen,
          device: 'kitchen',
          category: 'order',
          action: 'order.ready',
          subject,
          ...on,
          items: orderLines.map((line) => line.name),
          lines: orderLines.map((line) => ({ name: line.name, quantity: line.quantity })),
          params: {
            orderId: `${plan.id}-o${ready.round}`,
            from: 2,
            to: 3,
            items: orderLines.reduce((sum, line) => sum + line.quantity, 0),
          },
        });
      }
      for (const voided of plan.voids ?? []) {
        if (voided.at > now) continue;
        const index = record.lines.findIndex(
          (line) => line.lineId === `${plan.id}-l${voided.round}-${voided.line}`,
        );
        const line = record.lines[index];
        if (!line) continue;
        const before = total();
        const worth = line.unitPriceAmd * line.quantity;
        record.lines[index] = {
          ...line,
          lineTotalAmd: 0,
          voided: true,
          voidedAtUtc: new Date(voided.at).toISOString(),
          voidedBy: { staffMemberId: voided.by.id, name: voided.by.name },
          voidReason: voided.reason,
        };
        add({
          at: voided.at,
          by: voided.by,
          device: voided.device ?? 'console',
          category: 'order',
          action: 'order.line-voided',
          subject,
          ...on,
          items: [line.name],
          amount: worth,
          money: true,
          before: { name: line.name, quantity: line.quantity, amountAmd: worth },
          after: { voided: true },
          reason: voided.reason,
          params: {
            lineId: line.lineId,
            orderId: line.orderId,
            name: line.name,
            quantity: line.quantity,
            totalBeforeAmd: before,
            totalAfterAmd: total(),
          },
        });
      }
      if (plan.discount && plan.discount.at <= now) {
        const before = total();
        const discount = Math.round((before * plan.discount.percent) / 100);
        record.discountAmd = discount;
        record.discountBy = plan.discount.by;
        record.discountAtMs = plan.discount.at;
        add({
          at: plan.discount.at,
          by: plan.discount.by,
          device: plan.discount.device ?? 'hall',
          category: 'payment',
          action: 'payment.discount',
          subject,
          ...on,
          amount: discount,
          money: true,
          before: { totalAmd: before },
          after: { totalAmd: before - discount },
          reason: plan.discount.reason,
          params: {
            adjustmentId: `${plan.id}-adj`,
            percent: plan.discount.percent,
            amountAmd: null,
            lineId: null,
            lineName: null,
            totalBeforeAmd: before,
            totalAfterAmd: before - discount,
          },
        });
      }
      (plan.calls ?? []).forEach((call, index) => {
        if (call.at > now) return;
        add({
          at: call.at,
          by: call.by,
          device: call.device ?? 'phone',
          category: 'table',
          action: 'table.call-claimed',
          subject: { type: 'serviceRequest', id: `${plan.id}-call-${index}` },
          ...on,
          params: {
            tabId: plan.id,
            preset: PRESET[call.reason],
            calledAtUtc: new Date(call.at - call.seconds * 1000).toISOString(),
            responseSeconds: call.seconds,
          },
          seconds: call.seconds,
        });
      });
      if (plan.pay && plan.pay.at <= now) {
        record.serviceChargeAmd = plan.pay.service ?? 0;
        record.paidAmd = total() + record.serviceChargeAmd;
        record.tipAmd = plan.pay.tip;
        record.paidByPerson = plan.pay.by;
        record.closedAtMs = plan.pay.at;
        add({
          at: plan.pay.at,
          by: plan.pay.by,
          device: plan.pay.device ?? 'phone',
          category: 'payment',
          action: 'payment.cash',
          subject,
          ...on,
          amount: record.paidAmd,
          money: true,
          params: {
            paymentId: `${plan.id}-pay`,
            amountAmd: record.paidAmd,
            tipAmd: plan.pay.tip,
            remainingAmd: 0,
            totalAmd: record.paidAmd,
            closed: true,
            serverStaffMemberId: ownerAt(plan.pay.at).id,
          },
        });
      }
    }

    function booking(input: {
      readonly id: string;
      readonly guest: string;
      readonly table: string;
      readonly start: string;
      readonly party: number;
      readonly requestedAt: number;
      readonly decided?: {
        readonly at: number;
        readonly by: Person | 'system';
        readonly approved: boolean;
        readonly reason?: string;
        readonly device?: DeviceKey;
      };
    }): void {
      const code = `B-${String((hash(input.id) % 9000) + 1000)}`;
      const subject = { type: 'reservation' as const, id: input.id, code };
      const decided = input.decided && input.decided.at <= now ? input.decided : null;
      const status = !decided ? 1 : decided.approved ? 2 : 7;
      const localDate = dayOf(input.requestedAt, zone);
      bookings.set(input.id, {
        reservationId: input.id,
        code,
        guestName: input.guest,
        partySize: input.party,
        localDate,
        localTime: input.start,
        status,
        tableLabel: input.table,
        tabId: null,
      });
      const base = {
        localDate,
        localTime: input.start,
        partySize: input.party,
        tableId: `${branchId}-table-${input.table}`,
      };
      add({
        at: input.requestedAt,
        by: { guest: input.guest },
        category: 'booking',
        action: 'booking.created',
        subject,
        table: input.table,
        guest: input.guest,
        params: { ...base, status: 1, 'extra.channel': 1, 'extra.trigger': 1 },
      });
      if (!decided) return;
      const seconds = Math.round((decided.at - input.requestedAt) / 1000);
      if (decided.by === 'system') {
        add({
          at: decided.at,
          by: 'system',
          category: 'booking',
          action: 'booking.auto-declined',
          subject,
          table: input.table,
          guest: input.guest,
          params: {
            ...base,
            status: 7,
            'extra.declineReason': 2,
            'extra.deadlineUtc': new Date(decided.at).toISOString(),
          },
        });
        return;
      }
      add({
        at: decided.at,
        by: decided.by,
        device: decided.device ?? 'phone',
        category: 'booking',
        action: decided.approved ? 'booking.approved' : 'booking.declined',
        subject,
        table: input.table,
        guest: input.guest,
        reason: decided.reason ?? null,
        params: { ...base, status, 'extra.trigger': 1, 'extra.decisionSeconds': seconds },
        seconds,
      });
    }

    function reply(input: {
      readonly at: number;
      readonly by: Person;
      readonly guest: string;
      readonly subject: ActivitySubject;
      readonly table?: string | null;
      readonly text: string;
      readonly seconds: number | null;
    }): void {
      add({
        at: input.at,
        by: input.by,
        device: 'phone',
        category: 'message',
        action: 'message.sent',
        subject: input.subject,
        table: input.table ?? null,
        guest: input.guest,
        params: {
          conversationId: `${input.subject.id}-thread`,
          messageId: `${input.subject.id}-${input.at}`,
          text: input.text,
          replySeconds: input.seconds,
        },
        seconds: input.seconds,
      });
    }

    function takeaway(input: {
      readonly number: number;
      readonly guest: string;
      readonly totalAmd: number;
      readonly items: readonly ActivityLine[];
      readonly createdAt: number;
      readonly pickup: string;
      readonly accepted?: { readonly at: number; readonly by: Person; readonly readyAt: number };
      readonly collected?: { readonly at: number; readonly by: Person };
    }): void {
      const id = `${branchId}-tk-${today}-${input.number}`;
      const code = `T-${input.number}`;
      const collected = input.collected && input.collected.at <= now ? input.collected : null;
      takeaways.set(id, {
        orderId: id,
        code,
        guestName: input.guest,
        status: collected ? 4 : input.accepted ? 2 : 1,
        totalAmd: input.totalAmd,
        paidAmd: collected ? input.totalAmd : null,
        paymentMethod: collected ? 'cash' : null,
        createdAtUtc: new Date(input.createdAt).toISOString(),
        collectedAtUtc: collected ? new Date(collected.at).toISOString() : null,
        collectedBy: collected?.by ?? null,
      });
      const subject = { type: 'takeaway' as const, id, code };
      const items = input.items.map((line) => line.name);
      const quantity = input.items.reduce((sum, line) => sum + line.quantity, 0);
      const base = {
        code,
        items: quantity,
        totalAmd: input.totalAmd,
        pickupLocal: input.pickup,
        paymentMethod: null,
        paidAmd: null,
      };
      add({
        at: input.createdAt,
        by: { guest: input.guest },
        category: 'takeaway',
        action: 'takeaway.placed',
        subject,
        guest: input.guest,
        items,
        amount: input.totalAmd,
        params: { ...base, status: 1, readyAtUtc: null },
      });
      if (input.accepted) {
        add({
          at: input.accepted.at,
          by: input.accepted.by,
          device: 'phone',
          category: 'takeaway',
          action: 'takeaway.accepted',
          subject,
          guest: input.guest,
          items,
          amount: input.totalAmd,
          params: {
            ...base,
            status: 2,
            readyAtUtc: new Date(input.accepted.readyAt).toISOString(),
          },
        });
      }
      if (collected) {
        add({
          at: collected.at,
          by: collected.by,
          device: 'phone',
          category: 'takeaway',
          action: 'takeaway.collected',
          subject,
          guest: input.guest,
          items,
          amount: input.totalAmd,
          money: true,
          params: {
            ...base,
            status: 4,
            readyAtUtc: null,
            paymentMethod: 1,
            paidAmd: input.totalAmd,
          },
        });
      }
    }

    // --- Today: the boards' day ------------------------------------------------

    // The board's 18:36 is two minutes ago; everything else keeps its gap.
    const anchor = now - 2 * MINUTE;
    const at = (clock: string): number => {
      const [hour, minute] = clock.split(':').map(Number) as [number, number];
      return anchor - (18 * 60 + 36 - (hour * 60 + minute)) * MINUTE;
    };
    const tab = (name: string) => `${branchId}-tab-${today}-${name}`;
    const res = (name: string) => `${branchId}-res-${today}-${name}`;

    add({
      at: at('15:50'),
      by: nare,
      device: 'console',
      category: 'settings',
      action: 'settings.menu-availability',
      subject: { type: 'menuItem', id: `${branchId}-menu-gata` },
      items: ['Գաթա'],
      before: { isAvailable: true },
      after: { isAvailable: false },
      params: { name: 'Գաթա', priceAmd: 1_500, isAvailable: false },
    });
    add({
      at: at('16:00'),
      by: nare,
      device: 'console',
      category: 'staff',
      action: 'staff.pin-set',
      subject: { type: 'staffMember', id: gor.id },
      params: { name: gor.name, role: 3, branchId },
    });
    // Devices (2026-10-25): a tablet connected with a manager's code, a phone
    // paired by its person, and one the console unpaired.
    add({
      at: at('15:40'),
      by: 'system',
      category: 'device',
      action: 'device.enrolled',
      subject: { type: 'device', id: devices.hall.id },
      params: { name: devices.hall.label, codeCreatedByStaffMemberId: nare.id },
    });
    add({
      at: at('15:45'),
      by: lilit,
      device: 'phone',
      category: 'device',
      action: 'device.phone-paired',
      subject: { type: 'device', id: `${branchId}-dev-phone-${lilit.id}` },
      params: {
        name: 'Chrome on Android',
        staffMemberId: lilit.id,
        staffName: lilit.name,
        repaired: false,
        codeCreatedByStaffMemberId: nare.id,
      },
    });
    add({
      at: at('16:10'),
      by: nare,
      device: 'console',
      category: 'device',
      action: 'device.phone-unpaired',
      subject: { type: 'device', id: `${branchId}-dev-phone-${gor.id}` },
      params: {
        name: 'Safari on iPhone',
        staffMemberId: gor.id,
        staffName: gor.name,
        cause: 'console',
      },
    });
    booking({
      id: res('tigran'),
      guest: 'Տիգրան Հովհաննիսյան',
      table: '9',
      start: '20:00',
      party: 6,
      requestedAt: at('16:58'),
      decided: { at: at('17:02'), by: aram, approved: true },
    });
    booking({
      id: res('sona'),
      guest: 'Սոնա Աբրահամյան',
      table: '2',
      start: '18:00',
      party: 2,
      requestedAt: at('16:15'),
      decided: { at: at('16:20'), by: aram, approved: false, reason: 'Տեղ չունենք' },
    });
    bill({
      id: tab('t1-early'),
      table: '1',
      party: 2,
      server: aram,
      seatAt: at('16:05'),
      rounds: [
        {
          at: at('16:10'),
          lines: [
            [7, 2],
            [9, 2],
          ],
        },
      ],
      calls: [{ at: at('16:58'), by: aram, reason: 'bill', seconds: 40 }],
      pay: { at: at('17:05'), by: aram, tip: 1_000 },
    });
    bill({
      id: tab('t3'),
      table: '3',
      party: 2,
      guest: 'Մարիամ Կարապետյան',
      server: lilit,
      seatAt: at('16:30'),
      rounds: [
        {
          at: at('16:35'),
          lines: [
            [1, 1],
            [6, 1],
            [10, 2],
          ],
        },
      ],
      calls: [{ at: at('17:05'), by: lilit, reason: 'water', seconds: 72 }],
      pay: { at: at('17:35'), by: lilit, tip: 800 },
    });
    reply({
      at: at('16:44'),
      by: aram,
      guest: 'Մարիամ Կարապետյան',
      subject: { type: 'reservation', id: res('mariam') },
      table: '3',
      text: 'Այո, սեղան 3-ը պատշգամբում է',
      seconds: 240,
    });
    reply({
      at: at('17:10'),
      by: aram,
      guest: 'Կարեն Սարգսյան',
      subject: { type: 'takeaway', id: `${branchId}-tk-${today}-485`, code: 'T-485' },
      text: 'Այո, կարող եք',
      seconds: 60,
    });
    // Table 4: the Check board.
    bill({
      id: tab('t4'),
      table: '4',
      party: 4,
      server: lilit,
      seatAt: at('17:12'),
      seatDevice: 'phone',
      rounds: [
        {
          at: at('17:15'),
          lines: [
            [0, 2],
            [1, 1],
          ],
        },
        {
          at: at('17:44'),
          lines: [
            [2, 1],
            [3, 2],
            [4, 3],
          ],
        },
      ],
      // A branch with one waiter has nobody to hand table 4 to.
      ...(lilit.id !== aram.id ? { transfer: { at: at('17:40'), to: aram } } : {}),
      ready: [{ at: at('17:52'), round: 1 }],
      voids: [{ at: at('18:15'), by: nare, round: 1, line: 0, reason: 'Հյուրը փոխեց պատվերը' }],
      calls: [
        { at: at('18:02'), by: aram, reason: 'waiter', seconds: 55 },
        { at: at('18:16'), by: aram, reason: 'bill', seconds: 31 },
      ],
      pay: { at: at('18:20'), by: aram, tip: 2_000, service: 1_000 },
    });
    bill({
      id: tab('t5'),
      table: '5',
      party: 3,
      server: gor,
      seatAt: at('17:20'),
      rounds: [
        {
          at: at('17:25'),
          lines: [
            [7, 1],
            [5, 1],
            [8, 2],
          ],
        },
      ],
      calls: [{ at: at('17:50'), by: gor, reason: 'waiter', seconds: 125 }],
      pay: { at: at('18:10'), by: gor, tip: 500 },
    });
    bill({
      id: tab('t6'),
      table: '6',
      party: 4,
      guest: 'Անի Մարտիրոսյան',
      server: aram,
      seatAt: at('17:38'),
      rounds: [
        {
          at: at('17:41'),
          lines: [
            [0, 1],
            [3, 1],
            [6, 1],
            [10, 2],
          ],
          preOrder: true,
        },
      ],
      calls: [{ at: at('17:45'), by: aram, reason: 'waiter', seconds: 80 }],
    });
    takeaway({
      number: 478,
      guest: 'Էլեն Մանուկյան',
      totalAmd: 4_100,
      items: [
        { name: 'Տոլմա', quantity: 1 },
        { name: 'Լիմոնադ', quantity: 1 },
      ],
      createdAt: at('16:50'),
      pickup: '17:40',
      accepted: { at: at('16:52'), by: aram, readyAt: at('17:35') },
      collected: { at: at('17:40'), by: aram },
    });
    add({
      at: at('18:05'),
      by: nare,
      device: 'console',
      category: 'settings',
      action: 'settings.menu-price',
      subject: { type: 'menuItem', id: `${branchId}-menu-tan` },
      items: ['Թան'],
      amount: 700,
      before: { priceAmd: 600 },
      after: { priceAmd: 700 },
      params: { name: 'Թան', priceAmd: 700, isAvailable: true },
    });
    booking({
      id: res('arman'),
      guest: 'Արման Գևորգյան',
      table: '9',
      start: '21:30',
      party: 3,
      requestedAt: at('17:57'),
      decided: { at: at('18:12'), by: 'system', approved: false },
    });
    takeaway({
      number: 482,
      guest: 'Կարեն Սարգսյան',
      totalAmd: 5_400,
      items: [
        { name: 'Լյուլյա քաբաբ', quantity: 1 },
        { name: 'Ամառային աղցան', quantity: 1 },
      ],
      createdAt: at('18:21'),
      pickup: '18:54',
      accepted: { at: at('18:22'), by: lilit, readyAt: at('18:54') },
    });
    bill({
      id: tab('t1-late'),
      table: '1',
      party: 2,
      server: lilit,
      seatAt: at('18:24'),
      seatDevice: 'phone',
      rounds: [
        {
          at: at('18:30'),
          lines: [
            [3, 1],
            [6, 1],
          ],
        },
      ],
    });
    bill({
      id: tab('t2'),
      table: '2',
      party: 2,
      server: aram,
      seatAt: at('18:27'),
      rounds: [
        {
          at: at('18:29'),
          device: 'hall',
          lines: [
            [11, 1],
            [0, 1],
            [3, 1],
            [1, 1],
            [10, 1],
          ],
        },
      ],
      discount: { at: at('18:31'), by: nare, percent: 10, reason: 'Մշտական հյուր' },
      calls: [{ at: at('18:34'), by: aram, reason: 'bill', seconds: 31 }],
    });
    const ani = bookings.get(`${tab('t6')}-booking`);
    add({
      at: at('18:31'),
      by: aram,
      device: 'phone',
      category: 'message',
      action: 'message.asked-on-my-way',
      subject: { type: 'reservation', id: res('ani') },
      table: '6',
      guest: 'Անի Մարտիրոսյան',
      params: { notified: true, startUtc: new Date(at('19:00')).toISOString() },
    });
    add({
      at: at('18:33'),
      by: { guest: 'Անի Մարտիրոսյան' },
      category: 'booking',
      action: 'booking.guest-answered',
      subject: { type: 'reservation', id: res('ani') },
      table: '6',
      guest: 'Անի Մարտիրոսյան',
      params: {
        localDate: today,
        localTime: '19:00',
        partySize: ani?.partySize ?? 4,
        status: 2,
        tableId: `${branchId}-table-6`,
        'extra.answer': 'late',
        'extra.minutes': 15,
      },
    });
    booking({
      id: res('lilit-m'),
      guest: 'Լիլիթ Մանուկյան',
      table: '7',
      start: '19:15',
      party: 2,
      requestedAt: at('18:31'),
      decided: { at: at('18:35'), by: aram, approved: true },
    });
    reply({
      at: at('18:36'),
      by: aram,
      guest: 'Անի Մարտիրոսյան',
      subject: { type: 'reservation', id: res('ani') },
      table: '6',
      text: 'Լավ, սպասում ենք',
      seconds: 180,
    });

    // --- The thirty days before ------------------------------------------------

    const roll = random(hash(branchId));
    const pick = <T>(list: readonly T[]): T => list[Math.floor(roll() * list.length)]!;
    const between = (low: number, high: number) => low + Math.floor(roll() * (high - low + 1));
    const servers = [aram, lilit, gor];
    const loads = [8, 6, 4];

    for (let back = 1; back <= 34; back += 1) {
      const date = addLocalDays(today, -back);
      const clock = (minute: number) => atClock(date, minute, zone);
      servers.forEach((server, serverIndex) => {
        if (server === lilit && back % 7 === 3) return; // a day off
        const tables = Math.max(1, loads[serverIndex]! + between(-2, 2));
        for (let n = 0; n < tables; n += 1) {
          const seat = between(12 * 60, 21 * 60);
          const rounds = Array.from({ length: between(1, 2) }, (_, round) => ({
            at: clock(seat + 4 + round * between(20, 40)),
            lines: Array.from(
              { length: between(1, 4) },
              () => [between(0, DISHES.length - 1), between(1, 2)] as const,
            ),
          }));
          const others = servers.filter((other) => other.id !== server.id);
          const transfer =
            roll() < 0.06 && others.length > 0
              ? { at: clock(seat + 15), to: pick(others) }
              : undefined;
          const closer = transfer?.to ?? server;
          const pay = {
            at: clock(seat + between(60, 110)),
            by: closer,
            tip: pick([0, 500, 1_000, 1_000, 2_000, 3_000]),
          };
          bill({
            id: `${branchId}-tab-${date}-${serverIndex}-${n}`,
            table: pick(TABLES),
            party: between(1, 6),
            guest: roll() < 0.3 ? pick(GUESTS) : null,
            server,
            seatAt: clock(seat),
            rounds,
            ...(transfer ? { transfer } : {}),
            ...(roll() < 0.06
              ? {
                  voids: [
                    {
                      at: clock(seat + 30),
                      by: nare,
                      round: 0,
                      line: 0,
                      reason: pick(VOID_REASONS),
                    },
                  ],
                }
              : {}),
            ...(roll() < 0.05
              ? {
                  discount: {
                    at: clock(seat + 50),
                    by: roll() < 0.7 ? nare : server,
                    percent: pick([5, 10, 15]),
                    reason: 'Մշտական հյուր',
                  },
                }
              : {}),
            ...(roll() < 0.55
              ? {
                  calls: [
                    {
                      at: clock(seat + 50),
                      by: closer,
                      reason: pick(['waiter', 'bill', 'water'] as const),
                      seconds: between(20, 200) * (serverIndex + 1),
                    },
                  ],
                }
              : {}),
            pay,
          });
        }
      });
      for (let n = 0; n < between(2, 5); n += 1) {
        const requested = between(9 * 60, 20 * 60);
        const decider = pick([aram, lilit, nare, aram, gor]);
        const system = roll() < 0.08;
        booking({
          id: `${branchId}-res-${date}-${n}`,
          guest: pick(GUESTS),
          table: pick(TABLES),
          start: `${pad(between(18, 21))}:${pick(['00', '15', '30', '45'])}`,
          party: between(2, 8),
          requestedAt: clock(requested),
          decided: system
            ? { at: clock(requested + 15), by: 'system', approved: false }
            : {
                at: clock(requested + between(1, 9)),
                by: decider,
                approved: roll() < 0.85,
                ...(roll() < 0.15 ? { reason: pick(DECLINE_REASONS) } : {}),
              },
        });
      }
      for (let n = 0; n < between(1, 4); n += 1) {
        const by = pick([aram, lilit, gor, aram]);
        const guest = pick(GUESTS);
        reply({
          at: clock(between(11 * 60, 21 * 60)),
          by,
          guest,
          subject: { type: 'reservation', id: `${branchId}-res-${date}-m${n}` },
          table: pick(TABLES),
          text: pick(REPLIES),
          seconds: between(40, 400),
        });
      }
      if (back % 6 === 0) {
        const dish = pick(DISHES);
        add({
          at: clock(between(10 * 60, 12 * 60)),
          by: cast.owner && back % 12 === 0 ? cast.owner : nare,
          device: 'console',
          category: 'settings',
          action: 'settings.menu-price',
          subject: { type: 'menuItem', id: `${branchId}-menu-${dish.name}` },
          items: [dish.name],
          amount: dish.price,
          before: { priceAmd: dish.price - 200 },
          after: { priceAmd: dish.price },
          params: { name: dish.name, priceAmd: dish.price, isAvailable: true },
        });
      }
    }

    records.sort((a, b) => compareActivityEntries(a.entry, b.entry));
    return { zone, records, bills, bookings, takeaways, people: cast.all };
  }

  function worldOf(branchId: string): World {
    let world = worlds.get(branchId);
    if (!world) {
      world = seed(branchId);
      worlds.set(branchId, world);
    }
    return world;
  }

  function matches(record: Rec, filters: ActivityFilters): boolean {
    if (record.day !== filters.date) return false;
    if (filters.category !== 'all' && record.entry.category !== filters.category) return false;
    if (filters.who.kind === 'system' && record.entry.actor.kind !== 'system') return false;
    if (
      filters.who.kind === 'staff' &&
      record.entry.actor.staffMemberId !== filters.who.staffMemberId
    ) {
      return false;
    }
    return matchesActivitySearch(record.entry, filters.q);
  }

  function refuse(
    url: string,
    violations: readonly {
      field: string;
      message: string;
      bound?: string | undefined;
      max?: number | undefined;
    }[],
  ): never {
    throw validationFailed(
      url,
      violations.map((violation) => ({
        field: violation.field,
        message: violation.message,
        ...(violation.bound !== undefined ? { bound: violation.bound } : {}),
        ...(violation.max !== undefined ? { max: violation.max } : {}),
      })),
    );
  }

  // --- Performance ------------------------------------------------------------

  interface Tally {
    tables: number;
    guests: number;
    sales: number;
    tips: number;
    calls: number[];
    replies: number[];
    approvals: number;
    declines: number;
    cash: number;
    cashPayments: number;
    discounts: number;
    comps: number;
    adjustments: number;
    voids: number;
  }

  const emptyTally = (): Tally => ({
    tables: 0,
    guests: 0,
    sales: 0,
    tips: 0,
    calls: [],
    replies: [],
    approvals: 0,
    declines: 0,
    cash: 0,
    cashPayments: 0,
    discounts: 0,
    comps: 0,
    adjustments: 0,
    voids: 0,
  });

  function figures(tally: Tally): PerformanceFigures {
    return {
      tables: tally.tables,
      guests: tally.guests,
      salesAmd: tally.sales,
      averageCheckAmd: tally.tables > 0 ? Math.round(tally.sales / tally.tables) : null,
      tipsAmd: tally.tips,
      callMedianSeconds: medianSeconds(tally.calls),
      callsClaimed: tally.calls.length,
      replyMedianSeconds: medianSeconds(tally.replies),
      messagesAnswered: tally.replies.length,
      approvals: tally.approvals,
      declines: tally.declines,
      cashAmd: tally.cash,
      cashPayments: tally.cashPayments,
      discounts: tally.discounts,
      comps: tally.comps,
      adjustmentsAmd: tally.adjustments,
      voids: tally.voids,
    };
  }

  /**
   * The server's rules (`docs/activity.md` §8), per person and for the branch
   * counted once: bills closed in the range, each total split over the
   * waiters who held its lines; the table and guests to each of them and the
   * closing waiter; the tip to the closing waiter; cash, discounts, voids,
   * calls, replies and decisions to whoever did them, in the range.
   */
  function tallies(
    world: World,
    range: PerformanceRange,
  ): { readonly people: Map<string, Tally>; readonly branch: Tally; readonly takeawayAmd: number } {
    const people = new Map<string, Tally>();
    const branch = emptyTally();
    let takeawayAmd = 0;
    const of = (id: string) => {
      let tally = people.get(id);
      if (!tally) {
        tally = emptyTally();
        people.set(id, tally);
      }
      return tally;
    };
    const inRange = (day: string) => day >= range.from && day <= range.to;
    for (const bill of world.bills.values()) {
      if (bill.closedAtMs === null || !inRange(dayOf(bill.closedAtMs, world.zone))) continue;
      const weights = new Map<string, number>();
      for (const line of bill.lines) {
        if (line.voided || !line.serverStaffMemberId) continue;
        weights.set(
          line.serverStaffMemberId,
          (weights.get(line.serverStaffMemberId) ?? 0) + line.lineTotalAmd,
        );
      }
      const closer = bill.owners.at(-1)!.person.id;
      const shares = split(
        bill.paidAmd,
        [...weights].map(([id, weight]) => ({ id, weight })),
        closer,
      );
      const holders = new Set([...shares.keys(), closer]);
      for (const id of holders) {
        const tally = of(id);
        tally.sales += shares.get(id) ?? 0;
        tally.tables += 1;
        tally.guests += bill.partySize;
      }
      of(closer).tips += bill.tipAmd;
      if (bill.paidByPerson) {
        of(bill.paidByPerson.id).cash += bill.paidAmd;
        of(bill.paidByPerson.id).cashPayments += 1;
      }
      branch.tables += 1;
      branch.guests += bill.partySize;
      branch.sales += bill.paidAmd;
      branch.tips += bill.tipAmd;
      branch.cash += bill.paidAmd;
      branch.cashPayments += 1;
    }
    for (const order of world.takeaways.values()) {
      if (!order.collectedAtUtc || !order.collectedBy) continue;
      if (!inRange(dayOf(Date.parse(order.collectedAtUtc), world.zone))) continue;
      of(order.collectedBy.id).cash += order.paidAmd ?? 0;
      of(order.collectedBy.id).cashPayments += 1;
      branch.cash += order.paidAmd ?? 0;
      branch.cashPayments += 1;
      takeawayAmd += order.paidAmd ?? 0;
    }
    for (const record of world.records) {
      if (!inRange(record.day)) continue;
      const id = record.entry.actor.staffMemberId;
      if (!id) continue;
      // Only what counts makes a row: the kitchen's moves are nobody's numbers.
      const both = (apply: (one: Tally) => void) => {
        apply(of(id));
        apply(branch);
      };
      switch (record.entry.action) {
        case 'table.call-claimed':
          if (record.entry.seconds !== null) {
            const seconds = record.entry.seconds;
            both((one) => one.calls.push(seconds));
          }
          break;
        case 'message.sent':
          if (record.entry.seconds !== null) {
            const seconds = record.entry.seconds;
            both((one) => one.replies.push(seconds));
          }
          break;
        case 'booking.approved':
          both((one) => (one.approvals += 1));
          break;
        case 'booking.declined':
          both((one) => (one.declines += 1));
          break;
        case 'payment.discount':
          both((one) => {
            one.discounts += 1;
            one.adjustments += record.entry.amountAmd ?? 0;
          });
          break;
        case 'payment.comp':
          both((one) => {
            one.comps += 1;
            one.adjustments += record.entry.amountAmd ?? 0;
          });
          break;
        case 'order.line-voided':
          both((one) => (one.voids += 1));
          break;
      }
    }
    return { people, branch, takeawayAmd };
  }

  function recentOf(
    world: World,
    staffMemberId: string,
    range: PerformanceRange,
    list: StaffRecentList,
    cursor: string | null,
    url: string,
  ): StaffRecentPage {
    const all = world.records.filter(
      (record) =>
        record.entry.actor.staffMemberId === staffMemberId &&
        record.day >= range.from &&
        record.day <= range.to &&
        RECENT[list].includes(record.entry.action),
    );
    let start = 0;
    if (cursor) {
      const at = all.findIndex((record) => record.entry.id === cursor);
      if (at < 0) {
        refuse(url, [
          {
            field: 'cursor',
            message: 'That cursor was not issued by this list. Start again without it.',
            bound: 'required',
          },
        ]);
      }
      start = at + 1;
    }
    const page = all.slice(start, start + STAFF_RECENT_PAGE_SIZE);
    return {
      list,
      items: page.map((record) => record.entry),
      nextCursor: start + page.length < all.length ? (page.at(-1)?.entry.id ?? null) : null,
    };
  }

  /** Everybody with anything in the range, and every waiter and manager with nothing. */
  function rowsOf(world: World, range: PerformanceRange): StaffPerformanceRow[] {
    const counted = tallies(world, range).people;
    return world.people
      .filter(
        (person) => counted.has(person.id) || person.role === 'waiter' || person.role === 'manager',
      )
      .map((person) => ({
        ...figures(counted.get(person.id) ?? emptyTally()),
        staffMemberId: person.id,
        name: person.name,
        role: person.role,
        isActive: true,
      }))
      .sort((a, b) => b.salesAmd - a.salesAmd);
  }

  function totalsOf(world: World, range: PerformanceRange): StaffPerformanceTotals {
    const { branch, takeawayAmd } = tallies(world, range);
    return { ...figures(branch), unattributedSalesAmd: 0, takeawayAmd };
  }

  function peopleOf(entries: readonly ActivityEntry[], world: World): ActivityPerson[] {
    const out: ActivityPerson[] = [];
    for (const entry of entries) {
      const id = entry.actor.staffMemberId;
      if (!id || out.some((one) => one.staffMemberId === id)) continue;
      const now = world.people.find((person) => person.id === id);
      out.push({ staffMemberId: id, name: now?.name ?? entry.actor.name });
    }
    return out;
  }

  const csvNumber = (value: number | null) => (value === null ? null : value);
  const json = (value: unknown) =>
    value === null || value === undefined ? '' : JSON.stringify(value);

  return {
    list(url: string, branchId: string, query: ActivityQuery): ActivityPage {
      const world = worldOf(branchId);
      const today = branchDayKey(options.now(), world.zone);
      const violations = [...activityViolations(query, today)];
      let start = 0;
      if (query.cursor) {
        const at = world.records.findIndex((record) => record.entry.id === query.cursor);
        if (at < 0) {
          violations.push({
            field: 'cursor',
            message: 'That cursor was not issued by this list. Start again without it.',
            bound: 'required',
          });
        } else {
          start = at + 1;
        }
      }
      if (violations.length > 0) refuse(url, violations);
      const limit = query.limit ?? ACTIVITY_PAGE_SIZE;
      const items: ActivityEntry[] = [];
      let nextCursor: string | null = null;
      for (let index = start; index < world.records.length; index += 1) {
        const record = world.records[index]!;
        if (!matches(record, query)) continue;
        if (items.length === limit) {
          nextCursor = items.at(-1)!.id;
          break;
        }
        items.push(record.entry);
      }
      return { items, nextCursor };
    },

    /** The server's columns (`exportBranchActivity`), newest first. */
    csv(branchId: string, filters: ActivityFilters): ReportExport {
      const world = worldOf(branchId);
      const rows = world.records
        .filter((record) => matches(record, filters))
        .map(({ entry }) => [
          entry.local,
          entry.actor.kind,
          entry.actor.name,
          entry.device.label,
          entry.category,
          entry.action,
          SUBJECT_WORD[entry.subject.type],
          entry.subject.id,
          entry.subject.code ?? null,
          entry.tableLabel,
          entry.guestName,
          entry.itemNames,
          csvNumber(entry.amountAmd),
          entry.isMoney ? 'true' : 'false',
          csvNumber(entry.seconds),
          entry.reason,
          json(entry.before),
          json(entry.after),
          json(entry.params),
        ]);
      return csv(
        `activity-${filters.date}-to-${filters.date}.csv`,
        [
          'local',
          'actorKind',
          'actorName',
          'deviceLabel',
          'category',
          'action',
          'subjectType',
          'subjectId',
          'subjectCode',
          'tableLabel',
          'guestName',
          'items',
          'amountAmd',
          'isMoney',
          'seconds',
          'reason',
          'before',
          'after',
          'summary',
        ],
        rows,
      );
    },

    timeline(
      branchId: string,
      subject: { readonly type: ActivitySubjectType; readonly id: string },
    ): ActivityTimeline | null {
      const world = worldOf(branchId);
      const bill = subject.type === 'tab' ? world.bills.get(subject.id) : undefined;
      const booking = subject.type === 'reservation' ? world.bookings.get(subject.id) : undefined;
      const order = subject.type === 'takeaway' ? world.takeaways.get(subject.id) : undefined;
      // A bill's timeline is every entry of its sitting: the seat came before the tab.
      const entries = world.records
        .filter((record) =>
          bill
            ? record.entry.tableSessionId === bill.sessionId
            : record.entry.subject.type === subject.type && record.entry.subject.id === subject.id,
        )
        .map((record) => record.entry)
        .reverse();
      if (entries.length === 0 && !bill && !booking && !order) return null;
      const servers = (bill?.owners ?? []).map((owner) => ({
        staffMemberId: owner.person.id,
        name: owner.person.name,
        fromUtc: new Date(owner.atMs).toISOString(),
      }));
      const lines = (bill?.lines ?? []).map(({ addedAtMs: _addedAtMs, ...line }) => line);
      const linesAmd = lines
        .filter((line) => !line.voided)
        .reduce((sum, line) => sum + line.lineTotalAmd, 0);
      return {
        subject,
        tab: bill
          ? {
              tabId: bill.id,
              tableSessionId: bill.sessionId,
              tableLabel: bill.tableLabel,
              partySize: bill.partySize,
              openedAtUtc: new Date(bill.openedAtMs).toISOString(),
              seatedAtUtc: new Date(bill.openedAtMs).toISOString(),
              closedAtUtc: bill.closedAtMs ? new Date(bill.closedAtMs).toISOString() : null,
              status: bill.closedAtMs ? 'closed' : 'open',
              subtotalAmd: linesAmd - bill.discountAmd,
              serviceChargeAmd: bill.serviceChargeAmd,
              totalAmd: linesAmd - bill.discountAmd + bill.serviceChargeAmd,
              paidAmd: bill.paidAmd,
              tipsAmd: bill.tipAmd,
              servers,
            }
          : null,
        booking: booking ?? null,
        takeaway: order ? (({ collectedBy: _collectedBy, ...header }) => header)(order) : null,
        lines,
        entries,
        people: peopleOf(entries, world),
      };
    },

    performance(branchId: string, range: PerformanceRange): StaffPerformance {
      const world = worldOf(branchId);
      return { ...range, rows: rowsOf(world, range), totals: totalsOf(world, range) };
    },

    /** The server's columns (`exportStaffPerformance`): one row per person, then `totals`. */
    performanceCsv(branchId: string, range: PerformanceRange): ReportExport {
      const world = worldOf(branchId);
      const cells = (f: PerformanceFigures) => [
        f.tables,
        f.guests,
        f.salesAmd,
        f.averageCheckAmd ?? 0,
        f.tipsAmd,
        f.callsClaimed,
        csvNumber(f.callMedianSeconds),
        f.messagesAnswered,
        csvNumber(f.replyMedianSeconds),
        f.approvals,
        f.declines,
        f.cashAmd,
        f.cashPayments,
        f.discounts,
        f.comps,
        f.adjustmentsAmd,
        f.voids,
      ];
      const roleCode: Readonly<Record<StaffRole, number>> = {
        owner: 1,
        manager: 2,
        waiter: 3,
        kitchen: 4,
        generalManager: 6,
      };
      const rows = [
        ...rowsOf(world, range).map((row) => [
          row.staffMemberId,
          row.name,
          roleCode[row.role] ?? 0,
          ...cells(row),
        ]),
        ['totals', '', '', ...cells(totalsOf(world, range))],
      ];
      return csv(
        `staff-results-${range.from}-to-${range.to}.csv`,
        [
          'staffMemberId',
          'name',
          'role',
          'tables',
          'guests',
          'salesAmd',
          'averageCheckAmd',
          'tipsAmd',
          'callsClaimed',
          'callClaimMedianSeconds',
          'messagesAnswered',
          'messageReplyMedianSeconds',
          'approvals',
          'declines',
          'cashAmd',
          'cashPayments',
          'discounts',
          'comps',
          'adjustmentsAmd',
          'voids',
        ],
        rows,
      );
    },

    member(
      url: string,
      branchId: string,
      staffMemberId: string,
      range: PerformanceRange,
    ): StaffMemberPerformance | null {
      const world = worldOf(branchId);
      const person = world.people.find((candidate) => candidate.id === staffMemberId);
      if (!person) return null;
      // A week ending on `to` at least: six days before it, or `from` when earlier.
      const weekStart = addLocalDays(range.to, -6);
      const first = range.from < weekStart ? range.from : weekStart;
      const daily: DailySales[] = [];
      for (let date = first; date <= range.to; date = addLocalDays(date, 1)) {
        const tally = tallies(world, { from: date, to: date }).people.get(staffMemberId);
        daily.push({ date, salesAmd: tally?.sales ?? 0, tables: tally?.tables ?? 0 });
        if (daily.length > 400) break;
      }
      return {
        ...range,
        staffMemberId,
        name: person.name,
        role: person.role,
        isActive: true,
        figures: figures(tallies(world, range).people.get(staffMemberId) ?? emptyTally()),
        daily,
        recent: recentOf(world, staffMemberId, range, 'orders', null, url),
      };
    },

    recent(
      url: string,
      branchId: string,
      staffMemberId: string,
      range: PerformanceRange,
      list: StaffRecentList,
      cursor: string | null,
    ): StaffRecentPage {
      return recentOf(worldOf(branchId), staffMemberId, range, list, cursor, url);
    },
  };
}

export type MockActivity = ReturnType<typeof createMockActivity>;
