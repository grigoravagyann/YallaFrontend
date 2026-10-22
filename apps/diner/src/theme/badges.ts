import type { BookingStatus, OrderStatus } from '@yalla/api';
import { colors } from './colors';

export type BadgeVariant =
  | 'open'
  | 'closed'
  | 'popular'
  | 'new'
  | 'reserved'
  | 'occupied'
  | 'outOfService'
  | 'free'
  | 'confirmed'
  | 'preparing'
  | 'served'
  | 'awaiting'
  | 'inProgress'
  | 'ready'
  | 'completed'
  | 'cancelled';

export type BadgeTone = 'solid' | 'soft';

export interface BadgeSpec {
  /** The fill when solid — on photos and in the table bar. */
  readonly solid: string;
  /** The label and dot on `solid`. */
  readonly onSolid: string;
  /** The tinted fill when soft — on cards. */
  readonly soft: string;
  /** The label and dot on `soft`: the hue's ink, never its bright fill. */
  readonly ink: string;
  /** An edge round the pill, in either tone; none when absent. */
  readonly edge?: string;
  /** Key in the `diner` namespace. */
  readonly labelKey: string;
}

const success = {
  solid: colors.successStrong,
  onSolid: colors.onSuccessStrong,
  soft: colors.successSoft,
  ink: colors.successInk,
} as const;

const warning = {
  solid: colors.warningStrong,
  onSolid: colors.onWarningStrong,
  soft: colors.warningSoft,
  ink: colors.warningInk,
} as const;

const error = {
  solid: colors.errorStrong,
  onSolid: colors.onErrorStrong,
  soft: colors.errorSoft,
  ink: colors.errorInk,
} as const;

/** The soft burgundy pill: Preparing, Awaiting confirmation. */
const brandSoft = {
  solid: colors.primarySoft,
  onSolid: colors.primary,
  soft: colors.primarySoft,
  ink: colors.primary,
} as const;

/**
 * White, edged in the logo's burgundy, with a charcoal label, like the
 * category chips on Explore: Awaiting venue, on a photo and on a card alike.
 */
const outlined = {
  solid: colors.surface,
  onSolid: colors.text,
  soft: colors.surface,
  ink: colors.text,
  edge: colors.logoInk,
} as const;

/** The filled burgundy pill: Served. */
const brandFilled = {
  solid: colors.brand,
  onSolid: colors.onPrimary,
  soft: colors.brand,
  ink: colors.onPrimary,
} as const;

const neutral = {
  solid: colors.neutralStrong,
  onSolid: colors.onNeutralStrong,
  soft: colors.neutralSoft,
  ink: colors.neutralBadge,
} as const;

/**
 * What each badge means, and the one colour it is allowed to be.
 *
 * Open / Free / Confirmed / Ready are green; Reserved / In progress are orange;
 * Occupied / Cancelled are red; Closed / Completed / Out of service are grey;
 * Popular is the brand burgundy and New the deep burgundy of `info`. The kitchen's and the
 * venue's "not yet" is the soft burgundy pill for Preparing and a white pill
 * edged in burgundy for Awaiting venue, in either tone, and Served the filled one: those two never change with
 * the ground they sit on. Availability (Open / Closed) and
 * content (Popular / New) are separate variants so a card can carry both.
 *
 * Pure data, apart from the component, so `contrast.test.ts` can hold every
 * pairing here without rendering anything.
 */
export const badgeVariants: Record<BadgeVariant, BadgeSpec> = {
  open: { ...success, labelKey: 'place.status.open' },
  closed: { ...neutral, labelKey: 'place.status.closed' },
  popular: {
    solid: colors.brand,
    onSolid: colors.onPrimary,
    soft: colors.primarySoft,
    ink: colors.primary,
    labelKey: 'place.badge.popular',
  },
  new: {
    solid: colors.infoStrong,
    onSolid: colors.onInfoStrong,
    soft: colors.infoSoft,
    ink: colors.infoInk,
    labelKey: 'place.badge.new',
  },
  free: { ...success, labelKey: 'tables.status.free' },
  reserved: { ...warning, labelKey: 'tables.status.reserved' },
  occupied: { ...error, labelKey: 'tables.status.occupied' },
  outOfService: { ...neutral, labelKey: 'tables.status.outOfService' },
  confirmed: { ...success, labelKey: 'orders.status.confirmed' },
  preparing: { ...brandSoft, labelKey: 'orders.status.preparing' },
  served: { ...brandFilled, labelKey: 'bill.lineStatus.served' },
  awaiting: { ...outlined, labelKey: 'bookings.status.pendingApproval' },
  inProgress: { ...warning, labelKey: 'orders.status.inProgress' },
  ready: { ...success, labelKey: 'orders.status.ready' },
  completed: { ...neutral, labelKey: 'orders.status.completed' },
  cancelled: { ...error, labelKey: 'orders.status.cancelled' },
};

/** The fill and label colour a badge is drawn in for a tone. */
export function badgeColors(variant: BadgeVariant, tone: BadgeTone) {
  const spec = badgeVariants[variant];
  return tone === 'solid'
    ? { background: spec.solid, foreground: spec.onSolid, edge: spec.edge }
    : { background: spec.soft, foreground: spec.ink, edge: spec.edge };
}

/**
 * A booking's status in the one pill vocabulary the app has.
 *
 * The colour comes from the nearest order/table variant, the words from the
 * booking's own `bookings.status.*` copy — so "Awaiting venue" is the white
 * pill edged in burgundy, and a venue cancellation
 * is red where the diner's own is grey. Which side cancelled is the one thing a list reader wants to know.
 */
export const bookingBadgeVariant: Readonly<Record<BookingStatus, BadgeVariant>> = {
  confirmed: 'confirmed',
  pendingApproval: 'awaiting',
  seated: 'ready',
  completed: 'completed',
  cancelledByDiner: 'closed',
  cancelledByVenue: 'cancelled',
  noShow: 'cancelled',
  unknown: 'closed',
};

/**
 * Where the kitchen is with a line, as the pill under its price: Preparing is
 * the soft burgundy pill, Served the filled one; a line nobody has picked up
 * yet keeps the deep burgundy of "new", one waiting at the pass the green of ready.
 */
export function lineBadge(
  status: OrderStatus,
): { readonly variant: BadgeVariant; readonly labelKey?: string } | null {
  switch (status) {
    case 'new':
      return { variant: 'new', labelKey: 'bill.lineStatus.new' };
    case 'inKitchen':
      return { variant: 'preparing' };
    case 'ready':
      return { variant: 'ready' };
    case 'served':
      return { variant: 'served' };
    case 'voided':
      return null;
  }
}
