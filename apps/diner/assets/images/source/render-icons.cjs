// node apps/diner/assets/images/source/render-icons.cjs <repoRoot> <logo.png>
//
// Renders the SHURJ launcher icon set into apps/diner/assets/images from the logo raster (the fork,
// plate and knife in one burgundy line above the wordmark, on a cream ground), with Playwright's
// Chromium as the canvas. The logo is never redrawn: its ink is lifted off the cream once, then
// scaled onto each target. splash-icon.png is a crop of the same raster and is not written here.
const path = require('node:path');
const fs = require('node:fs');

const [repo, logo] = process.argv.slice(2).map((p) => p && path.resolve(p));
if (!repo || !logo) {
  console.error('usage: node render-icons.cjs <repoRoot> <logo.png>');
  process.exit(1);
}
const { chromium } = require(path.join(repo, 'node_modules', '@playwright', 'test'));
const out = path.join(repo, 'apps/diner/assets/images');

const settings = {
  // The splash's ground (expo-splash-screen's backgroundColor in app.json); the icon matches it.
  CREAM: '#F8F3E9',
  // The raster has a thin dark frame on its left, right and bottom edges. Ink is only read inside
  // this margin, so the frame never reaches a crop.
  FRAME_MARGIN: 24,
  // alpha = (bg − L) / (bg − ink), on Rec. 709 luminance. The cream measures L ≈ 243 with ±4 of
  // paper noise; the stroke cores sit at L 20–45. Alpha under NOISE is paper, not ink, and is
  // ramped to zero so no haze is left around the logo.
  BG_LUM: 243.5,
  INK_LUM: 45,
  NOISE: 0.035,
};

// Android's adaptive layers are 108 dp; every mask keeps a centred circle of 66 dp (61% of the canvas).
const SAFE_ZONE = 66 / 108;

// size: output px; ground: the cream, or null for transparent; fit: how the logo is sized;
//   { width: w }  the ink's bounding box spans w of the canvas width,
//   { circle: d } every ink pixel lies inside a centred circle of diameter d of the canvas;
// colour: 'ink' keeps the logo's colours, 'white' paints its alpha white.
const jobs = [
  // iOS and the store: opaque, the whole logo as large as stays clear of the rounded corners.
  { file: 'icon.png', size: 1024, ground: true, fit: { width: 0.8 }, colour: 'ink' },
  // Android adaptive: a flat cream back layer, and the logo inside the safe zone in front.
  { file: 'adaptive-background.png', size: 1024, ground: true, fit: null },
  {
    file: 'adaptive-foreground.png',
    size: 1024,
    ground: false,
    fit: { circle: SAFE_ZONE },
    colour: 'ink',
  },
  // Android 13 themed icons: the same alpha in one colour, which the system tints.
  {
    file: 'adaptive-monochrome.png',
    size: 1024,
    ground: false,
    fit: { circle: SAFE_ZONE },
    colour: 'white',
  },
  // The web target's tab icon. No mask, so the logo can run almost edge to edge.
  { file: 'favicon.png', size: 48, ground: true, fit: { width: 0.92 }, colour: 'ink' },
];

// Runs in the page.
function render(job, settings) {
  const { CREAM, FRAME_MARGIN, BG_LUM, INK_LUM, NOISE } = settings;
  const src = document.getElementById('logo');
  const W = src.naturalWidth;
  const H = src.naturalHeight;

  // 1. Lift the ink off the cream, once per page.
  if (!globalThis.__ink) {
    const c = document.createElement('canvas');
    c.width = W;
    c.height = H;
    const x = c.getContext('2d', { willReadFrequently: true });
    x.drawImage(src, 0, 0);
    const img = x.getImageData(0, 0, W, H);
    const d = img.data;
    const bg = [1, 3, 5].map((i) => parseInt(CREAM.slice(i, i + 2), 16));
    let [x0, y0, x1, y1] = [W, H, -1, -1];
    for (let y = 0; y < H; y++) {
      for (let X = 0; X < W; X++) {
        const i = (y * W + X) * 4;
        const inside =
          X >= FRAME_MARGIN && X < W - FRAME_MARGIN && y >= FRAME_MARGIN && y < H - FRAME_MARGIN;
        const lum = 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
        let a = inside ? (BG_LUM - lum) / (BG_LUM - INK_LUM) : 0;
        a = Math.min(1, Math.max(0, (a - NOISE) / (1 - NOISE)));
        if (a > 0) {
          // Un-premultiply against the cream: the colour that, at this alpha over the cream, gives
          // the pixel. Without it the edge pixels keep the cream mixed in and show as a halo.
          for (let ch = 0; ch < 3; ch++) {
            const v = (d[i + ch] - bg[ch] * (1 - a)) / a;
            d[i + ch] = Math.min(255, Math.max(0, Math.round(v)));
          }
          if (a > 0.25) {
            x0 = Math.min(x0, X);
            x1 = Math.max(x1, X);
            y0 = Math.min(y0, y);
            y1 = Math.max(y1, y);
          }
        } else {
          d[i] = d[i + 1] = d[i + 2] = 0;
        }
        d[i + 3] = Math.round(a * 255);
      }
    }
    x.putImageData(img, 0, 0);
    const cx = (x0 + x1 + 1) / 2;
    const cy = (y0 + y1 + 1) / 2;
    // The farthest ink from the box's centre, for the circle fit.
    let r = 0;
    for (let y = y0; y <= y1; y++) {
      for (let X = x0; X <= x1; X++) {
        if (d[(y * W + X) * 4 + 3] > 64) r = Math.max(r, Math.hypot(X + 0.5 - cx, y + 0.5 - cy));
      }
    }
    globalThis.__ink = { canvas: c, w: x1 - x0 + 1, h: y1 - y0 + 1, cx, cy, r };
  }
  const ink = globalThis.__ink;

  const S = job.size;
  const out = document.getElementById('out');
  out.width = S;
  out.height = S;
  out.style.width = S + 'px';
  out.style.height = S + 'px';
  const o = out.getContext('2d');
  o.clearRect(0, 0, S, S);
  if (job.ground) {
    o.fillStyle = CREAM;
    o.fillRect(0, 0, S, S);
  }
  if (!job.fit) return null;

  const scale = job.fit.width ? (job.fit.width * S) / ink.w : (job.fit.circle * S) / 2 / ink.r;

  // 2. Scale down in halving steps: one large drawImage step breaks up a hairline logo.
  let layer = ink.canvas;
  let s = scale;
  while (s < 0.5) {
    const next = document.createElement('canvas');
    next.width = Math.ceil(layer.width / 2);
    next.height = Math.ceil(layer.height / 2);
    const n = next.getContext('2d');
    n.imageSmoothingQuality = 'high';
    n.drawImage(layer, 0, 0, next.width, next.height);
    layer = next;
    s *= 2;
  }
  if (job.colour === 'white') {
    const tint = document.createElement('canvas');
    tint.width = layer.width;
    tint.height = layer.height;
    const t = tint.getContext('2d');
    t.drawImage(layer, 0, 0);
    t.globalCompositeOperation = 'source-in';
    t.fillStyle = '#FFFFFF';
    t.fillRect(0, 0, tint.width, tint.height);
    layer = tint;
  }

  // 3. Centred on the ink's bounding box. The halved layer still maps onto the full raster.
  o.imageSmoothingEnabled = true;
  o.imageSmoothingQuality = 'high';
  o.drawImage(layer, S / 2 - ink.cx * scale, S / 2 - ink.cy * scale, W * scale, H * scale);
  return { scale, w: ink.w * scale, h: ink.h * scale };
}

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const data = 'data:image/png;base64,' + fs.readFileSync(logo).toString('base64');
  await page.setContent(
    `<!doctype html><html><head><meta charset="utf-8"><style>
html,body{margin:0;background:transparent}canvas{display:block}</style></head>
<body><canvas id="out"></canvas><img id="logo" src="${data}" style="display:none"></body></html>`,
  );
  await page.locator('#logo').evaluate((img) => img.decode());
  for (const job of jobs) {
    await page.setViewportSize({ width: Math.max(job.size, 64), height: Math.max(job.size, 64) });
    const info = await page.evaluate(
      ([fn, job, settings]) => new Function('return ' + fn)()(job, settings),
      [render.toString(), job, settings],
    );
    const file = path.join(out, job.file);
    if (job.ground) {
      // Opaque targets as a screenshot: an RGB PNG with no alpha channel, as the App Store requires.
      await page.locator('#out').screenshot({ path: file });
    } else {
      const url = await page.locator('#out').evaluate((c) => c.toDataURL('image/png'));
      fs.writeFileSync(file, Buffer.from(url.split(',')[1], 'base64'));
    }
    const fit = info ? `: ink ${info.w.toFixed(0)} × ${info.h.toFixed(0)} px` : '';
    console.log('wrote', job.file + fit);
  }
  await browser.close();
})();
