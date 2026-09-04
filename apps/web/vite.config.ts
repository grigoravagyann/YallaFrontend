import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

/**
 * The admin panel runs the same `@yalla/floorplan` component as the two native
 * apps, through `react-native-web`. That is why this config is more than the
 * Vite default: the aliasing and extension order below are what let one
 * React Native component render in a browser.
 */
export default defineConfig(({ mode }) => ({
  plugins: [react()],
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
