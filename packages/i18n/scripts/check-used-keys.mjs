#!/usr/bin/env node
/**
 * Fails if the source calls `t()` for a key no locale defines.
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
 * ## Which namespace a key is checked against
 *
 * Three ways a call names one, in the order they are trusted:
 *
 * 1. **In the key** — `t('common:action.save')` is unambiguous, so it is checked
 *    against exactly that bundle.
 * 2. **In the options** — `t('booking.date', { ns: 'diner' })` overrides whatever
 *    the component was set up with, and eight call sites on the public page rely
 *    on it. Honoured, or every one of them would be reported as missing.
 * 3. **From the file** — a bare `t('save')` resolves against whatever the calling
 *    component passed to `useTranslation`, and a file holds several components:
 *    `PageStates.tsx` alone has four, three on `public` and one on `diner`. Tying
 *    each call to its own component means scope analysis, which a regex cannot
 *    do. So a bare key is accepted if **any** namespace the file mentions defines
 *    it. That is a deliberate over-approximation: it can miss a key that resolves
 *    only in a sibling component's namespace, and in exchange it never reports a
 *    key that really is fine. A check that cries wolf gets switched off.
 *
 * That third rule still earns its keep — it is what catches `t('save')` in a file
 * that only ever asks for `['admin', 'common']`, which is how a lowercase `save`
 * and `cancel` ended up on the staff dialog's two buttons.
 *
 * ## Calls with options are checked too
 *
 * They did not used to be. The rule was "a call that goes on to options may carry
 * a `defaultValue`", which is true of maybe one call in a thousand and was being
 * paid for by the other 203 in this repo — including every interpolated and
 * pluralised string on the diner surface. A missing `staff.pinShown` walked
 * straight through the check that was written to catch exactly that.
 *
 * So the options are read rather than used as an excuse to stop: a call is
 * skipped **only** when they literally contain a `defaultValue:` key, which is
 * the one case where i18next renders something sensible with no bundle entry
 * behind it.
 *
 * A computed key — a variable, a template literal, anything but a string literal
 * — is not knowable and is not checked.
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
 * Any `t(` whose first argument is a string literal.
 *
 * The leading boundary rejects an identifier that merely *ends* in `t` — without
 * it, `fetch('http://…')` reads as a call on namespace `http` and every URL in
 * the repo becomes a missing key.
 */
const CALL_RE = /(?<![A-Za-z0-9_$.])t\(\s*(['"])([A-Za-z][A-Za-z0-9_.:]*)\1/gu;

/** `defaultValue:` as an object key, not the word appearing inside some string. */
const DEFAULT_VALUE_RE = /\bdefaultValue\s*:/u;

/** `{ ns: 'diner' }` and `{ ns: ['diner', 'common'] }`. */
const NS_OPTION_RE = /\bns\s*:\s*(\[[^\]]*\]|'[a-z]+'|"[a-z]+")/u;

/** The namespaces a file asks for: `useTranslation('public')`, `useTranslation(['admin', 'common'])`. */
const USE_TRANSLATION_RE = /useTranslation\(\s*(\[[^\]]*\]|'[a-z]+')/gu;
const QUOTED_NAME_RE = /['"]([a-z]+)['"]/gu;

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

/**
 * Everything between a call's parentheses, or `null` if they do not balance.
 *
 * Quotes are tracked so a `)` inside a string does not end the call early, and
 * escapes so `'\\''` does not open one. Enough for an options object, which is
 * all this reads; a template literal with a nested brace-expression containing
 * an unbalanced bracket would defeat it, and the caller treats `null` as "cannot
 * tell" rather than as permission to skip.
 */
function callArguments(source, openParenIndex) {
  let depth = 0;
  let quote = null;

  for (let i = openParenIndex; i < source.length; i += 1) {
    const character = source[i];

    if (quote !== null) {
      if (character === '\\') i += 1;
      else if (character === quote) quote = null;
      continue;
    }

    if (character === "'" || character === '"' || character === '`') {
      quote = character;
    } else if (character === '(' || character === '[' || character === '{') {
      depth += 1;
    } else if (character === ')' || character === ']' || character === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(openParenIndex + 1, i);
    }
  }

  return null;
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

function definesKey(namespace, key) {
  const keys = defined.get(namespace);
  return keys !== undefined && (keys.has(key) || keys.has(baseKey(key)));
}

const problems = [];
let checked = 0;
let skippedForDefault = 0;

for (const root of SOURCE_ROOTS) {
  const absolute = join(REPO_ROOT, root);

  for (const file of sourceFiles(absolute)) {
    const source = readFileSync(file, 'utf8');
    const where = (index) =>
      `${relative(REPO_ROOT, file).replaceAll('\\', '/')}:${source.slice(0, index).split('\n').length}`;

    // Every namespace this file asks for, pooled — see the header on why the
    // pool is per file rather than per component.
    const pooled = [
      ...new Set(
        [...source.matchAll(USE_TRANSLATION_RE)].flatMap((match) =>
          [...match[1].matchAll(QUOTED_NAME_RE)].map((name) => name[1]),
        ),
      ),
    ].sort();

    for (const match of source.matchAll(CALL_RE)) {
      const literal = match[2];

      // `t(` is the first two characters of the match; its paren opens the call.
      const args = callArguments(source, match.index + 1);
      if (args !== null && DEFAULT_VALUE_RE.test(args)) {
        skippedForDefault += 1;
        continue;
      }

      const colon = literal.indexOf(':');
      if (colon !== -1) {
        const namespace = literal.slice(0, colon);
        const key = literal.slice(colon + 1);
        checked += 1;
        if (!defined.has(namespace)) {
          problems.push(
            `"${literal}" names namespace "${namespace}", which does not exist\n` +
              `    ${where(match.index)}`,
          );
        } else if (!definesKey(namespace, key)) {
          problems.push(`"${literal}" is used but defined in no locale\n    ${where(match.index)}`);
        }
        continue;
      }

      // An `ns` in the options overrides the component's own, so it is the
      // answer when present — and a narrower one than the file-wide pool.
      const declared = args === null ? null : NS_OPTION_RE.exec(args);
      const candidates = declared
        ? [...declared[1].matchAll(QUOTED_NAME_RE)].map((name) => name[1])
        : pooled;

      if (candidates.length === 0) continue;
      checked += 1;
      if (candidates.some((namespace) => definesKey(namespace, literal))) continue;

      problems.push(
        `"${literal}" is used but defined in none of [${candidates.join(', ')}]\n` +
          `    ${where(match.index)}`,
      );
    }
  }
}

if (problems.length > 0) {
  console.error('i18n:used-keys failed:\n');
  for (const problem of problems.sort()) console.error(`  - ${problem}`);
  console.error('');
  process.exit(1);
}

console.log(
  `i18n:used-keys passed — ${checked} t() references across ${SOURCE_ROOTS.join(', ')} all ` +
    `resolve against ${REFERENCE}` +
    (skippedForDefault > 0 ? `; ${skippedForDefault} skipped for a defaultValue` : '') +
    '.',
);
