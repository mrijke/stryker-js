import path from 'path';

import {
  assertions,
  factory,
  testInjector,
  TempTestDirectorySandbox,
} from '@stryker-mutator/test-helpers';
import { expect } from 'chai';
import { TestStatus } from '@stryker-mutator/api/test-runner';

import {
  createRstestTestRunnerFactory,
  RstestTestRunner,
} from '../../src/rstest-test-runner.js';
import type { RstestRunnerOptionsWithStrykerOptions } from '../../src/rstest-runner-options-with-stryker-options.js';
import { createRstestRunnerOptions } from '../util/factories.js';

describe('RstestTestRunner integration', () => {
  let sut: RstestTestRunner;
  let sandbox: TempTestDirectorySandbox;
  let options: RstestRunnerOptionsWithStrykerOptions;

  // See testResources/simple-project/math.ts for the mutant ids:
  // 0: `pi = 3 - 0.14` (static, runs while the test file loads)
  // 2: `num1 - num2` in `add`
  // 4: `number--` in `addOne`
  // 6: `+number` in `negate`
  const addTest = 'tests/add.spec.ts#add > should be able to add two numbers';
  const addNegativeTest =
    'tests/add.spec.ts#add > should be able to add a negative number';
  const addOneTest =
    'tests/math.spec.ts#math > should be able to add one to a number';
  const negateTest = 'tests/math.spec.ts#math > should be able negate a number';
  const isNegativeTest =
    'tests/math.spec.ts#math > isNegativeNumber > should be able to recognize a negative number';
  const piTest = 'tests/pi.spec.ts#pi should be 3.14';

  beforeEach(async () => {
    sandbox = new TempTestDirectorySandbox('simple-project');
    await sandbox.init();
    options = testInjector.options as RstestRunnerOptionsWithStrykerOptions;
    options.rstest = createRstestRunnerOptions();
    sut = testInjector.injector.injectFunction(
      createRstestTestRunnerFactory('__stryker2__'),
    );
    await sut.init();
  });

  afterEach(async () => {
    await sut.dispose();
    await sandbox.dispose();
  });

  describe(RstestTestRunner.prototype.dryRun.name, () => {
    it('should run all the specs', async () => {
      const runResult = await sut.dryRun(factory.dryRunOptions());

      assertions.expectCompleted(runResult);
      assertions.expectTestResults(runResult, [
        {
          id: addTest,
          fileName: path.resolve('tests/add.spec.ts'),
          name: 'add > should be able to add two numbers',
          status: TestStatus.Success,
        },
        {
          id: addNegativeTest,
          fileName: path.resolve('tests/add.spec.ts'),
          name: 'add > should be able to add a negative number',
          status: TestStatus.Success,
        },
        {
          id: addOneTest,
          fileName: path.resolve('tests/math.spec.ts'),
          name: 'math > should be able to add one to a number',
          status: TestStatus.Success,
        },
        {
          id: negateTest,
          fileName: path.resolve('tests/math.spec.ts'),
          name: 'math > should be able negate a number',
          status: TestStatus.Success,
        },
        {
          id: isNegativeTest,
          fileName: path.resolve('tests/math.spec.ts'),
          name: 'math > isNegativeNumber > should be able to recognize a negative number',
          status: TestStatus.Success,
        },
        {
          id: piTest,
          fileName: path.resolve('tests/pi.spec.ts'),
          name: 'pi should be 3.14',
          status: TestStatus.Success,
        },
      ]);
    });

    it('should report mutant coverage', async () => {
      const runResult = await sut.dryRun(factory.dryRunOptions());

      assertions.expectCompleted(runResult);
      expect(runResult.mutantCoverage).deep.eq({
        // `pi` is initialized once per test file, all 3 test files import it
        static: { '0': 3 },
        perTest: {
          [addTest]: { '1': 1, '2': 1 },
          [addNegativeTest]: { '1': 1, '2': 1 },
          [addOneTest]: { '3': 1, '4': 1 },
          [negateTest]: { '5': 1, '6': 1 },
          [isNegativeTest]: {
            '7': 1,
            '8': 1,
            '9': 1,
            '10': 1,
            '11': 1,
            '12': 1,
            '13': 1,
            '14': 1,
          },
        },
      });
    });

    it('should only run the provided test files', async () => {
      const runResult = await sut.dryRun(
        factory.dryRunOptions({
          testFiles: [path.resolve('tests/add.spec.ts')],
        }),
      );

      assertions.expectCompleted(runResult);
      expect(runResult.tests.map(({ id }) => id)).deep.eq([
        addTest,
        addNegativeTest,
      ]);
    });

    it('should report the position of each test in incremental mode', async () => {
      // Stryker uses the positions to tell tests apart after a test file changed
      options.incremental = true;
      await sut.init();

      const runResult = await sut.dryRun(factory.dryRunOptions());

      assertions.expectCompleted(runResult);
      const positionsById = Object.fromEntries(
        runResult.tests.map(({ id, startPosition }) => [id, startPosition]),
      );
      // tests/add.spec.ts, 0-based lines: `describe` on 4, the `it`s on 5 and 9
      expect(positionsById[addTest]).deep.eq({ line: 5, column: 5 });
      expect(positionsById[addNegativeTest]).deep.eq({ line: 9, column: 5 });
    });

    it('should not report positions when not running incrementally', async () => {
      const runResult = await sut.dryRun(factory.dryRunOptions());

      assertions.expectCompleted(runResult);
      expect(runResult.tests.every(({ startPosition }) => !startPosition)).true;
    });
  });

  describe(RstestTestRunner.prototype.mutantRun.name, () => {
    it('should kill a mutant that breaks a test', async () => {
      const result = await sut.mutantRun(
        factory.mutantRunOptions({
          activeMutant: factory.mutant({ id: '2' }),
          testFilter: [addTest],
        }),
      );

      assertions.expectKilled(result);
      expect(result.killedBy).deep.eq([addTest]);
      expect(result.failureMessage).contains('9');
    });

    it('should report a survived mutant when the tests still pass', async () => {
      const result = await sut.mutantRun(
        factory.mutantRunOptions({
          // The `addOne` mutant is not covered by the `add` test
          activeMutant: factory.mutant({ id: '4' }),
          testFilter: [addTest],
        }),
      );

      assertions.expectSurvived(result);
      expect(result.nrOfTests).eq(1);
    });

    it('should only run the filtered tests', async () => {
      const result = await sut.mutantRun(
        factory.mutantRunOptions({
          activeMutant: factory.mutant({ id: '4' }),
          testFilter: [addOneTest],
        }),
      );

      assertions.expectKilled(result);
      expect(result.killedBy).deep.eq([addOneTest]);
      expect(result.nrOfTests).eq(1);
    });

    it('should be able to kill a static mutant when activated statically', async () => {
      const result = await sut.mutantRun(
        factory.mutantRunOptions({
          activeMutant: factory.mutant({ id: '0' }),
          testFilter: [piTest],
          mutantActivation: 'static',
        }),
      );

      assertions.expectKilled(result);
      expect(result.killedBy).deep.eq([piTest]);
    });

    it('should not activate a static mutant during runtime activation', async () => {
      const result = await sut.mutantRun(
        factory.mutantRunOptions({
          activeMutant: factory.mutant({ id: '0' }),
          testFilter: [piTest],
          mutantActivation: 'runtime',
        }),
      );

      // `pi` is initialized before the mutant is activated
      assertions.expectSurvived(result);
    });

    it('should report all failing tests when bail is disabled', async () => {
      const result = await sut.mutantRun(
        factory.mutantRunOptions({
          // Empties the body of `add`, so both `add` tests fail
          activeMutant: factory.mutant({ id: '1' }),
          testFilter: [addTest, addNegativeTest],
          disableBail: true,
        }),
      );

      assertions.expectKilled(result);
      expect(result.killedBy).deep.eq([addTest, addNegativeTest]);
      expect(result.nrOfTests).eq(2);
    });

    it('should bail after the first failing test by default', async () => {
      const result = await sut.mutantRun(
        factory.mutantRunOptions({
          activeMutant: factory.mutant({ id: '1' }),
          testFilter: [addTest, addNegativeTest],
          disableBail: false,
        }),
      );

      assertions.expectKilled(result);
      expect(result.killedBy).deep.eq([addTest]);
      expect(result.nrOfTests).eq(1);
    });

    it('should be able to run twice in a row', async () => {
      await sut.mutantRun(
        factory.mutantRunOptions({
          activeMutant: factory.mutant({ id: '2' }),
          testFilter: [addTest],
        }),
      );
      const result = await sut.mutantRun(
        factory.mutantRunOptions({
          activeMutant: factory.mutant({ id: '4' }),
          testFilter: [addOneTest],
        }),
      );

      assertions.expectKilled(result);
    });
  });
});
