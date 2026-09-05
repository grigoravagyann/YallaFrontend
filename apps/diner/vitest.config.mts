import { defineConfig } from 'vitest/config';

/**
 * Only the pure layer is unit-tested here: the order tray, the permission
 * projection and the tab event application.
 *
 * Those three are where a bug is invisible. A tray that loses a line looks like
 * a diner who forgot to tap; a projection that renders a zero where there should
 * be no total looks like a free meal; an event applied out of order looks like a
 * bill that is simply wrong. None of them reproduces reliably by tapping through
 * the app, and all of them are cheap to pin here.
 *
 * `node`, not `jsdom`: nothing under test touches a browser API. The screens are
 * verified by running the app.
 */
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
