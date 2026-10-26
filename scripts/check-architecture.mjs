#!/usr/bin/env node
/**
 * The frontend's architecture checks: which code may import which.
 *
 *   node scripts/check-architecture.mjs        (part of `pnpm lint`, so CI's build job)
 *
 * Every rule here held when it was written; each failure names the rule, the
 * import that crossed it, what to do instead, and the AGENTS.md section that
 * explains it. The backend has the same thing as reflection tests (Yalla#84).
 *
 * Rules (ids as printed):
 *   apps-are-islands        an app never imports another app
 *   packages-below-apps     a package never imports from an app
 *   package-layers          a package imports only the packages PACKAGE_LAYERS allows
 *   public-entry-points     another workspace's code is reached only through its
 *                           package.json `exports` (`@yalla/api/react`, never
 *                           `@yalla/api/src/...` or `../../packages/...`)
 *   no-own-barrel           a package's own files never import its `index.ts` barrels
 *   no-value-cycles         no import cycle inside a package
 *   diner-intl-first        `apps/diner/app/_layout.tsx` imports `src/intlPolyfills` first
 *
 * The checks read imports with the TypeScript compiler's parser, the same one
 * `tsc` uses, so `import type`, `export ... from`, `import()` and `require()`
 * are all seen. They classify an import by the file it points at (relative
 * paths) or the package it names (`@yalla/*`); any other bare specifier is a
 * third-party module and none of these rules' business.
 *
 * `checkArchitecture(root)` is exported for `check-architecture.test.mjs`, which
 * proves each rule still fails on a fixture that breaks it.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { basename, dirname, join, posix, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ts = createRequire(import.meta.url)('typescript');

const POINTER = 'AGENTS.md, "Architecture checks"';

/**
 * Which `@yalla/*` packages each package may import. A package missing from this
 * map fails `package-layers` until it is added, so the direction is always a
 * decision someone wrote down.
 */
export const PACKAGE_LAYERS = {
  // Leaves: no Yalla knowledge, so every app and package can use them.
  '@yalla/format': [],
  '@yalla/tokens': [],
  '@yalla/realtime': [],
  // Copy only. Errors become a failure kind in `@yalla/api` and copy in each
  // app, so i18n never needs the API (and the API never needs copy).
  '@yalla/i18n': [],
  // Money, dates and names on the wire are formatted the same way the apps
  // format them.
  '@yalla/api': ['@yalla/format'],
  // Config files only (`extends` in tsconfig.json); no code imports it.
  '@yalla/tsconfig': [],
};

/**
 * Imports a rule lets through. Each entry needs `reason`; an entry that no
 * longer matches anything fails the check, so the list cannot rot.
 *
 * @type {{ rule: string, file: string, specifier: string, reason: string }[]}
 */
export const ALLOW = [];

const RULES = {
  'apps-are-islands': {
    rule: 'An app never imports another app (apps/diner, apps/web, apps/e2e).',
    instead: 'Move the shared code into a package under packages/ and import it from both apps.',
  },
  'packages-below-apps': {
    rule: 'A package never imports from an app.',
    instead:
      'Keep the code in the package and have the app pass in what it needs (a prop, a callback, an injected gateway).',
  },
  'package-layers': {
    rule: 'A package imports only the packages PACKAGE_LAYERS in scripts/check-architecture.mjs allows.',
    instead:
      'Move the code down a layer, or, if the new direction is right, add it to PACKAGE_LAYERS with the reason and declare the dependency in package.json.',
  },
  'public-entry-points': {
    rule: "Another workspace's code is imported only through an entry point its package.json `exports` lists.",
    instead:
      'Import the public name (e.g. `@yalla/api`, `@yalla/api/react`, `@yalla/api/schema`). If it is not exported, export it from that package (src/index.ts or the matching entry).',
  },
  'no-own-barrel': {
    rule: "A package's own files never import its index.ts barrels (only tests and other entry points may).",
    instead:
      'Import the module that defines the thing (e.g. `./gateways`, `../contracts/errors`), not `./index` or `..`.',
  },
  'no-value-cycles': {
    rule: 'No import cycle inside a package (`import type` / `export type` declarations do not count).',
    instead:
      'Break the cycle: move the shared piece into its own module both sides import, or make the import `import type` if only types cross.',
  },
  'diner-intl-first': {
    rule: "apps/diner/app/_layout.tsx imports '../src/intlPolyfills' before anything else.",
    instead:
      "Keep `import '../src/intlPolyfills';` as the first line, so Hermes has Intl before @yalla/format or i18n load.",
  },
};

const SOURCE_FILE = /\.(?:[cm]?[jt]sx?)$/;
const TEST_FILE = /\.test\.[cm]?[jt]sx?$/;
const SKIP_DIRS = new Set([
  'node_modules',
  'dist',
  'dist-web',
  'build',
  '.expo',
  'playwright-report',
  'blob-report',
]);
// Generated from the backend's OpenAPI document and import-free; schema.ts alone
// is 1.6 MB. Its own drift check is packages/api/scripts/check-generated-schema.mjs.
const SKIP_PATHS = new Set(['packages/api/src/generated']);
const RESOLVE_SUFFIXES = ['', '.ts', '.tsx', '.mts', '.js', '.jsx', '.mjs', '.cjs'];

/** Workspaces under apps/ and packages/, with the specifiers and files their `exports` open. */
function readWorkspaces(root) {
  const workspaces = [];
  for (const kind of ['apps', 'packages']) {
    const parent = join(root, kind);
    if (!existsSync(parent)) continue;
    for (const entry of readdirSync(parent, { withFileTypes: true })) {
      const manifestPath = join(parent, entry.name, 'package.json');
      if (!entry.isDirectory() || !existsSync(manifestPath)) continue;
      const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
      const dir = `${kind}/${entry.name}`;
      const exportsField =
        typeof manifest.exports === 'string' ? { '.': manifest.exports } : (manifest.exports ?? {});
      const entries = new Map();
      for (const [key, target] of Object.entries(exportsField)) {
        if (typeof target !== 'string') continue;
        const specifier =
          key === '.' ? manifest.name : `${manifest.name}/${key.replace(/^\.\//, '')}`;
        entries.set(specifier, posix.join(dir, target.replace(/^\.\//, '')));
      }
      workspaces.push({
        dir,
        kind: kind === 'apps' ? 'app' : 'package',
        name: manifest.name,
        entries,
      });
    }
  }
  return workspaces;
}

function listSources(root, dir, out = []) {
  for (const entry of readdirSync(join(root, dir), { withFileTypes: true })) {
    const path = `${dir}/${entry.name}`;
    if (entry.isDirectory()) {
      if (
        SKIP_DIRS.has(entry.name) ||
        entry.name.startsWith('test-results') ||
        SKIP_PATHS.has(path)
      )
        continue;
      listSources(root, path, out);
    } else if (SOURCE_FILE.test(entry.name)) {
      out.push(path);
    }
  }
  return out;
}

/** Every module reference in a file: declarations (static) and `import()` / `require()` calls. */
function readImports(root, file) {
  const text = readFileSync(join(root, file), 'utf8');
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, false);
  const imports = [];
  const add = (literal, isStatic, typeOnly) =>
    imports.push({
      specifier: literal.text,
      line: source.getLineAndCharacterOfPosition(literal.getStart(source)).line + 1,
      isStatic,
      typeOnly,
    });
  const visit = (node) => {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      // Only a whole-declaration `import type` is erased. `import { type A }` is
      // kept as `import {} from` under verbatimModuleSyntax, so it still loads
      // the module and still counts for cycles.
      add(node.moduleSpecifier, true, Boolean(node.importClause?.isTypeOnly));
    } else if (
      ts.isExportDeclaration(node) &&
      node.moduleSpecifier &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) {
      add(node.moduleSpecifier, true, node.isTypeOnly);
    } else if (
      ts.isCallExpression(node) &&
      node.arguments.length > 0 &&
      ts.isStringLiteralLike(node.arguments[0]) &&
      (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
        (ts.isIdentifier(node.expression) && node.expression.text === 'require'))
    ) {
      add(node.arguments[0], false, false);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return imports;
}

/** A relative specifier to the repo file it loads, or null (an asset, or nothing). */
function resolveFile(known, fromFile, specifier) {
  const base = posix.normalize(posix.join(posix.dirname(fromFile), specifier));
  const candidates = [
    ...RESOLVE_SUFFIXES.map((suffix) => base + suffix),
    ...RESOLVE_SUFFIXES.filter(Boolean).map((suffix) => `${base}/index${suffix}`),
  ];
  // `./x.js` written for a `./x.ts` file.
  if (/\.[cm]?js$/.test(base)) candidates.push(base.replace(/\.([cm]?)js$/, '.$1ts'));
  return candidates.find((candidate) => known.has(candidate)) ?? null;
}

/** Strongly connected components of size > 1 (or a self-loop), Tarjan's algorithm. */
function cyclesOf(graph) {
  let index = 0;
  const stack = [];
  const onStack = new Set();
  const indices = new Map();
  const low = new Map();
  const components = [];
  const connect = (node) => {
    indices.set(node, index);
    low.set(node, index);
    index += 1;
    stack.push(node);
    onStack.add(node);
    for (const next of graph.get(node)?.keys() ?? []) {
      if (!indices.has(next)) {
        connect(next);
        low.set(node, Math.min(low.get(node), low.get(next)));
      } else if (onStack.has(next)) {
        low.set(node, Math.min(low.get(node), indices.get(next)));
      }
    }
    if (low.get(node) === indices.get(node)) {
      const component = [];
      let member;
      do {
        member = stack.pop();
        onStack.delete(member);
        component.push(member);
      } while (member !== node);
      if (component.length > 1 || graph.get(node)?.has(node)) components.push(component);
    }
  };
  for (const node of [...graph.keys()].sort()) if (!indices.has(node)) connect(node);
  return components;
}

/** One concrete loop through a component, starting at its first file. */
function loopThrough(graph, component) {
  const members = new Set(component);
  const start = [...component].sort()[0];
  const previous = new Map([[start, null]]);
  const queue = [start];
  while (queue.length > 0) {
    const node = queue.shift();
    for (const next of graph.get(node)?.keys() ?? []) {
      if (!members.has(next)) continue;
      if (next === start) {
        const path = [node];
        while (previous.get(path[0])) path.unshift(previous.get(path[0]));
        return [...path, start];
      }
      if (!previous.has(next)) {
        previous.set(next, node);
        queue.push(next);
      }
    }
  }
  return [start, start];
}

/**
 * Run every rule against the repo at `root`.
 *
 * @param {string} root
 * @param {{ allow?: typeof ALLOW }} [options] `allow` replaces ALLOW (for the tests)
 * @returns {{ rule: string, file: string, line: number, specifier: string, detail: string }[]}
 */
export function checkArchitecture(root, { allow = ALLOW } = {}) {
  const workspaces = readWorkspaces(root);
  const byName = new Map(workspaces.map((workspace) => [workspace.name, workspace]));
  const ownerOf = (path) =>
    workspaces.find((workspace) => path === workspace.dir || path.startsWith(`${workspace.dir}/`));
  const found = [];
  const report = (rule, file, line, specifier, detail) =>
    found.push({ rule, file, line, specifier, detail });

  const sources = new Map(
    workspaces.map((workspace) => [workspace, listSources(root, workspace.dir)]),
  );
  const known = new Set([...sources.values()].flat());

  for (const workspace of workspaces) {
    const files = sources.get(workspace);
    const entryFiles = new Set(workspace.entries.values());
    const barrels = new Set(
      [...entryFiles].filter((file) => /^index\.[cm]?[jt]sx?$/.test(basename(file))),
    );
    /** file -> (imported file -> the import), for value imports inside this package */
    const graph = new Map();

    for (const file of files) {
      const edges = new Map();
      graph.set(file, edges);
      for (const { specifier, line, isStatic, typeOnly } of readImports(root, file)) {
        let target;
        let resolved;
        if (specifier.startsWith('.')) {
          target = ownerOf(posix.normalize(posix.join(posix.dirname(file), specifier)));
          resolved = resolveFile(known, file, specifier);
        } else {
          const named = workspaces.find(
            (candidate) =>
              specifier === candidate.name || specifier.startsWith(`${candidate.name}/`),
          );
          if (!named) continue; // third-party
          target = named;
          resolved = named.entries.get(specifier) ?? null;
        }
        if (!target) continue; // outside every workspace (root scripts, docs)

        if (target !== workspace) {
          if (workspace.kind === 'app' && target.kind === 'app') {
            report(
              'apps-are-islands',
              file,
              line,
              specifier,
              `${workspace.dir} imports ${target.dir}`,
            );
          } else if (workspace.kind === 'package' && target.kind === 'app') {
            report(
              'packages-below-apps',
              file,
              line,
              specifier,
              `${workspace.dir} imports ${target.dir}`,
            );
          } else if (workspace.kind === 'package') {
            const allowed = PACKAGE_LAYERS[workspace.name];
            if (!allowed) {
              report(
                'package-layers',
                file,
                line,
                specifier,
                `${workspace.name} has no entry in PACKAGE_LAYERS`,
              );
            } else if (!allowed.includes(target.name)) {
              report(
                'package-layers',
                file,
                line,
                specifier,
                `${workspace.name} may import ${allowed.length ? allowed.join(', ') : 'no @yalla package'}, not ${target.name}`,
              );
            }
          }
          if (target.kind === 'package' && !target.entries.has(specifier)) {
            const open = [...target.entries.keys()];
            report(
              'public-entry-points',
              file,
              line,
              specifier,
              `${target.name} exports ${open.length ? open.map((name) => `'${name}'`).join(', ') : 'nothing to code'}`,
            );
          }
          continue;
        }

        // Inside the workspace: barrels and cycles, packages only.
        if (workspace.kind !== 'package' || !resolved) continue;
        if (barrels.has(resolved) && !entryFiles.has(file) && !TEST_FILE.test(file)) {
          report('no-own-barrel', file, line, specifier, `imports the barrel ${resolved}`);
        }
        if (isStatic && !typeOnly && !edges.has(resolved)) edges.set(resolved, { line, specifier });
      }
    }

    if (workspace.kind === 'package') {
      for (const component of cyclesOf(graph)) {
        const loop = loopThrough(graph, component);
        const [first, second] = loop;
        report(
          'no-value-cycles',
          first,
          graph.get(first)?.get(second)?.line ?? 1,
          graph.get(first)?.get(second)?.specifier ?? second,
          `${loop.join(' -> ')}${component.length > loop.length - 1 ? ` (${component.length} files in the cycle)` : ''}`,
        );
      }
    }
  }

  const layout = 'apps/diner/app/_layout.tsx';
  if (byName.has('@yalla/diner')) {
    const first = known.has(layout)
      ? readImports(root, layout).find((entry) => entry.isStatic)
      : undefined;
    const polyfills = first && resolveFile(known, layout, first.specifier);
    if (!polyfills || !/^apps\/diner\/src\/intlPolyfills\.[jt]sx?$/.test(polyfills)) {
      report(
        'diner-intl-first',
        layout,
        first?.line ?? 1,
        first?.specifier ?? '(no import)',
        'the first import must be ../src/intlPolyfills',
      );
    }
  }

  // Apply the allow-list, and fail on entries nothing matched any more.
  const used = new Set();
  const kept = found.filter((violation) => {
    const allowance = allow.find(
      (entry) =>
        entry.rule === violation.rule &&
        entry.file === violation.file &&
        entry.specifier === violation.specifier,
    );
    if (allowance) used.add(allowance);
    return !allowance;
  });
  for (const entry of allow) {
    if (!entry.reason?.trim()) {
      kept.push({ ...entry, line: 1, rule: 'allow-list', detail: 'an ALLOW entry needs a reason' });
    } else if (!used.has(entry)) {
      kept.push({
        ...entry,
        line: 1,
        rule: 'allow-list',
        detail: `nothing matches this ALLOW entry for ${entry.rule} any more; delete it`,
      });
    }
  }
  return kept;
}

/** The text printed for one violation. */
export function describe(violation) {
  const rule = RULES[violation.rule];
  return [
    `[${violation.rule}] ${violation.file}:${violation.line} imports '${violation.specifier}' — ${violation.detail}`,
    ...(rule ? [`  Rule:    ${rule.rule}`, `  Instead: ${rule.instead}`] : []),
    `  See:     ${POINTER}`,
  ].join('\n');
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const violations = checkArchitecture(root);
  if (violations.length === 0) {
    console.log(`architecture — ${Object.keys(RULES).length} rules hold`);
  } else {
    console.error(violations.map(describe).join('\n\n'));
    console.error(`\narchitecture — ${violations.length} violation(s)`);
    process.exit(1);
  }
}
