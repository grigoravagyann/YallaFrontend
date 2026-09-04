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
    // The workspace packages ship raw TypeScript; Vite must not pre-bundle them
    // or it loses HMR on edits to shared code.
    exclude: [
      '@yalla/api',
      '@yalla/floorplan',
      '@yalla/format',
      '@yalla/i18n',
      '@yalla/realtime',
      '@yalla/tokens',
    ],
  },
  server: {
    port: 5173,
  },
}));
