#!/usr/bin/env node
/**
 * Write the web app's CSS custom properties from the token objects.
 *
 * Node 24 imports TypeScript directly (type stripping), so this reads the same
 * source the diner app imports rather than a build artefact. `apps/web` runs it
 * before `dev` and `build`, which is what stops the generated file from drifting
 * behind an edit to a token.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderTokenCss } from '../src/css.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const TARGET = resolve(HERE, '..', '..', '..', 'apps', 'web', 'src', 'tokens.generated.css');

const next = renderTokenCss();
let current = '';
try {
  current = readFileSync(TARGET, 'utf8');
} catch {
  // First run.
}

if (current === next) {
  console.log('tokens:css — up to date');
} else {
  mkdirSync(dirname(TARGET), { recursive: true });
  writeFileSync(TARGET, next, 'utf8');
  console.log(`tokens:css — wrote ${TARGET}`);
}
