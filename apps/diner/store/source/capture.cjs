// node apps/diner/store/source/capture.cjs <repoRoot> <outDir> : the five store screens from the diner web build (mock data), at 1290x2796
const path = require('node:path');
const fs = require('node:fs');
const { chromium } = require(path.join(process.argv[2], 'node_modules', '@playwright', 'test'));
const out = process.argv[3];
fs.mkdirSync(out, { recursive: true });
const BASE = 'http://localhost:8099';
const TABLE = '/t/2258ada4b141a56d6e550f657daf80a1'; // Lumen Coffee, Northern Avenue, table 2

// The mock borrows the names of real Yerevan places. A store screenshot is an advertisement, so
// those become invented names; the fictional ones (Lumen Coffee, The Green Table, Copper Fox) stay.
const RENAME = {
  Dolmama: 'Pomegranate Table',
  'Tavern Yerevan': 'Old Cellar Tavern',
  'Ararat Terrace': 'Hilltop Terrace',
  'Green Bean': 'Bean & Leaf',
  Vinoteka: 'Cork & Barrel',
};

async function rename(p) {
  await p.evaluate((map) => {
    const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let n = walk.nextNode(); n; n = walk.nextNode()) {
      for (const [from, to] of Object.entries(map))
        if (n.nodeValue.includes(from)) n.nodeValue = n.nodeValue.split(from).join(to);
    }
  }, RENAME);
}

async function settle(p, ms = 2500) {
  await p.waitForLoadState('networkidle');
  await p.waitForTimeout(ms);
  // Every photo on screen has arrived.
  await p
    .waitForFunction(() => [...document.images].every((i) => i.complete), null, { timeout: 15000 })
    .catch(() => {});
}

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({
    viewport: { width: 430, height: 932 },
    deviceScaleFactor: 3,
    locale: 'hy-AM',
    isMobile: true,
    hasTouch: true,
    timezoneId: 'Asia/Yerevan',
  });
  const p = await ctx.newPage();
  const shot = async (name) => {
    await rename(p);
    await p.screenshot({ path: path.join(out, name) });
    console.log('shot', name);
  };
  const tap = async (text, opts = {}) => {
    await p
      .getByText(text, { exact: opts.exact ?? false })
      .first()
      .click();
    await p.waitForTimeout(1200);
  };
  const tapRole = async (name) => {
    await p.getByRole('button', { name }).first().click();
    await p.waitForTimeout(900);
  };

  await p.goto(BASE + '/');
  await settle(p, 4000);
  await shot('1-explore.png');
  await p.goto(BASE + '/place/b-lumen-north');
  await settle(p);
  await shot('2-place.png');
  await p.goto(BASE + '/book/b-lumen-north');
  await settle(p);
  await shot('3-book.png');

  await p.goto(BASE + TABLE);
  await settle(p);
  await tap('Ոչ հիմա');
  await tap('Պատվիրել ևս');
  await tapRole('Ավելացնել՝ Cappuccino');
  await tapRole('Ավելացնել՝ Armenian coffee');
  await tap('Pastry');
  await tapRole('Ավելացնել՝ Gata');
  await settle(p, 1200);
  await shot('4-menu.png');
  await tap('Ավելացնել հաշվին');
  await tap('Ուղարկել 3 միավոր խոհանոց');
  await p.waitForTimeout(1500);
  await tap('Վերադառնալ հաշվին', { exact: true });
  await settle(p);
  await shot('5-tab.png');

  await browser.close();
})().catch((e) => {
  console.error('FAILED', e.message);
  process.exit(1);
});
