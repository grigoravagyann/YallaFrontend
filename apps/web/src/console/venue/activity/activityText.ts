import {
  addLocalDays,
  hasTimeline,
  type ActivityCategory,
  type ActivityEntry,
  type ActivityParams,
  type ActivitySubject,
} from '@yalla/api';
import { branchDayKey, formatDram, formatTime, type Locale, type TimeZone } from '@yalla/format';
import type { TFunction } from 'i18next';
import { shortName } from '../../../messages/messageText';
import { localDateLabel } from '../messageHistory/historyText';

/**
 * The words of the activity history (2026-10-24, the Main, Person and Check
 * boards). The server sends a stable action code and plain parameters, never
 * prose; every sentence is made here, in the reader's language. An action
 * this build does not know is still shown, by its category.
 */

function str(params: ActivityParams | null | undefined, key: string): string | null {
  const value = params?.[key];
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null;
}

function num(params: ActivityParams | null | undefined, key: string): number | null {
  const value = params?.[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
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
    case 'platformAdmin':
      return t('activity.who.platformAdmin');
    case 'diner':
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

/** From where: the device's own name, "Console", or nothing. */
export function deviceLabel(t: TFunction, entry: ActivityEntry): string | null {
  if (entry.device.isConsole) return t('activity.device.console');
  return entry.device.label || null;
}

/** "48 s", "1 min 35 s", "4 min". */
export function durationLabel(t: TFunction, seconds: number | null): string | null {
  if (seconds === null) return null;
  const whole = Math.max(0, Math.round(seconds));
  if (whole < 60) return t('activity.duration.seconds', { count: whole });
  const minutes = Math.floor(whole / 60);
  const rest = whole % 60;
  return rest === 0
    ? t('activity.duration.minutes', { count: minutes })
    : t('activity.duration.minutesSeconds', { minutes, seconds: rest });
}

/** The call's reason, as a timeline says it. */
function callReason(t: TFunction, reason: string | null): string | null {
  switch (reason) {
    case 'bill':
      return t('activity.part.call.bill');
    case 'water':
      return t('activity.part.call.water');
    case 'napkins':
      return t('activity.part.call.napkins');
    case 'waiter':
    case 'other':
      return t('activity.part.call.waiter');
    default:
      return null;
  }
}

/** The verb phrase: what the person did, without the details after it. */
export function actionLabel(t: TFunction, entry: ActivityEntry): string {
  const p = entry.params;
  const item = str(p, 'itemName') ?? '';
  const name = str(p, 'toName') ?? str(p, 'staffName') ?? '';
  switch (entry.action) {
    case 'booking.requested':
      return t('activity.action.bookingRequested');
    case 'booking.created':
      return t('activity.action.bookingCreated');
    case 'booking.approved':
      return t('activity.action.bookingApproved');
    case 'booking.declined':
      return t('activity.action.bookingDeclined');
    case 'booking.autoDeclined':
      return t('activity.action.bookingAutoDeclined', { count: num(p, 'minutes') ?? 15 });
    case 'booking.moved':
      return t('activity.action.bookingMoved');
    case 'booking.cancelled':
      return entry.actor.kind === 'diner'
        ? t('activity.action.bookingCancelledByGuest')
        : t('activity.action.bookingCancelled');
    case 'booking.noShow':
      return t('activity.action.bookingNoShow');
    case 'booking.seated':
      return t('activity.action.bookingSeated');
    case 'booking.released':
      return t('activity.action.bookingReleased');
    case 'booking.onMyWay': {
      const late = num(p, 'runningLateMinutes');
      return late
        ? t('activity.action.bookingRunningLate', { count: late })
        : t('activity.action.bookingOnMyWay');
    }
    case 'table.seated':
      return t('activity.action.tableSeated');
    case 'table.transferred':
      return t('activity.action.tableTransferred', { name: shortName(name) });
    case 'table.released':
      return t('activity.action.tableReleased');
    case 'table.callClaimed':
      return t('activity.action.callClaimed');
    case 'order.sent':
      return p['preOrder'] === true
        ? t('activity.action.preOrderSent')
        : t('activity.action.orderSent');
    case 'order.ready':
      return t('activity.action.orderReady', { item });
    case 'order.lineVoided':
      return t('activity.action.lineVoided', { item });
    case 'order.lineChanged':
      return t('activity.action.lineChanged', { item });
    case 'order.comped':
      return t('activity.action.comped', { item });
    case 'order.discounted':
      return t('activity.action.discounted', { percent: num(p, 'percent') ?? 0 });
    case 'payment.cash':
      return t('activity.action.paidCash');
    case 'payment.card':
      return t('activity.action.paidCard');
    case 'payment.unpaid':
      return t('activity.action.unpaid');
    case 'takeaway.accepted':
      return t('activity.action.takeawayAccepted', { code: str(p, 'code') ?? '' });
    case 'takeaway.declined':
      return t('activity.action.takeawayDeclined', { code: str(p, 'code') ?? '' });
    case 'takeaway.ready':
      return t('activity.action.takeawayReady', { code: str(p, 'code') ?? '' });
    case 'takeaway.collected':
      return t('activity.action.takeawayCollected', { code: str(p, 'code') ?? '' });
    case 'takeaway.noShow':
      return t('activity.action.takeawayNoShow', { code: str(p, 'code') ?? '' });
    case 'message.sent':
      return t('activity.action.messageSent', {
        guest: shortName(entry.guestName ?? '') || t('activity.who.theGuest'),
      });
    case 'message.askedComing':
      return t('activity.action.askedComing', {
        guest: shortName(entry.guestName ?? '') || t('activity.who.theGuest'),
      });
    case 'settings.menuPrice':
      return t('activity.action.menuPrice', { item });
    case 'settings.menuAvailability':
      return p['available'] === true || entry.after?.['available'] === true
        ? t('activity.action.menuBack', { item })
        : t('activity.action.menuOff', { item });
    case 'settings.hours':
      return t('activity.action.hours');
    case 'settings.policy':
      return t('activity.action.policy');
    case 'settings.takeaway':
      return t('activity.action.takeawaySettings');
    case 'settings.messages':
      return t('activity.action.messageSettings');
    case 'staff.pinSet':
      return t('activity.action.pinSet', { name: shortName(name) });
    case 'staff.signInIssued':
      return t('activity.action.signInIssued', { name: shortName(name) });
    case 'staff.added':
      return t('activity.action.staffAdded', { name: shortName(name) });
    case 'staff.deactivated':
      return t('activity.action.staffDeactivated', { name: shortName(name) });
    case 'device.enrolled':
      return t('activity.action.deviceEnrolled');
    case 'device.revoked':
      return t('activity.action.deviceRevoked');
    default:
      return t('activity.action.other', { kind: kindLabel(t, entry.category) });
  }
}

/** A money or price change, "18 400 ֏ → 16 560 ֏", when the entry carries one. */
export function changeLine(
  entry: ActivityEntry,
  locale: Locale,
): {
  readonly before: string;
  readonly after: string;
} | null {
  for (const key of ['amountAmd', 'priceAmd']) {
    const before = num(entry.before, key);
    const after = num(entry.after, key);
    if (before !== null && after !== null) {
      return { before: dram(before, locale), after: dram(after, locale) };
    }
  }
  return null;
}

/**
 * The details after the verb, in order: the guest, the table or the code,
 * the time, the count, the money. "Discount 10%" · "table 2" · "18 400 →
 * 16 560 ֏".
 */
export function detailParts(t: TFunction, entry: ActivityEntry, locale: Locale): string[] {
  const p = entry.params;
  const parts: (string | null)[] = [];
  const guest = entry.guestName ? shortName(entry.guestName) : null;
  const table = entry.tableLabel ? t('activity.part.table', { label: entry.tableLabel }) : null;
  const change = changeLine(entry, locale);
  const amount = entry.amountAmd !== null ? dram(entry.amountAmd, locale) : null;
  const tip = num(p, 'tipAmd');
  switch (entry.category) {
    case 'booking':
      parts.push(
        entry.actor.kind === 'diner' ? null : guest,
        table,
        str(p, 'startLocal'),
        num(p, 'partySize') ? t('activity.part.party', { count: num(p, 'partySize')! }) : null,
      );
      break;
    case 'message':
      parts.push(table ?? (str(p, 'code') ? str(p, 'code') : null));
      if (str(p, 'text')) parts.push(t('activity.part.quote', { text: str(p, 'text')! }));
      break;
    case 'takeaway':
      parts.push(
        str(p, 'readyLocal') ? t('activity.part.ready', { time: str(p, 'readyLocal')! }) : null,
        amount,
      );
      break;
    case 'settings':
      parts.push(change ? `${change.before} → ${change.after}` : null);
      break;
    case 'table':
      parts.push(table);
      if (entry.action === 'table.seated' && num(p, 'partySize')) {
        parts.push(t('activity.part.party', { count: num(p, 'partySize')! }));
        if (guest) parts.push(t('activity.part.booking', { name: guest }));
      }
      if (entry.action === 'table.callClaimed') {
        parts.push(callReason(t, str(p, 'reason')), durationLabel(t, num(p, 'seconds')));
      }
      break;
    case 'order':
      parts.push(table);
      if (entry.action === 'order.sent' && num(p, 'itemCount')) {
        parts.push(t('activity.part.dishes', { count: num(p, 'itemCount')! }));
      }
      parts.push(
        entry.action === 'order.discounted' && change
          ? `${change.before} → ${change.after}`
          : entry.action === 'order.ready'
            ? null
            : amount,
      );
      break;
    case 'payment':
      parts.push(table, amount, tip ? t('activity.part.tip', { amount: dram(tip, locale) }) : null);
      break;
    default:
      parts.push(table, amount);
  }
  return parts.filter((part): part is string => Boolean(part));
}

/** The whole "what": the verb and its details, " · " between. */
export function whatLabel(t: TFunction, entry: ActivityEntry, locale: Locale): string {
  return [actionLabel(t, entry), ...detailParts(t, entry, locale)].join(' · ');
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

/** Where an entry opens: its timeline, the menu, the person's page — or nowhere. */
export function subjectLink(
  subject: ActivitySubject,
): { readonly to: string; readonly labelKey: string } | null {
  if (hasTimeline(subject)) {
    return {
      to: `/venue/history/${subject.type}/${encodeURIComponent(subject.id)}`,
      labelKey:
        subject.type === 'tab'
          ? 'activity.link.tab'
          : subject.type === 'reservation'
            ? 'activity.link.reservation'
            : 'activity.link.takeaway',
    };
  }
  if (subject.type === 'menuItem') return { to: '/venue/menu', labelKey: 'activity.link.menu' };
  if (subject.type === 'staffMember' && subject.id) {
    return {
      to: `/venue/staff/${encodeURIComponent(subject.id)}`,
      labelKey: 'activity.link.person',
    };
  }
  return null;
}
