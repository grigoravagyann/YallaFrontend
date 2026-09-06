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

/**
 * Below this viewport width the whole-room view stops being usable for a real
 * restaurant, and the component offers one area at a time instead. A number
 * rather than a device check: a narrow window on a desktop has the same
 * problem a phone does.
 */
export const AREA_MODE_MAX_WIDTH_PX = 600;

/**
 * Zoom bounds. `1` is fit-to-viewport — the room can never be pushed smaller
 * than the space it has, because a room floating in grey is not more readable
 * than one that fills the screen.
 */
export const MIN_ZOOM = 1;
export const MAX_ZOOM = 4;

/** Padding inside a table rect that a label must fit within, in px. */
const LABEL_INSET_PX = 3;

/**
 * How much of a table's drawn height the label may take. Text grows with the
 * room so that zooming in actually makes the plan more readable, rather than
 * magnifying rectangles around permanently 11px labels.
 */
const LABEL_HEIGHT_RATIO = 0.4;

/** Margin around an area's own bounds when it is fitted alone, as a fraction. */
const AREA_MARGIN_RATIO = 0.06;

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
  /** Never below {@link MIN_FONT_SIZE_PX}; grows with the drawn table. */
  readonly labelFontSize: number;
  /** Seat count only fits on comfortably large tables; secondary to the label. */
  readonly seatsVisible: boolean;
  /** Tappable in the current mode. */
  readonly selectable: boolean;
  /** Rendered faded: present and visible, but not actionable in this mode. */
  readonly dimmed: boolean;
}

export interface FloorLayout {
  /** Uniform floor-plan-units-to-pixels multiplier, zoom included. */
  readonly scale: number;
  /** The multiplier at which the fitted region exactly fills the viewport. */
  readonly fitScale: number;
  /** Clamped zoom actually applied, relative to {@link fitScale}. */
  readonly zoom: number;
  /** Clamped pan actually applied, in pixels. */
  readonly panX: number;
  readonly panY: number;
  /** Pixel offset that centres the letterboxed room in the viewport. */
  readonly offsetX: number;
  readonly offsetY: number;
  /** Size of the drawn room in pixels, excluding the centring offsets. */
  readonly renderedWidth: number;
  readonly renderedHeight: number;
  /** The area this layout was filtered to, or `null` for the whole room. */
  readonly areaFilter: string | null;
  /**
   * At least two tappable tables' hit regions overlap.
   *
   * The fact, not the remedy. A 30-table room on a phone cannot give every
   * table a 44pt target without the targets colliding, and once they collide a
   * tap resolves by nearest centre — which is how a diner taps table 12 and
   * selects table 11. The **component** reads this and decides to fall back to
   * one area at a time; this function only reports it.
   */
  readonly hasOverlappingHitRects: boolean;
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
  /**
   * Render one floor area alone, fitted to its own bounds rather than the
   * room's. `null` or absent draws the whole room.
   *
   * Matched against `FloorTable.floorAreaName`. An area with no tables yields
   * an empty layout rather than a divide-by-zero.
   */
  readonly areaFilter?: string | null;
  /** Multiplier on {@link FloorLayout.fitScale}. Clamped to [1, 4]. */
  readonly zoom?: number;
  /** Pan in pixels, clamped so the room always covers the viewport. */
  readonly panX?: number;
  readonly panY?: number;
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

function rectsOverlap(a: Rect, b: Rect): boolean {
  // Touching edges are not an overlap: two 44pt targets sharing a boundary
  // still resolve unambiguously.
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
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

/** The region of the canvas a layout fits, in floor-plan units. */
interface Region {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/**
 * The bounds an area's own tables occupy, with a margin, in canvas units.
 *
 * Fitting an area to its own extent rather than to the whole canvas is the
 * point of area mode: eight tables get the space thirty were fighting over.
 */
function areaRegion(tables: readonly FloorTable[]): Region | null {
  if (tables.length === 0) return null;

  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  for (const table of tables) {
    // Rotation can push a table past its unrotated rect, so bound the corners.
    const center = { x: table.x + table.width / 2, y: table.y + table.height / 2 };
    const corners = [
      { x: table.x, y: table.y },
      { x: table.x + table.width, y: table.y },
      { x: table.x + table.width, y: table.y + table.height },
      { x: table.x, y: table.y + table.height },
    ].map((p) => rotatePoint(p, center, table.rotationDegrees));
    for (const p of corners) {
      if (p.x < minX) minX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.x > maxX) maxX = p.x;
      if (p.y > maxY) maxY = p.y;
    }
  }

  const width = Math.max(1, maxX - minX);
  const height = Math.max(1, maxY - minY);
  const margin = Math.max(width, height) * AREA_MARGIN_RATIO;

  return {
    x: minX - margin,
    y: minY - margin,
    width: width + margin * 2,
    height: height + margin * 2,
  };
}

const EMPTY_LAYOUT: Omit<FloorLayout, 'areaFilter'> = {
  scale: 0,
  fitScale: 0,
  zoom: MIN_ZOOM,
  panX: 0,
  panY: 0,
  offsetX: DEFAULT_PADDING_PX,
  offsetY: DEFAULT_PADDING_PX,
  renderedWidth: 0,
  renderedHeight: 0,
  hasOverlappingHitRects: false,
  tables: [],
};

/**
 * Map a room onto a viewport, and resolve every table's pixel geometry,
 * label visibility and hit region.
 *
 * Geometry scales uniformly and letterboxes; text and tap targets are floored.
 * See the module header for why those two are treated differently.
 *
 * Three inputs shape what gets fitted, and all of them are arguments rather
 * than component state, so every rule below stays testable without rendering:
 * `areaFilter` picks one area and fits it to its own bounds, `zoom` multiplies
 * the fit, and `panX`/`panY` move it — clamped so the room always covers the
 * viewport rather than drifting off into grey.
 *
 * Degenerate input (an unmeasured 0x0 viewport on the first render pass, a
 * zero-area canvas, an area with no tables) yields `scale: 0` and no tables
 * rather than `NaN` coordinates or a divide-by-zero.
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
    areaFilter = null,
  } = input;

  const minTapTargetPx = input.minTapTargetPx ?? tapTargetFloorFor(mode);

  const visible =
    areaFilter === null ? tables : tables.filter((t) => t.floorAreaName === areaFilter);

  const availableWidth = Math.max(0, viewport.width - padding * 2);
  const availableHeight = Math.max(0, viewport.height - padding * 2);

  const region: Region | null =
    areaFilter === null
      ? canvasWidth > 0 && canvasHeight > 0
        ? { x: 0, y: 0, width: canvasWidth, height: canvasHeight }
        : null
      : areaRegion(visible);

  if (!region || availableWidth <= 0 || availableHeight <= 0) {
    return { ...EMPTY_LAYOUT, offsetX: padding, offsetY: padding, areaFilter };
  }

  // Uniform on both axes: a non-uniform fit would stretch the room, and a diner
  // comparing the plan to what they can see would not recognise it.
  // Letterboxing the remainder is the correct trade.
  const fitScale = Math.min(availableWidth / region.width, availableHeight / region.height);
  const zoom = clamp(input.zoom ?? MIN_ZOOM, MIN_ZOOM, MAX_ZOOM);
  const scale = fitScale * zoom;

  const renderedWidth = region.width * scale;
  const renderedHeight = region.height * scale;

  /*
   * Pan is bounded by how much the room overflows the viewport, so a zoomed-in
   * room can be moved to any part of itself and a fitted one cannot be moved at
   * all. That is stronger than "cannot be panned entirely out of view": there
   * is never dead space at an edge, which is the state that makes people think
   * the plan has broken.
   */
  const overflowX = Math.max(0, renderedWidth - availableWidth) / 2;
  const overflowY = Math.max(0, renderedHeight - availableHeight) / 2;
  const panX = clamp(input.panX ?? 0, -overflowX, overflowX);
  const panY = clamp(input.panY ?? 0, -overflowY, overflowY);

  const offsetX = padding + (availableWidth - renderedWidth) / 2 + panX;
  const offsetY = padding + (availableHeight - renderedHeight) / 2 + panY;

  const laidOut = visible.map((table): LaidOutTable => {
    const rect: Rect = {
      x: offsetX + (table.x - region.x) * scale,
      y: offsetY + (table.y - region.y) * scale,
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

    /*
     * Text scales with the room and stops at the floor, so zooming in is how a
     * diner reads a label the fitted layout had to shrink. The width cap keeps
     * a long label ("12") from overflowing a narrow table even when the height
     * would allow a larger size.
     */
    const usableWidth = Math.max(0, rect.width - LABEL_INSET_PX * 2);
    const capByWidth =
      table.label.length > 0 ? usableWidth / (table.label.length * CHAR_WIDTH_RATIO) : usableWidth;
    const labelFontSize = Math.max(
      minFontSizePx,
      Math.min(rect.height * LABEL_HEIGHT_RATIO, capByWidth),
    );

    // Label fit is judged at the *floor* against the drawn shape, not against
    // the expanded hit rect: the hit rect is invisible, so text sized to it
    // would overflow the table.
    const neededWidth = estimateTextWidth(table.label, minFontSizePx) + LABEL_INSET_PX * 2;
    const neededHeight = minFontSizePx + LABEL_INSET_PX * 2;
    const labelVisible = rect.width >= neededWidth && rect.height >= neededHeight;

    // Seats are supplementary; only show them when a second line genuinely fits.
    const seatsText = String(table.seats);
    const seatsNeededWidth = estimateTextWidth(seatsText, minFontSizePx) + LABEL_INSET_PX * 2;
    const seatsVisible =
      labelVisible &&
      rect.height >= neededHeight + minFontSizePx + LABEL_INSET_PX &&
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

  return {
    scale,
    fitScale,
    zoom,
    panX,
    panY,
    offsetX,
    offsetY,
    renderedWidth,
    renderedHeight,
    areaFilter,
    hasOverlappingHitRects: findOverlap(laidOut),
    tables: laidOut,
  };
}

/**
 * Do any two tappable tables' hit regions overlap?
 *
 * Only selectable tables count. `pickTableAt` never resolves a tap to an
 * unselectable one, so a dimmed table's halo cannot steal a tap and is not
 * ambiguity. O(n²) over a room's tables is a few hundred comparisons at worst
 * and runs once per layout; an interval sweep would be faster and harder to
 * read for no gain at this size.
 */
function findOverlap(tables: readonly LaidOutTable[]): boolean {
  const tappable = tables.filter((t) => t.selectable);
  for (let i = 0; i < tappable.length; i += 1) {
    for (let j = i + 1; j < tappable.length; j += 1) {
      const a = tappable[i];
      const b = tappable[j];
      if (a && b && rectsOverlap(a.hitRect, b.hitRect)) return true;
    }
  }
  return false;
}

/**
 * How far past fit-to-viewport an area may be opened to clear its tap targets.
 *
 * An area that needs more than this is not a scaling problem. Two-tops at a
 * 60cm pitch in a room drawn to scale are physically closer together than a
 * fingertip, and opening at 3x would show four tables of a ten-table area with
 * the rest off screen — trading a mis-tap for a room the diner cannot find. At
 * the cap the honest behaviour is to open as far in as the cap allows and leave
 * the remainder to the pinch that already works.
 */
export const AUTO_SCALE_CAP = 2;

/** Zoom steps finer than this are not worth another layout pass. */
const AUTO_SCALE_TOLERANCE = 0.01;

/**
 * The smallest zoom at which no two tappable hit rects collide, or the cap.
 *
 * The component already asks {@link computeFloorLayout} whether hit rects
 * overlap at the fit. This asks the next question — *at what scale do they stop*
 * — so an area whose fitted layout puts 41px between adjacent centres against a
 * 44px floor opens at 1.08x instead of opening broken and waiting for a pinch
 * that nobody performs on a room that looks fine.
 *
 * Monotone, which is what makes a bisection sound here: separation between two
 * centres grows linearly with scale while the tap floor does not grow at all,
 * so a pair that has cleared cannot collide again further in. The search
 * therefore converges on the single crossing point rather than one of several.
 *
 * @returns {@link MIN_ZOOM} when the fitted layout is already clean — the
 * common case, and the one that must cost nothing — and never more than `cap`.
 * A layout that still collides *at* the cap also returns the cap: opening there
 * is strictly better than opening at the fit, and the caller is not asked to
 * tell the two apart.
 */
export function scaleToClearHitRects(
  input: ComputeFloorLayoutInput,
  options: { readonly cap?: number } = {},
): number {
  const cap = Math.min(options.cap ?? AUTO_SCALE_CAP, MAX_ZOOM);
  if (cap <= MIN_ZOOM) return MIN_ZOOM;

  const collidesAt = (zoom: number): boolean =>
    computeFloorLayout({ ...input, zoom }).hasOverlappingHitRects;

  // The overwhelmingly common case: the room fits and nothing is asked of it.
  if (!collidesAt(MIN_ZOOM)) return MIN_ZOOM;

  // Still broken as far in as we are willing to go. Open at the cap anyway —
  // it is closer to usable than the fit, and pan reaches the rest.
  if (collidesAt(cap)) return cap;

  let low = MIN_ZOOM; // known to collide
  let high = cap; // known to be clear
  while (high - low > AUTO_SCALE_TOLERANCE) {
    const mid = (low + high) / 2;
    if (collidesAt(mid)) low = mid;
    else high = mid;
  }

  // The clear end of the bracket, so the returned scale is one the caller can
  // use directly rather than one that is a rounding error short of working.
  return high;
}
