import path from 'path';

import type {
  CoverageData,
  MutantCoverage,
  Position,
} from '@stryker-mutator/api/core';
import {
  type BaseTestResult,
  type TestResult,
  TestStatus,
} from '@stryker-mutator/api/test-runner';
import { escapeRegExp } from '@stryker-mutator/util';
import type {
  TestFileResult,
  TestResult as RstestTestResult,
  TestResultStatus,
} from '@rstest/core/api';

/**
 * The separator between the parent `describe` names and the test name.
 *
 * Rstest joins parent names with ` > ` when the test name pattern contains a
 * `>` and with ` ` when it doesn't (see `createShouldSkipByName` in rstest).
 * Using ` > ` here means every filter we generate for a nested test contains a
 * `>`, making rstest's choice deterministic instead of dependent on the names
 * of the tests we happen to be filtering on.
 */
const NAME_SEPARATOR = ' > ';

/** The fields that identify a test, shared by rstest's results and its reporter events. */
export type TestIdentity = Pick<
  RstestTestResult,
  'name' | 'parentNames' | 'testPath'
>;

export function collectTestName({
  name,
  parentNames = [],
}: Pick<TestIdentity, 'name' | 'parentNames'>): string {
  return [...parentNames, name].join(NAME_SEPARATOR);
}

/**
 * The Stryker test id: `<test file relative to cwd>#<full test name>`.
 */
export function toTestId(test: TestIdentity): string {
  return `${path.relative(process.cwd(), test.testPath).replace(/\\/g, '/')}#${collectTestName(test)}`;
}

export function fromTestId(id: string): { file: string; test: string } {
  const [file, ...name] = id.split('#');
  return { file, test: name.join('#') };
}

/**
 * Translates Stryker's test ids into the test file paths and the name pattern
 * rstest needs to run exactly those tests.
 */
export function toRunFilter(testIds: string[]): {
  testFiles: string[];
  testNamePattern: RegExp;
} {
  const parsed = testIds.map(fromTestId);
  return {
    testFiles: [...new Set(parsed.map(({ file }) => path.resolve(file)))],
    testNamePattern: new RegExp(
      parsed.map(({ test }) => `^${escapeRegExp(test)}$`).join('|'),
    ),
  };
}

function convertTestStatus(status: TestResultStatus): TestStatus {
  switch (status) {
    case 'pass':
      return TestStatus.Success;
    case 'skip':
    case 'todo':
      return TestStatus.Skipped;
    case 'fail':
      return TestStatus.Failed;
  }
}

export function convertTestToTestResult(
  result: RstestTestResult,
  startPosition?: Position,
): TestResult {
  const status = convertTestStatus(result.status);
  const baseTestResult: BaseTestResult = {
    id: toTestId(result),
    name: collectTestName(result),
    timeSpentMs: result.duration ?? 0,
    fileName: path.resolve(result.testPath),
    // Only known in incremental mode, where rstest is asked for task locations
    ...(startPosition ? { startPosition } : {}),
  };
  if (status === TestStatus.Failed) {
    return {
      ...baseTestResult,
      status,
      failureMessage:
        result.errors?.[0]?.message ?? 'StrykerJS: Unknown test failure',
    };
  }
  return { ...baseTestResult, status };
}

function mergeCoverageData(target: CoverageData, source: CoverageData): void {
  for (const [mutantId, hits] of Object.entries(source)) {
    target[mutantId] = (target[mutantId] ?? 0) + hits;
  }
}

/**
 * Collects the mutant coverage the setup file attached to the test results.
 *
 * Coverage of code that runs while a test is running is reported on that test
 * (`perTest`), coverage of code that runs while the test file is loading is
 * reported on the test file (`static`).
 */
export function collectMutantCoverage(
  files: readonly TestFileResult[],
): MutantCoverage {
  const coverage: MutantCoverage = { static: {}, perTest: {} };
  for (const file of files) {
    mergeCoverageData(
      coverage.static,
      (file.meta?.staticCoverage as CoverageData | undefined) ?? {},
    );
    for (const result of file.results) {
      const perTest = result.meta?.mutantCoverage as CoverageData | undefined;
      // Tests that covered no mutant are left out, they don't influence which
      // tests Stryker runs for a mutant.
      if (perTest && Object.keys(perTest).length) {
        const id = toTestId(result);
        mergeCoverageData((coverage.perTest[id] ??= {}), perTest);
      }
    }
  }
  return coverage;
}

export function collectHitCount(files: readonly TestFileResult[]): number {
  return files.reduce(
    (total, file) => total + ((file.meta?.hitCount as number | undefined) ?? 0),
    0,
  );
}
