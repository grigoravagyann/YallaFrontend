// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { SHELL_FILE, SHELL_MANIFEST, shellFor, withManifest } from './manifestShell';
import { RESERVED_FIRST_SEGMENTS } from './publicRoutes';

/**
 * The shell each path is served (2026-10-29). iOS Safari installs the manifest
 * the HTML arrives with, so the right link has to be in the file the server
 * sends: these pin the mapping, the build's rewrite of `index.html`, and the
 * host's routing to the same answer.
 */

const WEB_ROOT = join(import.meta.dirname, '..');
const INDEX_HTML = readFileSync(join(WEB_ROOT, 'index.html'), 'utf8');
const CADDYFILE = readFileSync(join(WEB_ROOT, 'deploy', 'Caddyfile'), 'utf8');
const MANIFEST_LINK_JS = readFileSync(join(WEB_ROOT, 'public', 'manifest-link.js'), 'utf8');

describe('the shell a path is served', () => {
  it('serves the console its own, / included', () => {
    for (const path of ['/', '/sign-in', '/platform/venues', '/venue/menu', '/reset-password']) {
      expect(shellFor(path), path).toBe('console');
    }
  });

  it('serves the staff app its own, whatever the case', () => {
    for (const path of ['/staff', '/staff/', '/staff/kitchen', '/Staff/kitchen']) {
      expect(shellFor(path), path).toBe('staff');
    }
  });

  it("serves a diner's page one that installs nothing", () => {
    for (const path of [
      '/yalla-demo/yerevan-centre',
      '/booking/abc123',
      '/a-cafe/main/booking/t',
    ]) {
      expect(shellFor(path), path).toBe('public');
    }
    expect(SHELL_MANIFEST.public).toBeNull();
  });

  it('serves every reserved first segment the console or the staff app', () => {
    for (const segment of RESERVED_FIRST_SEGMENTS) {
      expect(shellFor(`/${segment}/x`), segment).toBe(segment === 'staff' ? 'staff' : 'console');
    }
  });
});

describe("pointing index.html's manifest link", () => {
  it('has exactly one link to point', () => {
    expect(INDEX_HTML.match(/<link rel="manifest"/gu)).toHaveLength(1);
  });

  it('changes that one line and nothing else', () => {
    const staff = withManifest(INDEX_HTML, '/manifest.webmanifest');
    const consoleHtml = withManifest(INDEX_HTML, '/manifest-console.webmanifest');
    expect(staff).toContain('<link rel="manifest" href="/manifest.webmanifest" />');
    expect(consoleHtml).toContain('<link rel="manifest" href="/manifest-console.webmanifest" />');
    expect(staff.split('\n')).toHaveLength(consoleHtml.split('\n').length);
    expect(staff.replace('/manifest.webmanifest', '/manifest-console.webmanifest')).toBe(
      consoleHtml,
    );
  });

  it('takes the whole line out for a diner', () => {
    const none = withManifest(INDEX_HTML, null);
    expect(none).not.toContain('rel="manifest"');
    expect(none.split('\n')).toHaveLength(INDEX_HTML.split('\n').length - 1);
    // The picker still loads: it follows client-side navigations.
    expect(none).toContain('<script src="/manifest-link.js"></script>');
  });

  it('refuses a shell with no link rather than writing three identical ones', () => {
    expect(() => withManifest('<html><head></head></html>', '/x')).toThrow(/manifest/u);
  });
});

describe('deploy/Caddyfile', () => {
  /** The paths a named matcher's `path` line lists. */
  function matcherPaths(name: string): readonly string[] {
    const inline = new RegExp(`^\\s*${name} path (.+)$`, 'mu').exec(CADDYFILE);
    const block = new RegExp(`^\\s*${name} \\{[^}]*?^\\s*path (.+)$`, 'mu').exec(CADDYFILE);
    const line = (inline ?? block)?.[1];
    if (!line) throw new Error(`no ${name} path matcher in the Caddyfile`);
    return line.trim().split(/\s+/u);
  }

  function rewriteTarget(name: string): string | undefined {
    return new RegExp(`^\\s*rewrite ${name} (\\S+)\\s*$`, 'mu').exec(CADDYFILE)?.[1];
  }

  it('sends /staff and below to the staff shell', () => {
    expect(matcherPaths('@staffShell')).toEqual(['/staff', '/staff/*']);
    expect(rewriteTarget('@staffShell')).toBe(`/${SHELL_FILE.staff}`);
  });

  it("sends the console's reserved segments to the console shell", () => {
    // `/assets/*` is answered before this (a missing chunk is a 404). `/` is
    // listed because try_files does not count the root as a file.
    const expected = [
      '/',
      ...RESERVED_FIRST_SEGMENTS.filter((s) => s !== 'staff' && s !== 'assets').flatMap((s) => [
        `/${s}`,
        `/${s}/*`,
      ]),
    ].sort();
    expect([...matcherPaths('@consoleShell')].sort()).toEqual(expected);
    expect(rewriteTarget('@consoleShell')).toBe(`/${SHELL_FILE.console}`);
    expect(SHELL_FILE.console).toBe('index.html');
  });

  it('sends everything else to the public shell', () => {
    expect(CADDYFILE).toMatch(
      new RegExp(`^\\s*try_files \\{path\\} /${SHELL_FILE.public}\\s*$`, 'mu'),
    );
  });

  it('keeps every shell off the long cache', () => {
    const shell = matcherPaths('@shell');
    for (const file of Object.values(SHELL_FILE)) expect(shell).toContain(`/${file}`);
    expect(shell).toContain('/');
  });
});

describe('manifest-link.js on a page served with no link', () => {
  function manifest(): string | null {
    return document.head.querySelector('link[rel="manifest"]')?.getAttribute('href') ?? null;
  }

  function visit(path: string): string | null {
    window.history.pushState(null, '', path);
    return manifest();
  }

  beforeAll(() => {
    // public.html, as a diner's page arrives: no link at all.
    window.history.replaceState(null, '', '/a-cafe/main');
    document.head.innerHTML = '<script src="/manifest-link.js"></script><title>Time to Eat</title>';
    new Function(MANIFEST_LINK_JS)();
  });

  it('adds the link when the page moves to a product that installs', () => {
    expect(manifest()).toBeNull();
    expect(visit('/sign-in')).toBe(SHELL_MANIFEST.console);
    expect(visit('/staff')).toBe(SHELL_MANIFEST.staff);
    expect(visit('/booking/abc')).toBeNull();
    expect(visit('/venue')).toBe(SHELL_MANIFEST.console);
    expect(document.head.querySelectorAll('link[rel="manifest"]')).toHaveLength(1);
  });

  it('agrees with the server about every path', () => {
    const paths = [
      '/',
      '/staff',
      '/STAFF/kitchen',
      '/x/y',
      '/booking/t',
      ...RESERVED_FIRST_SEGMENTS.map((s) => `/${s}/x`),
    ];
    for (const path of paths) expect(visit(path), path).toBe(SHELL_MANIFEST[shellFor(path)]);
  });
});
