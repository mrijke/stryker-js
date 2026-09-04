import { describe, expect, test } from '@rstest/core';

import { negate } from '../src/negate';

describe('negate', () => {
  test('should negate a number', () => {
    expect(negate(2)).toBe(-2);
  });
});
