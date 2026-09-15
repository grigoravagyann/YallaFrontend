/**
 * Proves the i18n checks fail for the reasons they exist, not only that they
 * pass today. A check that has never been seen failing is a check nobody knows
 * works.
 *
 * Each case copies the real bundles to a temporary directory, breaks one thing,
 * and runs the check against the copy through `YALLA_I18N_LOCALES_DIR`. The
 * source tree stays the real one, so the unreferenced-key case measures the
 * repo as it is.
 *
 * Plain `node:test`, so the package needs no test dependency: `pnpm --filter
 * @yalla/i18n test`.
 */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const LOCALES_DIR = resolve(HERE, '..', 'src', 'locales');
const PARITY = join(HERE, 'check-parity.mjs');
const USED_KEYS = join(HERE, 'check-used-keys.mjs');

function run(script, localesDir) {
  const env = { ...process.env };
  if (localesDir) env.YALLA_I18N_LOCALES_DIR = localesDir;
  else delete env.YALLA_I18N_LOCALES_DIR;
  const result = spawnSync(process.execPath, [script], { env, encoding: 'utf8' });
  return { code: result.status, output: `${result.stdout}${result.stderr}` };
}

/** A throwaway copy of the bundles, with `edit(locale, namespace, mutate)` to break it. */
function copyOfLocales(t) {
  const dir = mkdtempSync(join(tmpdir(), 'yalla-i18n-'));
  cpSync(LOCALES_DIR, dir, { recursive: true });
  t.after(() => rmSync(dir, { recursive: true, force: true }));

  const edit = (locale, namespace, mutate) => {
    const path = join(dir, locale, `${namespace}.json`);
    const bundle = JSON.parse(readFileSync(path, 'utf8'));
    mutate(bundle);
    writeFileSync(path, `${JSON.stringify(bundle, null, 2)}\n`);
  };
  return { dir, edit };
}

test('both checks pass on the bundles as committed', () => {
  const parity = run(PARITY);
  assert.equal(parity.code, 0, parity.output);
  const used = run(USED_KEYS);
  assert.equal(used.code, 0, used.output);
});

test('editing an amenity name in the console bundle alone fails', (t) => {
  const { dir, edit } = copyOfLocales(t);
  edit('ru', 'admin', (bundle) => {
    bundle.publicPage.listing.amenities.outdoorSeating = 'Летняя веранда';
  });
  const result = run(PARITY, dir);
  assert.equal(result.code, 1, result.output);
  assert.match(result.output, /ru: amenity "outdoorSeating"/u);
});

test('editing an amenity name in the diner bundle alone fails', (t) => {
  const { dir, edit } = copyOfLocales(t);
  edit('en', 'diner', (bundle) => {
    bundle.place.amenity.outdoorSeating = 'Outdoor Seating';
  });
  const result = run(PARITY, dir);
  assert.equal(result.code, 1, result.output);
  assert.match(result.output, /en: amenity "outdoorSeating"/u);
});

test('a diner key that nothing references fails', (t) => {
  const { dir, edit } = copyOfLocales(t);
  for (const locale of ['en', 'hy', 'ru']) {
    edit(locale, 'diner', (bundle) => {
      bundle.explore.unreferencedProbe = 'Nobody renders this';
    });
  }
  // Still in parity: this is purely the unreferenced-key rule.
  assert.equal(run(PARITY, dir).code, 0);
  const result = run(USED_KEYS, dir);
  assert.equal(result.code, 1, result.output);
  assert.match(result.output, /"diner:explore\.unreferencedProbe" is defined but nothing/u);
});

test('putting a glued {{name}}-ը back fails', (t) => {
  const { dir, edit } = copyOfLocales(t);
  edit('hy', 'diner', (bundle) => {
    bundle.pending.body = '{{name}}-ը պարզապես պետք է հաստատի իր հեռախոսում։';
  });
  const result = run(PARITY, dir);
  assert.equal(result.code, 1, result.output);
  assert.match(result.output, /hy\/diner\.json "pending\.body" glues a suffix/u);
});

test('a glued {{date}}-ին in the console bundle fails too', (t) => {
  const { dir, edit } = copyOfLocales(t);
  edit('hy', 'admin', (bundle) => {
    bundle.shell.signedInAs = 'Մուտք է գործել {{name}}-ին';
  });
  const result = run(PARITY, dir);
  assert.equal(result.code, 1, result.output);
  assert.match(result.output, /hy\/admin\.json "shell\.signedInAs" glues a suffix/u);
});
