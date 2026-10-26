import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * `DESIGN.md` quotes token values, and this holds it to them.
 *
 * Every hex the doc names must be a value a token file assigns: a quoted
 * `'#RRGGBB'` in `packages/tokens/src` or in the diner's `src/theme`. A hex
 * that only appears in a comment does not count, because a comment is where an
 * old artboard value is remembered, not where a colour is drawn. When a palette
 * change leaves the doc behind, this fails instead of the doc quietly
 * describing colours nobody draws.
 */

const ROOT = join(import.meta.dirname, '..', '..', '..');
const TOKEN_DIRS = [
  join(ROOT, 'packages', 'tokens', 'src'),
  join(ROOT, 'apps', 'diner', 'src', 'theme'),
];

function tokenSources(): string[] {
  return TOKEN_DIRS.flatMap((dir) =>
    readdirSync(dir)
      .filter((name) => /\.tsx?$/u.test(name) && !/\.test\.tsx?$/u.test(name))
      .map((name) => readFileSync(join(dir, name), 'utf8')),
  );
}

describe('DESIGN.md', () => {
  const doc = readFileSync(join(ROOT, 'DESIGN.md'), 'utf8');
  const sources = tokenSources();
  const assigned = new Set(
    sources.flatMap((source) =>
      [...source.matchAll(/'(#[0-9A-Fa-f]{6})'/gu)].map(([, hex]) => hex!.toUpperCase()),
    ),
  );
  const quoted = [
    ...new Set([...doc.matchAll(/#[0-9A-Fa-f]{6}\b/gu)].map(([hex]) => hex.toUpperCase())),
  ];

  it('reads the token files and finds colours in the doc', () => {
    expect(sources.length).toBeGreaterThan(5);
    expect(quoted.length).toBeGreaterThan(20);
  });

  it('names no hex that a token file does not assign', () => {
    expect(quoted.filter((hex) => !assigned.has(hex))).toEqual([]);
  });
});
