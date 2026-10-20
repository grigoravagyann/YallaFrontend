/**
 * Where pins are drawn on a room photo when some would sit on each other
 * (review S7).
 *
 * A pin is a 44px target. On a 358px phone photo that is 12% of its width, and
 * a bar's stools or a banquette's tables are pinned a few percent apart: the
 * numbers hid each other and the later pin took every tap in the overlap. So
 * pins closer than a target are pushed apart — each by half of what is
 * missing, along the line between them, a few rounds until none overlap or
 * nothing moves — and kept on the photo. A pin with room to spare stays
 * exactly where the venue put it.
 */

export interface PinPoint {
  /** Fraction of the photo's width, 0 at the left. */
  readonly x: number;
  /** Fraction of the photo's height, 0 at the top. */
  readonly y: number;
}

/** Each pin's centre in pixels on a photo of `size`, `target` apart at least where they fit. */
export function spreadPins(
  pins: readonly PinPoint[],
  size: { readonly width: number; readonly height: number },
  target: number,
): { x: number; y: number }[] {
  const half = target / 2;
  const clamp = (value: number, max: number) =>
    max <= target ? max / 2 : Math.min(Math.max(value, half), max - half);
  const out = pins.map((pin) => ({ x: pin.x * size.width, y: pin.y * size.height }));
  if (!collides(out, target)) return out;

  for (let round = 0; round < 40; round += 1) {
    let moved = false;
    for (let i = 0; i < out.length; i += 1) {
      for (let j = i + 1; j < out.length; j += 1) {
        const a = out[i]!;
        const b = out[j]!;
        let dx = b.x - a.x;
        let dy = b.y - a.y;
        let gap = Math.hypot(dx, dy);
        if (gap >= target) continue;
        if (gap === 0) {
          // On top of each other: apart sideways, in the order they came.
          dx = 1;
          dy = 0;
          gap = 1;
        }
        const push = (target - gap) / 2 + 0.01;
        const ux = dx / gap;
        const uy = dy / gap;
        a.x = clamp(a.x - ux * push, size.width);
        a.y = clamp(a.y - uy * push, size.height);
        b.x = clamp(b.x + ux * push, size.width);
        b.y = clamp(b.y + uy * push, size.height);
        moved = true;
      }
    }
    if (!moved) break;
  }
  return out;
}

function collides(points: readonly { x: number; y: number }[], target: number): boolean {
  for (let i = 0; i < points.length; i += 1) {
    for (let j = i + 1; j < points.length; j += 1) {
      if (Math.hypot(points[i]!.x - points[j]!.x, points[i]!.y - points[j]!.y) < target) {
        return true;
      }
    }
  }
  return false;
}
