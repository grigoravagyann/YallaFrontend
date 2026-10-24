import { branchDayKey, instantFromZonedClock, zonedParts, type TimeZone } from '@yalla/format';
import {
  ACTIVITY_PAGE_SIZE,
  STAFF_RECENT_PAGE_SIZE,
  activityViolations,
  compareActivityEntries,
  matchesActivitySearch,
  medianSeconds,
  type ActivityActor,
  type ActivityBillItem,
  type ActivityCategory,
  type ActivityEntry,
  type ActivityFilters,
  type ActivityPage,
  type ActivityParams,
  type ActivityPerson,
  type ActivityQuery,
  type ActivitySubject,
  type ActivitySubjectType,
  type ActivityTimeline,
  type DailySales,
  type PerformanceFigures,
  type PerformanceRange,
  type StaffMemberPerformance,
  type StaffPerformance,
  type StaffPerformanceRow,
  type StaffRecentItem,
  type StaffRecentList,
  type StaffRecentPage,
} from '../contracts/activity';
import type { StaffRole } from '../contracts/console';
import { addLocalDays } from '../contracts/messageHistory';
import type { ReportExport } from '../contracts/reports';
import type { StaffMember } from '../contracts/staff';
import { validationFailed } from './problems';

/**
 * Activity history and staff results for the console mock (2026-10-24): a
 * month of a branch's floor, seeded once per branch relative to the mock's
 * clock, deterministic (a PRNG keyed by the branch id) so a reload and a test
 * see the same history.
 *
 * Today is the boards' own day, moved so its last entry is two minutes ago:
 * table 4's bill that Lilit seated, handed to Aram at the end of her shift,
 * with a dish the manager voided and paid in cash with a tip (the Check
 * board); a 10 % discount, a booking SHURJ declined because nobody answered
 * in 15 minutes, a price change from the console, takeaway T-482 accepted,
 * guests' messages answered and calls claimed. The thirty days before it are
 * generated: every waiter's tables, orders, payments, calls and replies,
 * the odd transfer, void and discount.
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
  readonly responseSeconds: number | null;
}

interface Bill {
  readonly id: string;
  readonly tableLabel: string;
  readonly partySize: number;
  readonly guestName: string | null;
  readonly openedAtMs: number;
  closedAtMs: number | null;
  /** Owners in time order: who seated it, then every transfer. */
  readonly owners: { readonly atMs: number; readonly person: Person }[];
  readonly items: (ActivityBillItem & { readonly addedAtMs: number })[];
  discountAmd: number;
  discountBy: Person | null;
  serviceChargeAmd: number;
  paidAmd: number;
  tipAmd: number;
  paidBy: 'cash' | 'card' | null;
  paidByPerson: Person | null;
}

interface World {
  readonly zone: TimeZone;
  /** Newest first. */
  readonly records: Rec[];
  readonly bills: Map<string, Bill>;
  readonly people: readonly Person[];
}

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

export function createMockActivity(options: MockActivityOptions) {
  const worlds = new Map<string, World>();

  function zoneOf(branchId: string): TimeZone {
    return (options.timeZoneOf(branchId) ?? 'Asia/Yerevan') as TimeZone;
  }

  function dayOf(ms: number, zone: TimeZone): string {
    const parts = zonedParts(new Date(ms), zone);
    return `${parts.year}-${pad(parts.month)}-${pad(parts.day)}`;
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
      phone: `Հեռախոս · ${firstName(member.fullName)}`,
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
    let sequence = 0;

    const devices = {
      hall: { id: `${branchId}-dev-hall`, label: 'Սրահի պլանշետ' },
      kitchen: { id: `${branchId}-dev-kitchen`, label: 'Խոհանոցի պլանշետ' },
    };

    function deviceFor(key: DeviceKey, who: Person | null) {
      switch (key) {
        case 'hall':
          return { ...devices.hall, isConsole: false };
        case 'kitchen':
          return { ...devices.kitchen, isConsole: false };
        case 'phone':
          return who
            ? { id: `${branchId}-dev-phone-${who.id}`, label: who.phone, isConsole: false }
            : { id: null, label: '', isConsole: false };
        case 'console':
          return { id: null, label: 'Console', isConsole: true };
        default:
          return { id: null, label: '', isConsole: false };
      }
    }

    interface Add {
      readonly at: number;
      readonly by: Person | 'system' | { readonly guest: string };
      readonly device?: DeviceKey;
      readonly category: ActivityCategory;
      readonly action: string;
      readonly subject: { readonly type: ActivitySubjectType; readonly id: string | null };
      readonly table?: string | null;
      readonly guest?: string | null;
      readonly amount?: number | null;
      readonly money?: boolean;
      readonly before?: ActivityParams | null;
      readonly after?: ActivityParams | null;
      readonly reason?: string | null;
      readonly params?: ActivityParams;
      readonly response?: number | null;
    }

    function add(input: Add): void {
      if (input.at > now) return;
      sequence += 1;
      const actor: ActivityActor =
        input.by === 'system'
          ? { kind: 'system', staffMemberId: null, name: '' }
          : 'guest' in input.by
            ? { kind: 'diner', staffMemberId: null, name: input.by.guest }
            : { kind: 'staff', staffMemberId: input.by.id, name: input.by.name };
      const who = typeof input.by === 'object' && !('guest' in input.by) ? input.by : null;
      const entry: ActivityEntry = {
        id: `${branchId}-act-${String(sequence).padStart(6, '0')}`,
        occurredAtUtc: new Date(input.at).toISOString(),
        actor,
        device: deviceFor(input.device ?? (who ? 'hall' : 'none'), who),
        category: input.category,
        action: input.action,
        subject: input.subject,
        tableLabel: input.table ?? null,
        guestName: input.guest ?? null,
        amountAmd: input.amount ?? null,
        isMoney: input.money ?? false,
        before: input.before ?? null,
        after: input.after ?? null,
        reason: input.reason ?? null,
        params: input.params ?? {},
      };
      records.push({ entry, day: dayOf(input.at, zone), responseSeconds: input.response ?? null });
    }

    // --- A bill, step by step -------------------------------------------------

    interface BillPlan {
      readonly id: string;
      readonly table: string;
      readonly party: number;
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
      readonly transfer?: {
        readonly at: number;
        readonly to: Person;
        readonly reason?: string;
        readonly device?: DeviceKey;
      };
      readonly ready?: readonly {
        readonly at: number;
        readonly round: number;
        readonly line: number;
      }[];
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
        readonly reason: 'waiter' | 'bill' | 'water' | 'napkins';
        readonly seconds: number;
        readonly device?: DeviceKey;
      }[];
      readonly pay?: {
        readonly at: number;
        readonly by: Person;
        readonly device?: DeviceKey;
        readonly method: 'cash' | 'card';
        readonly tip: number;
        readonly service?: number;
      };
    }

    function bill(plan: BillPlan): void {
      const record: Bill = {
        id: plan.id,
        tableLabel: plan.table,
        partySize: plan.party,
        guestName: plan.guest ?? null,
        openedAtMs: plan.seatAt,
        closedAtMs: null,
        owners: [{ atMs: plan.seatAt, person: plan.server }],
        items: [],
        discountAmd: 0,
        discountBy: null,
        serviceChargeAmd: 0,
        paidAmd: 0,
        tipAmd: 0,
        paidBy: null,
        paidByPerson: null,
      };
      if (plan.seatAt > now) return;
      bills.set(plan.id, record);
      const subject = { type: 'tab' as const, id: plan.id };
      const table = plan.table;
      add({
        at: plan.seatAt,
        by: plan.server,
        device: plan.seatDevice ?? 'hall',
        category: 'table',
        action: 'table.seated',
        subject,
        table,
        guest: plan.guest ?? null,
        params: { partySize: plan.party, fromBooking: Boolean(plan.guest) },
      });
      if (plan.transfer && plan.transfer.at <= now) {
        record.owners.push({ atMs: plan.transfer.at, person: plan.transfer.to });
      }
      const ownerAt = (at: number): Person =>
        [...record.owners].reverse().find((owner) => owner.atMs <= at)?.person ?? plan.server;
      plan.rounds.forEach((round, roundIndex) => {
        if (round.at > now) return;
        const by = round.by ?? ownerAt(round.at);
        let amount = 0;
        let count = 0;
        round.lines.forEach(([dish, quantity], lineIndex) => {
          const meal = DISHES[dish % DISHES.length]!;
          record.items.push({
            lineId: `${plan.id}-l${roundIndex}-${lineIndex}`,
            name: meal.name,
            quantity,
            amountAmd: meal.price * quantity,
            addedBy: { staffMemberId: by.id, name: by.name },
            voided: false,
            voidedBy: null,
            voidReason: null,
            comped: false,
            addedAtMs: round.at,
          });
          amount += meal.price * quantity;
          count += quantity;
        });
        add({
          at: round.at,
          by,
          device: round.device ?? 'phone',
          category: 'order',
          action: 'order.sent',
          subject,
          table,
          amount,
          params: {
            itemCount: count,
            ...(round.lines.length === 1
              ? { itemName: DISHES[round.lines[0]![0] % DISHES.length]!.name }
              : {}),
            ...(round.preOrder ? { preOrder: true } : {}),
          },
        });
      });
      if (plan.transfer && plan.transfer.at <= now) {
        const from = record.owners[record.owners.length - 2]!.person;
        add({
          at: plan.transfer.at,
          by: from,
          device: plan.transfer.device ?? 'phone',
          category: 'table',
          action: 'table.transferred',
          subject,
          table,
          reason: plan.transfer.reason ?? null,
          params: {
            fromName: from.name,
            toName: plan.transfer.to.name,
            toStaffMemberId: plan.transfer.to.id,
          },
        });
      }
      for (const ready of plan.ready ?? []) {
        const item = record.items.find(
          (line) => line.lineId === `${plan.id}-l${ready.round}-${ready.line}`,
        );
        if (!item) continue;
        add({
          at: ready.at,
          by: cast.kitchen,
          device: 'kitchen',
          category: 'order',
          action: 'order.ready',
          subject,
          table,
          params: { itemName: item.name },
        });
      }
      for (const voided of plan.voids ?? []) {
        if (voided.at > now) continue;
        const index = record.items.findIndex(
          (line) => line.lineId === `${plan.id}-l${voided.round}-${voided.line}`,
        );
        const item = record.items[index];
        if (!item) continue;
        record.items[index] = {
          ...item,
          voided: true,
          voidedBy: { staffMemberId: voided.by.id, name: voided.by.name },
          voidReason: voided.reason,
        };
        add({
          at: voided.at,
          by: voided.by,
          device: voided.device ?? 'console',
          category: 'order',
          action: 'order.lineVoided',
          subject,
          table,
          amount: item.amountAmd,
          money: true,
          before: { quantity: item.quantity, itemName: item.name, amountAmd: item.amountAmd },
          after: { voided: true },
          reason: voided.reason,
          params: { itemName: item.name, quantity: item.quantity },
        });
      }
      const live = () =>
        record.items.filter((line) => !line.voided).reduce((sum, line) => sum + line.amountAmd, 0);
      if (plan.discount && plan.discount.at <= now) {
        const before = live();
        const discount = Math.round((before * plan.discount.percent) / 100);
        record.discountAmd = discount;
        record.discountBy = plan.discount.by;
        add({
          at: plan.discount.at,
          by: plan.discount.by,
          device: plan.discount.device ?? 'hall',
          // Money off the bill: the board files it under "Payment & discount".
          category: 'payment',
          action: 'order.discounted',
          subject,
          table,
          amount: discount,
          money: true,
          before: { amountAmd: before },
          after: { amountAmd: before - discount },
          reason: plan.discount.reason,
          params: { percent: plan.discount.percent },
        });
      }
      for (const call of plan.calls ?? []) {
        if (call.at > now) continue;
        add({
          at: call.at,
          by: call.by,
          device: call.device ?? 'phone',
          category: 'table',
          action: 'table.callClaimed',
          subject,
          table,
          params: { reason: call.reason, seconds: call.seconds },
          response: call.seconds,
        });
      }
      if (plan.pay && plan.pay.at <= now) {
        record.serviceChargeAmd = plan.pay.service ?? 0;
        record.paidAmd = live() - record.discountAmd + record.serviceChargeAmd;
        record.tipAmd = plan.pay.tip;
        record.paidBy = plan.pay.method;
        record.paidByPerson = plan.pay.by;
        record.closedAtMs = plan.pay.at;
        add({
          at: plan.pay.at,
          by: plan.pay.by,
          device: plan.pay.device ?? 'phone',
          category: 'payment',
          action: plan.pay.method === 'cash' ? 'payment.cash' : 'payment.card',
          subject,
          table,
          amount: record.paidAmd,
          money: true,
          params: { tipAmd: plan.pay.tip },
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
      const subject = { type: 'reservation' as const, id: input.id };
      const params = { startLocal: input.start, partySize: input.party };
      add({
        at: input.requestedAt,
        by: { guest: input.guest },
        category: 'booking',
        action: 'booking.requested',
        subject,
        table: input.table,
        guest: input.guest,
        params,
      });
      const decided = input.decided;
      if (!decided) return;
      const seconds = Math.round((decided.at - input.requestedAt) / 1000);
      add({
        at: decided.at,
        by: decided.by,
        device: decided.device ?? 'phone',
        category: 'booking',
        action:
          decided.by === 'system'
            ? 'booking.autoDeclined'
            : decided.approved
              ? 'booking.approved'
              : 'booking.declined',
        subject,
        table: input.table,
        guest: input.guest,
        reason: decided.reason ?? null,
        params: decided.by === 'system' ? { ...params, minutes: 15 } : params,
        response: decided.by === 'system' ? null : seconds,
      });
    }

    function reply(input: {
      readonly at: number;
      readonly by: Person;
      readonly guest: string;
      readonly subject: ActivitySubject;
      readonly table?: string | null;
      readonly code?: string;
      readonly text: string;
      readonly seconds: number;
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
        params: { text: input.text, ...(input.code ? { code: input.code } : {}) },
        response: input.seconds,
      });
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
      action: 'settings.menuAvailability',
      subject: { type: 'menuItem', id: `${branchId}-menu-gata` },
      before: { available: true },
      after: { available: false },
      params: { itemName: 'Գաթա', available: false },
    });
    add({
      at: at('16:00'),
      by: nare,
      device: 'console',
      category: 'staff',
      action: 'staff.pinSet',
      subject: { type: 'staffMember', id: gor.id },
      params: { staffName: gor.name },
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
      pay: { at: at('17:05'), by: aram, method: 'cash', tip: 1_000 },
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
      pay: { at: at('17:35'), by: lilit, method: 'card', tip: 800 },
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
      subject: { type: 'takeaway', id: `${branchId}-tk-${today}-485` },
      code: 'T-485',
      text: 'Այո, կարող եք',
      seconds: 60,
    });
    // Table 4: the Check board.
    bill({
      id: tab('t4'),
      table: '4',
      party: 4,
      guest: 'Տաթև Հովհաննիսյան',
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
      ...(lilit.id !== aram.id
        ? { transfer: { at: at('17:40'), to: aram, reason: 'Հերթափոխի ավարտ' } }
        : {}),
      ready: [{ at: at('17:52'), round: 1, line: 1 }],
      voids: [{ at: at('18:15'), by: nare, round: 1, line: 0, reason: 'Հյուրը փոխեց պատվերը' }],
      calls: [
        { at: at('18:02'), by: aram, reason: 'waiter', seconds: 55 },
        { at: at('18:16'), by: aram, reason: 'bill', seconds: 31 },
      ],
      pay: { at: at('18:20'), by: aram, method: 'cash', tip: 2_000, service: 1_000 },
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
      pay: { at: at('18:10'), by: gor, method: 'card', tip: 500 },
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
      calls: [{ at: at('17:30'), by: aram, reason: 'waiter', seconds: 80 }],
    });
    add({
      at: at('17:40'),
      by: aram,
      device: 'phone',
      category: 'takeaway',
      action: 'takeaway.collected',
      subject: { type: 'takeaway', id: `${branchId}-tk-${today}-478` },
      amount: 4_100,
      money: true,
      params: { code: 'T-478', paidBy: 'cash' },
    });
    add({
      at: at('18:05'),
      by: nare,
      device: 'console',
      category: 'settings',
      action: 'settings.menuPrice',
      subject: { type: 'menuItem', id: `${branchId}-menu-tan` },
      before: { priceAmd: 600 },
      after: { priceAmd: 700 },
      params: { itemName: 'Թան' },
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
    add({
      at: at('18:22'),
      by: lilit,
      device: 'phone',
      category: 'takeaway',
      action: 'takeaway.accepted',
      subject: { type: 'takeaway', id: `${branchId}-tk-${today}-482` },
      guest: 'Կարեն Սարգսյան',
      amount: 5_400,
      params: { code: 'T-482', readyLocal: '18:54' },
      response: 50,
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
    add({
      at: at('18:31'),
      by: aram,
      device: 'phone',
      category: 'message',
      action: 'message.askedComing',
      subject: { type: 'reservation', id: res('ani') },
      table: '6',
      guest: 'Անի Մարտիրոսյան',
    });
    add({
      at: at('18:33'),
      by: { guest: 'Անի Մարտիրոսյան' },
      category: 'booking',
      action: 'booking.onMyWay',
      subject: { type: 'reservation', id: res('ani') },
      table: '6',
      guest: 'Անի Մարտիրոսյան',
      params: { runningLateMinutes: 15 },
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
          const seat = between(12 * 60, 22 * 60);
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
              ? { at: clock(seat + 45), to: pick(others) }
              : undefined;
          const closer = transfer?.to ?? server;
          const pay = {
            at: clock(seat + between(60, 110)),
            by: closer,
            method: roll() < 0.6 ? ('cash' as const) : ('card' as const),
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
            ...(transfer ? { transfer: { ...transfer, reason: 'Հերթափոխի ավարտ' } } : {}),
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
          action: 'settings.menuPrice',
          subject: { type: 'menuItem', id: `${branchId}-menu-${dish.name}` },
          before: { priceAmd: dish.price - 200 },
          after: { priceAmd: dish.price },
          params: { itemName: dish.name },
        });
      }
    }

    records.sort((a, b) => compareActivityEntries(a.entry, b.entry));
    return { zone, records, bills, people: cast.all };
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
    cash: number;
    cashBills: number;
    discounts: number;
  }

  const emptyTally = (): Tally => ({
    tables: 0,
    guests: 0,
    sales: 0,
    tips: 0,
    calls: [],
    replies: [],
    approvals: 0,
    cash: 0,
    cashBills: 0,
    discounts: 0,
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
      cashAmd: tally.cash,
      cashBills: tally.cashBills,
      discountsAndComps: tally.discounts,
    };
  }

  /**
   * The rules: a line's sales go to the table's waiter when it was added; the
   * table, its guests and its tip to the waiter it ended with; the discount
   * comes off the waiter it ended with too.
   */
  function tallies(world: World, range: PerformanceRange): Map<string, Tally> {
    const out = new Map<string, Tally>();
    const of = (id: string) => {
      let tally = out.get(id);
      if (!tally) {
        tally = emptyTally();
        out.set(id, tally);
      }
      return tally;
    };
    const inRange = (day: string) => day >= range.from && day <= range.to;
    for (const bill of world.bills.values()) {
      if (!inRange(dayOf(bill.openedAtMs, world.zone))) continue;
      const ownerAt = (ms: number) =>
        [...bill.owners].reverse().find((owner) => owner.atMs <= ms)?.person ??
        bill.owners[0]!.person;
      for (const item of bill.items) {
        if (!item.voided) of(ownerAt(item.addedAtMs).id).sales += item.amountAmd;
      }
      const last = bill.owners.at(-1)!.person;
      const final = of(last.id);
      final.tables += 1;
      final.guests += bill.partySize;
      final.tips += bill.tipAmd;
      final.sales -= bill.discountAmd;
    }
    for (const record of world.records) {
      if (!inRange(record.day)) continue;
      const id = record.entry.actor.staffMemberId;
      if (!id) continue;
      const tally = of(id);
      switch (record.entry.action) {
        case 'table.callClaimed':
          if (record.responseSeconds !== null) tally.calls.push(record.responseSeconds);
          break;
        case 'message.sent':
          if (record.responseSeconds !== null) tally.replies.push(record.responseSeconds);
          break;
        case 'booking.approved':
        case 'takeaway.accepted':
          tally.approvals += 1;
          break;
        case 'payment.cash':
          tally.cash += record.entry.amountAmd ?? 0;
          tally.cashBills += 1;
          break;
        case 'order.discounted':
        case 'order.comped':
          tally.discounts += 1;
          break;
      }
    }
    return out;
  }

  const RECENT: Readonly<Record<StaffRecentList, readonly string[]>> = {
    orders: ['order.sent', 'payment.cash', 'payment.card'],
    messages: ['message.sent', 'message.askedComing'],
    bookings: ['booking.approved', 'booking.declined', 'booking.created', 'takeaway.accepted'],
    cash: ['payment.cash', 'takeaway.collected'],
    calls: ['table.callClaimed'],
  };

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
          { field: 'cursor', message: 'That cursor was not issued here.', bound: 'required' },
        ]);
      }
      start = at + 1;
    }
    const page = all.slice(start, start + STAFF_RECENT_PAGE_SIZE);
    const items: StaffRecentItem[] = page.map((record) => ({
      ...record.entry,
      responseSeconds: record.responseSeconds,
    }));
    return {
      items,
      total: all.length,
      nextCursor: start + page.length < all.length ? (page.at(-1)?.entry.id ?? null) : null,
    };
  }

  function rowsOf(world: World, range: PerformanceRange): StaffPerformanceRow[] {
    const counted = tallies(world, range);
    return world.people
      .filter((person) => person.role !== 'kitchen' && counted.has(person.id))
      .map((person) => ({
        ...figures(counted.get(person.id)!),
        staffMemberId: person.id,
        name: person.name,
        role: person.role,
      }))
      .sort((a, b) => b.salesAmd - a.salesAmd);
  }

  function totalsOf(world: World, range: PerformanceRange): PerformanceFigures {
    const total = emptyTally();
    for (const [id, tally] of tallies(world, range)) {
      if (!world.people.some((person) => person.id === id && person.role !== 'kitchen')) continue;
      total.tables += tally.tables;
      total.guests += tally.guests;
      total.sales += tally.sales;
      total.tips += tally.tips;
      total.calls.push(...tally.calls);
      total.replies.push(...tally.replies);
      total.approvals += tally.approvals;
      total.cash += tally.cash;
      total.cashBills += tally.cashBills;
      total.discounts += tally.discounts;
    }
    return figures(total);
  }

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

    csv(branchId: string, filters: ActivityFilters): ReportExport {
      const world = worldOf(branchId);
      const rows = world.records
        .filter((record) => matches(record, filters))
        .map((record) => {
          const entry = record.entry;
          return [
            entry.occurredAtUtc,
            entry.actor.kind,
            entry.actor.name,
            entry.device.label,
            entry.category,
            entry.action,
            entry.tableLabel,
            entry.guestName,
            entry.amountAmd,
            entry.reason,
          ];
        });
      return csv(
        `activity-${filters.date}.csv`,
        [
          'occurredAtUtc',
          'actorKind',
          'actorName',
          'device',
          'category',
          'action',
          'table',
          'guest',
          'amountAmd',
          'reason',
        ],
        rows,
      );
    },

    timeline(
      branchId: string,
      subject: { readonly type: ActivitySubjectType; readonly id: string },
    ): ActivityTimeline | null {
      const world = worldOf(branchId);
      const entries = world.records
        .filter(
          (record) =>
            record.entry.subject.type === subject.type && record.entry.subject.id === subject.id,
        )
        .map((record) => record.entry)
        .reverse();
      const bill = subject.type === 'tab' ? world.bills.get(subject.id) : undefined;
      if (entries.length === 0 && !bill) return null;
      const first = entries[0];
      const last = bill?.owners.at(-1)?.person;
      const items = (bill?.items ?? []).map(({ addedAtMs: _addedAtMs, ...item }) => item);
      const live = items
        .filter((item) => !item.voided)
        .reduce((sum, item) => sum + item.amountAmd, 0);
      const server: ActivityPerson | null = last
        ? { staffMemberId: last.id, name: last.name }
        : null;
      return {
        subject,
        tableLabel:
          bill?.tableLabel ?? entries.find((entry) => entry.tableLabel)?.tableLabel ?? null,
        guestName: bill?.guestName ?? entries.find((entry) => entry.guestName)?.guestName ?? null,
        code:
          (entries.find((entry) => typeof entry.params['code'] === 'string')?.params['code'] as
            string | undefined) ?? null,
        partySize:
          bill?.partySize ??
          (entries.find((entry) => typeof entry.params['partySize'] === 'number')?.params[
            'partySize'
          ] as number | undefined) ??
          null,
        startedAtUtc: bill
          ? new Date(bill.openedAtMs).toISOString()
          : (first?.occurredAtUtc ?? null),
        endedAtUtc: bill?.closedAtMs ? new Date(bill.closedAtMs).toISOString() : null,
        server: bill ? server : null,
        totals: bill
          ? {
              itemsAmd: live,
              discountAmd: bill.discountAmd,
              serviceChargeAmd: bill.serviceChargeAmd,
              paidAmd: bill.paidAmd,
              tipAmd: bill.tipAmd,
              paidBy: bill.paidBy,
            }
          : null,
        entries,
        items,
      };
    },

    performance(branchId: string, range: PerformanceRange): StaffPerformance {
      const world = worldOf(branchId);
      return { ...range, rows: rowsOf(world, range), totals: totalsOf(world, range) };
    },

    performanceCsv(branchId: string, range: PerformanceRange): ReportExport {
      const world = worldOf(branchId);
      const rows = rowsOf(world, range).map((row) => [
        row.name,
        row.role,
        row.tables,
        row.guests,
        row.salesAmd,
        row.averageCheckAmd,
        row.tipsAmd,
        row.callMedianSeconds,
        row.replyMedianSeconds,
        row.approvals,
        row.cashAmd,
        row.discountsAndComps,
      ]);
      return csv(
        `staff-${range.from}-to-${range.to}.csv`,
        [
          'name',
          'role',
          'tables',
          'guests',
          'salesAmd',
          'averageCheckAmd',
          'tipsAmd',
          'callMedianSeconds',
          'replyMedianSeconds',
          'approvals',
          'cashAmd',
          'discountsAndComps',
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
      const daily: DailySales[] = [];
      for (let date = range.from; date <= range.to; date = addLocalDays(date, 1)) {
        const tally = tallies(world, { from: date, to: date }).get(staffMemberId);
        daily.push({ date, salesAmd: Math.max(0, tally?.sales ?? 0) });
        if (daily.length > 400) break;
      }
      const lists = ['orders', 'messages', 'bookings', 'cash', 'calls'] as const;
      return {
        ...range,
        staffMemberId,
        name: person.name,
        role: person.role,
        figures: figures(tallies(world, range).get(staffMemberId) ?? emptyTally()),
        daily,
        recent: Object.fromEntries(
          lists.map((list) => [list, recentOf(world, staffMemberId, range, list, null, url)]),
        ) as Record<StaffRecentList, StaffRecentPage>,
      };
    },

    recent(
      url: string,
      branchId: string,
      staffMemberId: string,
      range: PerformanceRange,
      list: StaffRecentList,
      cursor: string,
    ): StaffRecentPage {
      return recentOf(worldOf(branchId), staffMemberId, range, list, cursor, url);
    },
  };
}

export type MockActivity = ReturnType<typeof createMockActivity>;
