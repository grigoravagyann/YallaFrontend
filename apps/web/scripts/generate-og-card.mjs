// @ts-check
/**
 * Draw `public/og-card.png` — the 1200x630 card a shared link unfurls as.
 *
 * ## Why this is a script and not a design file
 *
 * The page had no `og:image` at all, and dropping the one that was proposed was
 * right: the only brand asset in `public/` is an SVG and no major unfurler
 * renders SVG, so the tag would have produced a card with a broken slot in it.
 * But "no image" is not free either — every link shared into WhatsApp or
 * Telegram, which is the channel this page exists to serve, unfurls as a
 * text-only card that people scroll past.
 *
 * So the card is generated, from the same tokens the product is built from,
 * with no binary checked in that nobody can reproduce or recolour. When brand
 * green changes, this is a one-line edit and a re-run.
 *
 * ## Why the letterforms are polygons
 *
 * There is no rasteriser in this workspace — no `sharp`, no `canvas`, no
 * headless browser — and adding one to draw five letters would be a dependency
 * with a build step for an asset that changes once a year. Every glyph in
 * "YALLA" is straight-sided, so the wordmark is drawn as polygons and filled by
 * the scanline routine below at 4x supersampling. That is the whole reason the
 * wordmark is set in capitals.
 *
 * The card deliberately carries **no sentence**. The words belong in
 * `og:description`, which unfurlers render as real selectable text next to the
 * image; baking them into a picture would make them unreadable to a screen
 * reader and untranslatable into the two other languages this product ships in.
 * What the picture carries instead is the one thing only this product can show:
 * a room with some tables free and some not.
 *
 * Usage: `node scripts/generate-og-card.mjs`
 */
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';

// --- Brand ------------------------------------------------------------------
// Copied rather than imported: this is a build script run by `node`, and
// `@yalla/tokens` is TypeScript. The contrast test in that package is what
// keeps these honest; a mismatch here is a wrong-coloured card, not a wrong
// product.
const GREEN = [0x1e, 0x5b, 0x3c]; // color.primary — deep, desaturated brand green
const FREE = [0x35, 0xb3, 0x7e]; // color.stateFree — bright free-table green
const PAPER = [0xf6, 0xf9, 0xf7]; // color.paper
const WHITE = [0xff, 0xff, 0xff];

const WIDTH = 1200;
const HEIGHT = 630;
/** Every unfurler crops a little; nothing that matters goes outside this. */
const SAFE = 72;

// --- Geometry ---------------------------------------------------------------

function rect(x, y, w, h) {
  return [
    [x, y],
    [x + w, y],
    [x + w, y + h],
    [x, y + h],
  ];
}

/**
 * The five glyphs, as polygon sets in a `w` x `h` cell at (`x`, `y`).
 *
 * Every diagonal is built as a quad with **horizontal terminals** rather than
 * as a stroked line segment. A stroked segment caps perpendicular to its own
 * direction, so the two arms of a Y meet at the top in a V-shaped notch and the
 * apex of an A comes to a nick — which is what the first render of this card
 * did. Horizontal cuts are also what a real geometric sans does at those
 * junctions, so this is the correct shape rather than a workaround.
 *
 * Capitals only, and only these five, because these five are all the card
 * needs. A general font is what the TTFs in `public/fonts` are for; this is a
 * wordmark.
 */
const GLYPHS = {
  Y: (x, y, w, h, t) => {
    const mx = x + w / 2;
    const my = y + h * 0.52;
    return [
      [
        [x, y],
        [x + t, y],
        [mx + t / 2, my],
        [mx - t / 2, my],
      ],
      [
        [x + w - t, y],
        [x + w, y],
        [mx + t / 2, my],
        [mx - t / 2, my],
      ],
      rect(mx - t / 2, my, t, y + h - my),
    ];
  },
  A: (x, y, w, h, t) => {
    const mx = x + w / 2;
    return [
      [
        [mx - t / 2, y],
        [mx + t / 2, y],
        [x + t, y + h],
        [x, y + h],
      ],
      [
        [mx - t / 2, y],
        [mx + t / 2, y],
        [x + w, y + h],
        [x + w - t, y + h],
      ],
      rect(x + w * 0.2, y + h * 0.66, w * 0.6, t * 0.84),
    ];
  },
  L: (x, y, w, h, t) => [rect(x, y, t, h), rect(x, y + h - t, w * 0.82, t)],
};

function wordmark(word, x, y, cellW, cellH, thickness, gap) {
  const shapes = [];
  let cursor = x;
  for (const letter of word) {
    const glyph = GLYPHS[letter];
    if (!glyph) throw new Error(`No glyph for "${letter}" — this is a wordmark, not a font.`);
    shapes.push(...glyph(cursor, y, cellW, cellH, thickness));
    cursor += cellW + gap;
  }
  return shapes;
}

function wordmarkWidth(word, cellW, gap) {
  return word.length * cellW + (word.length - 1) * gap;
}

/** Rounded rectangle as a polygon, corners approximated in eight steps. */
function roundedRect(x, y, w, h, r) {
  const radius = Math.min(r, w / 2, h / 2);
  const points = [];
  const corners = [
    [x + w - radius, y + h - radius, 0],
    [x + radius, y + h - radius, Math.PI / 2],
    [x + radius, y + radius, Math.PI],
    [x + w - radius, y + radius, (3 * Math.PI) / 2],
  ];
  for (const [cx, cy, start] of corners) {
    for (let i = 0; i <= 8; i += 1) {
      const angle = start + (i / 8) * (Math.PI / 2);
      points.push([cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius]);
    }
  }
  return points;
}

/** The four sides of a rounded rect, as a ring of thickness `t`. */
function roundedOutline(x, y, w, h, r, t) {
  return {
    outer: roundedRect(x, y, w, h, r),
    inner: roundedRect(x + t, y + t, w - 2 * t, h - 2 * t, Math.max(0, r - t)),
  };
}

// --- Rasteriser -------------------------------------------------------------

function insidePolygon(polygon, px, py) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
    const [xi, yi] = polygon[i];
    const [xj, yj] = polygon[j];
    if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function boundsOf(polygon) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [x, y] of polygon) {
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }
  return { minX, minY, maxX, maxY };
}

/** Supersampling factor. Four is plenty for straight edges and stays quick. */
const SS = 4;

const png = new PNG({ width: WIDTH, height: HEIGHT });

function fillBackground(rgb) {
  for (let i = 0; i < png.data.length; i += 4) {
    png.data[i] = rgb[0];
    png.data[i + 1] = rgb[1];
    png.data[i + 2] = rgb[2];
    png.data[i + 3] = 255;
  }
}

/**
 * Paint one shape, anti-aliased, over whatever is already there.
 *
 * `holes` lets a shape be drawn as an outline: a pixel inside the outer polygon
 * and inside a hole contributes nothing, which is how the "booked" tables get
 * their ring without a second pass.
 */
function paint(polygon, rgb, { alpha = 1, holes = [] } = {}) {
  const { minX, minY, maxX, maxY } = boundsOf(polygon);
  const x0 = Math.max(0, Math.floor(minX));
  const x1 = Math.min(WIDTH - 1, Math.ceil(maxX));
  const y0 = Math.max(0, Math.floor(minY));
  const y1 = Math.min(HEIGHT - 1, Math.ceil(maxY));

  for (let y = y0; y <= y1; y += 1) {
    for (let x = x0; x <= x1; x += 1) {
      let hits = 0;
      for (let sy = 0; sy < SS; sy += 1) {
        for (let sx = 0; sx < SS; sx += 1) {
          const px = x + (sx + 0.5) / SS;
          const py = y + (sy + 0.5) / SS;
          if (!insidePolygon(polygon, px, py)) continue;
          if (holes.some((hole) => insidePolygon(hole, px, py))) continue;
          hits += 1;
        }
      }
      if (hits === 0) continue;

      const coverage = (hits / (SS * SS)) * alpha;
      const index = (y * WIDTH + x) * 4;
      for (let c = 0; c < 3; c += 1) {
        png.data[index + c] = Math.round(png.data[index + c] * (1 - coverage) + rgb[c] * coverage);
      }
    }
  }
}

// --- The card ---------------------------------------------------------------

fillBackground(GREEN);

// A paper band along the bottom third: the room sits on it, so the card reads
// as the product rather than as a logo on a colour.
const BAND_TOP = 372;
paint(rect(0, BAND_TOP, WIDTH, HEIGHT - BAND_TOP), PAPER);

// The wordmark, optically centred in the green field above the band.
const CELL_W = 104;
const CELL_H = 148;
const THICK = 27;
const GAP = 30;
const markWidth = wordmarkWidth('YALLA', CELL_W, GAP);
for (const shape of wordmark(
  'YALLA',
  (WIDTH - markWidth) / 2,
  (BAND_TOP - CELL_H) / 2 + 6,
  CELL_W,
  CELL_H,
  THICK,
  GAP,
)) {
  paint(shape, WHITE);
}

/*
 * The room. Eight tables, three of them free.
 *
 * Not decoration and not a real branch: it is the one picture that says what
 * the link leads to. Free tables are solid `stateFree`; the rest are rings, so
 * the difference survives being rendered at thumbnail size in a chat list and
 * does not depend on colour alone — the same rule the floor plan itself
 * follows.
 */
const TABLE_W = 116;
const TABLE_H = 84;
const TABLE_GAP = 26;
const COLUMNS = 8;
const roomWidth = COLUMNS * TABLE_W + (COLUMNS - 1) * TABLE_GAP;
const roomX = (WIDTH - roomWidth) / 2;
const roomY = BAND_TOP + (HEIGHT - BAND_TOP - TABLE_H) / 2;

const FREE_TABLES = new Set([1, 4, 5]);
for (let i = 0; i < COLUMNS; i += 1) {
  const x = roomX + i * (TABLE_W + TABLE_GAP);
  if (FREE_TABLES.has(i)) {
    paint(roundedRect(x, roomY, TABLE_W, TABLE_H, 20), FREE);
  } else {
    const { outer, inner } = roundedOutline(x, roomY, TABLE_W, TABLE_H, 20, 5);
    paint(outer, GREEN, { alpha: 0.32, holes: [inner] });
  }
}

const out = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'og-card.png');
writeFileSync(out, PNG.sync.write(png));
console.log(`og-card — wrote ${out} (${WIDTH}x${HEIGHT}, safe area ${SAFE}px)`);
