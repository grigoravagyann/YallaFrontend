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
  const inFolder = (folder: string) =>
    readdirSync(folder)
      .filter((name) => /\.(css|tsx?)$/u.test(name) && !name.includes('.test.'))
      .map((name) => join(folder, name));
  const venues = join(SRC, 'console', 'platform', 'venues');
  const venue = join(SRC, 'console', 'platform', 'venue');
  return [
    ...inFolder(ui),
    // The venues list (redesign phase 2): the route and everything in its folder.
    ...inFolder(venues),
    join(SRC, 'console', 'platform', 'VenuesRoute.tsx'),
    // The venue page (redesign phase 3).
    ...inFolder(venue),
    join(SRC, 'console', 'platform', 'VenueDetailRoute.tsx'),
    // A branch's pages (redesign phase 4): the header and its three pages.
    join(SRC, 'console', 'platform', 'PlatformBranchHeader.tsx'),
    join(SRC, 'console', 'platform', 'BranchPublicPageRoute.tsx'),
    join(SRC, 'console', 'platform', 'BranchFloorPlanRoute.tsx'),
    join(SRC, 'console', 'platform', 'BranchReviewsRoute.tsx'),
    join(SRC, 'console', 'platform', 'PlatformLayout.tsx'),
    join(SRC, 'console', 'platform', 'SettingsRoute.tsx'),
    // Home (redesign phase 5).
    join(SRC, 'console', 'platform', 'HomeRoute.tsx'),
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
    expect(files.some((file) => file.endsWith('TierDialog.tsx'))).toBe(true);
    expect(files.some((file) => file.endsWith('AddStaffWizard.tsx'))).toBe(true);
    expect(files.some((file) => file.endsWith('BranchReviewsRoute.tsx'))).toBe(true);

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
