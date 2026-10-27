// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { RESERVED_FIRST_SEGMENTS } from './publicRoutes';

/**
 * `public/manifest-link.js` (2026-10-27): which app "Add to Home Screen"
 * installs from a path. The staff app on /staff, the console on its own paths,
 * nothing on a diner's page. Run once, as the page runs it, then driven by
 * navigation, as the router drives it.
 */

const SOURCE = readFileSync(join(import.meta.dirname, '..', 'public', 'manifest-link.js'), 'utf8');
const STAFF = '/manifest.webmanifest';
const CONSOLE = '/manifest-console.webmanifest';

function manifest(): string | null {
  return document.head.querySelector('link[rel="manifest"]')?.getAttribute('href') ?? null;
}

function visit(path: string): string | null {
  window.history.pushState(null, '', path);
  return manifest();
}

beforeAll(() => {
  window.history.replaceState(null, '', '/');
  document.head.innerHTML = `<link rel="manifest" href="${STAFF}" /><title>SHURJ</title>`;
  new Function(SOURCE)();
});

describe('the manifest a path installs', () => {
  it("installs the console from the console's paths, / included", () => {
    expect(manifest()).toBe(CONSOLE);
    for (const path of ['/sign-in', '/platform/venues', '/venue/menu', '/reset-password']) {
      expect(visit(path), path).toBe(CONSOLE);
    }
  });

  it('installs the staff app from /staff', () => {
    expect(visit('/staff')).toBe(STAFF);
    expect(visit('/staff/kitchen')).toBe(STAFF);
  });

  it("installs nothing from a diner's page, and comes back on the console", () => {
    expect(visit('/yalla-demo/yerevan-centre')).toBeNull();
    expect(visit('/booking/abc123')).toBeNull();
    expect(visit('/venue')).toBe(CONSOLE);
    // One link, never a second.
    expect(document.head.querySelectorAll('link[rel="manifest"]')).toHaveLength(1);
  });

  it('follows the back button too', () => {
    window.history.pushState(null, '', '/staff');
    // Under the patch, as the browser's own Back moves the address: only the
    // popstate listener can notice.
    History.prototype.replaceState.call(window.history, null, '', '/a-cafe/main');
    expect(manifest()).not.toBeNull();
    window.dispatchEvent(new PopStateEvent('popstate'));
    expect(manifest()).toBeNull();
  });

  it('knows every first segment the console and the staff app own', () => {
    // `RESERVED_FIRST_SEGMENTS` decides what is not a venue page; a word added
    // there and not in the script would leave that page installing nothing.
    for (const segment of RESERVED_FIRST_SEGMENTS) {
      expect(visit(`/${segment}/x`), segment).toBe(segment === 'staff' ? STAFF : CONSOLE);
    }
  });
});
