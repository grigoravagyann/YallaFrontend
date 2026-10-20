import { describe, expect, it } from 'vitest';
import { spreadPins } from './pinLayout';

/**
 * Pins that would sit on each other (review S7). A bar's stools and a
 * banquette's tables are pinned a few percent apart; at 44px a pin on a 358px
 * photo covers 12% of it, so neighbours hid each other's numbers and the
 * later one took the taps. They are pushed apart, as little as will do, and
 * kept on the photo.
 */

const distance = (a: { x: number; y: number }, b: { x: number; y: number }) =>
  Math.hypot(a.x - b.x, a.y - b.y);

describe('spreading pins that collide', () => {
  it('pushes two pins 5% apart on a phone-sized photo to a whole target apart', () => {
    const [a, b] = spreadPins(
      [
        { x: 0.5, y: 0.5 },
        { x: 0.55, y: 0.5 },
      ],
      { width: 358, height: 268 },
      44,
    );
    expect(distance(a!, b!)).toBeGreaterThanOrEqual(43.5);
    // Moved apart along the line between them, each about half the way.
    expect(a!.x).toBeLessThan(0.5 * 358);
    expect(b!.x).toBeGreaterThan(0.55 * 358);
    expect(Math.abs(a!.y - 134)).toBeLessThan(1);
  });

  it('leaves pins that are far enough apart where they are', () => {
    const out = spreadPins(
      [
        { x: 0.2, y: 0.2 },
        { x: 0.8, y: 0.8 },
      ],
      { width: 358, height: 268 },
      44,
    );
    expect(out).toEqual([
      { x: 0.2 * 358, y: 0.2 * 268 },
      { x: 0.8 * 358, y: 0.8 * 268 },
    ]);
  });

  it('keeps a pushed pin on the photo', () => {
    const out = spreadPins(
      [
        { x: 0.01, y: 0.5 },
        { x: 0.02, y: 0.5 },
      ],
      { width: 358, height: 268 },
      44,
    );
    for (const pin of out) {
      expect(pin.x).toBeGreaterThanOrEqual(22);
      expect(pin.x).toBeLessThanOrEqual(358 - 22);
    }
    expect(distance(out[0]!, out[1]!)).toBeGreaterThanOrEqual(43.5);
  });

  it('separates a tight cluster of four', () => {
    const out = spreadPins(
      [
        { x: 0.5, y: 0.5 },
        { x: 0.52, y: 0.5 },
        { x: 0.5, y: 0.53 },
        { x: 0.52, y: 0.53 },
      ],
      { width: 358, height: 268 },
      44,
    );
    for (let i = 0; i < out.length; i += 1) {
      for (let j = i + 1; j < out.length; j += 1) {
        expect(distance(out[i]!, out[j]!)).toBeGreaterThanOrEqual(42);
      }
    }
  });
});
