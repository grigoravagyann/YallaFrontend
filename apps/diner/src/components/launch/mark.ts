/**
 * The Time to Eat mark as strokes, traced over the logo raster
 * (`assets/images/splash-mark.png`, 1024 × 1024, the mark lifted off its paper) so each line can be drawn in
 * turn: the fork, the plate that is a clock face, its twelve hour marks, its hands and their hub,
 * and the knife. The drawing gives way to that raster at the end, so where a traced line strays a
 * pixel from the logo nobody is left looking at it.
 *
 * `length` is each stroke's path length (measured with `getTotalLength`),
 * used as its dash so it can be drawn from nothing.
 */
export type MarkStroke =
  | {
      readonly id: 'fork' | 'plate' | 'ticks' | 'hands' | 'knife';
      readonly kind: 'path';
      readonly d: string;
      readonly length: number;
    }
  | {
      readonly id: 'hub';
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
    // One line: down the fork's left edge, round the handle, up its right edge, then the two inner tines.
    d: 'M 243 249 L 243 340 C 243 356 250 366 258 374 C 264 381 266 392 265 405 L 247 540 C 243 572 252 598 270 598 C 289 598 297 572 293 545 L 277 425 C 275 400 276 382 284 372 C 294 360 301 352 301 336 L 301 249 M 263 249 L 263 336 M 283 249 L 283 336',
    length: 910,
  },
  {
    id: 'plate',
    kind: 'path',
    // Out of the fork's neck, down and up into the clock's rim, round it clockwise to its tail.
    d: 'M 279 402 C 285 425 298 437 311 436 C 330 434 338 410 345 385 C 362 320 420 245 514 245 C 610 245 688 320 688 422 C 688 520 610 596 520 596 C 505 596 495 593 486 589',
    length: 932,
  },
  {
    id: 'ticks',
    kind: 'path',
    // The twelve hour marks, from twelve o'clock round: radii 121 to 150 about (516, 420).
    d: 'M 516 299 L 516 270 M 576.5 315.2 L 591 290.1 M 620.8 359.5 L 645.9 345 M 637 420 L 666 420 M 620.8 480.5 L 645.9 495 M 576.5 524.8 L 591 549.9 M 516 541 L 516 570 M 455.5 524.8 L 441 549.9 M 411.2 480.5 L 386.1 495 M 395 420 L 366 420 M 411.2 359.5 L 386.1 345 M 455.5 315.2 L 441 290.1',
    length: 348,
  },
  {
    id: 'hands',
    kind: 'path',
    // The hour hand in to the hub, then the minute hand out of it.
    d: 'M 440 378 L 515 420 L 617 362',
    length: 203,
  },
  { id: 'hub', kind: 'circle', cx: 515, cy: 420, r: 8, length: 50 },
  {
    id: 'knife',
    kind: 'path',
    // The plate's line runs on to the knife's bolster, then the blade's edge up to the tip, the
    // spine down, and round the handle back to the bolster.
    d: 'M 590 583 C 640 560 700 512 752 470 M 757 458 C 754 442 748 432 742 424 C 732 410 727 380 726 345 C 726 300 745 260 772 241 C 775 239 777 241 777 246 L 777 450 C 778 480 786 515 788 550 C 790 582 781 600 766 600 C 751 600 742 585 742 562 C 742 530 750 495 757 458',
    length: 965,
  },
];

/** The launch's white ground and the logo's burgundy, sampled from the raster. */
export const LAUNCH_GROUND = '#FFFFFF';
export const LAUNCH_INK = '#6B1121';

/** The logo's box on screen, in points. */
export const LAUNCH_LOGO_SIZE = 260;

/**
 * The ink's vertical extent in the 1024 frame (measured on the raster layers):
 * the mark alone, and the whole logo with the wordmark. While the mark is drawn
 * alone it sits on the screen's optical centre, then rises to make room for the
 * wordmark.
 */
export const MARK_INK = { top: 237, bottom: 603 } as const;
export const LOGO_INK = { top: 237, bottom: 787 } as const;

/** How far below its place in the logo the mark is drawn, in points. */
export const MARK_DROP =
  (((LOGO_INK.top + LOGO_INK.bottom) / 2 - (MARK_INK.top + MARK_INK.bottom) / 2) / 1024) *
  LAUNCH_LOGO_SIZE;
