import { describe, expect, it } from 'vitest';
import { glyphCells, MAX_SQUARES } from './freeTablesGlyph';

describe('the free-tables glyph', () => {
  it('fills one square per free table and leaves the rest of the grid empty', () => {
    const { cells, closed } = glyphCells({ kind: 'freeNow', count: 3 });
    expect(cells).toHaveLength(MAX_SQUARES);
    expect(cells.filter(Boolean)).toHaveLength(3);
    expect(cells.slice(0, 3)).toEqual([true, true, true]);
    expect(closed).toBe(false);
  });

  it('stops at the grid when a venue has more free tables than squares', () => {
    const { cells } = glyphCells({ kind: 'freeNow', count: 40 });
    expect(cells).toHaveLength(MAX_SQUARES);
    expect(cells.every(Boolean)).toBe(true);
  });

  it('draws an empty frame for an open venue with every table taken, and a quiet one when shut', () => {
    const busy = glyphCells({ kind: 'noneFreeNow' });
    expect(busy.cells.some(Boolean)).toBe(false);
    expect(busy.closed).toBe(false);

    const shut = glyphCells({ kind: 'closed' });
    expect(shut.cells.some(Boolean)).toBe(false);
    expect(shut.closed).toBe(true);
  });
});
