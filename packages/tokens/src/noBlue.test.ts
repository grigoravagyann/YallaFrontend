import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * No blue in Time to Eat.
 *
 * The brand rule is that waiting and held are burgundy and confirmed is green;
 * the pre-SHURJ palette (a blue held, a cool blue-grey paper and ink) lived on
 * in `color.ts` long after no screen drew it, where anyone could pick it up
 * again. This reads every colour literal in the token files — a `#RRGGBB`, an
 * `rgb()`/`rgba()`, or a bare `'r, g, b'` triplet — and fails on a blue.
 *
 * A blue is a hue of 190° to 260° at more than 25% HSL saturation. HSL rather
 * than chroma on purpose: it calls a faintly blue near-white or near-black a
 * blue too (the old paper `#F4F6FA` is 37%, the old ink `#131A22` 28%), which
 * is exactly the cool cast Time to Eat dropped. The warm greys and the floor's
 * out-of-service grey (`#8B95A1`, 10%) pass.
 */

const ROOT = join(import.meta.dirname, '..', '..', '..');
const TOKEN_DIRS = [
  join(ROOT, 'packages', 'tokens', 'src'),
  join(ROOT, 'apps', 'diner', 'src', 'theme'),
];

const HUE_MIN = 190;
const HUE_MAX = 260;
const SATURATION_MAX = 0.25;

/**
 * The blues Time to Eat keeps, each a convention people already know (DESIGN.md,
 * "There is no blue in Time to Eat"). Keyed `file:token`; each must still match a
 * blue, so a stale entry fails too.
 */
const ALLOWED: Readonly<Record<string, string>> = {
  'packages/tokens/src/console.ts:publicTelegram':
    'The "Confirm with Telegram" button wears Telegram\'s own blue, so people recognise it.',
  'packages/tokens/src/console.ts:publicTelegramHover': 'The same button under the pointer.',
  'apps/diner/src/theme/colors.ts:location':
    'The map\'s "you are here" dot: every map app\'s blue.',
  'apps/diner/src/theme/colors.ts:locationSoft': 'The halo around that dot.',
};

interface Found {
  readonly key: string;
  readonly literal: string;
  readonly line: number;
  readonly hue: number;
  readonly saturation: number;
}

/** HSL hue (degrees) and saturation (0–1) of an sRGB triplet. */
export function hsl(r: number, g: number, b: number): { hue: number; saturation: number } {
  const [rr, gg, bb] = [r / 255, g / 255, b / 255];
  const max = Math.max(rr, gg, bb);
  const min = Math.min(rr, gg, bb);
  const delta = max - min;
  if (delta === 0) return { hue: 0, saturation: 0 };
  const lightness = (max + min) / 2;
  const saturation = delta / (1 - Math.abs(2 * lightness - 1));
  const sector =
    max === rr
      ? ((gg - bb) / delta) % 6
      : max === gg
        ? (bb - rr) / delta + 2
        : (rr - gg) / delta + 4;
  return { hue: (sector * 60 + 360) % 360, saturation };
}

export function isBlue(r: number, g: number, b: number): boolean {
  const { hue, saturation } = hsl(r, g, b);
  return hue >= HUE_MIN && hue <= HUE_MAX && saturation > SATURATION_MAX;
}

const LITERAL =
  /#([0-9A-Fa-f]{6})\b|rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)|['"`](\d{1,3}),\s*(\d{1,3}),\s*(\d{1,3})['"`]/gu;

/** Every blue literal in a source, named by the token key on its line. */
export function bluesIn(source: string, file: string): Found[] {
  const found: Found[] = [];
  source.split('\n').forEach((text, index) => {
    for (const m of text.matchAll(LITERAL)) {
      const [r, g, b] = m[1]
        ? [0, 8, 16].map((shift) => (Number.parseInt(m[1]!, 16) >> (16 - shift)) & 255)
        : m[2]
          ? [m[2], m[3], m[4]].map(Number)
          : [m[5], m[6], m[7]].map(Number);
      if (!isBlue(r!, g!, b!)) continue;
      const name = /^\s*(?:const\s+)?([A-Za-z_]\w*)\s*[:=]/u.exec(text)?.[1] ?? `line ${index + 1}`;
      const { hue, saturation } = hsl(r!, g!, b!);
      found.push({ key: `${file}:${name}`, literal: m[0], line: index + 1, hue, saturation });
    }
  });
  return found;
}

function tokenFiles(): { file: string; source: string }[] {
  return TOKEN_DIRS.flatMap((dir) =>
    readdirSync(dir)
      .filter((name) => /\.tsx?$/u.test(name) && !/\.test\.tsx?$/u.test(name))
      .map((name) => {
        const path = join(dir, name);
        return {
          file: relative(ROOT, path).split('\\').join('/'),
          source: readFileSync(path, 'utf8'),
        };
      }),
  );
}

const describeFound = (f: Found) =>
  `${f.key} (line ${f.line}) is ${f.literal}: a blue, hue ${Math.round(f.hue)}° at ` +
  `${Math.round(f.saturation * 100)}% saturation. Time to Eat has no blue — waiting and held ` +
  `are burgundy (consoleColor.waiting), confirmed is green. Use a console.ts or diner ` +
  `theme value, or, for a blue people must recognise, add it to ALLOWED with its reason.`;

describe('no blue in Time to Eat', () => {
  const files = tokenFiles();

  it('reads the token files of both palettes', () => {
    expect(files.map((f) => f.file)).toEqual(
      expect.arrayContaining([
        'packages/tokens/src/color.ts',
        'packages/tokens/src/console.ts',
        'packages/tokens/src/elevation.ts',
        'apps/diner/src/theme/colors.ts',
      ]),
    );
  });

  for (const { file, source } of files) {
    it(`${file} assigns no blue outside the allow-list`, () => {
      const offenders = bluesIn(source, file).filter((f) => !(f.key in ALLOWED));
      expect(offenders.map(describeFound)).toEqual([]);
    });
  }

  it('every allow-list entry still names a blue, with a reason', () => {
    const blues = new Set(
      files.flatMap(({ file, source }) => bluesIn(source, file).map((f) => f.key)),
    );
    for (const [key, reason] of Object.entries(ALLOWED)) {
      expect(blues.has(key), `${key} is allowed but is no longer a blue: drop it`).toBe(true);
      expect(reason.length).toBeGreaterThan(10);
    }
  });

  it('calls the retired pre-SHURJ colours blue, and the Time to Eat ones not', () => {
    const blue = (hex: string) => bluesIn(`x: '${hex}',`, 'probe').length > 0;
    // The old held, paper, ink and hairline, and the shadow triplet.
    for (const hex of ['#3B6FD4', '#F4F6FA', '#131A22', '#E2E8F0']) expect(blue(hex)).toBe(true);
    expect(bluesIn("const SHADOW_RGB = '19, 26, 34';", 'probe')).toHaveLength(1);
    expect(bluesIn("scrim: 'rgba(19, 26, 34, 0.45)',", 'probe')).toHaveLength(1);
    // The cherry, the waiting burgundy, the charcoal, the warm hairline, the
    // out-of-service grey and the floor's grey card.
    for (const hex of ['#4B0C18', '#6B1121', '#2D2927', '#EAE4E1', '#8B95A1', '#ECEEF0']) {
      expect(blue(hex)).toBe(false);
    }
  });
});
