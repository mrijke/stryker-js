import { defineConfig } from '@rstest/core';

export default defineConfig({
  include: ['tests/*.spec.ts'],
  setupFiles: ['./rstest.setup.ts'],
});
