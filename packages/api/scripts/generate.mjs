#!/usr/bin/env node
/**
 * Generate `src/generated/schema.ts` from the backend's OpenAPI document.
 *
 * Types are generated rather than hand-written so that a backend contract change
 * shows up as a compile error in all three apps instead of as a runtime surprise
 * in one of them. The output is committed, so the workspace typechecks with no
 * backend running and CI needs no network.
 *
 * Usage:
 *   pnpm api:generate
 *   pnpm api:generate --url https://localhost:7188/swagger/v1/swagger.json
 *   YALLA_OPENAPI_URL=... pnpm api:generate
 */
import { writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import openapiTS, { astToString } from 'openapi-typescript';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUTPUT = resolve(HERE, '..', 'src', 'generated', 'schema.ts');

/**
 * The document the types came from, kept beside them.
 *
 * `schema.ts` is a type declaration, so a script cannot read a `required` list
 * back out of it — the types are structural and the requiredness is expressed as
 * optionality that only the compiler sees. `check-gateway-schema.mjs` needs both
 * halves to tell "this body omits a required field" from "this body is fine", so
 * the source document is written here in the same run, from the same fetch. Two
 * files that cannot disagree, rather than a second fetch that could.
 */
const RAW_OUTPUT = resolve(HERE, '..', 'src', 'generated', 'swagger.json');

const DEFAULT_URL = 'https://localhost:7188/swagger/v1/swagger.json';

function readUrl() {
  const flagIndex = process.argv.indexOf('--url');
  if (flagIndex !== -1 && process.argv[flagIndex + 1]) return process.argv[flagIndex + 1];
  return process.env.YALLA_OPENAPI_URL ?? DEFAULT_URL;
}

const url = readUrl();

// The .NET dev certificate is self-signed. Only relaxed for localhost, and only
// for this one-shot codegen process — never in app code.
const isLocalhost = /^https:\/\/(localhost|127\.0\.0\.1)/u.test(url);
if (isLocalhost) {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
}

console.log(`api:generate — reading ${url}`);

try {
  const document = await fetch(url).then((response) => {
    if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
    return response.json();
  });

  const ast = await openapiTS(new URL(url), {
    additionalProperties: false,
    // The backend sends dram as integers and timestamps as ISO strings; leaving
    // these as `string`/`number` keeps the generated types honest.
    alphabetize: true,
  });

  const banner = [
    '/**',
    ' * GENERATED FILE — do not edit.',
    ' *',
    ` * Source: ${url}`,
    ' * Regenerate with: pnpm api:generate',
    ' */',
    '',
    '/* eslint-disable */',
    '',
  ].join('\n');

  writeFileSync(OUTPUT, `${banner}${astToString(ast)}`, 'utf8');
  console.log(`api:generate — wrote ${OUTPUT}`);

  writeFileSync(
    RAW_OUTPUT,
    `${JSON.stringify(document, null, 2)}
`,
    'utf8',
  );
  console.log(`api:generate — wrote ${RAW_OUTPUT}`);
} catch (error) {
  console.error(`api:generate — failed to read ${url}`);
  console.error(`  ${error instanceof Error ? error.message : String(error)}`);
  console.error('');
  console.error('  Is the backend running? Start it, then re-run:');
  console.error('    pnpm api:generate --url <swagger url>');
  process.exit(1);
}
