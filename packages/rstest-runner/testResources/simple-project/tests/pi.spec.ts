import { expect, it } from '@rstest/core';

import { pi } from '../math.js';

it('pi should be 3.14', () => {
  expect(pi).toBe(3.14);
  expect(globalThis.setupFileRan).toBe(true);
});
