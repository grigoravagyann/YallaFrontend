import { defineConfig } from 'vitest/config';

/**
 * Only the offline queue is unit-tested here; the screens are verified by
 * driving the real app in a browser. The queue is different: it is the one
 * module whose failure mode is silent data loss, and its ordering rules are far
 * cheaper to pin down here than to reproduce by pulling a tablet's wifi.
 *
 * `node`, not `jsdom`: the tests import `fake-indexeddb/auto`, which supplies
 * the only browser API this module touches.
 */
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
