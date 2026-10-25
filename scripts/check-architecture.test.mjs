/**
 * Each architecture rule still fails when broken. Plain `node:test`, run by
 * `pnpm test:scripts` (and so by `pnpm test`); the check itself runs on the real
 * tree in `pnpm lint`.
 *
 * Every case builds a small repo in a temp folder — the clean one below, plus
 * the one file that breaks a rule — and runs `checkArchitecture` on it.
 */
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { after, test } from 'node:test';
import { checkArchitecture, describe } from './check-architecture.mjs';

const manifest = (name, exports) => JSON.stringify({ name, ...(exports ? { exports } : {}) });

/** A tree every rule accepts. */
const CLEAN = {
  'apps/web/package.json': manifest('@yalla/web'),
  'apps/web/src/main.ts': [
    "import { money } from '@yalla/format';",
    "import { useThing } from '@yalla/api/react';",
    "import type { Thing } from '@yalla/api';",
    "import { helper } from './helper';",
  ].join('\n'),
  'apps/web/src/helper.ts': 'export const helper = 1;',
  'apps/diner/package.json': manifest('@yalla/diner'),
  'apps/diner/app/_layout.tsx':
    "import '../src/intlPolyfills';\nimport { Stack } from 'expo-router';",
  'apps/diner/src/intlPolyfills.ts': 'export {};',
  'apps/e2e/package.json': manifest('@yalla/e2e'),
  'apps/e2e/specs/a.spec.ts': "import { test } from '@playwright/test';",
  'packages/api/package.json': manifest('@yalla/api', {
    '.': './src/index.ts',
    './react': './src/react/index.ts',
  }),
  'packages/api/src/index.ts': "export * from './thing';",
  'packages/api/src/thing.ts': [
    "import { money } from '@yalla/format';",
    "import type { Hook } from './react/hooks';",
    'export type Thing = { money: typeof money; hook?: Hook };',
  ].join('\n'),
  'packages/api/src/react/index.ts': "export * from './hooks';",
  'packages/api/src/react/hooks.ts': [
    "import type { Thing } from '../thing';",
    'export type Hook = () => Thing;',
    'export const useThing = () => undefined;',
  ].join('\n'),
  'packages/api/src/react/hooks.test.ts': "import { useThing } from './index';",
  'packages/format/package.json': manifest('@yalla/format', { '.': './src/index.ts' }),
  'packages/format/src/index.ts': 'export const money = 1;',
};

const roots = [];
after(() => roots.forEach((root) => rmSync(root, { recursive: true, force: true })));

/** Write CLEAN plus `changes` (a null value deletes a file) and check it. */
function check(changes = {}, options) {
  const root = mkdtempSync(join(tmpdir(), 'yalla-arch-'));
  roots.push(root);
  for (const [path, text] of Object.entries({ ...CLEAN, ...changes })) {
    if (text === null) continue;
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), text);
  }
  return checkArchitecture(root, options);
}

const rulesOf = (violations) => violations.map((violation) => violation.rule);

test('the clean tree passes', () => {
  assert.deepEqual(check(), []);
});

test('apps-are-islands: an app importing another app, by path or by name', () => {
  const found = check({
    'apps/web/src/bad.ts': "import { x } from '../../diner/src/intlPolyfills';",
    'apps/e2e/specs/bad.spec.ts': "import { helper } from '@yalla/web';",
  });
  assert.deepEqual(rulesOf(found).sort(), ['apps-are-islands', 'apps-are-islands']);
  assert.equal(found.find((v) => v.file === 'apps/web/src/bad.ts')?.line, 1);
});

test('packages-below-apps: a package importing an app', () => {
  const found = check({
    'packages/format/src/bad.ts': "export { helper } from '../../../apps/web/src/helper';",
  });
  assert.deepEqual(rulesOf(found), ['packages-below-apps']);
});

test('package-layers: a direction PACKAGE_LAYERS does not allow, and a package it does not know', () => {
  const found = check({
    'packages/format/src/bad.ts': "import type { Thing } from '@yalla/api';",
    'packages/fresh/package.json': manifest('@yalla/fresh', { '.': './src/index.ts' }),
    'packages/fresh/src/index.ts': "import { money } from '@yalla/format';",
  });
  assert.deepEqual(rulesOf(found), ['package-layers', 'package-layers']);
  assert.match(found[0].detail, /@yalla\/format may import no @yalla package, not @yalla\/api/);
  assert.match(found[1].detail, /@yalla\/fresh has no entry in PACKAGE_LAYERS/);
});

test('public-entry-points: a deep import, by name or by relative path', () => {
  const found = check({
    'apps/web/src/deep.ts': "import { useThing } from '@yalla/api/src/react/hooks';",
    'apps/diner/src/deep.ts': "const thing = require('../../../packages/api/src/thing');",
  });
  assert.deepEqual(rulesOf(found), ['public-entry-points', 'public-entry-points']);
  assert.match(found[0].detail, /'@yalla\/api', '@yalla\/api\/react'/);
});

test('no-own-barrel: a package file importing its own index, but not a test', () => {
  const found = check({
    'packages/api/src/other.ts': "import { useThing } from './react';",
  });
  assert.deepEqual(rulesOf(found), ['no-own-barrel']);
});

test('no-value-cycles: a value cycle fails; a cycle through `import type` does not', () => {
  const found = check({
    'packages/api/src/a.ts': "import { b } from './b';\nexport const a = 1;",
    'packages/api/src/b.ts': "import { c } from './c';\nexport const b = 1;",
    // `import { type X }` still loads the module under verbatimModuleSyntax.
    'packages/api/src/c.ts': "import { type A, a } from './a';\nexport const c = a;",
  });
  assert.deepEqual(rulesOf(found), ['no-value-cycles']);
  assert.equal(
    found[0].detail,
    'packages/api/src/a.ts -> packages/api/src/b.ts -> packages/api/src/c.ts -> packages/api/src/a.ts',
  );
});

test('no-value-cycles: an inline-type-only import still counts', () => {
  const found = check({
    'packages/api/src/a.ts': "import { type B } from './b';\nexport type A = B;",
    'packages/api/src/b.ts': "import { type A } from './a';\nexport type B = A;",
  });
  assert.deepEqual(rulesOf(found), ['no-value-cycles']);
});

test('diner-intl-first: the polyfills are not the first import', () => {
  const found = check({
    'apps/diner/app/_layout.tsx':
      "import { Stack } from 'expo-router';\nimport '../src/intlPolyfills';",
  });
  assert.deepEqual(rulesOf(found), ['diner-intl-first']);
});

test('allow-list: an entry with a reason lets one import through; a stale or bare one fails', () => {
  const bad = { 'apps/web/src/bad.ts': "import '../../diner/src/intlPolyfills';" };
  const entry = {
    rule: 'apps-are-islands',
    file: 'apps/web/src/bad.ts',
    specifier: '../../diner/src/intlPolyfills',
  };
  assert.deepEqual(check(bad, { allow: [{ ...entry, reason: 'a test' }] }), []);
  assert.deepEqual(rulesOf(check({}, { allow: [{ ...entry, reason: 'a test' }] })), ['allow-list']);
  assert.deepEqual(rulesOf(check(bad, { allow: [{ ...entry, reason: '' }] })), ['allow-list']);
});

test('a failure names the rule, the import, what to do instead and where to read', () => {
  const [violation] = check({ 'apps/web/src/deep.ts': "import '@yalla/api/src/thing';" });
  const text = describe(violation);
  assert.match(
    text,
    /\[public-entry-points\] apps\/web\/src\/deep\.ts:1 imports '@yalla\/api\/src\/thing'/,
  );
  assert.match(text, /Rule: {4}/);
  assert.match(text, /Instead: /);
  assert.match(text, /See: {5}AGENTS\.md, "Architecture checks"/);
});
