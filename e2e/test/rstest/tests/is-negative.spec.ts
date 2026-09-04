import { describe, expect, test } from '@rstest/core';

import { isNegative } from '../src/is-negative';

describe('isNegative', () => {
  test('should recognize a negative number', () => {
    expect(isNegative(-2)).toBe(true);
  });

  test('should recognize a positive number', () => {
    expect(isNegative(2)).toBe(false);
  });
});
