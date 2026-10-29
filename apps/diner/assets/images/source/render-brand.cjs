// node apps/diner/assets/images/source/render-brand.cjs <repoRoot> [logo.png]
//
// Renders every Time to Eat brand raster, in both apps, from the one logo raster
// (`logo.png` beside this file: the fork, the clock-face plate and the knife in one burgundy line,
// the "Time to Eat" lettering under them, on white), with Playwright's Chromium as the canvas. The
// logo is never redrawn: its ink is lifted off the white once, then scaled onto each target.
//
// The diner's launcher icons, favicon, launch-animation layers, welcome logo and Explore wordmark;
// the web's install icons (PNG and the SVGs that wrap them), favicon and ivory wordmark. The web's
// og-card.png is drawn from that wordmark by apps/web/scripts/generate-og-card.mjs afterwards.
const path = require('node:path');
const fs = require('node:fs');

const [repo, given] = process.argv.slice(2).map((p) => p && path.resolve(p));
if (!repo) {
  console.error('usage: node render-brand.cjs <repoRoot> [logo.png]');
  process.exit(1);
}
const logo = given ?? path.join(__dirname, 'logo.png');
const { chromium } = require(path.join(repo, 'node_modules', '@playwright', 'test'));

const settings = {
  // The ground the opaque icons are laid on: white, as the splash and the launch animation.
  GROUND: '#FFFFFF',
  // The ink's alpha is read off the green channel: the burgundy keeps green near zero in its
  // shadows and its highlights alike, where luminance would read a highlight as half paper.
  // alpha = (paper − G) / (paper − ink). The white measures 254; stroke cores sit at G 0–30.
  PAPER_G: 254,
  INK_G: 14,
  // Alpha under NOISE is the faint grey haze the raster has round its strokes, not ink.
  NOISE: 0.06,
  // Ink is only read this far inside the raster's edges.
  FRAME_MARGIN: 16,
};

// Android's adaptive layers are 108 dp; every mask keeps a centred circle of 66 dp (61% of the canvas).
const SAFE_ZONE = 66 / 108;
// A maskable web icon keeps a centred circle of 80% of the canvas.
const WEB_SAFE_ZONE = 0.8;

const IVORY = '#FFF7EA';

// part: 'logo' (all of it), 'mark' (fork, clock and knife) or 'wordmark' (the lettering).
// size: a square canvas of this many px, or 'trim' for the part's ink at the raster's own scale.
// ground: lay it on GROUND (opaque), or leave it transparent.
// fit: { width: w } the ink's box spans w of the canvas; { circle: d } every ink pixel lies in a
//   centred circle of diameter d of the canvas.
// placeBy: size and centre by this part's ink, while drawing only `part` (the launch layers).
// colour: 'ink' keeps the logo's colours; any hex paints the alpha in that colour.
const jobs = [
  // iOS and the store: opaque, the whole logo as large as stays clear of the rounded corners.
  {
    file: 'apps/diner/assets/images/icon.png',
    part: 'logo',
    size: 1024,
    ground: true,
    fit: { width: 0.8 },
  },
  // Android adaptive: a flat white back layer, and the logo inside the safe zone in front.
  {
    file: 'apps/diner/assets/images/adaptive-background.png',
    part: 'logo',
    size: 1024,
    ground: true,
    fit: null,
  },
  {
    file: 'apps/diner/assets/images/adaptive-foreground.png',
    part: 'logo',
    size: 1024,
    fit: { circle: SAFE_ZONE },
  },
  // Android 13 themed icons: the same alpha in one colour, which the system tints.
  {
    file: 'apps/diner/assets/images/adaptive-monochrome.png',
    part: 'logo',
    size: 1024,
    fit: { circle: SAFE_ZONE },
    colour: '#FFFFFF',
  },
  // The web target's tab icon: the mark alone, the lettering would not read at 48 px.
  {
    file: 'apps/diner/assets/images/favicon.png',
    part: 'mark',
    size: 48,
    ground: true,
    fit: { width: 0.92 },
  },
  // The launch animation's two layers, in one 1024 frame: the mark is drawn first, the lettering
  // rises in under it, and together they are the logo as on the icon.
  {
    file: 'apps/diner/assets/images/splash-mark.png',
    part: 'mark',
    placeBy: 'logo',
    size: 1024,
    fit: { width: 0.8 },
  },
  {
    file: 'apps/diner/assets/images/splash-wordmark.png',
    part: 'wordmark',
    placeBy: 'logo',
    size: 1024,
    fit: { width: 0.8 },
  },
  // Welcome's logo and Explore's wordmark, trimmed to their ink.
  { file: 'apps/diner/assets/images/welcome-logo.png', part: 'logo', size: 'trim' },
  { file: 'apps/diner/assets/images/explore-wordmark.png', part: 'wordmark', size: 'trim' },
  // The web: the ivory lettering for the dark bars, the install icons and the tab icon.
  { file: 'apps/web/src/assets/wordmark.png', part: 'wordmark', size: 'trim', colour: IVORY },
  {
    file: 'apps/web/public/icon-512.png',
    part: 'logo',
    size: 512,
    ground: true,
    fit: { width: 0.84 },
  },
  {
    file: 'apps/web/public/icon-maskable-512.png',
    part: 'logo',
    size: 512,
    ground: true,
    fit: { circle: WEB_SAFE_ZONE * 0.92 },
  },
  {
    file: 'apps/web/public/favicon-128.png',
    part: 'mark',
    size: 128,
    ground: true,
    fit: { width: 0.94 },
    temp: true,
  },
];

// SVG wrappers round a PNG, for the browsers that prefer an SVG icon.
const svgs = [
  { file: 'apps/web/public/icon.svg', from: 'apps/web/public/icon-512.png', size: 512 },
  {
    file: 'apps/web/public/icon-maskable.svg',
    from: 'apps/web/public/icon-maskable-512.png',
    size: 512,
  },
  { file: 'apps/web/public/favicon.svg', from: 'apps/web/public/favicon-128.png', size: 128 },
];

// Runs in the page.
function render(job, settings) {
  const { GROUND, PAPER_G, INK_G, NOISE, FRAME_MARGIN } = settings;
  const src = document.getElementById('logo');
  const W = src.naturalWidth;
  const H = src.naturalHeight;

  // 1. Lift the ink off the white, once per page, and split it at the empty band between the
  //    mark and the lettering.
  if (!globalThis.__ink) {
    const c = document.createElement('canvas');
    c.width = W;
    c.height = H;
    const x = c.getContext('2d', { willReadFrequently: true });
    x.drawImage(src, 0, 0);
    const img = x.getImageData(0, 0, W, H);
    const d = img.data;
    const rowInk = new Array(H).fill(0);
    for (let y = 0; y < H; y++) {
      for (let X = 0; X < W; X++) {
        const i = (y * W + X) * 4;
        const inside =
          X >= FRAME_MARGIN && X < W - FRAME_MARGIN && y >= FRAME_MARGIN && y < H - FRAME_MARGIN;
        let a = inside ? (PAPER_G - d[i + 1]) / (PAPER_G - INK_G) : 0;
        a = Math.min(1, Math.max(0, (a - NOISE) / (1 - NOISE)));
        if (a > 0) {
          // Un-premultiply against the white: the colour that, at this alpha over white, gives the
          // pixel. Without it the edge pixels keep the white mixed in and show as a halo.
          for (let ch = 0; ch < 3; ch++) {
            const v = (d[i + ch] - 255 * (1 - a)) / a;
            d[i + ch] = Math.min(255, Math.max(0, Math.round(v)));
          }
          if (a > 0.25) rowInk[y]++;
        } else {
          d[i] = d[i + 1] = d[i + 2] = 0;
        }
        d[i + 3] = Math.round(a * 255);
      }
    }
    x.putImageData(img, 0, 0);

    // The widest run of empty rows between the first and last inked rows is the split.
    const first = rowInk.findIndex((n) => n > 0);
    const last = H - 1 - [...rowInk].reverse().findIndex((n) => n > 0);
    let gap = [0, -1];
    for (let y = first, start = -1; y <= last; y++) {
      if (rowInk[y] === 0 && start < 0) start = y;
      if (rowInk[y] > 0 && start >= 0) {
        if (y - start > gap[1] - gap[0] + 1) gap = [start, y - 1];
        start = -1;
      }
    }
    const split = Math.round((gap[0] + gap[1]) / 2);

    const part = (y0, y1) => {
      const p = document.createElement('canvas');
      p.width = W;
      p.height = H;
      const px = p.getContext('2d', { willReadFrequently: true });
      px.drawImage(c, 0, y0, W, y1 - y0, 0, y0, W, y1 - y0);
      const pd = px.getImageData(0, 0, W, H).data;
      let [x0, yy0, x1, yy1] = [W, H, -1, -1];
      for (let y = y0; y < y1; y++) {
        for (let X = 0; X < W; X++) {
          if (pd[(y * W + X) * 4 + 3] > 64) {
            x0 = Math.min(x0, X);
            x1 = Math.max(x1, X);
            yy0 = Math.min(yy0, y);
            yy1 = Math.max(yy1, y);
          }
        }
      }
      const cx = (x0 + x1 + 1) / 2;
      const cy = (yy0 + yy1 + 1) / 2;
      // The farthest ink from the box's centre, for the circle fit.
      let r = 0;
      for (let y = yy0; y <= yy1; y++) {
        for (let X = x0; X <= x1; X++) {
          if (pd[(y * W + X) * 4 + 3] > 64) r = Math.max(r, Math.hypot(X + 0.5 - cx, y + 0.5 - cy));
        }
      }
      return { canvas: p, x0, y0: yy0, w: x1 - x0 + 1, h: yy1 - yy0 + 1, cx, cy, r };
    };
    globalThis.__ink = {
      logo: part(0, H),
      mark: part(0, split),
      wordmark: part(split, H),
      split,
    };
  }
  const ink = globalThis.__ink;
  const drawn = ink[job.part];
  const placed = ink[job.placeBy ?? job.part];

  const out = document.getElementById('out');
  let OW;
  let OH;
  let scale;
  let dx;
  let dy;
  if (job.size === 'trim') {
    // A pixel of air on each side, so a resampled edge is never cut.
    OW = drawn.w + 4;
    OH = drawn.h + 4;
    scale = 1;
    dx = 2 - drawn.x0;
    dy = 2 - drawn.y0;
  } else {
    OW = OH = job.size;
    scale = !job.fit
      ? 0
      : job.fit.width
        ? (job.fit.width * OW) / placed.w
        : (job.fit.circle * OW) / 2 / placed.r;
    dx = OW / 2 - placed.cx * scale;
    dy = OH / 2 - placed.cy * scale;
  }
  out.width = OW;
  out.height = OH;
  out.style.width = OW + 'px';
  out.style.height = OH + 'px';
  const o = out.getContext('2d');
  o.clearRect(0, 0, OW, OH);
  if (job.ground) {
    o.fillStyle = GROUND;
    o.fillRect(0, 0, OW, OH);
  }
  if (job.fit === null) return null;

  // 2. Scale down in halving steps: one large drawImage step breaks up a hairline logo.
  let layer = drawn.canvas;
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
  if (job.colour) {
    const tint = document.createElement('canvas');
    tint.width = layer.width;
    tint.height = layer.height;
    const t = tint.getContext('2d');
    t.drawImage(layer, 0, 0);
    t.globalCompositeOperation = 'source-in';
    t.fillStyle = job.colour;
    t.fillRect(0, 0, tint.width, tint.height);
    layer = tint;
  }

  // 3. The halved layer still maps onto the full raster.
  o.imageSmoothingEnabled = true;
  o.imageSmoothingQuality = 'high';
  o.drawImage(layer, dx, dy, W * scale, H * scale);
  const box = (p) => ({
    x0: +(p.x0 * scale + dx).toFixed(1),
    y0: +(p.y0 * scale + dy).toFixed(1),
    x1: +((p.x0 + p.w) * scale + dx).toFixed(1),
    y1: +((p.y0 + p.h) * scale + dy).toFixed(1),
  });
  return { w: OW, h: OH, split: ink.split, drawn: box(drawn), logo: box(ink.logo) };
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
    const side = job.size === 'trim' ? 1400 : Math.max(job.size, 64);
    await page.setViewportSize({ width: side, height: side });
    const info = await page.evaluate(
      ([fn, job, settings]) => new Function('return ' + fn)()(job, settings),
      [render.toString(), job, settings],
    );
    const file = path.join(repo, job.file);
    if (job.ground) {
      // Opaque targets as a screenshot: an RGB PNG with no alpha channel, as the App Store requires.
      await page.locator('#out').screenshot({ path: file });
    } else {
      const url = await page.locator('#out').evaluate((c) => c.toDataURL('image/png'));
      fs.writeFileSync(file, Buffer.from(url.split(',')[1], 'base64'));
    }
    const where = info ? ` ${info.w} × ${info.h}, ink ${JSON.stringify(info.drawn)}` : '';
    console.log(
      'wrote',
      job.file + where + (job.placeBy ? ` logo ${JSON.stringify(info.logo)}` : ''),
    );
  }
  await browser.close();

  for (const svg of svgs) {
    const png = fs.readFileSync(path.join(repo, svg.from)).toString('base64');
    fs.writeFileSync(
      path.join(repo, svg.file),
      `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 ${svg.size} ${svg.size}" role="img" aria-label="Time to Eat"><image width="${svg.size}" height="${svg.size}" href="data:image/png;base64,${png}"/></svg>\n`,
    );
    console.log('wrote', svg.file);
  }
  for (const job of jobs.filter((j) => j.temp)) fs.rmSync(path.join(repo, job.file));
})();
