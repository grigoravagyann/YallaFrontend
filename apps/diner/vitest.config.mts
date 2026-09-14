import { defineConfig } from 'vitest/config';

/**
 * Two projects, split by file extension.
 *
 * `node` (`*.test.ts`) is the pure layer: the order tray, the permission
 * projection, the tab event application, the HTTP mappings. Those are where a
 * bug is invisible — a tray that loses a line looks like a diner who forgot to
 * tap, an event applied out of order looks like a bill that is simply wrong —
 * and none of them needs a DOM, so they do not pay for one.
 *
 * `ui` (`*.test.tsx`) renders components and screens. "The menu failed, so
 * Retry is shown" is a claim about what a person sees; a test that asserted on
 * a returned value would pass while the screen rendered nothing. These run under
 * jsdom with `react-native` resolved to `react-native-web`, the same aliasing
 * Expo's web build uses, so a React Native tree becomes DOM that
 * @testing-library/react can query. Native-only modules that reach
 * `react-native` from inside node_modules (vector icons, gradients, the router,
 * expo-* device APIs) are not transformed and must be `vi.mock`ed per test.
 *
 * Keep test files out of `app/`: Expo Router would treat them as routes.
 */
export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'node',
          globals: true,
          environment: 'node',
          include: ['src/**/*.test.ts'],
        },
      },
      {
        resolve: {
          alias: [
            {
              find: /^react-native-svg$/,
              replacement: 'react-native-svg/lib/module/ReactNativeSVG.web.js',
            },
            {
              find: '@react-native/assets-registry/registry',
              replacement: 'react-native-web/dist/modules/AssetRegistry',
            },
            { find: /^react-native$/, replacement: 'react-native-web' },
          ],
          // Platform files win, as they do in the web bundle.
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
          // Vitest assigns `define` keys on globalThis rather than inlining
          // them, so a test can still `vi.stubGlobal('__DEV__', false)`.
          __DEV__: 'true',
        },
        test: {
          name: 'ui',
          // Globals give @testing-library/react its automatic cleanup.
          globals: true,
          environment: 'jsdom',
          include: ['src/**/*.test.tsx'],
        },
      },
    ],
  },
});
