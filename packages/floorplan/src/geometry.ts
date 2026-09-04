import type { FloorCanvas, FloorTable, Viewport } from './types';

/**
 * How a room's canvas maps onto the pixels available.
 *
 * This is the single source of scaling truth for both apps and both platform
 * renderers. If a second copy of this maths ever appears, the phone and the
 * tablet will disagree about where a table is.
 */
export interface CanvasFit {
  /** Uniform canvas-units-to-pixels multiplier. */
  readonly scale: number;
  /** Pixel offset that centres the scaled room inside the viewport. */
  readonly offsetX: number;
  readonly offsetY: number;
  /** Size of the drawn room in pixels, excluding the centring offsets. */
  readonly renderedWidth: number;
  readonly renderedHeight: number;
}

/**
 * Fit a room into a viewport, preserving aspect ratio and centring it.
 *
 * Scale is uniform on both axes on purpose: a non-uniform fit would stretch the
 * room and a diner comparing the plan to what they can see would not recognise
 * it. Letterboxing is the correct trade.
 *
 * Degenerate inputs (a zero-area canvas, a viewport not yet measured) return a
 * scale of 0 rather than `Infinity`/`NaN`, so a first render before layout draws
 * nothing instead of crashing.
 */
export function fitCanvas(canvas: FloorCanvas, viewport: Viewport, padding = 0): CanvasFit {
  const availableWidth = Math.max(0, viewport.width - padding * 2);
  const availableHeight = Math.max(0, viewport.height - padding * 2);

  if (canvas.width <= 0 || canvas.height <= 0 || availableWidth <= 0 || availableHeight <= 0) {
    return { scale: 0, offsetX: padding, offsetY: padding, renderedWidth: 0, renderedHeight: 0 };
  }

  const scale = Math.min(availableWidth / canvas.width, availableHeight / canvas.height);
  const renderedWidth = canvas.width * scale;
  const renderedHeight = canvas.height * scale;

  return {
    scale,
    offsetX: padding + (availableWidth - renderedWidth) / 2,
    offsetY: padding + (availableHeight - renderedHeight) / 2,
    renderedWidth,
    renderedHeight,
  };
}

export interface Point {
  readonly x: number;
  readonly y: number;
}

/** Centre of a table in canvas units — the anchor rotation and labels use. */
export function tableCenter(table: FloorTable): Point {
  return { x: table.x + table.width / 2, y: table.y + table.height / 2 };
}

/** Convert a canvas-space point to pixels under a given fit. */
export function toPixels(point: Point, fit: CanvasFit): Point {
  return {
    x: fit.offsetX + point.x * fit.scale,
    y: fit.offsetY + point.y * fit.scale,
  };
}

/**
 * Convert a pixel point (a tap) back to canvas space.
 *
 * Needed by hit-testing on the web renderer, where the tap arrives in client
 * coordinates rather than being delivered to the shape itself.
 */
export function toCanvas(point: Point, fit: CanvasFit): Point {
  if (fit.scale === 0) return { x: 0, y: 0 };
  return {
    x: (point.x - fit.offsetX) / fit.scale,
    y: (point.y - fit.offsetY) / fit.scale,
  };
}

/**
 * SVG transform for a table, in canvas units.
 *
 * Rotation is about the table's centre, not its origin, so that a rotated table
 * stays where the owner dragged it.
 */
export function tableTransform(table: FloorTable): string {
  if (table.rotationDegrees === 0) return '';
  const center = tableCenter(table);
  return `rotate(${table.rotationDegrees} ${center.x} ${center.y})`;
}

/**
 * Smallest canvas that contains every table.
 *
 * The backend sends explicit canvas dimensions, but an owner can drag a table
 * past the edge in the editor. Used to sanity-check a plan rather than to
 * silently resize it.
 */
export function tablesBounds(tables: readonly FloorTable[]): FloorCanvas & Point {
  if (tables.length === 0) return { x: 0, y: 0, width: 0, height: 0 };

  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  for (const table of tables) {
    minX = Math.min(minX, table.x);
    minY = Math.min(minY, table.y);
    maxX = Math.max(maxX, table.x + table.width);
    maxY = Math.max(maxY, table.y + table.height);
  }

  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

/** True when any table falls outside the declared canvas. */
export function hasOverflow(tables: readonly FloorTable[], canvas: FloorCanvas): boolean {
  const bounds = tablesBounds(tables);
  if (tables.length === 0) return false;
  return (
    bounds.x < 0 ||
    bounds.y < 0 ||
    bounds.x + bounds.width > canvas.width ||
    bounds.y + bounds.height > canvas.height
  );
}

/**
 * Minimum tap target, in pixels, that a table must occupy.
 *
 * A 60x60cm two-top in a large room can scale below a fingertip. Renderers use
 * this to decide whether to draw an enlarged invisible hit area over the shape.
 */
export const MIN_TAP_TARGET_PX = 44;

export function needsEnlargedHitArea(table: FloorTable, fit: CanvasFit): boolean {
  return (
    table.width * fit.scale < MIN_TAP_TARGET_PX || table.height * fit.scale < MIN_TAP_TARGET_PX
  );
}
