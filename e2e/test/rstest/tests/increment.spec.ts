import { describe, expect, test } from '@rstest/core';

import { increment } from '../src/increment';

describe('increment', () => {
  test('should increment a number', () => {
    expect(increment(2)).toBe(3);
  });
});
