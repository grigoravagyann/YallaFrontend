import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { STICKY_QUERY, WIDE_QUERY } from './layout';

/**
 * The redesigned public page names no colour of its own.
 *
 * public-page HANDOFF: the page shares the console's colour and type tokens
 * (`@yalla/tokens`, `console.ts`, emitted as `--console-*`, where the contrast
 * tests see them). A hex value typed here is a second palette nobody checks.
 * Files join the list as each phase restyles them.
 */

const HERE = dirname(fileURLToPath(import.meta.url));

const REDESIGNED = [
  'public.css',
  'PublicApp.tsx',
  'PageStates.tsx',
  'language.tsx',
  'layout.ts',
  'BranchRoute.tsx',
  'BookingCard.tsx',
  'PhotoGallery.tsx',
  'BranchHeader.tsx',
  'AboutSection.tsx',
  'ReviewsSection.tsx',
  'BranchDetails.tsx',
  'MenuSection.tsx',
  'icons.tsx',
  'RoomSection.tsx',
  'RoomPhotos.tsx',
  'tablePick.ts',
  'dayNames.ts',
  'pinLayout.ts',
  'useSettled.ts',
  'ManageBookingRoute.tsx',
  'ManageChange.tsx',
  'VenueRoute.tsx',
];

/** Comments may quote a value; only code is checked. */
function withoutComments(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//gu, '').replace(/^\s*\/\/.*$/gmu, '');
}

const COLOUR = /#[0-9a-f]{3,8}\b|\b(?:rgba?|hsla?|oklch)\(/giu;

const css = () => withoutComments(readFileSync(join(HERE, 'public.css'), 'utf8'));

describe('the public page redesign', () => {
  it('names no colour outside @yalla/tokens', () => {
    for (const file of REDESIGNED) {
      const code = withoutComments(readFileSync(join(HERE, file), 'utf8'));
      expect(code.match(COLOUR), file).toBeNull();
    }
  });

  it('reads the console tokens directly, never the product palette', () => {
    // The page's own rules name `--console-*`; a `--color-*` read here would be
    // the beige product look leaking back in through a variable.
    expect(css().match(/var\(--color-[\w-]+/gu)).toBeNull();
  });

  it('turns two columns, and sticks the booking column, where the page script also asks', () => {
    // Two queries, each said twice: the stylesheet lays the columns out and
    // makes the booking column sticky only when the window is tall enough to
    // hold it; `layout.ts` opens the booking panel in that column on the same
    // condition. They must agree.
    expect(WIDE_QUERY).toBe('(min-width: 60rem)');
    expect(STICKY_QUERY).toBe('(min-width: 60rem) and (min-height: 44rem)');
    expect(css()).toContain(`@media ${WIDE_QUERY} {`);
    const sticky = css().split(`@media ${STICKY_QUERY} {`)[1];
    expect(sticky, 'a sticky block').toBeDefined();
    expect(sticky!).toMatch(/^[^@]*\.pub-aside\s*\{[^}]*position:\s*sticky/u);
    // And nowhere else: on a short wide window the column flows with the page.
    expect(css().match(/position:\s*sticky/gu)!.length).toBe(
      // the top bar, the phone's bottom sheet, and the column
      3,
    );
  });

  it('lets a component link keep its own colour under the pointer', () => {
    // A generic `.pub a:hover` outranked the wordmark's cream and turned it
    // brown on the brown bar (about 1.5:1), and recoloured whole branch cards.
    expect(css()).not.toMatch(/\.pub a:hover\s*\{/u);
  });

  it('draws "fully booked" apart from a free count', () => {
    expect(css()).toMatch(/\.pub-count-none\s*\{[^}]*color:/u);
  });

  it('never sets a form control under 16px, so iOS does not zoom on focus', () => {
    const rules = [...css().matchAll(/([^{}]*(?:input|select|textarea)[^{}]*)\{([^}]*)\}/gu)];
    expect(rules.length).toBeGreaterThan(0);
    for (const [, selector, body] of rules) {
      const size = /font-size:\s*([^;]+);/u.exec(body!)?.[1];
      if (!size) continue;
      expect(size, selector!.trim()).toMatch(/^max\(16px,|^var\(--console-text-public-input\)$/u);
    }
  });

  it('keeps the line breaks of a review and of a reply', () => {
    // Both are written in multi-line boxes: the diner app's composer and the
    // console's reply textarea.
    const text = css();
    for (const selector of ['.pub-review-text {', '.pub-review-reply-text {']) {
      const start = text.indexOf(selector);
      expect(start, selector).toBeGreaterThanOrEqual(0);
      expect(text.slice(start, text.indexOf('}', start)), selector).toMatch(
        /white-space: pre-line;/u,
      );
    }
  });
});
