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
 *
 * The public branch page's chunk graph is asserted here too, in the same file
 * rather than a neighbouring one, for a boring reason with teeth: both need a
 * fresh `dist`, vitest runs files in parallel workers, and two workers running
 * `pnpm build` into the same directory at the same time produce a bundle
 * neither of them measured.
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

/**
 * The bundle these tests read is built **by these tests, every run**.
 *
 * Two earlier versions got this wrong in the same direction, and the direction
 * is the point. The first built only when `dist/` was missing, so a stale
 * bundle passed and looked like it had checked something. The second compared
 * source mtimes against output mtimes — a better guess, still a guess, and
 * blind to the thing that actually broke it: a build is a function of its
 * *environment* as well as its sources, and the assertions below are partly
 * about which variables were set when it ran. No mtime can see that.
 *
 * So there is no reuse and no heuristic left to be wrong. One build, launched
 * here, with the variables the assertions name pinned rather than inherited.
 * It costs a few seconds and it removes the whole category.
 */
beforeAll(() => {
  execSync('pnpm --filter @yalla/web build', {
    cwd: resolve(WEB_ROOT, '..', '..'),
    stdio: 'inherit',
    env: {
      ...process.env,
      // `NODE_ENV` has to be forced. Vitest sets it to `test`, a child process
      // inherits it, and `@vitejs/plugin-react` picks its JSX runtime from it —
      // so a build launched from here without this produces `jsxDEV` calls and a
      // truthy `import.meta.env.DEV`, and every dev affordance this test exists
      // to find survives into the output. The first run of this rebuild found
      // exactly that, which is the test working rather than a regression.
      NODE_ENV: 'production',
      // The variable the "baked in" assertion below is about, pinned so that
      // the assertion is about the code rather than about the machine. A
      // developer with `mock` in their `.env`, a developer with no `.env` at
      // all and a CI runner with an empty environment must all produce the
      // same bundle here. A value passed in the environment wins over a `.env`
      // entry, which is what makes the pin effective.
      VITE_DATA_SOURCE: 'real',
    },
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
    // The value comes from the pin in `beforeAll`, not from the machine. Left
    // to the environment this asserted that somebody had exported the variable
    // before running the tests: it passed on a laptop because a `.env` file
    // happened to be there, and failed on a runner where the key was simply
    // absent from the inlined object — a property of the environment wearing
    // the costume of a property of the build.
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

// ---------------------------------------------------------------------------
// The public branch page
// ---------------------------------------------------------------------------

interface GraphModule {
  readonly id: string;
  /** Bytes this module contributed after tree-shaking. Zero means it did not. */
  readonly bytes: number;
}

interface GraphChunk {
  readonly file: string;
  readonly name: string;
  readonly isEntry: boolean;
  readonly imports: readonly string[];
  readonly dynamicImports: readonly string[];
  readonly modules: readonly GraphModule[];
}

function chunkGraph(): readonly GraphChunk[] {
  const path = join(DIST, 'chunk-graph.json');
  expect(existsSync(path), 'the build did not emit dist/chunk-graph.json').toBe(true);
  return JSON.parse(readFileSync(path, 'utf8')) as GraphChunk[];
}

/**
 * Every chunk the browser must have downloaded before this one can run.
 *
 * Static imports only. A dynamic import is the whole point of the split — the
 * floor plan renderer and the booking panel are reached that way — so counting
 * them would make the assertion vacuous and the byte budget meaningless.
 */
function staticClosure(graph: readonly GraphChunk[], entry: GraphChunk): readonly GraphChunk[] {
  const byFile = new Map(graph.map((chunk) => [chunk.file, chunk]));
  const seen = new Set<string>();
  const queue = [entry.file];

  while (queue.length > 0) {
    const file = queue.pop();
    if (!file || seen.has(file)) continue;
    seen.add(file);
    for (const next of byFile.get(file)?.imports ?? []) queue.push(next);
  }

  return [...seen].map((file) => byFile.get(file)!).filter(Boolean);
}

function findChunkContaining(graph: readonly GraphChunk[], moduleSuffix: string): GraphChunk {
  const chunk = graph.find((entry) =>
    entry.modules.some((module) => module.id.endsWith(moduleSuffix)),
  );
  expect(chunk, `no chunk contains ${moduleSuffix}`).toBeDefined();
  return chunk!;
}

/**
 * Modules that would mean the console or the counter screen shipped.
 *
 * Named by source path, which is what makes this assertion survive
 * minification: the identifiers are gone from the output, the file paths are
 * not. Both the *screens* and the *data layers* are listed, because either one
 * alone would be tens of kilobytes on the download a stranger judges the whole
 * product by, and the data layers are the ones a barrel import drags in
 * silently.
 */
const FORBIDDEN_IN_PUBLIC = [
  /^src\/console\//u,
  /^src\/staff\//u,
  /^src\/auth\//u,
  /^src\/offline\//u,
  /packages\/api\/src\/mocks\/consoleMock/u,
  /packages\/api\/src\/mocks\/staffMock/u,
  /packages\/api\/src\/http\/consoleHttpGateway/u,
  /packages\/api\/src\/http\/staffHttpGateway/u,
  /packages\/api\/src\/resolveConsoleGateway/u,
  /packages\/api\/src\/resolveStaffGateway/u,
  /packages\/realtime\//u,
  /node_modules\/@microsoft\/signalr/u,
  /node_modules\/qrcode/u,
  /node_modules\/idb-keyval/u,
  /locales\/[a-z]{2}\/admin\.json/u,
  /locales\/[a-z]{2}\/staff\.json/u,
] as const;

describe("the public branch page's bundle", () => {
  it('is its own entry, reached without loading the console', () => {
    const graph = chunkGraph();
    const shell = findChunkContaining(graph, 'src/main.tsx');
    const publicChunk = findChunkContaining(graph, 'src/public/bootstrapPublic.tsx');
    const consoleChunk = findChunkContaining(graph, 'src/bootstrap.tsx');

    // Both apps hang off the shell entry as *dynamic* imports, which is what
    // makes the choice in `main.tsx` a code split rather than a routing detail.
    expect(shell.dynamicImports).toContain(publicChunk.file);
    expect(shell.dynamicImports).toContain(consoleChunk.file);
    expect(publicChunk.file).not.toBe(consoleChunk.file);
  });

  it('contains no console or staff code, however the bundler chunked it', () => {
    const graph = chunkGraph();
    const publicChunk = findChunkContaining(graph, 'src/public/bootstrapPublic.tsx');

    const offenders: string[] = [];
    for (const chunk of staticClosure(graph, publicChunk)) {
      for (const module of chunk.modules) {
        // Zero-byte entries are modules the bundler resolved and then shook
        // out entirely. Asserting on those would fail on code that is not in
        // the file, and an assertion that fails on absent code gets deleted.
        if (module.bytes === 0) continue;
        if (FORBIDDEN_IN_PUBLIC.some((pattern) => pattern.test(module.id))) {
          offenders.push(`${chunk.file}: ${module.id} (${module.bytes} bytes)`);
        }
      }
    }

    expect(offenders).toEqual([]);
  });

  it('defers the floor plan renderer, which is the heaviest thing it needs', () => {
    const graph = chunkGraph();
    const publicChunk = findChunkContaining(graph, 'src/public/bootstrapPublic.tsx');
    const closure = new Set(staticClosure(graph, publicChunk).map((chunk) => chunk.file));

    const rendererChunk = findChunkContaining(graph, 'packages/floorplan/src/FloorPlan.tsx');
    expect(
      closure.has(rendererChunk.file),
      'react-native-web reached the first load; the room is meant to arrive after the fold',
    ).toBe(false);

    // And react-native-web is with it rather than hoisted into something the
    // first load already needs.
    for (const file of closure) {
      const chunk = graph.find((entry) => entry.file === file)!;
      for (const module of chunk.modules) {
        if (module.bytes === 0) continue;
        expect(module.id).not.toMatch(/node_modules\/react-native-(web|svg)\//u);
      }
    }
  });

  it('defers the booking flow, which most visitors never open', () => {
    const graph = chunkGraph();
    const publicChunk = findChunkContaining(graph, 'src/public/bootstrapPublic.tsx');
    const closure = new Set(staticClosure(graph, publicChunk).map((chunk) => chunk.file));

    const sheet = findChunkContaining(graph, 'src/public/BookingSheet.tsx');
    expect(closure.has(sheet.file)).toBe(false);
    expect(publicChunk.dynamicImports).toContain(sheet.file);
  });

  it('touches no browser storage at all', () => {
    /*
     * A hard requirement of this page rather than a preference. A visitor
     * arrived from somebody else's link, on a phone that may not be theirs,
     * and the page asks for a phone number partway down it. Nothing it learns
     * may outlive the tab: no remembered language on a borrowed handset, and
     * above all no verification token left behind for whoever opens the link
     * next. The session is in memory and the language is in the URL.
     *
     * Asserted on the built text, not on source, because the failure mode is a
     * *transitive* import — the console's `localStorage` locale adapter riding
     * in on a barrel export, which is exactly what happened before
     * `@yalla/i18n`'s `webStorage.ts` was split out.
     */
    const graph = chunkGraph();
    const publicChunk = findChunkContaining(graph, 'src/public/bootstrapPublic.tsx');
    const shell = findChunkContaining(graph, 'src/main.tsx');

    const reachable = new Set([
      ...staticClosure(graph, publicChunk),
      ...staticClosure(graph, shell),
      // The two chunks the page fetches later. Deferred is not exempt.
      ...publicChunk.dynamicImports,
    ]);

    const offenders: string[] = [];
    for (const entry of reachable) {
      const file = typeof entry === 'string' ? entry : entry.file;
      const source = readFileSync(join(DIST, file), 'utf8');
      for (const api of ['localStorage', 'sessionStorage']) {
        if (source.includes(api)) offenders.push(`${file}: ${api}`);
      }
    }

    expect(offenders).toEqual([]);
  });

  it('ships no test harness', () => {
    // `testHarness.tsx` builds the mock world and lives beside the page it
    // tests, which is exactly the sort of file that ends up in a bundle by
    // being imported "just for a type".
    const graph = chunkGraph();
    for (const chunk of graph) {
      for (const module of chunk.modules) {
        expect(module.id).not.toMatch(/testHarness/u);
      }
    }
  });
});
