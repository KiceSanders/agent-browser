import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    include: ['src/**/*.test.ts', 'test/**/*.test.ts'],
    testTimeout: 30000,
    setupFiles: ['./vitest.setup.ts'],
    teardownTimeout: 5000,
  },
});
