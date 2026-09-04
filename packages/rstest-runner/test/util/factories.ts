import type { TestFileResult, TestResult } from '@rstest/core/api';

import type { RstestRunnerOptions } from '../../src-generated/rstest-runner-options.js';

export function createRstestRunnerOptions(
  overrides?: Partial<RstestRunnerOptions>,
): RstestRunnerOptions {
  return { ...overrides };
}

export function createRstestTestResult(
  overrides?: Partial<TestResult>,
): TestResult {
  return {
    status: 'pass',
    name: 'should be able to add two numbers',
    testPath: '/project/tests/add.spec.ts',
    parentNames: ['add'],
    duration: 42,
    project: 'rstest',
    ...overrides,
  };
}

export function createRstestTestFileResult(
  overrides?: Partial<TestFileResult>,
): TestFileResult {
  return {
    status: 'pass',
    name: 'tests/add.spec.ts',
    testPath: '/project/tests/add.spec.ts',
    project: 'rstest',
    results: [],
    ...overrides,
  };
}
