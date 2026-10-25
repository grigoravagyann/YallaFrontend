#!/usr/bin/env node
/**
 * Fails when the frontend branches on a problem code the backend does not
 * declare, or when `generated/problemCodes.ts` is stale; lists the codes the
 * backend declares that nothing here handles.
 *
 * ## Why
 *
 * The backend declares every problem code once, in its `ErrorCodes.cs`, and
 * publishes the catalogue as the `x-problem-codes` extension of its OpenAPI
 * document; `pnpm api:generate` writes `generated/problemCodes.ts` from it.
 * Code that reads `ProblemCodes.TakeawayBusy` is checked by the compiler. A
 * hand-typed `'takeaway-busy'` is not: misspell it, or let the backend retire
 * it, and the branch silently never runs — the same class of bug
 * `check-gateway-schema.mjs` catches for routes.
 *
 * ## What is checked
 *
 * 1. **Freshness.** `generated/problemCodes.ts` must be exactly what
 *    `problemCodes.mjs` renders from the committed `generated/swagger.json`.
 * 2. **Every code the frontend handles is declared.** In `packages/api/src`,
 *    `apps/web/src`, `apps/diner/src` and `apps/diner/app` — tests and mocks
 *    included, because a test or a mock speaking a code the server never sends
 *    proves nothing — each `ProblemCodes.X` must name a declared code, and each
 *    string literal in a code position must be one: `code === '…'` / `!==`,
 *    `case '…':` in a `switch` on a code, `const FOO_CODE = '…'`, and `code:
 *    '…'` in a problem document (an object that also has a `traceId`).
 *    A literal that really is not a problem code — a locale compared with
 *    `code === 'hy'`, a test's deliberately unknown code — carries the marker
 *    `problem-codes: not-a-problem-code` (and the reason) on its line or the
 *    line above. `typeof` answers (`'string'` …) are never codes.
 * 3. **Codes nothing handles** — declared by the backend, referenced nowhere
 *    outside tests and mocks — are listed as a warning, not a failure: many are
 *    handled by status alone (a 404 is a `NotFoundError` whatever its code), and
 *    a new backend code is unmapped until somebody decides what it means here.
 *
 * Run by `pnpm --filter @yalla/api test` and `api:check`.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { catalogueOf, renderProblemCodes } from './problemCodes.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = resolve(HERE, '..');
const REPO_ROOT = resolve(HERE, '..', '..', '..');
const GENERATED = join(PACKAGE_ROOT, 'src', 'generated');
const SWAGGER_FILE = join(GENERATED, 'swagger.json');
const CODES_FILE = join(GENERATED, 'problemCodes.ts');

const SCANNED = [
  join(PACKAGE_ROOT, 'src'),
  join(REPO_ROOT, 'apps', 'web', 'src'),
  join(REPO_ROOT, 'apps', 'diner', 'src'),
  join(REPO_ROOT, 'apps', 'diner', 'app'),
];

const SLUG = "'([a-z]+(?:-[a-z]+)*)'";

/** `code === 'x'`, `x.code !== 'x'`. */
const COMPARE_RE = new RegExp(`\\bcode\\s*(?:===|!==)\\s*${SLUG}`, 'gu');
const COMPARE_REVERSED_RE = new RegExp(`${SLUG}\\s*(?:===|!==)\\s*[\\w.?]*[cC]ode\\b`, 'gu');
/** `const FOO_CODE = 'x'`. */
const CONSTANT_RE = new RegExp(`\\b[A-Z][A-Z_]*_CODE\\s*(?::[^=]+)?=\\s*${SLUG}`, 'gu');
/** `code: 'x'` inside an object that also carries a `traceId`: a problem document. */
const PROBLEM_RE = new RegExp(`\\bcode:\\s*${SLUG}(?=[^{}]*\\btraceId\\b)`, 'gu');
const SWITCH_RE = /switch\s*\(([^)]*)\)\s*\{/gu;
const CASE_RE = new RegExp(`\\bcase\\s+${SLUG}\\s*:`, 'gu');
const NAMED_RE = /\bProblemCodes\.([A-Za-z_$][\w$]*)/gu;

/** Opts one literal out: it is a code of something else. */
const NOT_A_CODE_RE = /problem-codes:\s*not-a-problem-code/u;

/** What `typeof` answers; compared with a `code` only to ask whether it is a string. */
const TYPEOF_RESULTS = new Set([
  'string',
  'number',
  'boolean',
  'object',
  'undefined',
  'function',
  'bigint',
  'symbol',
]);

/** Whether the marker is on the line of `index` or the line above it. */
function optedOut(text, index) {
  const lineStart = text.lastIndexOf('\n', index - 1) + 1;
  const previousStart = lineStart === 0 ? 0 : text.lastIndexOf('\n', lineStart - 2) + 1;
  const lineEnd = text.indexOf('\n', index);
  return NOT_A_CODE_RE.test(text.slice(previousStart, lineEnd === -1 ? text.length : lineEnd));
}

function sourceFiles(dir) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  return entries.flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      return entry.name === 'node_modules' || path === GENERATED ? [] : sourceFiles(path);
    }
    return /\.(ts|tsx)$/u.test(entry.name) ? [path] : [];
  });
}

/** Where a match sits, for the report. */
function at(file, text, index) {
  return `${relative(REPO_ROOT, file).replaceAll('\\', '/')}:${text.slice(0, index).split('\n').length}`;
}

/** The body of each `switch` whose discriminant is a code. */
function codeSwitchBodies(text) {
  const bodies = [];
  for (const match of text.matchAll(SWITCH_RE)) {
    if (!/code/iu.test(match[1])) continue;
    let depth = 1;
    let i = match.index + match[0].length;
    const start = i;
    while (depth > 0 && i < text.length) {
      if (text[i] === '{') depth += 1;
      else if (text[i] === '}') depth -= 1;
      i += 1;
    }
    bodies.push([start, i]);
  }
  return bodies;
}

function main() {
  const document = JSON.parse(readFileSync(SWAGGER_FILE, 'utf8'));
  const catalogue = catalogueOf(document);
  const codes = new Set(Object.keys(catalogue));
  const byName = new Map(Object.entries(catalogue).map(([code, entry]) => [entry.name, code]));
  const problems = [];

  // 1. The generated file is what the committed document renders.
  const committed = readFileSync(CODES_FILE, 'utf8');
  const source = /Source: (\S+)/u.exec(committed)?.[1] ?? '';
  if (renderProblemCodes(document, source) !== committed) {
    problems.push(
      'generated/problemCodes.ts does not match generated/swagger.json — run `pnpm api:generate`.',
    );
  }

  // 2. Every code referenced is declared; collect what is handled.
  const handled = new Map();

  for (const file of SCANNED.flatMap(sourceFiles)) {
    const text = readFileSync(file, 'utf8');
    const rel = relative(REPO_ROOT, file).replaceAll('\\', '/');
    const counts = !/\.test\.tsx?$|testkit|\/mocks\//u.test(rel);

    const found = (code, index) => {
      if (TYPEOF_RESULTS.has(code) || optedOut(text, index)) return;
      if (!codes.has(code)) {
        problems.push(
          `${at(file, text, index)}: '${code}' is not a problem code the backend declares`,
        );
      } else if (counts) {
        if (!handled.has(code)) handled.set(code, at(file, text, index));
      }
    };

    for (const match of text.matchAll(NAMED_RE)) {
      const code = byName.get(match[1]);
      if (code) found(code, match.index);
      else
        problems.push(`${at(file, text, match.index)}: ProblemCodes.${match[1]} is not declared`);
    }
    for (const re of [COMPARE_RE, COMPARE_REVERSED_RE, CONSTANT_RE, PROBLEM_RE]) {
      for (const match of text.matchAll(re)) found(match[1], match.index);
    }
    for (const [start, end] of codeSwitchBodies(text)) {
      CASE_RE.lastIndex = 0;
      for (const match of text.slice(start, end).matchAll(CASE_RE)) {
        found(match[1], start + match.index);
      }
    }
  }

  if (problems.length > 0) {
    console.error('problem-codes failed:\n');
    for (const problem of problems.sort()) console.error(`  - ${problem}`);
    console.error('');
    process.exit(1);
  }

  // 3. Declared, and handled nowhere outside tests and mocks.
  const unhandled = [...codes].filter((code) => !handled.has(code)).sort();
  console.log(
    `problem-codes: ${codes.size} declared by the backend, ${handled.size} handled here, ` +
      `${unhandled.length} by status alone.`,
  );
  if (unhandled.length > 0) {
    console.warn('problem-codes: declared codes no typed error or branch handles yet:');
    for (const code of unhandled) {
      console.warn(`  - ${code} (${catalogue[code].status}) — ${catalogue[code].description}`);
    }
  }
}

main();
