import { describe, expect, it } from '@rstest/core';

import { add } from '../math.js';

describe('add', () => {
  it('should be able to add two numbers', () => {
    expect(add(4, 5)).toBe(9);
  });

  it('should be able to add a negative number', () => {
    expect(add(4, -5)).toBe(-1);
  });
});
