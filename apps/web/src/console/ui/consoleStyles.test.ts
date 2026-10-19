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
    // The venue console's shell and My account (venue-console redesign phase 1).
    join(SRC, 'console', 'venue', 'VenueLayout.tsx'),
    ...inFolder(join(SRC, 'console', 'venue', 'account')),
    // Overview (venue-console redesign phase 2).
    join(SRC, 'console', 'venue', 'VenueOverviewScreen.tsx'),
    join(SRC, 'console', 'venue', 'OnboardingChecklist.tsx'),
    ...inFolder(join(SRC, 'console', 'venue', 'overview')),
    // Menu, Rooms and Hours (venue-console redesign phase 3).
    ...inFolder(join(SRC, 'console', 'venue', 'menu')),
    ...inFolder(join(SRC, 'console', 'venue', 'rooms')),
    ...inFolder(join(SRC, 'console', 'venue', 'hours')),
    // Policy, Public and Reviews, with the review card both consoles share (phase 4).
    ...inFolder(join(SRC, 'console', 'venue', 'policy')),
    ...inFolder(join(SRC, 'console', 'venue', 'public')),
    ...inFolder(join(SRC, 'console', 'venue', 'reviews')),
    ...inFolder(join(SRC, 'console', 'reviews')),
    // Staff and Reports, with the add-staff wizard both consoles share (phase 5).
    ...inFolder(join(SRC, 'console', 'venue', 'staff')),
    ...inFolder(join(SRC, 'console', 'venue', 'reports')),
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
    expect(files.some((file) => file.endsWith('AccountScreen.tsx'))).toBe(true);
    expect(files.some((file) => file.endsWith('ConsoleShell.tsx'))).toBe(true);
    expect(files.some((file) => file.endsWith('RoomsEditor.tsx'))).toBe(true);
    expect(files.some((file) => file.endsWith('DishDrawer.tsx'))).toBe(true);
    expect(files.some((file) => file.endsWith('OpeningHoursScreen.tsx'))).toBe(true);
    expect(files.some((file) => file.endsWith('ReservationPolicyScreen.tsx'))).toBe(true);
    expect(files.some((file) => file.endsWith('AppCardPreview.tsx'))).toBe(true);
    expect(files.some((file) => file.endsWith('ReviewCard.tsx'))).toBe(true);
    expect(files.some((file) => file.endsWith('ShiftDialog.tsx'))).toBe(true);
    expect(files.some((file) => file.endsWith('RevenueLine.tsx'))).toBe(true);

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

/** Every rule of the console's stylesheet, as selector and declarations, comments left out. */
function consoleRules(): { readonly selector: string; readonly body: string }[] {
  const css = withoutComments(readFileSync(join(SRC, 'console', 'ui', 'console.css'), 'utf8'));
  return [...css.matchAll(/([^{}]+)\{([^{}]*)\}/gu)].map((match) => ({
    selector: (match[1] ?? '').trim(),
    body: match[2] ?? '',
  }));
}

describe('the console stylesheet keeps its contrast', () => {
  // The edges `console.test.ts` proves clear 3:1 against every ground.
  const CONTROL_EDGES = ['control', 'control-hover', 'red', 'focus', 'brand'];

  it("gives every field and select the control's 3:1 edge, never the soft button edge", () => {
    const offenders = consoleRules()
      .filter((rule) => /\.yc-(ctl|bsel|range)\b/u.test(rule.selector))
      .flatMap((rule) =>
        [...rule.body.matchAll(/border-color:\s*var\(--console-([a-z-]+)\)/gu)]
          .map((match) => match[1] ?? '')
          .filter((token) => !CONTROL_EDGES.includes(token))
          .map((token) => `${rule.selector}: ${token}`),
      );
    expect(offenders).toEqual([]);
  });

  it('draws a placeholder in the muted ink at full strength', () => {
    const rule = consoleRules().find((candidate) =>
      /\.yc-ctl::placeholder/u.test(candidate.selector),
    );
    expect(rule?.body).toMatch(/color:\s*var\(--console-muted\)/u);
    expect(rule?.body).toMatch(/opacity:\s*1/u);
  });

  it("keeps the skip link's light text when it is hovered", () => {
    const rule = consoleRules().find((candidate) =>
      /\.yc \.yc-skip:hover/u.test(candidate.selector),
    );
    expect(rule?.body).toMatch(/color:\s*var\(--console-brand-foreground\)/u);
  });

  it("puts the rooms page's new pins in the brand, not the venue console's beige", () => {
    const legacy = consoleRules().find((candidate) => candidate.selector === '.yc-legacy');
    expect(legacy?.body).toMatch(/--color-primary-on-floor-plan:\s*var\(--console-brand\)/u);
    expect(legacy?.body).toMatch(
      /--color-primary-on-floor-plan-pressed:\s*var\(--console-brand-hover\)/u,
    );
  });
});

describe('the console sidebar', () => {
  // QA, venue console phase 1: on a long page the person at the foot — My
  // account and sign-out — scrolled away with the page.
  it('stays in view while the page scrolls, and scrolls on its own when it must', () => {
    const side = consoleRules().find((rule) => rule.selector === '.yc-side');
    expect(side?.body).toMatch(/position:\s*sticky/u);
    expect(side?.body).toMatch(/top:\s*0/u);
    expect(side?.body).toMatch(/height:\s*100vh/u);
    expect(side?.body).toMatch(/overflow-y:\s*auto/u);
  });

  // A window shorter than the sidebar (768px tall, a venue's full nav) made the
  // person at the foot need the sidebar's own scroll: it is pinned to the foot.
  it('keeps the person at its foot in view when the sidebar itself scrolls', () => {
    const foot = consoleRules().find((rule) => rule.selector === '.yc-side-foot');
    expect(foot?.body).toMatch(/position:\s*sticky/u);
    expect(foot?.body).toMatch(/bottom:\s*0/u);
    expect(foot?.body).toMatch(/background:\s*var\(--console-sidebar\)/u);
  });
});

describe("a branch's sub-tabs", () => {
  /*
   * Public page / Rooms and tables / Reviews scroll sideways on a narrow
   * screen. `overflow-x: auto` alone makes the other axis `auto` too, and the
   * tab underline drawn a pixel past the bar's bottom then overflowed it:
   * stray vertical scroll arrows on the right of the bar (QA, Reviews page at
   * 1024×768). The bar scrolls one way only, and nothing is drawn past it.
   */
  it('scrolls sideways only, and draws nothing below itself', () => {
    const rules = consoleRules();
    const bar = rules.find((rule) => rule.selector === '.yc-subtabs');
    expect(bar?.body).toMatch(/overflow-x:\s*auto/u);
    expect(bar?.body).toMatch(/overflow-y:\s*hidden/u);
    const tabs = rules.filter((rule) => /\.yc-subtabs a$/u.test(rule.selector));
    expect(tabs.length).toBeGreaterThan(0);
    for (const rule of tabs) expect(rule.body).not.toMatch(/margin(?:-bottom)?:\s*-/u);
  });

  it('draws the focus ring inside the tab, where the bar does not clip it', () => {
    // `.yc :focus-visible` draws 2px outside the element; the tabs fill a bar
    // that clips its overflow, so a keyboard user would see no ring at all.
    const focus = consoleRules().find(
      (rule) => rule.selector === '.yc .yc-subtabs a:focus-visible',
    );
    expect(focus?.body).toMatch(/outline-offset:\s*-\d+px/u);
  });
});
