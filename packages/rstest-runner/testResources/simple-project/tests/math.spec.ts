import { describe, expect, it } from '@rstest/core';

import { addOne, isNegativeNumber, negate } from '../math.js';

describe('math', () => {
  it('should be able to add one to a number', () => {
    expect(addOne(2)).toBe(3);
  });

  it('should be able negate a number', () => {
    expect(negate(2)).toBe(-2);
  });

  describe('isNegativeNumber', () => {
    it('should be able to recognize a negative number', () => {
      expect(isNegativeNumber(-2)).toBe(true);
    });
  });
});
