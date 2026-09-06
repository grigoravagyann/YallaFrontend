import { execSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';

/**
 * What is actually in the file a venue installs.
 *
 * Every other test here reasons about source. This one reads the build output,
 * because the thing it is guarding is a *build-time* guarantee: `?race=t4` and
 * `?churn=t4` are gated on `import.meta.env.DEV` **and** on the mock data
 * source, which is right — but "right" and "actually removed by the bundler"
 * are different claims, and only one of them can be checked by looking at the
 * bundle.
 *
 * A dev affordance that ships is how a waiter finds a way to break the floor:
 * a query string on a URL somebody pasted into a group chat, and a table that
 * refuses the next four transitions for no reason anybody can explain.
 */

const WEB_ROOT = resolve(__dirname, '..');
const DIST = join(WEB_ROOT, 'dist');

/** The dev-only query flags. If either string survives, so does the affordance. */
const DEV_FLAGS = ['race', 'churn'] as const;

function bundleFiles(): readonly string[] {
  const assets = join(DIST, 'assets');
  if (!existsSync(assets)) return [];
  return readdirSync(assets)
    .filter((name) => name.endsWith('.js'))
    .map((name) => join(assets, name))
    .filter((path) => statSync(path).isFile());
}

/** The newest mtime under a directory, recursively. `0` when it does not exist. */
function newestMtime(root: string): number {
  if (!existsSync(root)) return 0;
  let newest = 0;
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) newest = Math.max(newest, newestMtime(path));
    else newest = Math.max(newest, statSync(path).mtimeMs);
  }
  return newest;
}

/**
 * Build if there is nothing to read, **or if what is there is stale**.
 *
 * Deliberately not a skip, and deliberately not "exists is good enough". A test
 * that quietly passes because the artefact it is about is missing is the same
 * category of mistake as the four defects the regression suite was written
 * for — and one that passes against last week's bundle is worse, because it
 * looks like it checked something. So the sources are compared against the
 * output and a stale bundle is rebuilt.
 */
beforeAll(() => {
  const built = newestMtime(join(DIST, 'assets'));
  const sources = Math.max(
    newestMtime(join(WEB_ROOT, 'src')),
    newestMtime(join(WEB_ROOT, 'public')),
    newestMtime(join(WEB_ROOT, '..', '..', 'packages')),
  );

  if (built > 0 && built >= sources) return;

  execSync('pnpm --filter @yalla/web build', {
    cwd: resolve(WEB_ROOT, '..', '..'),
    stdio: 'inherit',
    // `NODE_ENV` has to be forced. Vitest sets it to `test`, a child process
    // inherits it, and `@vitejs/plugin-react` picks its JSX runtime from it —
    // so a build launched from here without this produces `jsxDEV` calls and a
    // truthy `import.meta.env.DEV`, and every dev affordance this test exists
    // to find survives into the output. The first run of this rebuild found
    // exactly that, which is the test working rather than a regression.
    env: { ...process.env, NODE_ENV: 'production' },
  });
}, 600_000);

describe('the production bundle', () => {
  it('was built and has JavaScript in it', () => {
    const files = bundleFiles();
    expect(files.length).toBeGreaterThan(0);
  });

  it('contains no dev race or churn flag', () => {
    const offenders: string[] = [];

    for (const path of bundleFiles()) {
      const source = readFileSync(path, 'utf8');
      for (const flag of DEV_FLAGS) {
        // `get("race")` / `get('race')` — the shape the affordance takes after
        // minification, where the identifier is gone and the literal is not.
        const pattern = new RegExp(`get\\(\\s*["'\`]${flag}["'\`]\\s*\\)`, 'u');
        if (pattern.test(source)) offenders.push(`${path}: reads ?${flag}=`);
      }

      // The dev role switcher goes with them: it is gated the same way, and its
      // presence would mean the DEV branch survived rather than that one flag
      // slipped through.
      if (source.includes('dev-role-bar')) offenders.push(`${path}: dev role switcher`);
    }

    expect(offenders).toEqual([]);
  });

  it('bakes the data source in, so nothing can switch a tablet onto the mock', () => {
    // The other half of the same guarantee, and the one that matters: a tablet
    // that could be talked into inventing orders and balances is worse than one
    // that cannot start.
    //
    // The check is that `VITE_DATA_SOURCE` survives as a **literal in an object
    // Vite inlined**, not as something read at runtime — `{…,VITE_DATA_SOURCE:
    // "real"}.VITE_DATA_SOURCE`. There is therefore no switch: choosing the mock
    // is a rebuild, not a query string or a stored setting.
    //
    // Note what this deliberately does *not* claim. `createStaffMockGateway` is
    // still **in** the bundle: `resolveStaffGateway` imports both
    // implementations statically and picks between them with a runtime `if`, so
    // the bundler cannot drop the branch it can prove is never taken. That is
    // dead weight (~30 kB) rather than a reachable affordance, and asserting
    // its absence — as an earlier version of this test did, by grepping for a
    // doc comment minification had already stripped — would have been a test
    // that passed while checking nothing. Dropping it needs the resolver to
    // take the mock as an injected dependency behind a dynamic import.
    const sources = bundleFiles().map((path) => readFileSync(path, 'utf8'));
    const inlined = sources.filter((source) =>
      /VITE_DATA_SOURCE\s*:\s*["'`][a-z]+["'`]/u.test(source),
    );

    expect(inlined.length).toBeGreaterThan(0);
    // And no code path reads it from anywhere a person could change.
    for (const source of sources) {
      expect(source).not.toMatch(/localStorage\.getItem\(\s*["'`]VITE_DATA_SOURCE/u);
    }
  });

  it('reads no dev query flag anywhere, however the bundler renamed things', () => {
    // Broader than the first test: any surviving read of the search string
    // paired with one of the flag names, not just the exact `get("race")` form.
    for (const path of bundleFiles()) {
      const source = readFileSync(path, 'utf8');
      for (const flag of DEV_FLAGS) {
        expect(source).not.toMatch(new RegExp(`URLSearchParams[^;]{0,200}${flag}`, 'u'));
      }
    }
  });
});
