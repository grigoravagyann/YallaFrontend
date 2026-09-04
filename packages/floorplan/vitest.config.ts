import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    // Geometry only. Component tests are out of scope for this task.
    include: ['src/**/*.test.ts'],
  },
});
