import { colors } from './colors';

export type BadgeVariant =
  | 'open'
  | 'closed'
  | 'popular'
  | 'new'
  | 'reserved'
  | 'occupied'
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
  /** The tinted fill when soft — on white cards. */
  readonly soft: string;
  /** The label and dot on `soft`: the hue's ink, never its bright fill. */
  readonly ink: string;
  /** Key in the `diner` namespace. */
  readonly labelKey: string;
}

const success = {
  solid: colors.successInk,
  onSolid: colors.onImage,
  soft: colors.successSoft,
  ink: colors.successInk,
} as const;

/** Orange is light: the solid pill carries dark text, the soft one the ink. */
const warning = {
  solid: colors.warning,
  onSolid: colors.text,
  soft: colors.warningSoft,
  ink: colors.warningInk,
} as const;

const error = {
  solid: colors.errorInk,
  onSolid: colors.onImage,
  soft: colors.errorSoft,
  ink: colors.errorInk,
} as const;

const neutral = {
  solid: colors.neutralBadge,
  onSolid: colors.onImage,
  soft: colors.neutralSoft,
  ink: colors.neutralBadge,
} as const;

/**
 * What each badge means, and the one colour it is allowed to be.
 *
 * Open / Free / Confirmed / Ready are green; Reserved / Preparing / In progress
 * are orange; Occupied / Cancelled are red; Closed / Completed are grey;
 * Popular is the brown and New the blue. Availability (Open / Closed) and
 * content (Popular / New) are separate variants so a card can carry both.
 *
 * Pure data, apart from the component, so `contrast.test.ts` can hold every
 * pairing here without rendering anything.
 */
export const badgeVariants: Record<BadgeVariant, BadgeSpec> = {
  open: { ...success, labelKey: 'place.status.open' },
  closed: { ...neutral, labelKey: 'place.status.closed' },
  popular: {
    solid: colors.primary,
    onSolid: colors.onPrimary,
    soft: colors.primarySoft,
    ink: colors.primary,
    labelKey: 'place.badge.popular',
  },
  new: {
    solid: colors.infoInk,
    onSolid: colors.onImage,
    soft: colors.infoSoft,
    ink: colors.infoInk,
    labelKey: 'place.badge.new',
  },
  free: { ...success, labelKey: 'tables.status.free' },
  reserved: { ...warning, labelKey: 'tables.status.reserved' },
  occupied: { ...error, labelKey: 'tables.status.occupied' },
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
