// node apps/diner/store/source/compose.cjs <repoRoot> <rawDir> <outDir> : store frames (caption + screen) for App Store and Google Play
const path = require('node:path');
const fs = require('node:fs');
const repo = process.argv[2];
const { chromium } = require(path.join(repo, 'node_modules', '@playwright', 'test'));
const raw = path.resolve(process.argv[3]);
const out = path.resolve(process.argv[4]);
const fileUrl = (p) => 'file:///' + p.replace(/\\/g, '/');
const font = fileUrl(path.join(repo, 'apps/diner/assets/fonts/YallaSerif-700.ttf'));

const SHOTS = [
  ['1-explore.png', 'Գտեք ձեր հաջորդ\nսիրելի վայրը'],
  ['2-place.png', 'Ճաշացանկ, սրահներ\nև կարծիքներ՝ մեկ տեղում'],
  ['3-book.png', 'Ընտրեք ժամն ու սեղանը\nսրահի նկարից'],
  ['4-menu.png', 'Պատվիրեք անմիջապես\nձեր սեղանից'],
  ['5-tab.png', 'Հաշիվը՝ միշտ\nձեր աչքի առաջ'],
];

// App Store 6.7": the screen keeps its whole height. Google Play wants 9:16 at most, so the
// screen runs off the bottom edge there, as store frames commonly do.
const SIZES = [
  { dir: 'ios-6.7', w: 1290, h: 2796, caption: 82, top: 440, screenW: 1040, radius: 64 },
  { dir: 'android-phone', w: 1080, h: 1920, caption: 72, top: 360, screenW: 860, radius: 52 },
];

function html(size, shot, caption) {
  return `<!doctype html><html><head><meta charset="utf-8"><style>
@font-face{font-family:YS;src:url("${font}") format("truetype");font-weight:700}
html,body{margin:0}
.f{width:${size.w}px;height:${size.h}px;overflow:hidden;position:relative;
  background:radial-gradient(120% 70% at 50% 0%, #4A2614 0%, #2A140A 55%, #140904 100%)}
.c{position:absolute;left:0;right:0;top:0;height:${size.top}px;display:flex;align-items:center;justify-content:center;
  text-align:center;white-space:pre-line;font-family:YS,Georgia,serif;font-weight:700;font-size:${size.caption}px;line-height:1.18;
  color:#F6E8D8;padding:0 70px;box-sizing:border-box}
.s{position:absolute;left:50%;top:${size.top}px;transform:translateX(-50%);width:${size.screenW}px;border-radius:${size.radius}px;overflow:hidden;
  box-shadow:0 0 0 3px rgba(246,232,216,.16),0 40px 90px rgba(0,0,0,.55)}
.s img{display:block;width:100%}
</style></head><body><div class="f" id="f"><div class="c">${caption}</div><div class="s"><img src="${fileUrl(path.join(raw, shot))}"></div></div></body></html>`;
}

(async () => {
  const browser = await chromium.launch();
  for (const size of SIZES) {
    const dir = path.join(out, size.dir);
    fs.mkdirSync(dir, { recursive: true });
    const p = await browser.newPage({
      viewport: { width: size.w, height: size.h },
      deviceScaleFactor: 1,
    });
    for (const [shot, caption] of SHOTS) {
      const tmp = path.join(__dirname, 'compose-tmp.html');
      fs.writeFileSync(tmp, html(size, shot, caption));
      await p.goto(fileUrl(tmp));
      await p.evaluate(() => document.fonts.ready);
      await p.waitForFunction(() => [...document.images].every((i) => i.complete));
      const name = shot.replace('.png', '.jpg');
      await p.locator('#f').screenshot({ path: path.join(dir, name), type: 'jpeg', quality: 90 });
      console.log(size.dir, name);
    }
    await p.close();
  }
  await browser.close();
})().catch((e) => {
  console.error('FAILED', e.message);
  process.exit(1);
});
