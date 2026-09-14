// @ts-check
import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/dist-web/**',
      '**/build/**',
      '**/.expo/**',
      '**/expo-env.d.ts',
      // Generated from the backend's OpenAPI document; not ours to lint.
      'packages/api/src/generated/**',
    ],
  },

  js.configs.recommended,
  ...tseslint.configs.recommended,

  {
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: { ...globals.es2023 },
    },
    rules: {
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
      ],
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },

  // Shared packages are consumed by three apps and must not leak `any`.
  {
    files: ['packages/**/*.{ts,tsx}'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
    },
  },

  // React surfaces. `configs.flat.recommended` is the flat-config entry point;
  // the top-level `configs.recommended` is still eslintrc-shaped and ESLint 10
  // rejects it outright.
  {
    files: ['apps/**/*.{ts,tsx}', 'packages/floorplan/**/*.tsx'],
    ...reactHooks.configs.flat.recommended,
    languageOptions: {
      globals: { ...globals.browser, ...globals.es2023 },
    },
  },

  // Node-side tooling: codegen, the i18n parity check, the og-card generator.
  {
    files: [
      '**/*.config.{js,ts,mjs}',
      'scripts/**/*.mjs',
      'packages/*/scripts/**/*.mjs',
      'apps/*/scripts/**/*.mjs',
    ],
    languageOptions: {
      sourceType: 'module',
      globals: { ...globals.node },
    },
  },

  // The service worker runs in its own global scope: no `window`, no `document`,
  // and a `self` that is a ServiceWorkerGlobalScope. It is plain JS served
  // as-is from `public/`, so it is linted rather than compiled.
  {
    files: ['**/public/sw.js'],
    languageOptions: {
      sourceType: 'script',
      globals: { ...globals.serviceworker },
    },
  },

  // The diner app has its own theme. The shared colour, elevation and type-size
  // tokens describe the console's palette; a diner screen reaching past
  // `src/theme` for them is how the shared-tab flow ended up on the wrong one.
  // Spacing, radius, touch targets and font weights stay shared.
  {
    files: ['apps/diner/**/*.{ts,tsx}'],
    ignores: ['apps/diner/src/theme/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: '@yalla/tokens',
              importNames: ['color', 'elevation', 'fontSize', 'lineHeight'],
              message:
                'Diner colours, shadows and type sizes come from src/theme (colors, shadows, typography), not @yalla/tokens.',
            },
          ],
        },
      ],
    },
  },

  // Metro reads its config with `require`, so these files are CommonJS whether
  // or not the rest of the workspace is ESM.
  {
    files: ['**/metro.config.js', '**/babel.config.js'],
    languageOptions: {
      sourceType: 'commonjs',
      globals: { ...globals.node },
    },
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
    },
  },

  prettier,
);
