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

const neutral = {
  solid: colors.neutralStrong,
  onSolid: colors.onNeutralStrong,
  soft: colors.neutralSoft,
  ink: colors.neutralBadge,
} as const;

/**
 * What each badge means, and the one colour it is allowed to be.
 *
 * Open / Free / Confirmed / Ready are green; Reserved / Preparing / In progress
 * are orange; Occupied / Cancelled are red; Closed / Completed / Out of service are grey;
 * Popular is the brand brown and New the blue. Availability (Open / Closed) and
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
  preparing: { ...warning, labelKey: 'orders.status.preparing' },
  inProgress: { ...warning, labelKey: 'orders.status.inProgress' },
  ready: { ...success, labelKey: 'orders.status.ready' },
  completed: { ...neutral, labelKey: 'orders.status.completed' },
  cancelled: { ...error, labelKey: 'orders.status.cancelled' },
};

/** The fill and label colour a badge is drawn in for a tone. */
export function badgeColors(variant: BadgeVariant, tone: BadgeTone) {
  const spec = badgeVariants[variant];
  return tone === 'solid'
    ? { background: spec.solid, foreground: spec.onSolid }
    : { background: spec.soft, foreground: spec.ink };
}
