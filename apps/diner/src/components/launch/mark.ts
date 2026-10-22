/**
 * The SHURJ mark as strokes, traced over the logo raster
 * (`assets/images/splash-logo.png`, 1024 × 1024, the logo lifted off its paper) so each line can be drawn in
 * turn. The drawing gives way to that raster at the end, so where a traced line
 * strays a pixel from the logo nobody is left looking at it.
 *
 * `length` is each stroke's path length (measured with `getTotalLength`),
 * used as its dash so it can be drawn from nothing.
 */
export type MarkStroke =
  | {
      readonly id: 'fork' | 'plate' | 'knife';
      readonly kind: 'path';
      readonly d: string;
      readonly length: number;
    }
  | {
      readonly id: 'inner';
      readonly kind: 'circle';
      readonly cx: number;
      readonly cy: number;
      readonly r: number;
      readonly length: number;
    };

export const MARK_STROKES: readonly MarkStroke[] = [
  {
    id: 'fork',
    kind: 'path',
    d: 'M246 574 C 236 574 230 566 231 552 L 235 392 C 236 380 230 370 222 360 C 214 350 212 336 212 318 L 212 222 M 230 222 L 230 300 M 254 222 L 254 300 M 274 222 L 274 318 C 274 336 270 350 262 360 C 256 368 252 378 252 392 L 258 552 C 259 566 254 574 246 574',
    length: 885,
  },
  {
    id: 'plate',
    kind: 'path',
    d: 'M 256 402 C 280 412 300 400 310 380 C 330 300 400 216 490 214 C 592 214 668 300 668 405 C 668 482 634 530 584 552 C 556 560 520 568 484 570',
    length: 905,
  },
  { id: 'inner', kind: 'circle', cx: 503, cy: 397, r: 134, length: 842 },
  {
    id: 'knife',
    kind: 'path',
    d: 'M 640 526 C 690 498 730 478 766 452 M 766 452 C 762 440 758 430 758 418 C 756 380 756 330 760 290 C 764 250 774 220 790 198 L 790 520 L 790 556 C 790 568 784 574 777 574 C 770 574 765 568 765 556 L 764 456',
    length: 915,
  },
];

/** The launch's white ground and the logo's burgundy, sampled from the raster. */
export const LAUNCH_GROUND = '#FFFFFF';
export const LAUNCH_INK = '#7A1426';

/** The logo's box on screen, in points. */
export const LAUNCH_LOGO_SIZE = 260;
