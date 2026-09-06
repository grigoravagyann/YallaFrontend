#!/usr/bin/env node
/**
 * Fails if the source calls `t('namespace:key')` for a key no locale defines.
 *
 * `check-parity.mjs` compares the locales against *each other*, so a key that is
 * missing from all three is perfectly in parity and passes clean. i18next then
 * has nothing to resolve and nothing to fall back to, so it renders the key path
 * itself: a diner-facing button reading `action.save` instead of `Save`.
 *
 * That is exactly how `common:action.edit`, `common:action.delete` and
 * `common:action.save` reached the venue Overview, Menu and dish dialog — 27
 * visible key paths across two screens, with every parity check green.
 *
 * Two call forms are checked, and the bare one needs care.
 *
 * An explicit `t('common:action.save')` names its own namespace, so it is
 * checked against exactly that bundle.
 *
 * A bare `t('save')` resolves against whatever the calling component passed to
 * `useTranslation`, and a file holds several components — `PageStates.tsx` alone
 * has four, three on `public` and one on `diner`. Tying each call to its own
 * component means scope analysis, which a regex cannot do. So a bare key is
 * accepted if **any** namespace the file mentions defines it. That is a
 * deliberate over-approximation: it can miss a key that resolves only in a
 * sibling component's namespace, and in exchange it never reports a key that
 * really is fine. A check that cries wolf gets switched off.
 *
 * It still earns its keep — that rule is what catches `t('save')` in a file that
 * only ever asks for `['admin', 'common']`, which is how a lowercase `save` and
 * `cancel` ended up on the staff dialog's two buttons.
 *
 * A computed key is not knowable at all and is not checked.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const LOCALES_DIR = resolve(HERE, '..', 'src', 'locales');
const REPO_ROOT = resolve(HERE, '..', '..', '..');
const SOURCE_ROOTS = ['apps', 'packages'];
const SOURCE_EXTENSIONS = ['.ts', '.tsx'];
const SKIP_DIRECTORIES = new Set(['node_modules', 'dist', 'build', 'coverage', '.git']);

/** Same reference locale as check-parity.mjs: `hy` is the fallback bundle. */
const REFERENCE = 'hy';

const PLURAL_SUFFIXES = ['zero', 'one', 'two', 'few', 'many', 'other'];
const PLURAL_RE = new RegExp(`_(${PLURAL_SUFFIXES.join('|')})$`, 'u');

/**
 * `t('common:action.save')` and `t("common:action.save")`, with optional
 * whitespace after the paren. The leading boundary rejects any identifier that
 * merely *ends* in `t` — without it, `fetch('http://…')` reads as namespace
 * `http`, and every URL in the repo becomes a missing key.
 */
const CALL_RE = /(?<![A-Za-z0-9_$.])t\(\s*['"]([a-z][a-zA-Z0-9]*):([A-Za-z0-9_.]+)['"]/gu;

/**
 * `t('action.save')` — no namespace prefix. Closed with `)` on purpose: a call
 * that goes on to options may carry a `defaultValue`, which renders fine with no
 * key behind it and is not this check's business.
 */
const BARE_CALL_RE = /(?<![A-Za-z0-9_$.])t\(\s*'([a-zA-Z][A-Za-z0-9_.]*)'\s*\)/gu;

/** The namespaces a file asks for: `useTranslation('public')`, `useTranslation(['admin', 'common'])`. */
const USE_TRANSLATION_RE = /useTranslation\(\s*(\[[^\]]*\]|'[a-z]+')/gu;
const QUOTED_NAME_RE = /'([a-z]+)'/gu;

/** Flatten to dotted leaf paths, mirroring check-parity.mjs. */
function leafKeys(value, prefix = '') {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return [prefix];
  }
  return Object.entries(value).flatMap(([key, child]) =>
    leafKeys(child, prefix ? `${prefix}.${key}` : key),
  );
}

function baseKey(key) {
  return key.replace(PLURAL_RE, '');
}

function readNamespace(locale, namespace) {
  try {
    return JSON.parse(readFileSync(join(LOCALES_DIR, locale, `${namespace}.json`), 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw new Error(`${locale}/${namespace}.json is not valid JSON`, { cause: error });
  }
}

function* sourceFiles(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.name.startsWith('.') || SKIP_DIRECTORIES.has(entry.name)) continue;
    const full = join(directory, entry.name);
    if (entry.isDirectory()) {
      yield* sourceFiles(full);
    } else if (SOURCE_EXTENSIONS.some((extension) => entry.name.endsWith(extension))) {
      yield full;
    }
  }
}

const namespaces = readdirSync(join(LOCALES_DIR, REFERENCE))
  .filter((name) => name.endsWith('.json'))
  .map((name) => name.replace(/\.json$/u, ''))
  .sort();

/** Namespace -> set of defined keys, plural forms collapsed to their base. */
const defined = new Map(
  namespaces.map((namespace) => [
    namespace,
    new Set(leafKeys(readNamespace(REFERENCE, namespace)).map(baseKey)),
  ]),
);

/** `namespace:key` -> ["path:line", …], so one bad key reports every call site. */
const used = new Map();

/** Bare keys, already resolved against their file's namespaces: one entry per unresolved site. */
const unresolvedBare = [];

let bareCount = 0;

for (const root of SOURCE_ROOTS) {
  const absolute = join(REPO_ROOT, root);
  for (const file of sourceFiles(absolute)) {
    const source = readFileSync(file, 'utf8');
    const at = (index) =>
      `${relative(REPO_ROOT, file).replaceAll('\\', '/')}:${source.slice(0, index).split('\n').length}`;

    for (const match of source.matchAll(CALL_RE)) {
      const reference = `${match[1]}:${match[2]}`;
      const sites = used.get(reference);
      if (sites) sites.push(at(match.index));
      else used.set(reference, [at(match.index)]);
    }

    // Every namespace this file asks for, pooled — see the header on why the
    // pool is per file rather than per component.
    const pooled = new Set(
      [...source.matchAll(USE_TRANSLATION_RE)].flatMap((match) =>
        [...match[1].matchAll(QUOTED_NAME_RE)].map((name) => name[1]),
      ),
    );
    if (pooled.size === 0) continue;

    for (const match of source.matchAll(BARE_CALL_RE)) {
      bareCount += 1;
      const key = match[1];
      const resolves = [...pooled].some((namespace) => {
        const keys = defined.get(namespace);
        return keys?.has(key) || keys?.has(baseKey(key));
      });
      if (resolves) continue;
      unresolvedBare.push(
        `"${key}" is used but defined in none of [${[...pooled].sort().join(', ')}]\n` +
          `    ${at(match.index)}`,
      );
    }
  }
}

const problems = [];

for (const [reference, sites] of [...used].sort(([a], [b]) => a.localeCompare(b))) {
  const [namespace, key] = [
    reference.slice(0, reference.indexOf(':')),
    reference.slice(reference.indexOf(':') + 1),
  ];
  const keys = defined.get(namespace);
  if (!keys) {
    problems.push(`"${reference}" names namespace "${namespace}", which does not exist`);
    for (const site of sites) problems.push(`    ${site}`);
    continue;
  }
  if (!keys.has(key) && !keys.has(baseKey(key))) {
    problems.push(`"${reference}" is used but defined in no locale`);
    for (const site of sites) problems.push(`    ${site}`);
  }
}

problems.push(...unresolvedBare.sort());

if (problems.length > 0) {
  console.error('i18n:used-keys failed:\n');
  for (const problem of problems) console.error(`  - ${problem}`);
  console.error('');
  process.exit(1);
}

console.log(
  `i18n:used-keys passed — ${used.size} explicit and ${bareCount} bare t() references ` +
    `across ${SOURCE_ROOTS.join(', ')} all resolve against ${REFERENCE}.`,
);
