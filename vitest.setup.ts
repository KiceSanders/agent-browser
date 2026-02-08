import { afterAll } from 'vitest';

// Force worker process to exit after all tests complete.
// Playwright browser handles can keep the Node.js event loop alive,
// preventing vitest fork workers from terminating cleanly.
afterAll(() => {
  setTimeout(() => process.exit(0), 1000);
});
