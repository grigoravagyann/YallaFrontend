import type { FieldViolation } from '../errors';
import type { FloorChangeSignal } from './admission';
import type { MenuItemDetail } from './ordering';

/**
 * Takeaway (approved 2026-10-22, the "Time to Eat Takeaway" design): a guest orders
 * from a place's menu in the app, says when they will come, and picks the food
 * up at the counter — paying there, cash or card at the venue's own terminal.
 * **Nothing is charged in the app.**
 *
 * Every shape here is the wire's (`docs/takeaway.md` in the backend), renamed
 * the way the rest of the client is: amounts `Dram`, enums as words. The rules
 * the server applies are mirrored only where a screen or the mocks need them;
 * the server's answer always wins (`status`, `canCancel`, `noShowFromUtc`,
 * `slots`).
 */

// ---------------------------------------------------------------------------
// The product's fixed numbers
// ---------------------------------------------------------------------------

/** An order nobody accepts within this is declined, when auto-accept is off. */
export const TAKEAWAY_ACCEPT_WINDOW_MINUTES = 5;
/** "No-show" may be marked this long after ready (the later of promised and marked). */
export const TAKEAWAY_NO_SHOW_AFTER_MINUTES = 30;
/** Pickup slots are offered in quarter hours. */
export const TAKEAWAY_SLOT_STEP_MINUTES = 15;
/** The tablet's ready-time stepper moves by this. */
export const TAKEAWAY_READY_STEP_MINUTES = 5;

/** The bounds an order is held to (422 `validation-failed` otherwise). */
export const TAKEAWAY_LIMITS = {
  /** 1 to 30 lines. */
  maxLines: 30,
  /** 1 to 20 of one dish. */
  maxQuantity: 20,
  /** At most 60 dishes in all. */
  maxTotalQuantity: 60,
  /** The guest's note for the venue. */
  maxNote: 500,
  /** The reason a waiter gives for declining, shown to the guest. */
  maxDeclineReason: 300,
} as const;

// ---------------------------------------------------------------------------
// The order
// ---------------------------------------------------------------------------

/**
 * `TakeawayStatus`: 1 Sent, 2 Accepted, 3 Ready, 4 Collected, 5 Declined,
 * 6 Cancelled, 7 NoShow. `unknown` for a value a newer server adds: offer
 * nothing. The app shows `accepted` as "Accepted · being prepared".
 */
export type TakeawayStatus =
  'sent' | 'accepted' | 'ready' | 'collected' | 'declined' | 'cancelled' | 'noShow' | 'unknown';

/** `TakeawayPaymentMethod`: 1 Cash, 2 Card — recorded at the counter, never charged in the app. */
export type TakeawayPaymentMethod = 'cash' | 'card';

/**
 * `TakeawayDeclineCause`: 1 the venue said no (`venue`), 2 nobody answered
 * within five minutes (`noAnswer`) — an apology, not the venue's "no".
 */
export type TakeawayDeclineCause = 'venue' | 'noAnswer' | 'unknown';

/** One dish on a takeaway order, at the name and price it was ordered at. `TakeawayLineView`. */
export interface TakeawayLine {
  readonly id: string;
  readonly menuItemId: string;
  /** The dish's name when it was ordered. */
  readonly name: string;
  /** The **snapshotted** price — a menu change tomorrow does not change the order. */
  readonly unitPriceDram: number;
  readonly quantity: number;
  readonly lineTotalDram: number;
}

/** What every view of an order shares — the guest's status screen and the counter. */
interface TakeawayOrderCore {
  readonly id: string;
  /** "T-482" — what the guest says at the counter. */
  readonly code: string;
  readonly status: TakeawayStatus;
  readonly lines: readonly TakeawayLine[];
  /** The lines at their snapshotted prices: what is paid at pickup. */
  readonly totalDram: number;
  /** The guest's note ("no onion, separate bag"); `null` when none. */
  readonly note: string | null;
  /** Ordered for as soon as possible, rather than a slot. */
  readonly pickupAsap: boolean;
  /** When the guest asked for it. */
  readonly requestedPickupUtc: string;
  /** The same on the branch's wall clock, "19:15". */
  readonly requestedPickupAt: string;
  /** When the venue promised it; `null` until accepted. */
  readonly readyAtUtc: string | null;
  /** The same, "19:10"; `null` until accepted. */
  readonly readyAt: string | null;
  readonly sentAtUtc: string;
  /** While sent: when it is declined for nobody answering — the countdown. `null` with auto-accept. */
  readonly acceptDeadlineUtc: string | null;
  readonly acceptedAtUtc: string | null;
  /** When the kitchen (or the floor) marked it ready. */
  readonly readyMarkedAtUtc: string | null;
  readonly collectedAtUtc: string | null;
  readonly declinedAtUtc: string | null;
  readonly cancelledAtUtc: string | null;
  readonly noShowAtUtc: string | null;
  /** Why it was declined; `null` unless declined. */
  readonly declinedBecause: TakeawayDeclineCause | null;
  /** What the venue said, when it said why. */
  readonly declineReason: string | null;
  /** How it was paid, once collected. */
  readonly paymentMethod: TakeawayPaymentMethod | null;
  /** The amount recorded at handover (the total); `null` until collected. */
  readonly paidAmountDram: number | null;
  /** On an action's answer: it had been done already, and nothing changed this time. */
  readonly wasReplay: boolean;
}

/**
 * A takeaway order as its guest sees it — the status screen.
 * `GET /api/diner/takeaway-orders/{id}`, `TakeawayOrderView`.
 */
export interface TakeawayOrder extends TakeawayOrderCore {
  readonly branchId: string;
  readonly venueName: string;
  readonly branchName: string;
  /** Where to pick it up. */
  readonly branchAddress: string;
  /** The venue's number, to call; `null` when it has none on file. */
  readonly branchPhoneE164: string | null;
  /** For directions. */
  readonly latitude: number;
  readonly longitude: number;
  /** True while sent — after that, it is a phone call. */
  readonly canCancel: boolean;
}

/**
 * A takeaway order as the floor tablet and the counter see it.
 * `StaffTakeawayOrderView`; also the answer to each staff action.
 */
export interface StaffTakeawayOrder extends TakeawayOrderCore {
  /** Who to call out — a name, never a number. */
  readonly guestName: string;
  /** Their proved number, to call; `null` for a platform admin (the venue's to call). */
  readonly guestPhone: string | null;
  /** Who accepted it; `null` when accepted automatically. */
  readonly acceptedByName: string | null;
  /** From when "no-show" may be marked: thirty minutes after ready. `null` until accepted. */
  readonly noShowFromUtc: string | null;
}

/** A branch's takeaway counter. `GET /api/branches/{branchId}/takeaway-orders`. */
export interface BranchTakeawayOrders {
  /** Sent, Accepted and Ready — the rail's and the counter's first two columns. Oldest first. */
  readonly active: readonly StaffTakeawayOrder[];
  /** Collected, NoShow and Declined on the branch's service day, newest first. */
  readonly finishedToday: readonly StaffTakeawayOrder[];
  /** Waiting for an answer: half of the tab's badge. */
  readonly sentCount: number;
  /** Waiting at the counter: the other half. */
  readonly readyCount: number;
  readonly asOfUtc: string;
}

/**
 * Whether a branch takes takeaway now, and the pickup times it offers — the
 * checkout screen. `GET /api/diner/branches/{branchId}/takeaway`.
 */
export interface TakeawayAvailability {
  readonly branchId: string;
  /** The venue takes takeaway at all. False: no button. */
  readonly enabled: boolean;
  /** Orders are taken now: inside opening hours, before the last order. */
  readonly open: boolean;
  /** "Ready in about 20 minutes". */
  readonly prepMinutes: number;
  /** "As soon as possible" would be ready then; `null` when closed. */
  readonly asapReadyAtUtc: string | null;
  /** The same, "19:10"; `null` when closed. */
  readonly asapReadyAt: string | null;
  /** Today's pickup times, "HH:mm", in quarter hours from the ASAP time to the last pickup. */
  readonly slots: readonly string[];
  /** The latest pickup today, "HH:mm"; `null` when closed. */
  readonly lastPickupAt: string | null;
  /** The kitchen is full: ASAP is refused; a slot may still work. */
  readonly busy: boolean;
  /** Closed: "Takeaway from opening, 10:00". `null` otherwise. */
  readonly opensAt: string | null;
  readonly opensAtUtc: string | null;
}

/** When to pick up: exactly one of the two. */
export type TakeawayPickup = { readonly asap: true } | { readonly at: string };

/** One dish as the guest sends it. */
export interface TakeawayLineInput {
  readonly menuItemId: string;
  /** 1 to {@link TAKEAWAY_LIMITS.maxQuantity}. */
  readonly quantity: number;
}

/**
 * Send an order — `POST /api/diner/takeaway-orders`. A proved phone is
 * required (`PhoneNotVerifiedError` otherwise), as for booking.
 */
export interface PlaceTakeawayOrderCommand {
  readonly branchId: string;
  readonly pickup: TakeawayPickup;
  /** For the venue; blank is none; at most {@link TAKEAWAY_LIMITS.maxNote}. */
  readonly note?: string | null | undefined;
  /** The dishes, in display order. */
  readonly lines: readonly TakeawayLineInput[];
  /** One per send attempt, reused on a retry: a replay answers the order the first try made. */
  readonly clientCommandId: string;
}

/** "Accept" with the ready time the tablet's stepper settled on — `POST /api/takeaway-orders/{id}/accept`. */
export interface AcceptTakeawayOrderCommand {
  readonly orderId: string;
  /** UTC; from now to twelve hours on. */
  readonly readyAtUtc: string;
}

/** "Decline" — `POST /api/takeaway-orders/{id}/decline`. */
export interface DeclineTakeawayOrderCommand {
  readonly orderId: string;
  /** Shown to the guest; blank is none; at most {@link TAKEAWAY_LIMITS.maxDeclineReason}. */
  readonly reason?: string | null | undefined;
}

/** "Paid, handed over" — `POST /api/takeaway-orders/{id}/collect`. The amount is the total. */
export interface CollectTakeawayOrderCommand {
  readonly orderId: string;
  readonly method: TakeawayPaymentMethod;
}

// ---------------------------------------------------------------------------
// Where takeaway shows up elsewhere
// ---------------------------------------------------------------------------

/** A place's takeaway, as the place page shows it. `PublicTakeawayInfo`, on the branch detail. */
export interface PublicTakeawayInfo {
  /** The venue takes takeaway orders from the app: the "Order to take away" button. */
  readonly enabled: boolean;
  /** "Ready in about 20 minutes" on the info card. */
  readonly prepMinutes: number;
}

/** A place that has not switched takeaway on, and every server from before it. */
export const NO_TAKEAWAY: PublicTakeawayInfo = { enabled: false, prepMinutes: 20 };

/**
 * The "TAKEAWAY" band on a kitchen ticket: an accepted (or ready) takeaway
 * order. The ticket's `tableLabel` is the code and it has no tab.
 */
export interface KitchenTakeaway {
  /** "T-482". */
  readonly code: string;
  readonly readyAtUtc: string;
  /** "19:10" on the branch's clock. */
  readonly readyAtLocalTime: string;
  /** Whose it is — a name, never a number. */
  readonly guestName: string;
  /** "No onion, separate bag"; `null` when none. */
  readonly note: string | null;
}

/** A takeaway order on the Orders tab: the card's code, status and times. `DinerTakeawaySummary`. */
export interface DinerTakeawaySummary {
  readonly code: string;
  readonly status: TakeawayStatus;
  readonly pickupAsap: boolean;
  readonly requestedPickupUtc: string;
  /** `null` until accepted. */
  readonly readyAtUtc: string | null;
  /** "4 items". */
  readonly itemCount: number;
}

// ---------------------------------------------------------------------------
// The console's settings
// ---------------------------------------------------------------------------

/** `PUT /api/branches/{branchId}/takeaway-settings` — all five, every time. */
export interface TakeawaySettingsInput {
  /** Off by default: a venue that never looked at the feature receives no orders. */
  readonly enabled: boolean;
  /** Accepted without a tap. Off: staff accept, and nobody in five minutes is a decline. */
  readonly autoAccept: boolean;
  /** The earliest an "as soon as possible" order is ready: 5–90, in fives. */
  readonly prepMinutes: number;
  /** Ordering closes this long before closing time: 0–120, in fifteens. */
  readonly lastOrderMinutes: number;
  /** How many orders may be sent or accepted at once: 1–30. */
  readonly maxInProgress: number;
}

/** What each setting may be: inclusive bounds and the stepper's step. `TakeawaySettingsBounds`. */
export interface TakeawaySettingsBounds {
  readonly prepMinutesMin: number;
  readonly prepMinutesMax: number;
  readonly prepMinutesStep: number;
  readonly lastOrderMinutesMin: number;
  readonly lastOrderMinutesMax: number;
  readonly lastOrderMinutesStep: number;
  readonly maxInProgressMin: number;
  readonly maxInProgressMax: number;
}

/** `GET /api/branches/{branchId}/takeaway-settings`, and the PUT's answer. */
export interface TakeawaySettings extends TakeawaySettingsInput {
  readonly bounds: TakeawaySettingsBounds;
  /** 5: shown in the auto-accept switch's help. */
  readonly acceptWindowMinutes: number;
  /** 30: when "no-show" may be marked. */
  readonly noShowAfterMinutes: number;
}

export const TAKEAWAY_SETTINGS_BOUNDS: TakeawaySettingsBounds = {
  prepMinutesMin: 5,
  prepMinutesMax: 90,
  prepMinutesStep: 5,
  lastOrderMinutesMin: 0,
  lastOrderMinutesMax: 120,
  lastOrderMinutesStep: 15,
  maxInProgressMin: 1,
  maxInProgressMax: 30,
};

export const DEFAULT_TAKEAWAY_SETTINGS: TakeawaySettings = {
  enabled: false,
  autoAccept: false,
  prepMinutes: 20,
  lastOrderMinutes: 30,
  maxInProgress: 5,
  bounds: TAKEAWAY_SETTINGS_BOUNDS,
  acceptWindowMinutes: TAKEAWAY_ACCEPT_WINDOW_MINUTES,
  noShowAfterMinutes: TAKEAWAY_NO_SHOW_AFTER_MINUTES,
};

/**
 * Every setting out of bounds or off its step, in the server's field names —
 * so the card marks the same fields before saving as after a 422. Empty when
 * the settings may be saved.
 */
export function takeawaySettingsViolations(
  input: TakeawaySettingsInput,
  bounds: TakeawaySettingsBounds = TAKEAWAY_SETTINGS_BOUNDS,
): readonly FieldViolation[] {
  const violations: FieldViolation[] = [];
  const check = (field: string, value: number, min: number, max: number, step = 1) => {
    if (!Number.isInteger(value) || value < min || value > max || (value - min) % step !== 0) {
      violations.push({
        field,
        message:
          step > 1
            ? `${field} must be between ${min} and ${max}, in steps of ${step}.`
            : `${field} must be between ${min} and ${max}.`,
        bound: 'range',
        min,
        max,
      });
    }
  };
  check(
    'prepMinutes',
    input.prepMinutes,
    bounds.prepMinutesMin,
    bounds.prepMinutesMax,
    bounds.prepMinutesStep,
  );
  check(
    'lastOrderMinutes',
    input.lastOrderMinutes,
    bounds.lastOrderMinutesMin,
    bounds.lastOrderMinutesMax,
    bounds.lastOrderMinutesStep,
  );
  check('maxInProgress', input.maxInProgress, bounds.maxInProgressMin, bounds.maxInProgressMax);
  return violations;
}

// ---------------------------------------------------------------------------
// Notifications
// ---------------------------------------------------------------------------

/** The feed entries (params `venueName`, `branchName`, `code`, `readyTime`, `readyAtUtc`; declined: `code`, `noAnswer`, `reason`). `orderId` is set. */
export const TAKEAWAY_FEED_KINDS = [
  'takeaway-accepted',
  'takeaway-ready',
  'takeaway-declined',
] as const;
export type TakeawayFeedKind = (typeof TAKEAWAY_FEED_KINDS)[number];

/** The pushes' `data.kind` — the same three words; `data.orderId` and `data.code` beside it. */
export const TAKEAWAY_PUSH_KINDS = TAKEAWAY_FEED_KINDS;

/** Whether a feed entry or push kind is a takeaway one: a tap opens the order's status screen. */
export function isTakeawayNotificationKind(
  kind: string | null | undefined,
): kind is TakeawayFeedKind {
  return kind != null && (TAKEAWAY_FEED_KINDS as readonly string[]).includes(kind);
}

// ---------------------------------------------------------------------------
// The rules, as the screens and the mocks read them
// ---------------------------------------------------------------------------

function shift(instant: string, minutes: number): string {
  return new Date(Date.parse(instant) + minutes * 60_000).toISOString();
}

/**
 * Whether a change-stream entry's signal asks for the takeaway counter (and
 * the kitchen's queue, where an accepted order is a ticket) to be read again:
 * `takeawayChanged` (8, 2026-10-26) — any takeaway order at the branch placed,
 * accepted, declined, cancelled, ready, collected or not collected. Never
 * folded into the floor: the row names no table and no order.
 */
export function readsTakeawayCounter(signal: FloorChangeSignal | null | undefined): boolean {
  return signal === 'takeawayChanged';
}

/** Still moving: sent, accepted or ready. The Orders tab lists these first; the status screen polls. */
export function isTakeawayActive(status: TakeawayStatus): boolean {
  return status === 'sent' || status === 'accepted' || status === 'ready';
}

/** In the kitchen's hands, as `maxInProgress` counts: sent or accepted. */
export function isTakeawayInProgress(status: TakeawayStatus): boolean {
  return status === 'sent' || status === 'accepted';
}

/**
 * From when "no-show" may be marked: thirty minutes after ready — the later of
 * the promised time and the kitchen's "ready", since the guest was told when
 * it was. `null` until accepted.
 */
export function takeawayNoShowFromUtc(order: {
  readonly readyAtUtc: string | null;
  readonly readyMarkedAtUtc: string | null;
}): string | null {
  const promised = order.readyAtUtc ? Date.parse(order.readyAtUtc) : Number.NaN;
  const marked = order.readyMarkedAtUtc ? Date.parse(order.readyMarkedAtUtc) : Number.NaN;
  const later = Math.max(
    Number.isFinite(promised) ? promised : -Infinity,
    Number.isFinite(marked) ? marked : -Infinity,
  );
  if (!Number.isFinite(later)) return null;
  return shift(new Date(later).toISOString(), TAKEAWAY_NO_SHOW_AFTER_MINUTES);
}

/** Whether the counter shows "No-show": ready, and at least thirty minutes past ready. */
export function canMarkTakeawayNoShow(
  order: Pick<StaffTakeawayOrder, 'status' | 'noShowFromUtc' | 'readyAtUtc' | 'readyMarkedAtUtc'>,
  now: Date,
): boolean {
  if (order.status !== 'ready') return false;
  const from = order.noShowFromUtc ?? takeawayNoShowFromUtc(order);
  return from !== null && now.getTime() >= Date.parse(from);
}

/**
 * The ready time the tablet's stepper starts from: the time the guest asked
 * for (ASAP: now + the preparation time, which the server already wrote as
 * `requestedPickupUtc`), never in the past.
 */
export function defaultTakeawayReadyAtUtc(
  order: Pick<StaffTakeawayOrder, 'requestedPickupUtc'>,
  now: Date,
): string {
  const requested = Date.parse(order.requestedPickupUtc);
  return new Date(Math.max(requested, now.getTime())).toISOString();
}

/**
 * The stepper's ±5 minutes: `steps` fives on from `readyAtUtc`, never before
 * now (the server refuses a ready time in the past).
 */
export function stepTakeawayReadyAtUtc(readyAtUtc: string, steps: number, now: Date): string {
  const next = Date.parse(readyAtUtc) + steps * TAKEAWAY_READY_STEP_MINUTES * 60_000;
  return new Date(Math.max(next, now.getTime())).toISOString();
}

/** A dish the takeaway menu offers: not sold out, and not "only in the hall". */
export function isTakeawayable(item: MenuItemDetail): boolean {
  return item.isAvailable && item.availableForTakeaway !== false;
}

/** How many dishes in all — "4 items". */
export function takeawayItemCount(lines: readonly { readonly quantity: number }[]): number {
  return lines.reduce((sum, entry) => sum + entry.quantity, 0);
}

function trimmed(value: string | null | undefined): string {
  return (value ?? '').trim();
}

/** Trimmed, blank as none: what the server keeps of a note or a reason. */
export function takeawayNote(value: string | null | undefined): string | null {
  const text = trimmed(value);
  return text === '' ? null : text;
}

/**
 * The bounds the server checks on an order, in its field names (`lines`,
 * `lines[2].quantity`, `note`), so the checkout marks the same fields before
 * sending as after a 422. Empty when the order may be sent.
 */
export function takeawayOrderViolations(
  order: Pick<PlaceTakeawayOrderCommand, 'lines' | 'note'>,
): readonly FieldViolation[] {
  const violations: FieldViolation[] = [];
  const { lines } = order;
  if (lines.length < 1 || lines.length > TAKEAWAY_LIMITS.maxLines) {
    violations.push({
      field: 'lines',
      message: `Between 1 and ${TAKEAWAY_LIMITS.maxLines} dishes.`,
      bound: 'range',
      min: 1,
      max: TAKEAWAY_LIMITS.maxLines,
    });
  } else if (takeawayItemCount(lines) > TAKEAWAY_LIMITS.maxTotalQuantity) {
    violations.push({
      field: 'lines',
      message: `At most ${TAKEAWAY_LIMITS.maxTotalQuantity} dishes in all.`,
      bound: 'max',
      max: TAKEAWAY_LIMITS.maxTotalQuantity,
    });
  }
  lines.forEach((entry, index) => {
    if (
      !Number.isInteger(entry.quantity) ||
      entry.quantity < 1 ||
      entry.quantity > TAKEAWAY_LIMITS.maxQuantity
    ) {
      violations.push({
        field: `lines[${index}].quantity`,
        message: `Between 1 and ${TAKEAWAY_LIMITS.maxQuantity}.`,
        bound: 'range',
        min: 1,
        max: TAKEAWAY_LIMITS.maxQuantity,
      });
    }
  });
  if (trimmed(order.note).length > TAKEAWAY_LIMITS.maxNote) {
    violations.push({
      field: 'note',
      message: `At most ${TAKEAWAY_LIMITS.maxNote} characters.`,
      bound: 'max',
      max: TAKEAWAY_LIMITS.maxNote,
    });
  }
  return violations;
}
