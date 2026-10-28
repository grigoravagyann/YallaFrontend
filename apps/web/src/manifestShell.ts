import { RESERVED_FIRST_SEGMENTS } from './publicRoutes';

/**
 * Which HTML shell a path is served, so "Add to Home Screen" installs the
 * right app (2026-10-29).
 *
 * One origin serves three products and each installs differently: the staff
 * app on /staff, the console on its own paths, nothing on a diner's page. The
 * three shells are the same `index.html` but for its `<link rel="manifest">`.
 *
 * **iOS Safari reads that link from the HTML as the server sent it.** It
 * ignores `public/manifest-link.js` changing the href afterwards, so a console
 * installed from one shared shell came up as the staff app. So the build writes
 * one file per product (`vite.config.ts`), the host serves each its own paths
 * (`deploy/Caddyfile`), and the dev and preview servers do the same per
 * request. `manifest-link.js` still follows client-side navigations, for the
 * browsers that honour a changed link.
 *
 * Used by `vite.config.ts` at build and serve time; kept free of React so it can be.
 */

export type ShellKind = 'console' | 'staff' | 'public';

/** The built file each shell is, beside the bundle in `dist`. */
export const SHELL_FILE: Readonly<Record<ShellKind, string>> = {
  console: 'index.html',
  staff: 'staff.html',
  public: 'public.html',
};

/** The manifest each shell links, or none: a diner's page installs nothing. */
export const SHELL_MANIFEST: Readonly<Record<ShellKind, string | null>> = {
  console: '/manifest-console.webmanifest',
  staff: '/manifest.webmanifest',
  public: null,
};

/**
 * The shell a path gets. `/staff…` the staff app's; `/` and the console's
 * reserved first segments the console's; anything else is a venue page or a
 * booking's manage link. Case-insensitive, as `isPublicPath` is.
 */
export function shellFor(pathname: string): ShellKind {
  const first = (pathname.split('/').filter(Boolean)[0] ?? '').toLowerCase();
  if (first === 'staff') return 'staff';
  if (first === '' || RESERVED_FIRST_SEGMENTS.includes(first)) return 'console';
  return 'public';
}

/** The one `<link rel="manifest">` line in `index.html`, its indent and line break included. */
const MANIFEST_LINK = /^[ \t]*<link rel="manifest" href="[^"]*"\s*\/?>[ \t]*\r?\n?/mu;

/**
 * `html` with its manifest link pointing at `href`, or with no manifest link
 * at all. Throws when the shell has no such link, so a reworded `index.html`
 * fails the build instead of shipping three identical shells.
 */
export function withManifest(html: string, href: string | null): string {
  const match = MANIFEST_LINK.exec(html);
  if (!match) throw new Error('index.html has no <link rel="manifest" href="..." /> to point');
  if (href === null) return html.replace(MANIFEST_LINK, '');
  const indent = /^[ \t]*/u.exec(match[0])?.[0] ?? '';
  const newline = match[0].endsWith('\n') ? (match[0].endsWith('\r\n') ? '\r\n' : '\n') : '';
  return html.replace(MANIFEST_LINK, `${indent}<link rel="manifest" href="${href}" />${newline}`);
}
