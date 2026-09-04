import {
  assertions,
  factory,
  testInjector,
  TempTestDirectorySandbox,
} from '@stryker-mutator/test-helpers';
import { expect } from 'chai';

import {
  createRstestTestRunnerFactory,
  RstestTestRunner,
} from '../../src/rstest-test-runner.js';
import type { RstestRunnerOptionsWithStrykerOptions } from '../../src/rstest-runner-options-with-stryker-options.js';
import { createRstestRunnerOptions } from '../util/factories.js';

describe('Infinite loop', () => {
  let sut: RstestTestRunner;
  let sandbox: TempTestDirectorySandbox;

  const test =
    'tests/infinite-loop.spec.js#should be able to break out of an infinite loop with a hit counter';

  beforeEach(async () => {
    sandbox = new TempTestDirectorySandbox('infinite-loop');
    await sandbox.init();
    (testInjector.options as RstestRunnerOptionsWithStrykerOptions).rstest =
      createRstestRunnerOptions();
    sut = testInjector.injector.injectFunction(
      createRstestTestRunnerFactory('__stryker2__'),
    );
    await sut.init();
  });

  afterEach(async () => {
    await sut.dispose();
    await sandbox.dispose();
  });

  it('should be able to recover using a hit counter', async () => {
    // Mutant 5 replaces `n--` with `n++`, so the while loop never ends
    const result = await sut.mutantRun(
      factory.mutantRunOptions({
        activeMutant: factory.mutant({ id: '5' }),
        testFilter: [test],
        hitLimit: 10,
      }),
    );

    assertions.expectTimeout(result);
    expect(result.reason).contains('Hit limit reached');
  });

  it('should reset the hit count between runs', async () => {
    const firstResult = await sut.mutantRun(
      factory.mutantRunOptions({
        activeMutant: factory.mutant({ id: '5' }),
        testFilter: [test],
        hitLimit: 10,
        mutantActivation: 'static',
      }),
    );
    const secondResult = await sut.mutantRun(
      factory.mutantRunOptions({
        // Mutant 4 empties the `action(n)` call, a 'normal' mutant that is killed
        activeMutant: factory.mutant({ id: '4' }),
        testFilter: [test],
        hitLimit: 10,
        mutantActivation: 'static',
      }),
    );

    assertions.expectTimeout(firstResult);
    assertions.expectKilled(secondResult);
  });
});
