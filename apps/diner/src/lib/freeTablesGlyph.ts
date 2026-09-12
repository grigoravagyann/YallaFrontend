import type { Availability } from '@yalla/api';

/** More than this and the glyph stops being a count and becomes a texture. */
export const MAX_SQUARES = 12;

export interface GlyphCells {
  /** One entry per square on the grid; `true` where a free table is drawn. */
  readonly cells: readonly boolean[];
  /** The whole frame goes quiet: a shut branch has no count worth drawing. */
  readonly closed: boolean;
}

/**
 * Which squares the free-tables glyph fills.
 *
 * Green squares for the free tables, capped at the grid; nothing for an open
 * venue with every table taken; a quiet, empty frame for a shut one. Pure so
 * the cap and the closed state can be pinned without rendering.
 */
export function glyphCells(availability: Availability): GlyphCells {
  const free = availability.kind === 'freeNow' ? Math.min(availability.count, MAX_SQUARES) : 0;
  return {
    cells: Array.from({ length: MAX_SQUARES }, (_, i) => i < free),
    closed: availability.kind === 'closed',
  };
}
