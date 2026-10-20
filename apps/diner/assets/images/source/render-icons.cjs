// node apps/diner/assets/images/source/render-icons.cjs <repoRoot> : renders the Yalla wordmark icon set (design D, chosen 2026-10-20) into apps/diner/assets/images with Playwright
const path = require('node:path');
const fs = require('node:fs');
const repo = process.argv[2];
const { chromium } = require(path.join(repo, 'node_modules', '@playwright', 'test'));
const font =
  'file:///' + path.join(repo, 'apps/diner/assets/fonts/YallaSerif-700.ttf').replace(/\\/g, '/');
const out = path.join(repo, 'apps/diner/assets/images');
fs.mkdirSync(out, { recursive: true });

const CREAM = '#F6E8D8';
// size: canvas px; bg: 'gradient' | 'none'; textWidth: share of the canvas the word spans;
// bar: the soft underline from the design; ink: the word's colour.
function page({ size, bg, textWidth, bar = true, ink = CREAM }) {
  const g =
    bg === 'gradient'
      ? `<defs><radialGradient id="g" cx="50%" cy="40%" r="78%"><stop offset="0" stop-color="#4A2614"/><stop offset="0.55" stop-color="#2A140A"/><stop offset="1" stop-color="#140904"/></radialGradient></defs><rect width="1024" height="1024" fill="url(#g)"/>`
      : '';
  return `<!doctype html><html><head><meta charset="utf-8"><style>
@font-face{font-family:YS;src:url("${font}") format("truetype");font-weight:700}
html,body{margin:0;background:transparent}svg{display:block}
</style></head><body>
<svg id="s" xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 1024 1024">${g}
<text id="t" x="512" y="512" text-anchor="middle" font-family="YS" font-weight="700" font-size="100" fill="${ink}">Yalla</text>
${bar ? `<rect id="b" x="0" y="0" width="0" height="0" rx="0" fill="${ink}" opacity="0.5"/>` : ''}
</svg>
<script>
document.fonts.load('700 100px YS').then(() => {
  const t = document.getElementById('t');
  // Scale the word to the width asked for.
  let box = t.getBBox();
  t.setAttribute('font-size', String(100 * (${textWidth} * 1024) / box.width));
  box = t.getBBox();
  // The block (word + bar) sits on the optical centre: the cap/x-height band, not the descender of "Y".
  const fs = parseFloat(t.getAttribute('font-size'));
  // Ink, not the font's line box: getBBox spans ascent to descent, which sits the word low.
  const ctx = document.createElement('canvas').getContext('2d');
  ctx.font = '700 ' + fs + 'px YS';
  const capTop = parseFloat(t.getAttribute('y')) - ctx.measureText('Yalla').actualBoundingBoxAscent;
  const baseline = parseFloat(t.getAttribute('y'));
  const barGap = fs * 0.20, barH = fs * 0.052, barW = box.width * 0.36;
  const blockTop = capTop, blockBottom = ${bar} ? baseline + barGap + barH : baseline;
  const shift = 512 - (blockTop + blockBottom) / 2;
  t.setAttribute('y', String(baseline + shift));
  const b = document.getElementById('b');
  if (b) {
    b.setAttribute('x', String(512 - barW / 2)); b.setAttribute('y', String(baseline + shift + barGap));
    b.setAttribute('width', String(barW)); b.setAttribute('height', String(barH)); b.setAttribute('rx', String(barH / 2));
  }
  window.__ready = true;
});
</script></body></html>`;
}

const jobs = [
  // iOS and the store: full bleed, opaque, the word as large as stays clear of the rounded corners.
  { file: 'icon.png', size: 1024, bg: 'gradient', textWidth: 0.74 },
  // Android adaptive: the background layer, and the word inside the 66% safe zone on a transparent foreground.
  { file: 'adaptive-background.png', size: 1024, bg: 'gradient', textWidth: 0, onlyBg: true },
  { file: 'adaptive-foreground.png', size: 1024, bg: 'none', textWidth: 0.56 },
  // Android 13 themed icons: one colour, the system tints it.
  { file: 'adaptive-monochrome.png', size: 1024, bg: 'none', textWidth: 0.56, ink: '#FFFFFF' },
  // Splash: the word alone, transparent; app.json gives the background colour and the width.
  { file: 'splash-icon.png', size: 1024, bg: 'none', textWidth: 0.9 },
  // The web target's tab icon.
  { file: 'favicon.png', size: 48, bg: 'gradient', textWidth: 0.8, bar: false },
];

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ deviceScaleFactor: 1 });
  for (const j of jobs) {
    const p = await ctx.newPage();
    await p.setViewportSize({ width: j.size, height: j.size });
    const html = j.onlyBg
      ? page({ size: j.size, bg: 'gradient', textWidth: 0.5, bar: false, ink: 'transparent' })
      : page(j);
    const tmp = path.join(__dirname, 'tmp-' + j.file + '.html');
    fs.writeFileSync(tmp, html);
    await p.goto('file:///' + tmp.replace(/\\/g, '/'));
    await p.waitForFunction(() => globalThis.__ready === true);
    await p
      .locator('#s')
      .screenshot({ path: path.join(out, j.file), omitBackground: j.bg === 'none' });
    await p.close();
    fs.unlinkSync(tmp);
    console.log('wrote', j.file);
  }
  await browser.close();
})();
