#!/usr/bin/env node
/**
 * Fails when `src/generated/schema.ts` is not what `pnpm api:generate` renders
 * from the committed `src/generated/swagger.json`.
 *
 *   node scripts/check-generated-schema.mjs   (in this package's `test` and `api:check`)
 *
 * The files in `generated/` are imported, never edited: a type changed by hand
 * in `schema.ts` compiles, and is undone by the next regeneration. The other two
 * are already held: `check-problem-codes.mjs` re-renders `problemCodes.ts`, and
 * CI's contract job compares `swagger.json` with the live backend
 * (`scripts/check-swagger-drift.mjs`). This closes the loop for `schema.ts`,
 * offline, from the same renderer `generate.mjs` uses.
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderSchema } from './schema.mjs';

const GENERATED = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'generated');

const document = JSON.parse(readFileSync(resolve(GENERATED, 'swagger.json'), 'utf8'));
const committed = readFileSync(resolve(GENERATED, 'schema.ts'), 'utf8').replace(/\r\n/g, '\n');
const source = /Source: (\S+)/u.exec(committed)?.[1] ?? '';
const expected = await renderSchema(document, source);

if (committed === expected) {
  console.log('generated schema — schema.ts matches swagger.json');
} else {
  const have = committed.split('\n');
  const want = expected.split('\n');
  let line = 0;
  while (line < have.length && have[line] === want[line]) line += 1;
  console.error(
    [
      `generated schema — src/generated/schema.ts does not match src/generated/swagger.json (first difference at line ${line + 1}).`,
      `  committed: ${have[line] ?? '(end of file)'}`,
      `  rendered:  ${want[line] ?? '(end of file)'}`,
      '  Rule:    files in generated/ are imported, never edited by hand.',
      '  Instead: change the backend and run `pnpm api:generate --url <swagger>`, then commit',
      '           schema.ts, swagger.json and problemCodes.ts together.',
      '  See:     AGENTS.md, "Architecture checks"',
    ].join('\n'),
  );
  process.exit(1);
}
