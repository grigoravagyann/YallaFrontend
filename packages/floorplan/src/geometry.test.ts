import { describe, expect, it } from 'vitest';
import {
  MIN_TAP_TARGET_PX,
  fitCanvas,
  hasOverflow,
  needsEnlargedHitArea,
  tableCenter,
  tableTransform,
  tablesBounds,
  toCanvas,
  toPixels,
} from './geometry';
import type { FloorTable } from './types';

const table = (over: Partial<FloorTable> = {}): FloorTable => ({
  id: 't1',
  label: 'T1',
  x: 10,
  y: 20,
  width: 60,
  height: 60,
  rotationDegrees: 0,
  shape: 'rectangle',
  seats: 4,
  status: 'free',
  ...over,
});

const ROOM = { width: 1000, height: 500 };

describe('fitCanvas', () => {
  it('scales uniformly to the limiting axis', () => {
    // Viewport is relatively taller than the room, so width limits.
    const fit = fitCanvas(ROOM, { width: 500, height: 500 });
    expect(fit.scale).toBe(0.5);
  });

  it('letterboxes rather than stretching', () => {
    const fit = fitCanvas(ROOM, { width: 500, height: 500 });
    expect(fit.renderedWidth).toBe(500);
    expect(fit.renderedHeight).toBe(250);
    // Centred vertically in the leftover space.
    expect(fit.offsetY).toBe(125);
    expect(fit.offsetX).toBe(0);
  });

  it('renders the same room at different sizes on a phone and a tablet', () => {
    const phone = fitCanvas(ROOM, { width: 360, height: 640 });
    const tablet = fitCanvas(ROOM, { width: 1024, height: 768 });

    // Same aspect ratio, different scale — that is the whole requirement.
    expect(phone.renderedWidth / phone.renderedHeight).toBeCloseTo(
      tablet.renderedWidth / tablet.renderedHeight,
      10,
    );
    expect(tablet.scale).toBeGreaterThan(phone.scale);
  });

  it('subtracts padding from both edges', () => {
    const fit = fitCanvas(ROOM, { width: 520, height: 520 }, 10);
    expect(fit.scale).toBe(0.5);
    expect(fit.offsetX).toBe(10);
  });

  it('returns scale 0 for an unmeasured viewport instead of NaN or Infinity', () => {
    const fit = fitCanvas(ROOM, { width: 0, height: 0 });
    expect(fit.scale).toBe(0);
    expect(Number.isFinite(fit.offsetX)).toBe(true);
  });

  it('returns scale 0 for a degenerate canvas', () => {
    expect(fitCanvas({ width: 0, height: 0 }, { width: 500, height: 500 }).scale).toBe(0);
  });

  it('returns scale 0 when padding exceeds the viewport', () => {
    expect(fitCanvas(ROOM, { width: 20, height: 20 }, 30).scale).toBe(0);
  });
});

describe('coordinate conversion', () => {
  it('round-trips a point through pixels and back', () => {
    const fit = fitCanvas(ROOM, { width: 500, height: 500 });
    const point = { x: 123, y: 456 };
    const back = toCanvas(toPixels(point, fit), fit);
    expect(back.x).toBeCloseTo(point.x, 10);
    expect(back.y).toBeCloseTo(point.y, 10);
  });

  it('applies the centring offset', () => {
    const fit = fitCanvas(ROOM, { width: 500, height: 500 });
    expect(toPixels({ x: 0, y: 0 }, fit)).toEqual({ x: 0, y: 125 });
  });

  it('does not divide by zero on an unmeasured viewport', () => {
    const fit = fitCanvas(ROOM, { width: 0, height: 0 });
    expect(toCanvas({ x: 10, y: 10 }, fit)).toEqual({ x: 0, y: 0 });
  });
});

describe('tableCenter', () => {
  it('is the middle of the bounding box', () => {
    expect(tableCenter(table())).toEqual({ x: 40, y: 50 });
  });
});

describe('tableTransform', () => {
  it('is empty for an unrotated table', () => {
    expect(tableTransform(table())).toBe('');
  });

  it('rotates about the centre so the table stays where it was dragged', () => {
    expect(tableTransform(table({ rotationDegrees: 45 }))).toBe('rotate(45 40 50)');
  });
});

describe('tablesBounds', () => {
  it('covers every table', () => {
    const bounds = tablesBounds([
      table({ id: 'a', x: 10, y: 20, width: 60, height: 60 }),
      table({ id: 'b', x: 200, y: 100, width: 40, height: 40 }),
    ]);
    expect(bounds).toEqual({ x: 10, y: 20, width: 230, height: 120 });
  });

  it('is empty for no tables', () => {
    expect(tablesBounds([])).toEqual({ x: 0, y: 0, width: 0, height: 0 });
  });
});

describe('hasOverflow', () => {
  it('is false when every table is inside the canvas', () => {
    expect(hasOverflow([table()], ROOM)).toBe(false);
  });

  it('is true when the owner dragged a table past the edge', () => {
    expect(hasOverflow([table({ x: 990 })], ROOM)).toBe(true);
    expect(hasOverflow([table({ x: -5 })], ROOM)).toBe(true);
  });

  it('is false for an empty room', () => {
    expect(hasOverflow([], ROOM)).toBe(false);
  });
});

describe('needsEnlargedHitArea', () => {
  it('flags a small table in a large room on a small screen', () => {
    const fit = fitCanvas(ROOM, { width: 360, height: 200 });
    // 60 canvas units * 0.36 = 21.6px, well under a fingertip.
    expect(needsEnlargedHitArea(table(), fit)).toBe(true);
  });

  it('does not flag a table already bigger than the minimum target', () => {
    const fit = fitCanvas(ROOM, { width: 1000, height: 500 });
    expect(table().width * fit.scale).toBeGreaterThanOrEqual(MIN_TAP_TARGET_PX);
    expect(needsEnlargedHitArea(table(), fit)).toBe(false);
  });
});
