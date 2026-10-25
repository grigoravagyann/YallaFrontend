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
      // Playwright's output from a local e2e run (gitignored in apps/e2e).
      'apps/e2e/test-results/**',
      'apps/e2e/test-results-*/**',
      'apps/e2e/playwright-report/**',
      'apps/e2e/blob-report/**',
      // Generated from the backend's OpenAPI document; not ours to lint.
      'packages/api/src/generated/**',
      // The approved console design, kept exactly as exported: its artboards'
      // scripts and the scenario checks that run them are the spec, not code.
      'docs/design/console/**',
      'docs/design/venue-console/**',
      'docs/design/floor-tablet/**',
      'docs/design/public-page/**',
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
    files: ['apps/**/*.{ts,tsx}'],
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
      // The web image's build-stage helper (apps/web/deploy).
      'apps/*/deploy/**/*.mjs',
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

  // The same rule for colours typed by hand: a diner screen's colour is a name
  // from src/theme's `colors`, so a palette change is one file. AGENTS.md,
  // "Architecture checks".
  {
    files: ['apps/diner/app/**/*.{ts,tsx}', 'apps/diner/src/**/*.{ts,tsx}'],
    ignores: [
      // Where the palette is defined.
      'apps/diner/src/theme/**',
      // Tests pin computed colours and contrast ratios against literal values.
      'apps/diner/**/*.test.{ts,tsx}',
      // The launch animation's white and burgundy are sampled from the logo
      // raster and must equal the native splash in app.json, which cannot read
      // the theme (src/data/appConfig.test.ts holds them together).
      'apps/diner/src/components/launch/mark.ts',
    ],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector:
            'Literal[value=/^#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/], TemplateElement[value.raw=/#[0-9a-fA-F]{6}\\b/]',
          message:
            'A hex colour in diner code: use a name from src/theme\'s `colors` (add one there if it is new). AGENTS.md, "Architecture checks".',
        },
        {
          selector:
            'Literal[value=/^(?:rgb|hsl)a?\\(/], TemplateElement[value.raw=/^(?:rgb|hsl)a?\\(/]',
          message:
            'A typed rgb()/hsl() colour in diner code: use a name from src/theme\'s `colors` (add one there if it is new). AGENTS.md, "Architecture checks".',
        },
      ],
    },
  },

  // Metro and Expo read their config with `require`, so these files are CommonJS whether
  // or not the rest of the workspace is ESM.
  {
    files: ['**/metro.config.js', '**/babel.config.js', 'apps/diner/app.config.js'],
    languageOptions: {
      sourceType: 'commonjs',
      globals: { ...globals.node },
    },
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
    },
  },

  // The icon and store-screenshot scripts: CommonJS run by Node, with callbacks Playwright runs
  // inside the page, so both sets of globals.
  {
    files: ['apps/diner/assets/images/source/*.cjs', 'apps/diner/store/source/*.cjs'],
    languageOptions: {
      sourceType: 'commonjs',
      globals: { ...globals.node, ...globals.browser },
    },
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
    },
  },

  prettier,
);
