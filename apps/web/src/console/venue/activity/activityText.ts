import {
  addLocalDays,
  timelineSubjectOf,
  type ActivityCategory,
  type ActivityEntry,
  type ActivityParams,
} from '@yalla/api';
import { branchDayKey, formatDram, formatTime, type Locale, type TimeZone } from '@yalla/format';
import type { TFunction } from 'i18next';
import { shortName } from '../../../messages/messageText';
import { localDateLabel } from '../messageHistory/historyText';

/**
 * The words of the activity history (2026-10-24, the Main, Person and Check
 * boards). The server sends a stable action code (Yalla `docs/activity.md`
 * §3, kebab-case: `booking.auto-declined`, `order.line-voided`) and plain
 * parameters, never prose; every sentence is made here, in the reader's
 * language. An action this build does not know is still shown, by its
 * category.
 */

function str(params: ActivityParams | null | undefined, key: string): string | null {
  const value = params?.[key];
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null;
}

function num(params: ActivityParams | null | undefined, key: string): number | null {
  const value = params?.[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function bool(params: ActivityParams | null | undefined, key: string): boolean | null {
  const value = params?.[key];
  return typeof value === 'boolean' ? value : null;
}

/** Whole dram as the console writes it; a fraction is rounded, never thrown. */
export function dram(amount: number, locale: Locale): string {
  return formatDram(Math.round(amount), locale);
}

/** A kind's pill and tag. */
export function kindLabel(t: TFunction, category: ActivityCategory | 'all'): string {
  switch (category) {
    case 'all':
      return t('activity.filters.kinds.all');
    case 'booking':
      return t('activity.filters.kinds.booking');
    case 'table':
      return t('activity.filters.kinds.table');
    case 'order':
      return t('activity.filters.kinds.order');
    case 'payment':
      return t('activity.filters.kinds.payment');
    case 'takeaway':
      return t('activity.filters.kinds.takeaway');
    case 'message':
      return t('activity.filters.kinds.message');
    case 'settings':
      return t('activity.filters.kinds.settings');
    case 'staff':
      return t('activity.filters.kinds.staff');
    case 'device':
      return t('activity.filters.kinds.device');
  }
}

/**
 * The tag's tone: bookings green, tables amber, money red, the rest the
 * brand's tint, settings grey — the board's, in the console's tokens.
 */
export function kindTone(entry: Pick<ActivityEntry, 'category' | 'isMoney'>): string {
  if (entry.category === 'payment' || entry.isMoney) return 'is-money';
  switch (entry.category) {
    case 'booking':
      return 'is-booking';
    case 'table':
      return 'is-table';
    case 'settings':
    case 'staff':
    case 'device':
      return 'is-quiet';
    default:
      return 'is-brand';
  }
}

/** Who acted, as the feed's "Who" column says it: "Aram P.", "SHURJ", "Guest · Ani M.". */
export function whoLabel(t: TFunction, entry: ActivityEntry): string {
  switch (entry.actor.kind) {
    case 'system':
      return t('activity.who.system');
    case 'platform':
      return t('activity.who.platformAdmin');
    case 'guest':
      return t('activity.who.guest', {
        name: shortName(entry.actor.name || entry.guestName || ''),
      });
    default:
      return shortName(entry.actor.name) || t('activity.who.unknown');
  }
}

/** The person's first name, for a timeline: "Lilit". */
export function whoShort(t: TFunction, entry: ActivityEntry): string {
  if (entry.actor.kind !== 'staff') return whoLabel(t, entry);
  return entry.actor.name.split(/\s+/u)[0] || t('activity.who.unknown');
}

/**
 * The label an entry written before the server kept the device's parts has
 * for a personal phone, "Aram's phone" (always English): the name part, or
 * `null` for any other label (a tablet's own name).
 */
export function phoneOwnerOf(label: string): string | null {
  const said = /^(.+?)\s*['’]s\s+phone$/iu.exec(label.trim());
  return said?.[1]?.trim() || null;
}

/**
 * From where: "Console" and "Aram's phone" in the reader's language, a
 * tablet's own name as it was given, or nothing. Worded from the parts the
 * server keeps (`kind`, `ownerName`); only an entry written before it kept
 * them is read from its English label.
 */
export function deviceLabel(t: TFunction, entry: ActivityEntry): string | null {
  const { kind, ownerName } = entry.device;
  const label = entry.device.label.trim();
  if (
    kind === 'console' ||
    entry.device.isConsole ||
    (entry.device.id === null && /^console$/iu.test(label))
  ) {
    return t('activity.device.console');
  }
  const owner = ownerName?.trim().split(/\s+/u)[0];
  if (kind === 'phone' && owner) return t('activity.device.phone', { name: owner });
  if (kind === 'tablet' || kind === 'phone') return label || null;
  if (!label) return null;
  const said = phoneOwnerOf(label);
  return said ? t('activity.device.phone', { name: said }) : label;
}

/** "48 s", "1 min 35 s", "2 min 05 s", "4 min": the seconds two digits after minutes, as the boards. */
export function durationLabel(t: TFunction, seconds: number | null): string | null {
  if (seconds === null) return null;
  const whole = Math.max(0, Math.round(seconds));
  if (whole < 60) return t('activity.duration.seconds', { count: whole });
  const minutes = Math.floor(whole / 60);
  const rest = whole % 60;
  return rest === 0
    ? t('activity.duration.minutes', { count: minutes })
    : t('activity.duration.minutesSeconds', { minutes, seconds: String(rest).padStart(2, '0') });
}

/** A call's preset (`ServiceRequestPreset`: 1 napkins, 2 water, 3 the bill, 4 other), as a timeline says it. */
function callReason(t: TFunction, preset: number | null): string | null {
  switch (preset) {
    case 1:
      return t('activity.part.call.napkins');
    case 2:
      return t('activity.part.call.water');
    case 3:
      return t('activity.part.call.bill');
    case 4:
      return t('activity.part.call.waiter');
    default:
      return null;
  }
}

/** The dish an entry is about: a void's or a menu item's `name`, a comp's `lineName`, an order's dishes. */
function itemOf(entry: ActivityEntry): string {
  const p = entry.params;
  return (
    str(p, 'name') ??
    str(p, 'lineName') ??
    (entry.lines.length > 0 ? entry.lines.map((line) => line.name).join(', ') : null) ??
    entry.itemNames ??
    ''
  );
}

function guestOf(t: TFunction, entry: ActivityEntry): string {
  return shortName(entry.guestName ?? '') || t('activity.who.theGuest');
}

/** A phone entry about the actor's own phone: the person named is the one who acted. */
function ownPhone(entry: ActivityEntry): boolean {
  const owner = str(entry.params, 'staffMemberId');
  return entry.actor.kind === 'staff' && (owner === null || owner === entry.actor.staffMemberId);
}

/** Why a phone was unpaired, when it was not somebody pressing "Unpair". */
function unpairCause(t: TFunction, cause: string | null): string | null {
  switch (cause) {
    case 'replaced':
      return t('activity.part.unpaired.replaced');
    case 'deactivated':
      return t('activity.part.unpaired.deactivated');
    case 'kitchen':
      return t('activity.part.unpaired.kitchen');
    case 'other-branch':
      return t('activity.part.unpaired.otherBranch');
    default:
      // `console` and `its-owner` are the verb itself; anything newer says nothing more.
      return null;
  }
}

/**
 * The verb phrase: what the person did, without the details after it. Keyed
 * by the server's codes (Yalla `docs/activity.md` §3, `ACTIVITY_ACTIONS`); a
 * code this build does not know is said by its category.
 */
export function actionLabel(t: TFunction, entry: ActivityEntry, locale?: Locale): string {
  const p = entry.params;
  const item = itemOf(entry);
  const code = entry.subject.code ?? str(p, 'code') ?? '';
  const name = str(p, 'toName') ?? str(p, 'name') ?? '';
  switch (entry.action) {
    // Bookings.
    case 'booking.created':
      return t('activity.action.bookingRequested');
    case 'booking.moved':
      return t('activity.action.bookingMoved');
    case 'booking.cancelled':
      if (entry.actor.kind === 'guest') return t('activity.action.bookingCancelledByGuest');
      return str(p, 'extra.because') === 'no-show-block'
        ? t('activity.action.bookingCancelledByBlock')
        : t('activity.action.bookingCancelled');
    case 'booking.approved':
      return t('activity.action.bookingApproved');
    case 'booking.declined':
      return t('activity.action.bookingDeclined');
    case 'booking.auto-declined':
      // `DeclineReason`: 2 nobody answered, 4 the earlier guest did not.
      return num(p, 'extra.declineReason') === 4
        ? t('activity.action.bookingAutoDeclinedEarlier')
        : t('activity.action.bookingAutoDeclined');
    case 'booking.seated':
      return t('activity.action.bookingSeated');
    case 'booking.no-show':
      return t('activity.action.bookingNoShow');
    case 'booking.no-show-undone':
      return t('activity.action.bookingNoShowUndone');
    case 'booking.released':
      return t('activity.action.bookingReleased');
    case 'booking.hold-extended':
      return t('activity.action.bookingHoldExtended', { count: num(p, 'extra.minutes') ?? 0 });
    case 'booking.guest-answered':
      switch (str(p, 'extra.answer')) {
        case 'late':
          return t('activity.action.bookingRunningLate', { count: num(p, 'extra.minutes') ?? 0 });
        case 'not-coming':
          return entry.actor.kind === 'staff'
            ? t('activity.action.bookingMarkedNotComing')
            : t('activity.action.bookingNotComing');
        case 'table-request':
          return bool(p, 'extra.accepted')
            ? t('activity.action.tableRequestYes')
            : t('activity.action.tableRequestNo');
        default:
          return t('activity.action.bookingOnMyWay');
      }
    // Tables and their bills.
    case 'table.seated':
      return t('activity.action.tableSeated');
    case 'table.freed':
      return t('activity.action.tableReleased');
    case 'table.held':
      return t('activity.action.tableHeld');
    case 'table.hold-released':
      return t('activity.action.tableHoldReleased');
    case 'table.out-of-service':
      return t('activity.action.tableOutOfService');
    case 'table.back-in-service':
      return t('activity.action.tableBackInService');
    case 'table.tab-opened':
      return t('activity.action.tabOpened');
    case 'table.tab-admitted':
      return t('activity.action.tabAdmitted');
    case 'table.tab-turned-away':
      return t('activity.action.tabTurnedAway');
    case 'table.transferred':
      return t('activity.action.tableTransferred', { name: shortName(name) });
    case 'table.call-claimed':
      return t('activity.action.callClaimed');
    case 'table.bill-presented':
      return t('activity.action.billPresented');
    case 'table.host-reassigned':
      return t('activity.action.hostReassigned');
    // Orders.
    case 'order.sent':
      return t('activity.action.orderSent');
    case 'order.placed-by-guest':
      return t('activity.action.orderPlacedByGuest');
    case 'order.pre-order-sent':
      return t('activity.action.preOrderSent');
    case 'order.in-kitchen':
      return t('activity.action.orderInKitchen', { item });
    case 'order.ready':
      return t('activity.action.orderReady', { item });
    case 'order.served':
      return t('activity.action.orderServed', { item });
    case 'order.line-voided':
      return t('activity.action.lineVoided', { item });
    case 'order.voided':
      return t('activity.action.orderVoided');
    // Money.
    case 'payment.cash':
      return t('activity.action.paidCash');
    case 'payment.discount': {
      const percent = num(p, 'percent');
      const amount = num(p, 'amountAmd');
      if (percent !== null) return t('activity.action.discounted', { percent });
      const off = amount ?? entry.amountAmd ?? 0;
      return t('activity.action.discountedAmount', {
        amount: locale ? dram(off, locale) : String(Math.round(off)),
      });
    }
    case 'payment.comp':
      return item ? t('activity.action.comped', { item }) : t('activity.action.compedBill');
    case 'payment.adjustment-reversed':
      return str(p, 'kind') === 'comp'
        ? t('activity.action.compReversed')
        : t('activity.action.adjustmentReversed');
    case 'payment.unpaid':
      return t('activity.action.unpaid');
    // Takeaway.
    case 'takeaway.placed':
      return t('activity.action.takeawayPlaced', { code });
    case 'takeaway.cancelled':
      return t('activity.action.takeawayCancelled', { code });
    case 'takeaway.accepted':
      return t('activity.action.takeawayAccepted', { code });
    case 'takeaway.declined':
      return t('activity.action.takeawayDeclined', { code });
    case 'takeaway.auto-declined':
      return t('activity.action.takeawayAutoDeclined', { code });
    case 'takeaway.ready':
      return t('activity.action.takeawayReady', { code });
    case 'takeaway.collected':
      return t('activity.action.takeawayCollected', { code });
    case 'takeaway.no-show':
      return t('activity.action.takeawayNoShow', { code });
    // Guest messages.
    case 'message.sent':
      return t('activity.action.messageSent', { guest: guestOf(t, entry) });
    case 'message.asked-on-my-way':
      return t('activity.action.askedComing', { guest: guestOf(t, entry) });
    // Settings.
    case 'settings.menu-price':
      return t('activity.action.menuPrice', { item });
    case 'settings.menu-availability': {
      const takeaway = bool(entry.after, 'availableForTakeaway');
      if (takeaway !== null) {
        return takeaway
          ? t('activity.action.menuTakeawayOn', { item })
          : t('activity.action.menuTakeawayOff', { item });
      }
      return (bool(entry.after, 'isAvailable') ?? bool(p, 'isAvailable'))
        ? t('activity.action.menuBack', { item })
        : t('activity.action.menuOff', { item });
    }
    case 'settings.hours':
      return t('activity.action.hours');
    case 'settings.special-days':
      return t('activity.action.specialDays');
    case 'settings.policy':
      return t('activity.action.policy');
    case 'settings.takeaway':
      return t('activity.action.takeawaySettings');
    case 'settings.messages':
      return t('activity.action.messageSettings');
    case 'settings.pre-orders':
      return t('activity.action.preOrderSettings');
    // The team and devices.
    case 'staff.created':
      return t('activity.action.staffAdded', { name: shortName(name) });
    case 'staff.updated': {
      const was = bool(entry.before, 'isActive');
      const now = bool(entry.after, 'isActive');
      if (was === true && now === false) {
        return t('activity.action.staffDeactivated', { name: shortName(name) });
      }
      if (was === false && now === true) {
        return t('activity.action.staffReactivated', { name: shortName(name) });
      }
      return t('activity.action.staffUpdated', { name: shortName(name) });
    }
    case 'staff.pin-set':
      return t('activity.action.pinSet', { name: shortName(name) });
    case 'staff.sign-in-issued':
      return t('activity.action.signInIssued', { name: shortName(name) });
    case 'staff.pin-lockout-cleared':
      return t('activity.action.pinLockoutCleared', { name: shortName(name) });
    case 'device.enrolment-code-created':
      return t('activity.action.enrolmentCode');
    case 'device.enrolled':
      // Nobody is signed in to a tablet being connected: SHURJ says it, by its name.
      return name
        ? t('activity.action.deviceEnrolledNamed', { name })
        : t('activity.action.deviceEnrolled');
    case 'device.revoked':
      return name
        ? t('activity.action.deviceRevokedNamed', { name })
        : t('activity.action.deviceRevoked');
    case 'device.phone-paired': {
      // `name` here is what the browser called itself: the person is `staffName`.
      const owner = shortName(str(p, 'staffName') ?? '');
      if (owner && !ownPhone(entry)) return t('activity.action.phonePairedFor', { name: owner });
      return bool(p, 'repaired')
        ? t('activity.action.phonePairedAgain')
        : t('activity.action.phonePaired');
    }
    case 'device.phone-unpaired': {
      const owner = shortName(str(p, 'staffName') ?? '');
      if (str(p, 'cause') === 'its-owner' || (ownPhone(entry) && owner)) {
        return t('activity.action.phoneUnpairedOwn');
      }
      return owner
        ? t('activity.action.phoneUnpairedNamed', { name: owner })
        : t('activity.action.phoneUnpaired');
    }
    default:
      return t('activity.action.other', { kind: kindLabel(t, entry.category) });
  }
}

/**
 * A money or price change, "18 400 ֏ → 16 560 ֏", when the entry carries one:
 * `before`/`after` (`priceAmd`, `totalAmd`, `amountAmd`), or a summary's
 * `totalBeforeAmd`/`totalAfterAmd`.
 */
export function changeLine(
  entry: ActivityEntry,
  locale: Locale,
): {
  readonly before: string;
  readonly after: string;
} | null {
  for (const key of ['priceAmd', 'totalAmd', 'amountAmd']) {
    const before = num(entry.before, key);
    const after = num(entry.after, key);
    if (before !== null && after !== null) {
      return { before: dram(before, locale), after: dram(after, locale) };
    }
  }
  const before = num(entry.params, 'totalBeforeAmd');
  const after = num(entry.params, 'totalAfterAmd');
  return before !== null && after !== null
    ? { before: dram(before, locale), after: dram(after, locale) }
    : null;
}

/**
 * The details after the verb, in order: the guest, the table or the code,
 * the time, the count, the money. "Discount 10%" · "table 2" · "18 400 →
 * 16 560 ֏".
 *
 * `nameOf` turns a staff id the entry names (the manager whose code connected
 * a device) into a name, where the screen knows the branch's people.
 */
export function detailParts(
  t: TFunction,
  entry: ActivityEntry,
  locale: Locale,
  nameOf?: (staffMemberId: string) => string | null,
): string[] {
  const p = entry.params;
  const parts: (string | null)[] = [];
  const guest = entry.guestName ? shortName(entry.guestName) : null;
  const table = entry.tableLabel ? t('activity.part.table', { label: entry.tableLabel }) : null;
  const change = changeLine(entry, locale);
  const amount = entry.amountAmd !== null ? dram(entry.amountAmd, locale) : null;
  const tip = num(p, 'tipAmd');
  const items = num(p, 'items');
  switch (entry.category) {
    case 'booking': {
      const party = num(p, 'partySize');
      parts.push(
        entry.actor.kind === 'guest' ? null : guest,
        table,
        str(p, 'localTime'),
        party ? t('activity.part.party', { count: party }) : null,
      );
      break;
    }
    case 'message':
      parts.push(table ?? entry.subject.code ?? null);
      if (str(p, 'text')) parts.push(t('activity.part.quote', { text: str(p, 'text')! }));
      break;
    case 'takeaway':
      parts.push(
        str(p, 'pickupLocal') ? t('activity.part.pickup', { time: str(p, 'pickupLocal')! }) : null,
        amount,
      );
      break;
    case 'settings':
      parts.push(change ? `${change.before} → ${change.after}` : null);
      break;
    case 'device': {
      if (entry.action === 'device.phone-unpaired') parts.push(unpairCause(t, str(p, 'cause')));
      const codeBy = str(p, 'codeCreatedByStaffMemberId');
      const codeName = codeBy && nameOf ? nameOf(codeBy) : null;
      if (codeName) parts.push(t('activity.part.codeBy', { name: shortName(codeName) }));
      break;
    }
    case 'table':
      parts.push(table);
      if (entry.action === 'table.seated' && num(p, 'partySize')) {
        parts.push(t('activity.part.party', { count: num(p, 'partySize')! }));
      }
      if (entry.action === 'table.call-claimed') {
        parts.push(callReason(t, num(p, 'preset')), durationLabel(t, entry.seconds));
      }
      break;
    case 'order':
      parts.push(table);
      if (
        (entry.action === 'order.sent' ||
          entry.action === 'order.placed-by-guest' ||
          entry.action === 'order.pre-order-sent') &&
        items
      ) {
        parts.push(t('activity.part.dishes', { count: items }));
      }
      parts.push(
        entry.action === 'order.ready' ||
          entry.action === 'order.in-kitchen' ||
          entry.action === 'order.served'
          ? null
          : amount,
      );
      break;
    case 'payment':
      parts.push(table);
      if (entry.action === 'payment.discount' || entry.action === 'payment.comp') {
        parts.push(change ? `${change.before} → ${change.after}` : amount);
      } else {
        parts.push(amount, tip ? t('activity.part.tip', { amount: dram(tip, locale) }) : null);
      }
      break;
    default:
      parts.push(table, amount);
  }
  return parts.filter((part): part is string => Boolean(part));
}

/** The whole "what": the verb and its details, " · " between. */
export function whatLabel(
  t: TFunction,
  entry: ActivityEntry,
  locale: Locale,
  nameOf?: (staffMemberId: string) => string | null,
): string {
  return [actionLabel(t, entry, locale), ...detailParts(t, entry, locale, nameOf)].join(' · ');
}

/** The entry's clock time on the branch's clock. */
export function timeLabel(entry: ActivityEntry, timeZoneId: string, locale: Locale): string {
  return formatTime(entry.occurredAtUtc, timeZoneId as TimeZone, locale);
}

/** "today, 18:31", "yesterday, 17:10", "20 Oct, 13:02". */
export function whenLabel(
  t: TFunction,
  entry: ActivityEntry,
  timeZoneId: string,
  today: string,
  locale: Locale,
): string {
  const day = branchDayKey(entry.occurredAtUtc, timeZoneId as TimeZone);
  const time = timeLabel(entry, timeZoneId, locale);
  if (day === today) return t('activity.detail.today', { time });
  if (day === addLocalDays(today, -1)) return t('activity.detail.yesterday', { time });
  return t('activity.detail.dated', { date: localDateLabel(day, today, locale), time });
}

/**
 * Where an entry opens: its timeline (a call's or a sitting's bill too), the
 * menu, the person's page — or nowhere.
 */
export function subjectLink(
  entry: Pick<ActivityEntry, 'subject' | 'params'>,
): { readonly to: string; readonly labelKey: string } | null {
  const timeline = timelineSubjectOf(entry);
  if (timeline) {
    return {
      to: `/venue/history/${timeline.type}/${encodeURIComponent(timeline.id)}`,
      labelKey:
        timeline.type === 'tab'
          ? 'activity.link.tab'
          : timeline.type === 'reservation'
            ? 'activity.link.reservation'
            : 'activity.link.takeaway',
    };
  }
  const subject = entry.subject;
  if (subject.type === 'menuItem') return { to: '/venue/menu', labelKey: 'activity.link.menu' };
  if (subject.type === 'staffMember' && subject.id) {
    return {
      to: `/venue/staff/${encodeURIComponent(subject.id)}`,
      labelKey: 'activity.link.person',
    };
  }
  return null;
}
