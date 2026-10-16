import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Every `var(--token)` the stylesheets read is a token something defines.
 *
 * An undefined custom property is not an error anywhere: the declaration that
 * reads it is quietly dropped. The staff PIN gate's background read
 * `--color-background`, which no file defines, so the gate was transparent and
 * the dead floor — "Loading…" and a stale error — showed around the PIN card
 * after every sign-out (QA sweep 2026-10-16, L2). Nothing looked broken in the
 * diff and nothing failed. This is the thing that fails.
 *
 * A `var(--x, fallback)` is exempt — the fallback is the author saying the
 * token may be absent. Properties set from a component (`style={{ '--x': … }}`)
 * count as defined.
 */

const SRC = dirname(fileURLToPath(import.meta.url));

function walk(dir: string, accept: (name: string) => boolean): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return walk(path, accept);
    return accept(entry.name) ? [path] : [];
  });
}

describe('the stylesheets', () => {
  it('read no custom property that nothing defines', () => {
    const sheets = walk(SRC, (name) => name.endsWith('.css'));
    const components = walk(SRC, (name) => /\.tsx?$/u.test(name) && !name.includes('.test.'));

    const defined = new Set<string>();
    for (const file of sheets) {
      for (const match of readFileSync(file, 'utf8').matchAll(/(--[\w-]+)\s*:/gu)) {
        defined.add(match[1]!);
      }
    }
    for (const file of components) {
      for (const match of readFileSync(file, 'utf8').matchAll(/['"](--[\w-]+)['"]\s*:/gu)) {
        defined.add(match[1]!);
      }
    }

    const undefinedReads: string[] = [];
    for (const file of sheets) {
      const text = readFileSync(file, 'utf8');
      for (const match of text.matchAll(/var\(\s*(--[\w-]+)\s*(,)?/gu)) {
        if (match[2] || defined.has(match[1]!)) continue;
        const line = text.slice(0, match.index).split('\n').length;
        undefinedReads.push(`${relative(SRC, file)}:${line} ${match[1]}`);
      }
    }

    expect(sheets.length).toBeGreaterThan(1);
    expect(undefinedReads).toEqual([]);
  });
});
