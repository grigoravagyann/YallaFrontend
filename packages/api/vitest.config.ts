import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts'],
    // The 5s default is a hang detector. Under `pnpm -r test` (verify.sh runs
    // every package at once) the monorepo scan in generatedTypes.test.ts and the
    // first import of large modules have taken over 5s with nothing wrong.
    testTimeout: 20_000,
  },
});
