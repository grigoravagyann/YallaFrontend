import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve as resolvePath } from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';

/**
 * Write the built chunk graph beside the bundle, so a test can read it.
 *
 * The public branch page's whole performance argument is that a stranger who
 * opens a venue link downloads the page and **not** the venue console, the
 * counter screen, the offline command queue or the SignalR client. "We import
 * it lazily" is a claim about source; whether the bundler agreed is a claim
 * about output, and only the output can settle it.
 *
 * Rollup's own metadata is the honest source for that: each chunk's static
 * imports, its dynamic imports, and the module ids that went into it. Grepping
 * minified JavaScript for identifiers would be checking a shadow — minification
 * renames everything a test could look for, which is exactly how a bundle test
 * ends up passing while checking nothing.
 *
 * Emitted at build time only, and beside `dist/assets` rather than inside it,
 * so nothing ships it to a browser.
 */
function emitChunkGraph(): Plugin {
  /** Either separator, so the output reads the same on Windows and in CI. */
  const separator = /[\\/]/u;
  /** Rollup names a virtual module with a leading NUL. */
  const nullByte = String.fromCharCode(0);

  return {
    name: 'yalla:chunk-graph',
    apply: 'build',
    generateBundle(_options, bundle) {
      const root = resolvePath(import.meta.dirname);
      const chunks = Object.values(bundle)
        .filter((entry) => entry.type === 'chunk')
        .map((chunk) => ({
          file: chunk.fileName,
          name: chunk.name,
          isEntry: chunk.isEntry,
          imports: chunk.imports,
          dynamicImports: chunk.dynamicImports,
          /*
           * `bytes` is what makes this graph usable as an assertion.
           *
           * A module can appear in a chunk's module list having contributed
           * **nothing**: the bundler resolved it, tree-shook every export the
           * chunk did not reach, and left the entry behind with a rendered
           * length of zero. `@yalla/api`'s barrel drags the console and staff
           * gateways into the resolution graph of anything that imports it, and
           * all of them shake out to nothing here — so a test that asserted on
           * module *names* would fail on code that is not in the bundle, and
           * would eventually be "fixed" by deleting the assertion.
           */
          modules: Object.entries(chunk.modules).map(([id, module]) => ({
            // Relative to this app and POSIX-separated, so an assertion can
            // name `src/console/...` and mean it on either platform.
            id: id.includes(nullByte) ? id : relative(root, id).split(separator).join('/'),
            bytes: module.renderedLength,
          })),
        }));

      const out = join(root, 'dist', 'chunk-graph.json');
      mkdirSync(dirname(out), { recursive: true });
      writeFileSync(out, JSON.stringify(chunks, null, 2), 'utf8');
    },
  };
}

/**
 * The admin panel runs the same `@yalla/floorplan` component as the two native
 * apps, through `react-native-web`. That is why this config is more than the
 * Vite default: the aliasing and extension order below are what let one
 * React Native component render in a browser.
 */
export default defineConfig(({ mode }) => ({
  plugins: [react(), emitChunkGraph()],
  resolve: {
    alias: [
      // Order matters: the more specific alias must come first, or
      // `react-native-svg` would be rewritten to `react-native-web-svg`.
      {
        find: /^react-native-svg$/,
        replacement: 'react-native-svg/lib/module/ReactNativeSVG.web.js',
      },
      // react-native-svg's web build reaches for React Native's asset registry
      // to resolve <Image href> sources. react-native-web ships an equivalent,
      // so point at that rather than pulling the native package into the bundle.
      {
        find: '@react-native/assets-registry/registry',
        replacement: 'react-native-web/dist/modules/AssetRegistry',
      },
      { find: /^react-native$/, replacement: 'react-native-web' },
    ],
    // `.web.*` wins so platform-specific files in RN packages resolve correctly.
    extensions: [
      '.web.tsx',
      '.web.ts',
      '.web.jsx',
      '.web.js',
      '.tsx',
      '.ts',
      '.jsx',
      '.js',
      '.json',
    ],
  },
  define: {
    // React Native libraries branch on __DEV__ and expect a Node-ish `global`.
    __DEV__: JSON.stringify(mode !== 'production'),
    global: 'globalThis',
  },
  optimizeDeps: {
    exclude: [
      // The workspace packages ship raw TypeScript; Vite must not pre-bundle
      // them or it loses HMR on edits to shared code.
      '@yalla/api',
      '@yalla/floorplan',
      '@yalla/format',
      '@yalla/i18n',
      '@yalla/realtime',
      '@yalla/tokens',
    ],
    // react-native-svg and react-native-web MUST stay pre-bundled. They mix
    // CommonJS files into their ESM output (`lib/extract/transform.js` is a
    // generated PEG parser using `module.exports`), and pre-bundling is what
    // gives those files named-export interop. Excluding them produces
    // "does not provide an export named 'parse'" at runtime — a blank page.
    //
    // But the pre-bundler does not inherit `resolve.extensions` from above, so
    // by default it resolves react-native-svg's `./elements` to the native
    // `elements.js` rather than the `elements.web.js` beside it, drags in the
    // Fabric components, and dies on their Flow-typed react-native imports.
    // Giving the optimizer the same extension order fixes that at the source.
    rolldownOptions: {
      resolve: {
        extensions: [
          '.web.tsx',
          '.web.ts',
          '.web.jsx',
          '.web.js',
          '.tsx',
          '.ts',
          '.jsx',
          '.js',
          '.json',
        ],
      },
    },
  },
  server: {
    port: 5173,
  },
}));
