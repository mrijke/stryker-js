import { describe, expect, test } from '@rstest/core';

import { add } from '../src/add';

describe('add', () => {
  test('should be able to add two numbers', () => {
    expect(add(5, 2)).toBe(7);
  });
});
