#!/usr/bin/env node
/**
 * The OpenAPI drift gate: is the backend's document still the one the committed
 * types were generated from?
 *
 *   node scripts/check-swagger-drift.mjs --url http://127.0.0.1:5086/swagger/v1/swagger.json
 *   node scripts/check-swagger-drift.mjs --file path/to/swagger.json
 *   node scripts/check-swagger-drift.mjs --url ... --save swagger.live.json
 *
 * `packages/api/src/generated/swagger.json` and `schema.ts` are committed, so the
 * workspace typechecks with no backend running. That is also how they go stale: a
 * backend DTO property renamed without `pnpm api:generate` still compiles here,
 * and the contract suite only notices the fields it happens to read. This compares
 * the whole document.
 *
 * Both sides are normalised by sorting object keys at every depth, so key order
 * and whitespace are not drift. Array order is kept, because in OpenAPI it means
 * something (parameter order, `allOf`, enum members).
 *
 * `--save` writes the document it read, formatted the way `api:generate` writes
 * it, so a CI artifact can be dropped in place of the committed file to see the
 * change in a normal diff.
 *
 * Exit 0 when they match, 1 with the differing paths when they do not, 2 when a
 * document could not be read.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

const HERE = dirname(fileURLToPath(import.meta.url));
const COMMITTED = resolve(HERE, '..', 'packages', 'api', 'src', 'generated', 'swagger.json');
const MAX_LINES = 80;

const { values } = parseArgs({
  options: {
    url: { type: 'string' },
    file: { type: 'string' },
    save: { type: 'string' },
  },
});

const inCi = Boolean(process.env.GITHUB_ACTIONS);

function unreadable(what, error) {
  const reason = error instanceof Error ? error.message : String(error);
  console.error(`swagger drift: could not read ${what}: ${reason}`);
  if (inCi) console.log(`::error title=OpenAPI drift gate::Could not read ${what}: ${reason}`);
  process.exit(2);
}

/** A leading byte-order mark is not JSON; .NET tooling writes one. */
const BYTE_ORDER_MARK = String.fromCharCode(0xfeff);

/** CRLF vs LF in descriptions follows the backend's checkout, not the contract. */
function unixNewlines(value) {
  if (typeof value === 'string') return value.replace(/\r\n?/g, '\n');
  if (Array.isArray(value)) return value.map(unixNewlines);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, unixNewlines(v)]));
  }
  return value;
}

function parse(text) {
  return unixNewlines(JSON.parse(text.startsWith(BYTE_ORDER_MARK) ? text.slice(1) : text));
}

async function readLive() {
  if (values.file) {
    try {
      return parse(readFileSync(values.file, 'utf8'));
    } catch (error) {
      return unreadable(values.file, error);
    }
  }

  const url =
    values.url ?? process.env.YALLA_OPENAPI_URL ?? 'http://localhost:5086/swagger/v1/swagger.json';
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(30_000) });
    if (!response.ok) throw new Error(`HTTP ${response.status} ${response.statusText}`);
    return parse(await response.text());
  } catch (error) {
    return unreadable(url, error);
  }
}

function kind(value) {
  if (value === null) return 'null';
  return Array.isArray(value) ? 'array' : typeof value;
}

function sortKeys(value) {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (kind(value) !== 'object') return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, sortKeys(value[key])]),
  );
}

/** `paths["/api/public/branches"].get.responses["200"]`, which reads better than a JSON pointer. */
function child(path, key) {
  if (typeof key === 'number') return `${path}[${key}]`;
  return /^[A-Za-z_$][\w$]*$/u.test(key) ? `${path}.${key}` : `${path}[${JSON.stringify(key)}]`;
}

function show(value) {
  const text = JSON.stringify(value);
  return text.length > 140 ? `${text.slice(0, 137)}...` : text;
}

function* differences(committed, live, path) {
  const a = kind(committed);
  const b = kind(live);

  if (a === 'object' && b === 'object') {
    const keys = [...new Set([...Object.keys(committed), ...Object.keys(live)])].sort();
    for (const key of keys) {
      const at = child(path, key);
      if (!Object.hasOwn(live, key)) yield `- ${at}   only in the committed document`;
      else if (!Object.hasOwn(committed, key)) yield `+ ${at}   only in the backend's`;
      else yield* differences(committed[key], live[key], at);
    }
    return;
  }

  if (a === 'array' && b === 'array') {
    const flat = [...committed, ...live].every((x) => kind(x) !== 'object' && kind(x) !== 'array');
    if (flat) {
      if (JSON.stringify(committed) !== JSON.stringify(live)) {
        yield `~ ${path}: ${show(committed)} -> ${show(live)}`;
      }
      return;
    }
    for (let i = 0; i < Math.max(committed.length, live.length); i += 1) {
      const at = child(path, i);
      if (i >= live.length) yield `- ${at}   only in the committed document`;
      else if (i >= committed.length) yield `+ ${at}   only in the backend's`;
      else yield* differences(committed[i], live[i], at);
    }
    return;
  }

  if (JSON.stringify(committed) !== JSON.stringify(live)) {
    yield `~ ${path}: ${show(committed)} -> ${show(live)}`;
  }
}

let committed;
try {
  committed = parse(readFileSync(COMMITTED, 'utf8'));
} catch (error) {
  unreadable(COMMITTED, error);
}

const live = await readLive();

if (values.save) {
  writeFileSync(values.save, `${JSON.stringify(live, null, 2)}\n`, 'utf8');
}

const pathCount = Object.keys(live?.paths ?? {}).length;

if (JSON.stringify(sortKeys(committed)) === JSON.stringify(sortKeys(live))) {
  console.log(
    `swagger drift: none. The backend's OpenAPI document (${pathCount} paths) matches ` +
      'packages/api/src/generated/swagger.json.',
  );
  process.exit(0);
}

const lines = [...differences(sortKeys(committed), sortKeys(live), '$')];

console.error(
  `swagger drift: the backend's OpenAPI document differs from packages/api/src/generated/swagger.json ` +
    `in ${lines.length} place${lines.length === 1 ? '' : 's'}.`,
);
console.error('  - only in the committed document   + only in the backend   ~ changed\n');
for (const line of lines.slice(0, MAX_LINES)) console.error(`  ${line}`);
if (lines.length > MAX_LINES) console.error(`  ...and ${lines.length - MAX_LINES} more.`);
console.error(
  '\nRegenerate against this backend and commit both generated files together:\n' +
    '  pnpm api:generate --url <this backend>/swagger/v1/swagger.json\n' +
    'then fix whatever no longer typechecks. If the backend is the one that is wrong, fix it there.',
);

if (inCi) {
  const first = lines.slice(0, 5).join('%0A');
  console.log(
    `::error title=OpenAPI drift gate::The backend's OpenAPI document differs from the committed ` +
      `packages/api/src/generated/swagger.json in ${lines.length} place(s). First:%0A${first}`,
  );
}

process.exit(1);
