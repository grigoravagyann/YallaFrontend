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
 * with no binary checked in that nobody can reproduce or recolour. When the
 * brand colour changes, this is a one-line edit and a re-run.
 *
 * ## Why the wordmark is an image and the room is polygons
 *
 * There is no rasteriser in this workspace — no `sharp`, no `canvas`, no
 * headless browser — and adding one for an asset that changes once a year
 * would be a dependency with a build step. The product is SHURJ now, and its
 * lettering is the logo's own, with curves no polygon set draws well; so the
 * card lays the very image the web app's top bars show
 * (`src/assets/shurj-wordmark.png`, ivory on transparent) onto the cherry,
 * read with `pngjs`, which this script already uses to write. The tables are
 * straight-sided and stay polygons, filled by the scanline routine below at
 * 4x supersampling.
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
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';

// --- Brand ------------------------------------------------------------------
// Copied rather than imported: this is a build script run by `node`, and
// `@yalla/tokens` is TypeScript. The contrast test in that package is what
// keeps these honest; a mismatch here is a wrong-coloured card, not a wrong
// product.
const CHERRY = [0x3a, 0x09, 0x12]; // consoleColor.sidebar — the deep cherry of every SHURJ bar
const FREE = [0x35, 0xb3, 0x7e]; // consoleColor.floorFreeEdge — the free-table green
const PAPER = [0xff, 0xff, 0xff]; // consoleColor.canvas — the white page

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

/**
 * Lay an RGBA image over the card at (`dx`, `dy`), scaled to `dw` wide (the
 * height follows its own ratio), each pixel the average of a 4x4 grid of
 * bilinear samples so the fine strokes of the lettering stay smooth.
 */
function drawImage(image, dx, dy, dw) {
  const dh = (dw * image.height) / image.width;
  const sample = (u, v) => {
    const x = Math.min(image.width - 1.001, Math.max(0, u));
    const y = Math.min(image.height - 1.001, Math.max(0, v));
    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const fx = x - x0;
    const fy = y - y0;
    const at = (px, py, c) => image.data[(py * image.width + px) * 4 + c];
    const mix = (c) =>
      (at(x0, y0, c) * (1 - fx) + at(x0 + 1, y0, c) * fx) * (1 - fy) +
      (at(x0, y0 + 1, c) * (1 - fx) + at(x0 + 1, y0 + 1, c) * fx) * fy;
    return [mix(0), mix(1), mix(2), mix(3) / 255];
  };
  const scale = image.width / dw;
  for (let y = Math.max(0, Math.floor(dy)); y < Math.min(HEIGHT, Math.ceil(dy + dh)); y += 1) {
    for (let x = Math.max(0, Math.floor(dx)); x < Math.min(WIDTH, Math.ceil(dx + dw)); x += 1) {
      const sum = [0, 0, 0, 0];
      for (let sy = 0; sy < SS; sy += 1) {
        for (let sx = 0; sx < SS; sx += 1) {
          const [r, g, b, a] = sample(
            (x + (sx + 0.5) / SS - dx) * scale - 0.5,
            (y + (sy + 0.5) / SS - dy) * scale - 0.5,
          );
          sum[0] += r * a;
          sum[1] += g * a;
          sum[2] += b * a;
          sum[3] += a;
        }
      }
      const coverage = sum[3] / (SS * SS);
      if (coverage === 0) continue;
      const index = (y * WIDTH + x) * 4;
      for (let c = 0; c < 3; c += 1) {
        const ink = sum[c] / sum[3];
        png.data[index + c] = Math.round(png.data[index + c] * (1 - coverage) + ink * coverage);
      }
    }
  }
}

// --- The card ---------------------------------------------------------------

fillBackground(CHERRY);

// A paper band along the bottom third: the room sits on it, so the card reads
// as the product rather than as a logo on a colour.
const BAND_TOP = 372;
paint(rect(0, BAND_TOP, WIDTH, HEIGHT - BAND_TOP), PAPER);

// The wordmark, optically centred in the cherry field above the band. Its
// capitals sit high in the image (the R and the J hang below them), so the
// image is set a little low for the capitals to look centred.
const here = dirname(fileURLToPath(import.meta.url));
const lettering = PNG.sync.read(
  readFileSync(join(here, '..', 'src', 'assets', 'shurj-wordmark.png')),
);
const MARK_W = 640;
const markH = (MARK_W * lettering.height) / lettering.width;
drawImage(lettering, (WIDTH - MARK_W) / 2, (BAND_TOP - markH) / 2 + 12, MARK_W);

/*
 * The room. Eight tables, three of them free.
 *
 * Not decoration and not a real branch: it is the one picture that says what
 * the link leads to. Free tables are solid green (`floorFreeEdge`); the rest are rings, so
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
    paint(outer, CHERRY, { alpha: 0.32, holes: [inner] });
  }
}

const out = join(here, '..', 'public', 'og-card.png');
writeFileSync(out, PNG.sync.write(png));
console.log(`og-card — wrote ${out} (${WIDTH}x${HEIGHT}, safe area ${SAFE}px)`);
