#!/usr/bin/env node
/**
 * Fails if a translation key exists in one language but not another.
 *
 * Armenian is the reference because it is the fallback: a key missing from `hy`
 * has nothing to fall back to and renders as its own key path in production.
 * Keys missing from `ru`/`en` are also failures — they silently render Armenian
 * to a reader who does not read Armenian, which looks like a bug, not a gap.
 *
 * Plurals are compared by their *base* key, not their suffixed form. Russian has
 * four plural categories (one/few/many/other) where Armenian and English have
 * two, so `freeNow_many` existing only in `ru` is correct CLDR, not key drift.
 * Each language is instead checked against the categories `Intl.PluralRules`
 * says that language actually needs.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const LOCALES_DIR = resolve(HERE, '..', 'src', 'locales');

const REFERENCE = 'hy';

/** BCP-47 tags for plural-rule lookup, mirroring `@yalla/format`'s intlTag. */
const INTL_TAG = { hy: 'hy-AM', ru: 'ru-AM', en: 'en-GB' };

const PLURAL_SUFFIXES = ['zero', 'one', 'two', 'few', 'many', 'other'];
const PLURAL_RE = new RegExp(`_(${PLURAL_SUFFIXES.join('|')})$`, 'u');

/** Flatten to dotted leaf paths so nesting differences show up as key differences. */
function leafKeys(value, prefix = '') {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return [prefix];
  }
  return Object.entries(value).flatMap(([key, child]) =>
    leafKeys(child, prefix ? `${prefix}.${key}` : key),
  );
}

/** `venue.freeNow_many` -> `venue.freeNow`; a non-plural key is returned as-is. */
function baseKey(key) {
  return key.replace(PLURAL_RE, '');
}

function pluralSuffix(key) {
  const match = PLURAL_RE.exec(key);
  return match ? match[1] : null;
}

function requiredCategories(locale) {
  const tag = INTL_TAG[locale] ?? locale;
  return new Set(
    new Intl.PluralRules(tag, { type: 'cardinal' }).resolvedOptions().pluralCategories,
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

function valueAt(bundle, dottedKey) {
  return dottedKey
    .split('.')
    .reduce((node, part) => (node === undefined || node === null ? undefined : node[part]), bundle);
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
  const referenceKeys = leafKeys(reference);
  const referenceBases = new Set(referenceKeys.map(baseKey));

  // Which base keys are plurals, according to the reference bundle.
  const pluralBases = new Set(referenceKeys.filter((k) => pluralSuffix(k) !== null).map(baseKey));

  for (const locale of locales) {
    if (locale === REFERENCE) continue;

    const translated = readNamespace(locale, namespace);
    if (translated === null) {
      problems.push(`${locale}/${namespace}.json is missing entirely`);
      continue;
    }

    const translatedKeys = leafKeys(translated);
    const translatedBases = new Set(translatedKeys.map(baseKey));

    for (const base of referenceBases) {
      if (!translatedBases.has(base)) {
        problems.push(`${locale}/${namespace}.json is missing "${base}"`);
      }
    }
    for (const base of translatedBases) {
      if (!referenceBases.has(base)) {
        problems.push(`${locale}/${namespace}.json has "${base}", which ${REFERENCE} does not`);
      }
    }
  }

  // Every language must carry exactly the plural categories its own grammar
  // needs — no more (dead keys i18next will never select) and no fewer (a
  // missing category falls back and reads as the wrong number agreement).
  for (const locale of locales) {
    const bundle = readNamespace(locale, namespace);
    if (!bundle) continue;
    const needed = requiredCategories(locale);
    const keys = leafKeys(bundle);

    for (const base of pluralBases) {
      const present = new Set(
        keys
          .filter((k) => baseKey(k) === base && pluralSuffix(k) !== null)
          .map((k) => pluralSuffix(k)),
      );
      for (const category of needed) {
        if (!present.has(category)) {
          problems.push(`${locale}/${namespace}.json is missing plural "${base}_${category}"`);
        }
      }
      for (const category of present) {
        if (!needed.has(category)) {
          problems.push(
            `${locale}/${namespace}.json has plural "${base}_${category}", which ${locale} does not use`,
          );
        }
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
      const value = valueAt(bundle, key);
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

const keyCount = new Set(
  namespaces.flatMap((ns) =>
    leafKeys(readNamespace(REFERENCE, ns)).map((k) => `${ns}.${baseKey(k)}`),
  ),
).size;

console.log(
  `i18n:check passed — ${keyCount} keys x ${locales.length} locales (${locales.join(', ')}) ` +
    `across ${namespaces.length} namespaces, plural categories verified per language.`,
);
