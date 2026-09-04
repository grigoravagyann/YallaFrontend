import type { FloorPlanMode, FloorTable, Point, Rect } from './types';

/**
 * Floors that geometry is NOT allowed to scale below.
 *
 * This is the whole trick of this module. Scaling everything uniformly works
 * for the tablet and breaks the phone: at ~380pt wide a real room scales to
 * roughly a third, which turns a 12pt label into 4pt and a 60cm two-top into a
 * 20px tap target. Rectangles can shrink; fingertips and eyes cannot.
 */
export const MIN_FONT_SIZE_PX = 11;

/** Apple HIG and Material both land on 44pt as the smallest reliable tap area. */
export const MIN_TAP_TARGET_PX = 44;

/**
 * Staff tap targets are deliberately larger than the platform minimum. That
 * screen is used standing, at arm's length, mid-rush, by someone with ten
 * minutes of training.
 */
export const STAFF_MIN_TAP_TARGET_PX = 64;

/** Breathing room between the room edge and the viewport edge, in px. */
export const DEFAULT_PADDING_PX = 12;

/** Padding inside a table rect that a label must fit within, in px. */
const LABEL_INSET_PX = 3;

/**
 * Rough advance width of a digit at a given font size for a system sans face.
 *
 * Measuring text properly needs a layout engine, which this package cannot have
 * if it is to stay pure and testable. 0.62em is a deliberate over-estimate for
 * digits (~0.55em actual), so the rule errs toward hiding a label that would
 * *just* fit rather than showing one that clips. A clipped "12" reads as "1".
 */
const CHAR_WIDTH_RATIO = 0.62;

export function estimateTextWidth(text: string, fontSize: number): number {
  return text.length * fontSize * CHAR_WIDTH_RATIO;
}

export interface LaidOutTable {
  readonly id: string;
  /** The source table, so renderers need not carry a parallel lookup. */
  readonly table: FloorTable;
  /**
   * Drawn rectangle in pixels, *unrotated*. Renderers apply `rotationDegrees`
   * as a transform about {@link center}, which keeps the SVG output simple.
   */
  readonly rect: Rect;
  readonly center: Point;
  /** The four corners in pixels, with rotation already applied. */
  readonly corners: readonly [Point, Point, Point, Point];
  /**
   * Tappable region in pixels. Equals the axis-aligned bounds of the drawn
   * shape, expanded about the centre to at least the mode's minimum tap target.
   */
  readonly hitRect: Rect;
  /** True when {@link hitRect} is larger than the drawn shape's own bounds. */
  readonly hitExpanded: boolean;
  /** False when the table is too small to fit its label at {@link MIN_FONT_SIZE_PX}. */
  readonly labelVisible: boolean;
  /** Never below {@link MIN_FONT_SIZE_PX}. */
  readonly labelFontSize: number;
  /** Seat count only fits on comfortably large tables; secondary to the label. */
  readonly seatsVisible: boolean;
  /** Tappable in the current mode. */
  readonly selectable: boolean;
  /** Rendered faded: present and visible, but not actionable in this mode. */
  readonly dimmed: boolean;
}

export interface FloorLayout {
  /** Uniform floor-plan-units-to-pixels multiplier. */
  readonly scale: number;
  /** Pixel offset that centres the letterboxed room in the viewport. */
  readonly offsetX: number;
  readonly offsetY: number;
  /** Size of the drawn room in pixels, excluding the centring offsets. */
  readonly renderedWidth: number;
  readonly renderedHeight: number;
  readonly tables: readonly LaidOutTable[];
}

export interface ComputeFloorLayoutInput {
  readonly canvasWidth: number;
  readonly canvasHeight: number;
  readonly tables: readonly FloorTable[];
  readonly viewport: { readonly width: number; readonly height: number };
  /** Defaults to `'diner'`; only affects tap-target floor, selectability and dimming. */
  readonly mode?: FloorPlanMode;
  /** Diner mode only: tables seating fewer than this are not selectable. */
  readonly partySize?: number;
  readonly padding?: number;
  readonly minTapTargetPx?: number;
  readonly minFontSizePx?: number;
}

function rotatePoint(point: Point, origin: Point, degrees: number): Point {
  if (degrees === 0) return point;
  const radians = (degrees * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  const dx = point.x - origin.x;
  const dy = point.y - origin.y;
  return {
    x: origin.x + dx * cos - dy * sin,
    y: origin.y + dx * sin + dy * cos,
  };
}

/** Axis-aligned bounding box of a set of points. */
function boundsOf(points: readonly Point[]): Rect {
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

/** Grow a rect about its centre so it is at least `min` on both axes. */
function expandToMinimum(rect: Rect, min: number): Rect {
  const width = Math.max(rect.width, min);
  const height = Math.max(rect.height, min);
  return {
    x: rect.x + rect.width / 2 - width / 2,
    y: rect.y + rect.height / 2 - height / 2,
    width,
    height,
  };
}

/**
 * Whether a diner may pick this table.
 *
 * Pure and exported so the rule is testable on its own and cannot drift between
 * the layout pass and whatever the renderer decides to grey out.
 */
export function isTableSelectable(
  table: FloorTable,
  mode: FloorPlanMode,
  partySize: number,
): boolean {
  // A waiter acts on tables in every state — freeing an occupied one, taking a
  // broken one out of service. Nothing is off-limits and nothing is dimmed.
  if (mode === 'staff') return true;

  if (!table.isBookable) return false;
  if (table.seats < partySize) return false;
  // `held` is someone else's claim mid-checkout; `occupied` and `outOfService`
  // speak for themselves. Only these two states are bookable by a diner.
  return table.state === 'free' || table.state === 'reservedSoon';
}

export function tapTargetFloorFor(mode: FloorPlanMode): number {
  return mode === 'staff' ? STAFF_MIN_TAP_TARGET_PX : MIN_TAP_TARGET_PX;
}

/**
 * Map a room onto a viewport, and resolve every table's pixel geometry,
 * label visibility and hit region.
 *
 * Geometry scales uniformly and letterboxes; text and tap targets are floored.
 * See the module header for why those two are treated differently.
 *
 * Degenerate input (an unmeasured 0x0 viewport on the first render pass, a
 * zero-area canvas) yields `scale: 0` and no tables rather than `NaN`
 * coordinates or a divide-by-zero.
 */
export function computeFloorLayout(input: ComputeFloorLayoutInput): FloorLayout {
  const {
    canvasWidth,
    canvasHeight,
    tables,
    viewport,
    mode = 'diner',
    partySize = 1,
    padding = DEFAULT_PADDING_PX,
    minFontSizePx = MIN_FONT_SIZE_PX,
  } = input;

  const minTapTargetPx = input.minTapTargetPx ?? tapTargetFloorFor(mode);

  const availableWidth = Math.max(0, viewport.width - padding * 2);
  const availableHeight = Math.max(0, viewport.height - padding * 2);

  if (canvasWidth <= 0 || canvasHeight <= 0 || availableWidth <= 0 || availableHeight <= 0) {
    return {
      scale: 0,
      offsetX: padding,
      offsetY: padding,
      renderedWidth: 0,
      renderedHeight: 0,
      tables: [],
    };
  }

  // Uniform on both axes: a non-uniform fit would stretch the room, and a diner
  // comparing the plan to what they can see would not recognise it.
  // Letterboxing the remainder is the correct trade.
  const scale = Math.min(availableWidth / canvasWidth, availableHeight / canvasHeight);
  const renderedWidth = canvasWidth * scale;
  const renderedHeight = canvasHeight * scale;
  const offsetX = padding + (availableWidth - renderedWidth) / 2;
  const offsetY = padding + (availableHeight - renderedHeight) / 2;

  const laidOut = tables.map((table): LaidOutTable => {
    const rect: Rect = {
      x: offsetX + table.x * scale,
      y: offsetY + table.y * scale,
      width: table.width * scale,
      height: table.height * scale,
    };
    const center: Point = {
      x: rect.x + rect.width / 2,
      y: rect.y + rect.height / 2,
    };

    const unrotated: Point[] = [
      { x: rect.x, y: rect.y },
      { x: rect.x + rect.width, y: rect.y },
      { x: rect.x + rect.width, y: rect.y + rect.height },
      { x: rect.x, y: rect.y + rect.height },
    ];
    const corners = unrotated.map((p) =>
      rotatePoint(p, center, table.rotationDegrees),
    ) as unknown as readonly [Point, Point, Point, Point];

    // A rotated table's tappable area follows its rotated footprint, not the
    // unrotated rect — otherwise a 45-degree table has dead corners.
    const rotatedBounds = boundsOf(corners);
    const hitRect = expandToMinimum(rotatedBounds, minTapTargetPx);
    const hitExpanded =
      hitRect.width > rotatedBounds.width + 0.001 || hitRect.height > rotatedBounds.height + 0.001;

    // Label fit is judged against the drawn shape, not the expanded hit rect:
    // the hit rect is invisible, so text sized to it would overflow the table.
    const labelFontSize = minFontSizePx;
    const neededWidth = estimateTextWidth(table.label, labelFontSize) + LABEL_INSET_PX * 2;
    const neededHeight = labelFontSize + LABEL_INSET_PX * 2;
    const labelVisible = rect.width >= neededWidth && rect.height >= neededHeight;

    // Seats are supplementary; only show them when a second line genuinely fits.
    const seatsText = String(table.seats);
    const seatsNeededWidth = estimateTextWidth(seatsText, labelFontSize) + LABEL_INSET_PX * 2;
    const seatsVisible =
      labelVisible &&
      rect.height >= neededHeight + labelFontSize + LABEL_INSET_PX &&
      rect.width >= seatsNeededWidth;

    const selectable = isTableSelectable(table, mode, partySize);

    return {
      id: table.id,
      table,
      rect,
      center,
      corners,
      hitRect,
      hitExpanded,
      labelVisible,
      labelFontSize,
      seatsVisible,
      selectable,
      // Staff never dim anything — every table is actionable.
      dimmed: mode === 'diner' && !selectable,
    };
  });

  return { scale, offsetX, offsetY, renderedWidth, renderedHeight, tables: laidOut };
}
