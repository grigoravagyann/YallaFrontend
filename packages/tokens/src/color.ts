/**
 * Raw palette. Nothing outside this file should reference a hex literal.
 */
const palette = {
  ink900: '#12100E',
  ink700: '#3A3733',
  ink500: '#6B655D',
  ink300: '#A8A199',
  ink100: '#E4DFD8',
  ink50: '#F5F2EE',
  white: '#FFFFFF',

  apricot600: '#C2410C',
  apricot500: '#EA580C',
  apricot100: '#FFEDD5',

  pomegranate600: '#B91C1C',
  pomegranate500: '#DC2626',
  pomegranate100: '#FEE2E2',

  basil600: '#15803D',
  basil500: '#16A34A',
  basil100: '#DCFCE7',

  sky600: '#0369A1',
  sky500: '#0284C7',
  sky100: '#E0F2FE',

  amber600: '#B45309',
  amber500: '#D97706',
  amber100: '#FEF3C7',

  slate500: '#64748B',
  slate100: '#F1F5F9',
} as const;

export const color = {
  background: palette.ink50,
  surface: palette.white,
  surfaceMuted: palette.ink100,
  border: palette.ink300,

  textPrimary: palette.ink900,
  textSecondary: palette.ink500,
  textInverse: palette.white,

  accent: palette.apricot500,
  accentStrong: palette.apricot600,
  accentMuted: palette.apricot100,

  danger: palette.pomegranate500,
  success: palette.basil500,
  warning: palette.amber500,
  info: palette.sky500,
} as const;

export type ColorToken = keyof typeof color;

/**
 * The six states a table can be in on a floor plan.
 *
 * `yourPick` is the diner-side-only state for the table the diner is currently
 * selecting; staff never see it.
 */
export type TableStatus = 'free' | 'reserved' | 'occupied' | 'yourPick' | 'held' | 'outOfService';

/**
 * How a table state is drawn.
 *
 * Colour alone is not enough: roughly 1 in 12 men has a red/green deficiency, and
 * a terrace in Yerevan in July is bright enough to wash out hue differences on a
 * phone at any brightness. Every state therefore also differs in its border
 * treatment and fill pattern, so the floor plan stays readable in greyscale.
 */
export interface TableStatusStyle {
  /** Fill of the table shape. */
  readonly fill: string;
  /** Border/stroke colour. */
  readonly stroke: string;
  /** Stroke width in canvas units. */
  readonly strokeWidth: number;
  /**
   * SVG dash array for the border, or `null` for a solid border.
   * Expressed as a tuple so consumers can join it however their renderer wants.
   */
  readonly strokeDash: readonly number[] | null;
  /** Fill pattern layered over `fill`. Redundant encoding for the colour channel. */
  readonly pattern: 'none' | 'diagonalStripes' | 'crosshatch' | 'dots';
  /** Colour for the table label drawn on top of the shape. */
  readonly label: string;
  /**
   * Stable key for the translated legend entry, resolved by the consuming app
   * against the `common` i18n namespace. Never a human-readable string: the
   * legend is rendered in three languages.
   */
  readonly legendKey: `tableStatus.${TableStatus}`;
}

export const tableStatusStyle: Readonly<Record<TableStatus, TableStatusStyle>> = {
  free: {
    fill: palette.basil100,
    stroke: palette.basil600,
    strokeWidth: 2,
    strokeDash: null,
    pattern: 'none',
    label: palette.ink900,
    legendKey: 'tableStatus.free',
  },
  reserved: {
    fill: palette.amber100,
    stroke: palette.amber600,
    strokeWidth: 2,
    strokeDash: [6, 4],
    pattern: 'diagonalStripes',
    label: palette.ink900,
    legendKey: 'tableStatus.reserved',
  },
  occupied: {
    fill: palette.pomegranate100,
    stroke: palette.pomegranate600,
    strokeWidth: 2,
    strokeDash: null,
    pattern: 'crosshatch',
    label: palette.ink900,
    legendKey: 'tableStatus.occupied',
  },
  yourPick: {
    fill: palette.apricot100,
    stroke: palette.apricot600,
    strokeWidth: 4,
    strokeDash: null,
    pattern: 'none',
    label: palette.ink900,
    legendKey: 'tableStatus.yourPick',
  },
  held: {
    fill: palette.sky100,
    stroke: palette.sky600,
    strokeWidth: 2,
    strokeDash: [2, 3],
    pattern: 'dots',
    label: palette.ink900,
    legendKey: 'tableStatus.held',
  },
  outOfService: {
    fill: palette.slate100,
    stroke: palette.slate500,
    strokeWidth: 1,
    strokeDash: [1, 4],
    pattern: 'diagonalStripes',
    label: palette.ink500,
    legendKey: 'tableStatus.outOfService',
  },
} as const;

/** Order the legend is rendered in, shared by the diner and staff apps. */
export const tableStatusLegendOrder: readonly TableStatus[] = [
  'free',
  'reserved',
  'occupied',
  'held',
  'outOfService',
  'yourPick',
] as const;
