import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

/**
 * Two kinds of test live here, and the default environment says which is which.
 *
 * `node` is the default because most of what is worth testing on this surface
 * is not a component: the offline queue's ordering rules, the production
 * bundle's contents, the chunk graph, the reservation rules. Those are the
 * modules whose failure mode is silent — data loss, a dev affordance shipped to
 * a venue, the console's bundle on a stranger's phone — and none of them needs
 * a DOM.
 *
 * The public branch page's own tests do. A suspended venue "renders a plain
 * not-available page" and a 409 "shows the taken-table message" are claims
 * about what a person sees, and a test that asserted on a returned string
 * instead would pass while the page rendered nothing. Those files opt in with
 * `@vitest-environment jsdom` at the top, per file, so the DOM is paid for only
 * where it earns its keep.
 */
export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.{ts,tsx}'],
    setupFiles: ['./src/testSetup.ts'],
    // The bundle tests build the app when `dist` is stale, which is minutes
    // rather than milliseconds. The default 5s would kill them mid-build.
    testTimeout: 600_000,
    hookTimeout: 600_000,
  },
});
