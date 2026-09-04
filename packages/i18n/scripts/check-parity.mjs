#!/usr/bin/env node
/**
 * Fails if a translation key exists in one language but not another.
 *
 * Armenian is the reference because it is the fallback: a key missing from `hy`
 * has nothing to fall back to and renders as its own key path in production.
 * Keys missing from `ru`/`en` are also failures — they silently render Armenian
 * to a reader who does not read Armenian, which looks like a bug, not a gap.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const LOCALES_DIR = resolve(HERE, '..', 'src', 'locales');

const REFERENCE = 'hy';

/** Flatten to dotted leaf paths so nesting differences show up as key differences. */
function leafKeys(value, prefix = '') {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return [prefix];
  }
  return Object.entries(value).flatMap(([key, child]) =>
    leafKeys(child, prefix ? `${prefix}.${key}` : key),
  );
}

function readNamespace(locale, namespace) {
  const path = join(LOCALES_DIR, locale, `${namespace}.json`);
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw new Error(`${locale}/${namespace}.json is not valid JSON`, { cause: error });
  }
}

const locales = readdirSync(LOCALES_DIR, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();

if (!locales.includes(REFERENCE)) {
  console.error(`i18n:check: reference locale "${REFERENCE}" is missing from ${LOCALES_DIR}`);
  process.exit(1);
}

const namespaces = readdirSync(join(LOCALES_DIR, REFERENCE))
  .filter((name) => name.endsWith('.json'))
  .map((name) => name.replace(/\.json$/u, ''))
  .sort();

const problems = [];

for (const namespace of namespaces) {
  const reference = readNamespace(REFERENCE, namespace);
  const referenceKeys = new Set(leafKeys(reference));

  for (const locale of locales) {
    if (locale === REFERENCE) continue;

    const translated = readNamespace(locale, namespace);
    if (translated === null) {
      problems.push(`${locale}/${namespace}.json is missing entirely`);
      continue;
    }

    const translatedKeys = new Set(leafKeys(translated));

    for (const key of referenceKeys) {
      if (!translatedKeys.has(key)) {
        problems.push(`${locale}/${namespace}.json is missing "${key}"`);
      }
    }
    for (const key of translatedKeys) {
      if (!referenceKeys.has(key)) {
        problems.push(`${locale}/${namespace}.json has "${key}", which ${REFERENCE} does not`);
      }
    }
  }
}

// An empty string is a key someone added and never translated. It renders as
// blank, not as a fallback, so it is worth failing on too.
for (const locale of locales) {
  for (const namespace of namespaces) {
    const bundle = readNamespace(locale, namespace);
    if (!bundle) continue;
    for (const key of leafKeys(bundle)) {
      const value = key
        .split('.')
        .reduce((node, part) => (node === undefined ? undefined : node[part]), bundle);
      if (typeof value === 'string' && value.trim() === '') {
        problems.push(`${locale}/${namespace}.json has an empty value for "${key}"`);
      }
    }
  }
}

if (problems.length > 0) {
  console.error(`i18n:check failed with ${problems.length} problem(s):\n`);
  for (const problem of problems) console.error(`  - ${problem}`);
  console.error('');
  process.exit(1);
}

const keyCount = namespaces.reduce(
  (total, namespace) => total + leafKeys(readNamespace(REFERENCE, namespace)).length,
  0,
);
console.log(
  `i18n:check passed — ${keyCount} keys x ${locales.length} locales (${locales.join(', ')}) across ${namespaces.length} namespaces.`,
);
