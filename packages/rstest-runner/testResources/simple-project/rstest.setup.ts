import { beforeAll } from '@rstest/core';

// Verifies that a user's own setup file keeps working next to Stryker's.
beforeAll(() => {
  globalThis.setupFileRan = true;
});
