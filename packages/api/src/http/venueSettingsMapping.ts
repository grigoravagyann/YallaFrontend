import type {
  HoursBlock,
  PolicyChangeResult,
  ReservationPolicy,
  WeekdayIndex,
  WeeklyHours,
} from '../contracts/branchSettings';
import { WEEK_ORDER } from '../contracts/branchSettings';
import type {
  AdminMenuCategory,
  AdminMenuItem,
  MenuItemDeletion,
  Photo,
} from '../contracts/menuAdmin';
import type { SpiceLevel } from '../contracts/ordering';
import type { components } from '../generated/schema';

type Schemas = components['schemas'];
type WireCategory = Schemas['Yalla.Application.Menus.MenuCategoryView'];
type WireItem = Schemas['Yalla.Application.Menus.MenuItemView'];
type WirePhoto = Schemas['Yalla.Application.Media.PhotoView'];
type WireHours = Schemas['Yalla.Application.BranchSettings.OpeningHoursView'];
type WirePolicy = Schemas['Yalla.Application.BranchSettings.ReservationPolicyView'];
type WirePolicyResult = Schemas['Yalla.Application.BranchSettings.ReservationPolicyChangeResult'];

/**
 * Wire shapes to the console's venue-settings shapes.
 *
 * Its own module rather than more of `consoleMapping.ts`, which is about
 * venues and floor plans. These three screens share nothing with those and are
 * each one PUT or a handful of PATCHes; keeping them together means the menu's
 * spice enum and the week's day numbering live next to each other, and both are
 * the kind of thing that is wrong in exactly one place or in every place.
 */

// --- Enums --------------------------------------------------------------------

/** `Yalla.Domain.Enums.SpiceLevel`: 0 NotSpicy, 1 Mild, 2 Medium, 3 Hot. */
const SPICE: Readonly<Record<number, SpiceLevel>> = {
  0: 'notSpicy',
  1: 'mild',
  2: 'medium',
  3: 'hot',
};

const SPICE_CODE: Readonly<Record<SpiceLevel, 0 | 1 | 2 | 3>> = {
  notSpicy: 0,
  mild: 1,
  medium: 2,
  hot: 3,
};

export function spiceLevel(value: number): SpiceLevel {
  return SPICE[value] ?? 'notSpicy';
}

export function spiceCode(level: SpiceLevel): 0 | 1 | 2 | 3 {
  return SPICE_CODE[level];
}

// --- Photos --------------------------------------------------------------------

export function photo(view: WirePhoto): Photo {
  return {
    photoId: view.photoId,
    thumbnailUrl: view.thumbnailUrl,
    cardUrl: view.cardUrl,
    fullUrl: view.fullUrl,
    width: view.width ?? null,
    height: view.height ?? null,
  };
}

// --- The menu -------------------------------------------------------------------

export function adminItem(view: WireItem): AdminMenuItem {
  return {
    id: view.id,
    categoryId: view.categoryId,
    name: view.name,
    description: view.description,
    priceDram: view.priceAmd,
    ingredients: view.ingredients,
    allergens: view.allergens,
    portionSize: view.portionSize,
    spiceLevel: spiceLevel(view.spiceLevel),
    prepMinutes: view.prepMinutes,
    photo: photo(view.photo),
    isAvailable: view.isAvailable,
    displayOrder: view.displayOrder,
  };
}

/**
 * Categories and items, each sorted by their own display order.
 *
 * Sorted here rather than trusted from the server: the editor's drag reorder
 * sends a display order and reads one back, and a list that came back in
 * insertion order would have a row jump somewhere else the moment it saved.
 */
export function adminCategory(view: WireCategory): AdminMenuCategory {
  return {
    id: view.id,
    name: view.name,
    displayOrder: view.displayOrder,
    items: [...view.items].sort((a, b) => a.displayOrder - b.displayOrder).map(adminItem),
  };
}

export function adminMenu(views: readonly WireCategory[]): readonly AdminMenuCategory[] {
  return [...views].sort((a, b) => a.displayOrder - b.displayOrder).map(adminCategory);
}

export function menuItemDeletion(
  view: Schemas['Yalla.Application.Menus.MenuItemDeletionResult'],
): MenuItemDeletion {
  return {
    itemId: view.itemId,
    deleted: view.deleted,
    deactivated: view.deactivated,
    message: view.message,
  };
}

// --- Opening hours ---------------------------------------------------------------

/** `09:00:00` → `09:00`. Seconds in an opening time are noise on every row. */
export function toClientTime(wire: string): string {
  const match = /^(\d{1,2}):(\d{2})/u.exec(wire);
  if (!match) return wire;
  return `${match[1]!.padStart(2, '0')}:${match[2]}`;
}

/** `09:00` → `09:00:00`, which is what `Format: time` expects. */
export function toWireTime(client: string): string {
  const match = /^(\d{1,2}):(\d{2})/u.exec(client.trim());
  if (!match) return client;
  return `${match[1]!.padStart(2, '0')}:${match[2]}:00`;
}

/**
 * The flat block list into seven days, Monday first.
 *
 * Every day is present even when it has no blocks — that is what "closed" is,
 * and a screen that rendered only the days the server sent would show a
 * five-row week for a venue that shuts at weekends, with no way to open one.
 *
 * `closesNextDay` is dropped rather than carried: it is derived from the two
 * times, the client derives it the same way for its preview, and keeping a
 * second copy is how the two come to disagree.
 */
export function weeklyHours(views: readonly WireHours[]): WeeklyHours {
  const byDay = new Map<WeekdayIndex, HoursBlock[]>();
  for (const day of WEEK_ORDER) byDay.set(day, []);

  for (const view of views) {
    const day = view.day as WeekdayIndex;
    const blocks = byDay.get(day);
    if (!blocks) continue;
    blocks.push({ opensAt: toClientTime(view.opensAt), closesAt: toClientTime(view.closesAt) });
  }

  return WEEK_ORDER.map((day) => ({
    day,
    blocks: (byDay.get(day) ?? []).sort((a, b) => a.opensAt.localeCompare(b.opensAt)),
  }));
}

/** Seven days back to the flat list. A closed day contributes nothing. */
export function hoursBlocks(
  week: WeeklyHours,
): readonly Schemas['Yalla.Application.BranchSettings.OpeningHoursBlock'][] {
  return week.flatMap((day) =>
    day.blocks.map((block) => ({
      day: day.day,
      opensAt: toWireTime(block.opensAt),
      closesAt: toWireTime(block.closesAt),
    })),
  );
}

// --- The reservation policy --------------------------------------------------------

export function reservationPolicy(view: WirePolicy): ReservationPolicy {
  return {
    turnTimeMinutes: view.turnTimeMinutes,
    bufferMinutes: view.bufferMinutes,
    graceMinutes: view.graceMinutes,
    lateNudgeAfterMinutes: view.lateNudgeAfterMinutes,
    graceExtensionMinutes: view.graceExtensionMinutes,
    minLeadMinutes: view.minLeadMinutes,
    bookingWindowDays: view.bookingWindowDays,
    cancellationDeadlineMinutes: view.cancellationDeadlineMinutes,
    walkInHoldbackMinutes: view.walkInHoldbackMinutes,
    autoConfirm: view.autoConfirm,
    approvalRequiredAbovePartySize: view.approvalRequiredAbovePartySize ?? null,
    maxSeatOverhang: view.maxSeatOverhang ?? null,
    serviceChargePercent: view.serviceChargePercent,
    pricesIncludeVat: view.pricesIncludeVat,
  };
}

export function policyCommand(
  policy: ReservationPolicy,
): Schemas['Yalla.Application.BranchSettings.ReservationPolicyCommand'] {
  return {
    turnTimeMinutes: policy.turnTimeMinutes,
    bufferMinutes: policy.bufferMinutes,
    graceMinutes: policy.graceMinutes,
    lateNudgeAfterMinutes: policy.lateNudgeAfterMinutes,
    graceExtensionMinutes: policy.graceExtensionMinutes,
    minLeadMinutes: policy.minLeadMinutes,
    bookingWindowDays: policy.bookingWindowDays,
    cancellationDeadlineMinutes: policy.cancellationDeadlineMinutes,
    walkInHoldbackMinutes: policy.walkInHoldbackMinutes,
    autoConfirm: policy.autoConfirm,
    approvalRequiredAbovePartySize: policy.approvalRequiredAbovePartySize,
    maxSeatOverhang: policy.maxSeatOverhang,
    serviceChargePercent: policy.serviceChargePercent,
    pricesIncludeVat: policy.pricesIncludeVat,
  };
}

export function policyChangeResult(view: WirePolicyResult): PolicyChangeResult {
  return {
    policy: reservationPolicy(view.policy),
    affectedExistingReservations: view.affectedExistingReservations,
    affectedReservationIds: view.affectedReservationIds ?? [],
  };
}

// --- Bounds refusals ----------------------------------------------------------------

/**
 * The prose the server refuses with, mapped back to the field it is about.
 *
 * `ReservationPolicyLimits.Validate` throws `ArgumentOutOfRangeException` with
 * a message that opens with the field's label — *"Turn time must be between 15
 * and 360 minutes; 5 minutes was given."* — and the API's mapper turns that
 * into a 400 whose body carries the message and **nothing else**: no `errors`
 * map, no `context`, no field name. So this table is the only way a refusal
 * lands against the input it is about rather than at the top of the page.
 *
 * Matched on the label at the start of the message, which is what the server
 * puts there. A message that matches nothing yields `null`, and the screen then
 * shows it form-level — wrong-looking but never lost.
 */
const BOUNDS_LABELS: readonly (readonly [string, keyof ReservationPolicy])[] = [
  ['Turn time', 'turnTimeMinutes'],
  ['Buffer', 'bufferMinutes'],
  ['Grace period', 'graceMinutes'],
  ['Late nudge delay', 'lateNudgeAfterMinutes'],
  ['Grace extension', 'graceExtensionMinutes'],
  ['Minimum lead time', 'minLeadMinutes'],
  ['Booking window', 'bookingWindowDays'],
  ['Cancellation deadline', 'cancellationDeadlineMinutes'],
  ['Walk-in holdback', 'walkInHoldbackMinutes'],
  ['Service charge', 'serviceChargePercent'],
];

export function policyFieldFromMessage(detail: string): keyof ReservationPolicy | null {
  const text = detail.trim();
  for (const [label, field] of BOUNDS_LABELS) {
    if (text.toLowerCase().startsWith(label.toLowerCase())) return field;
  }
  // `ArgumentOutOfRangeException` also prefixes with "(Parameter 'Turn time')"
  // in some framings, so the label is looked for anywhere as a fallback.
  for (const [label, field] of BOUNDS_LABELS) {
    if (text.toLowerCase().includes(label.toLowerCase())) return field;
  }
  return null;
}

/** Which days the server named in an overlap refusal, when it named any. */
export function overlappingDaysFromMessage(detail: string): readonly number[] {
  const names = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  const lower = detail.toLowerCase();
  return names.map((name, index) => (lower.includes(name) ? index : -1)).filter((i) => i >= 0);
}
