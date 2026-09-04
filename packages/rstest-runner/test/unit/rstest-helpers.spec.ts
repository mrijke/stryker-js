import path from 'path';

import { expect } from 'chai';
import { TestStatus } from '@stryker-mutator/api/test-runner';

import {
  collectHitCount,
  collectMutantCoverage,
  collectTestName,
  convertTestToTestResult,
  fromTestId,
  toRunFilter,
  toTestId,
} from '../../src/rstest-helpers.js';
import {
  createRstestTestFileResult,
  createRstestTestResult,
} from '../util/factories.js';

describe('rstest-helpers', () => {
  describe(collectTestName.name, () => {
    it('should join the parent names and the test name', () => {
      expect(
        collectTestName({
          name: 'should recognize a negative number',
          parentNames: ['math', 'isNegativeNumber'],
        }),
      ).eq('math > isNegativeNumber > should recognize a negative number');
    });

    it('should support tests without a parent suite', () => {
      expect(collectTestName({ name: 'pi should be 3.14' })).eq(
        'pi should be 3.14',
      );
    });
  });

  describe(toTestId.name, () => {
    it('should use the test file relative to the cwd', () => {
      const result = createRstestTestResult({
        testPath: path.resolve('tests', 'add.spec.ts'),
        parentNames: ['add'],
        name: 'should add',
      });

      expect(toTestId(result)).eq('tests/add.spec.ts#add > should add');
    });

    it('should be reversible by fromTestId', () => {
      const result = createRstestTestResult({
        testPath: path.resolve('tests', 'add.spec.ts'),
        parentNames: ['add'],
        name: 'should add',
      });

      expect(fromTestId(toTestId(result))).deep.eq({
        file: 'tests/add.spec.ts',
        test: 'add > should add',
      });
    });
  });

  describe(toRunFilter.name, () => {
    it('should deduplicate the test files and anchor the test names', () => {
      const filter = toRunFilter([
        'tests/add.spec.ts#add > should add',
        'tests/add.spec.ts#add > should subtract',
      ]);

      expect(filter.testFiles).deep.eq([path.resolve('tests/add.spec.ts')]);
      expect(filter.testNamePattern.source).eq(
        '^add > should add$|^add > should subtract$',
      );
    });

    it('should escape regex characters in test names', () => {
      const filter = toRunFilter(['tests/a.spec.ts#matches (a|b)?']);

      expect(filter.testNamePattern.test('matches (a|b)?')).true;
      expect(filter.testNamePattern.test('matches a')).false;
    });

    it('should match the full name of a nested test, but not a partial one', () => {
      const filter = toRunFilter([
        'tests/math.spec.ts#math > isNegativeNumber > should recognize it',
      ]);

      expect(
        filter.testNamePattern.test(
          'math > isNegativeNumber > should recognize it',
        ),
      ).true;
      expect(filter.testNamePattern.test('should recognize it')).false;
    });

    it('should always contain a ">" for nested tests, so rstest joins names with " > "', () => {
      // @see createShouldSkipByName in rstest: the delimiter it uses to build
      // the full test name depends on the pattern containing a ">".
      const filter = toRunFilter(['tests/math.spec.ts#math > should add one']);

      expect(filter.testNamePattern.source).contains('>');
    });
  });

  describe(convertTestToTestResult.name, () => {
    it('should convert a passed test', () => {
      const result = convertTestToTestResult(
        createRstestTestResult({
          status: 'pass',
          testPath: path.resolve('tests/add.spec.ts'),
          parentNames: ['add'],
          name: 'should add',
          duration: 42,
        }),
      );

      expect(result).deep.eq({
        id: 'tests/add.spec.ts#add > should add',
        name: 'add > should add',
        fileName: path.resolve('tests/add.spec.ts'),
        timeSpentMs: 42,
        status: TestStatus.Success,
      });
    });

    it('should report the start position when it is known', () => {
      const result = convertTestToTestResult(createRstestTestResult(), {
        line: 5,
        column: 7,
      });

      expect(result).property('startPosition').deep.eq({ line: 5, column: 7 });
    });

    it('should not report a start position when it is unknown', () => {
      const result = convertTestToTestResult(createRstestTestResult());

      expect(result).not.property('startPosition');
    });

    it('should convert a failed test, including the failure message', () => {
      const result = convertTestToTestResult(
        createRstestTestResult({
          status: 'fail',
          errors: [{ name: 'AssertionError', message: 'expected 3 to be 4' }],
        }),
      );

      expect(result.status).eq(TestStatus.Failed);
      expect(result).property('failureMessage', 'expected 3 to be 4');
    });

    it('should fall back to a generic failure message', () => {
      const result = convertTestToTestResult(
        createRstestTestResult({ status: 'fail', errors: [] }),
      );

      expect(result).property(
        'failureMessage',
        'StrykerJS: Unknown test failure',
      );
    });

    it('should report skipped and todo tests as skipped', () => {
      for (const status of ['skip', 'todo'] as const) {
        expect(
          convertTestToTestResult(createRstestTestResult({ status })).status,
        ).eq(TestStatus.Skipped);
      }
    });

    it('should default the duration of a test without one', () => {
      expect(
        convertTestToTestResult(createRstestTestResult({ duration: undefined }))
          .timeSpentMs,
      ).eq(0);
    });
  });

  describe(collectMutantCoverage.name, () => {
    it('should collect static coverage from the test files and per-test coverage from the tests', () => {
      const coverage = collectMutantCoverage([
        createRstestTestFileResult({
          testPath: path.resolve('tests/add.spec.ts'),
          meta: { staticCoverage: { '0': 1 } },
          results: [
            createRstestTestResult({
              testPath: path.resolve('tests/add.spec.ts'),
              parentNames: ['add'],
              name: 'should add',
              meta: { mutantCoverage: { '1': 1, '2': 2 } },
            }),
          ],
        }),
      ]);

      expect(coverage).deep.eq({
        static: { '0': 1 },
        perTest: {
          'tests/add.spec.ts#add > should add': { '1': 1, '2': 2 },
        },
      });
    });

    it('should sum the static coverage of all test files', () => {
      const coverage = collectMutantCoverage([
        createRstestTestFileResult({ meta: { staticCoverage: { '0': 1 } } }),
        createRstestTestFileResult({
          testPath: path.resolve('tests/math.spec.ts'),
          meta: { staticCoverage: { '0': 2, '3': 1 } },
        }),
      ]);

      expect(coverage.static).deep.eq({ '0': 3, '3': 1 });
    });

    it('should not report tests that covered no mutants', () => {
      const coverage = collectMutantCoverage([
        createRstestTestFileResult({
          results: [createRstestTestResult({ meta: { mutantCoverage: {} } })],
        }),
      ]);

      expect(coverage.perTest).deep.eq({});
    });

    it('should ignore tests without coverage metadata (skipped tests)', () => {
      const coverage = collectMutantCoverage([
        createRstestTestFileResult({
          results: [createRstestTestResult({ status: 'skip', meta: {} })],
        }),
      ]);

      expect(coverage).deep.eq({ static: {}, perTest: {} });
    });
  });

  describe(collectHitCount.name, () => {
    it('should sum the hit count of all test files', () => {
      expect(
        collectHitCount([
          createRstestTestFileResult({ meta: { hitCount: 10 } }),
          createRstestTestFileResult({ meta: { hitCount: 7 } }),
        ]),
      ).eq(17);
    });

    it('should count test files without a hit count as 0', () => {
      expect(collectHitCount([createRstestTestFileResult()])).eq(0);
    });
  });
});
