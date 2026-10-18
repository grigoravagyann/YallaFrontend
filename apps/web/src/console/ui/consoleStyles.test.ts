import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * The redesigned console names no colour of its own.
 *
 * HANDOFF section 4: the approved look lives in `@yalla/tokens`
 * (`console.ts`, emitted as `--console-*`), and components read the tokens.
 * A hex value typed into a stylesheet or a `style` prop is a second palette
 * that the contrast tests in `console.test.ts` never see.
 */

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

/** Every file the redesign owns, so a new screen is covered by being put there. */
function redesignFiles(): string[] {
  const ui = join(SRC, 'console', 'ui');
  const own = readdirSync(ui)
    .filter((name) => /\.(css|tsx?)$/u.test(name) && !name.includes('.test.'))
    .map((name) => join(ui, name));
  return [
    ...own,
    join(SRC, 'console', 'platform', 'PlatformLayout.tsx'),
    join(SRC, 'console', 'platform', 'SettingsRoute.tsx'),
    join(SRC, 'auth', 'AuthLayout.tsx'),
    join(SRC, 'auth', 'SignInRoute.tsx'),
    join(SRC, 'auth', 'ResetPasswordRoute.tsx'),
    join(SRC, 'auth', 'RequireRole.tsx'),
  ];
}

/** Comments may quote a value; only code is checked. */
function withoutComments(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//gu, '').replace(/^\s*\/\/.*$/gmu, '');
}

const COLOUR = /#[0-9a-f]{3,8}\b|\b(?:rgba?|hsla?|oklch)\(/giu;

describe('the console redesign', () => {
  it('names no colour outside @yalla/tokens', () => {
    const files = redesignFiles();
    expect(files.some((file) => file.endsWith('.css'))).toBe(true);

    const found: string[] = [];
    for (const file of files) {
      const code = withoutComments(readFileSync(file, 'utf8'));
      for (const match of code.matchAll(COLOUR)) {
        found.push(`${relative(SRC, file)}: ${match[0]}`);
      }
    }
    expect(found).toEqual([]);
  });
});
