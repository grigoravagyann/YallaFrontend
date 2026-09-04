import type { TableStatus } from '@yalla/tokens';

export type { TableStatus };

export type TableId = string;

export type TableShape = 'rectangle' | 'round';

/**
 * A table as the backend stores it.
 *
 * All geometry is in *canvas units*, the coordinate space the owner drew the
 * room in. It is deliberately not pixels: the same room renders on a 5" phone
 * and a 10" tablet, so pixels are computed at render time by {@link fitCanvas}.
 *
 * `x`/`y` are the top-left corner of the table's unrotated bounding box, matching
 * the SVG and the floor plan editor's drag origin.
 */
export interface FloorTable {
  readonly id: TableId;
  /** Owner-authored label, e.g. "T12". Never generated — see `@yalla/format`. */
  readonly label: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  /** Clockwise, degrees. Round tables carry it too so seat markers can align. */
  readonly rotationDegrees: number;
  readonly shape: TableShape;
  readonly seats: number;
  readonly status: TableStatus;
  /** Floor area this table belongs to, e.g. "Terrace". */
  readonly areaName?: string | undefined;
}

/** The room's drawing surface, in canvas units. */
export interface FloorCanvas {
  readonly width: number;
  readonly height: number;
}

/** Pixel box the floor plan is being drawn into. */
export interface Viewport {
  readonly width: number;
  readonly height: number;
}

export interface FloorPlanProps {
  readonly tables: readonly FloorTable[];
  readonly canvas: FloorCanvas;
  /** Pixel box to fit into. Apps usually pass this from an onLayout measurement. */
  readonly viewport: Viewport;
  readonly selectedTableId?: TableId | null | undefined;
  readonly onTableTap?: ((table: FloorTable) => void) | undefined;
  /** Padding in pixels between the room and the viewport edge. */
  readonly padding?: number | undefined;
  /**
   * Accessible name for the plan as a whole, already translated by the caller.
   * The component holds no copy of its own.
   */
  readonly accessibilityLabel?: string | undefined;
  /**
   * Resolves a table's accessible label, already translated. Given the table so
   * the caller can compose label + status + seat count in its own language.
   */
  readonly tableAccessibilityLabel?: ((table: FloorTable) => string) | undefined;
  readonly testID?: string | undefined;
}
