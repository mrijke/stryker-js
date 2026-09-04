import fs from 'fs';
import os from 'os';
import path from 'path';

import { testInjector, factory } from '@stryker-mutator/test-helpers';
import { expect } from 'chai';
import sinon from 'sinon';
import type { RstestUserConfig, TestRunResult } from '@rstest/core/api';

import {
  createRstestTestRunnerFactory,
  MIN_RSTEST_VERSION,
  RstestTestRunner,
} from '../../src/rstest-test-runner.js';
import { rstestWrapper } from '../../src/rstest-wrapper.js';
import type { RstestRunnerOptionsWithStrykerOptions } from '../../src/rstest-runner-options-with-stryker-options.js';
import { createRstestRunnerOptions } from '../util/factories.js';

describe(RstestTestRunner.name, () => {
  let sut: RstestTestRunner;
  let options: RstestRunnerOptionsWithStrykerOptions;
  let runRstestStub: sinon.SinonStub<
    Parameters<typeof rstestWrapper.runRstest>,
    Promise<TestRunResult>
  >;
  let userConfig: RstestUserConfig;
  let workDir: string;
  let originalCwd: string;

  function createRunResult(overrides?: Partial<TestRunResult>): TestRunResult {
    return {
      ok: true,
      files: [],
      stats: {
        tests: { total: 0, passed: 0, failed: 0, skipped: 0, todo: 0 },
        files: { total: 0, failed: 0 },
      },
      unhandledErrors: [],
      duration: { total: 1 },
      ...overrides,
    };
  }

  /** The inline config the runner handed to rstest for the last run. */
  function lastInlineConfig(): RstestUserConfig {
    return runRstestStub.lastCall.firstArg.inlineConfig;
  }

  beforeEach(() => {
    originalCwd = process.cwd();
    workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'stryker-rstest-'));
    process.chdir(workDir);
    userConfig = {};
    runRstestStub = sinon.stub(rstestWrapper, 'runRstest');
    runRstestStub.resolves(createRunResult());
    sinon
      .stub(rstestWrapper, 'loadUserConfig')
      .callsFake(() => Promise.resolve({ content: userConfig }));
    options = testInjector.options as RstestRunnerOptionsWithStrykerOptions;
    options.rstest = createRstestRunnerOptions();
    sut = testInjector.injector.injectFunction(
      createRstestTestRunnerFactory('__stryker2__'),
    );
  });

  afterEach(async () => {
    await sut.dispose();
    // Windows cannot remove the current working directory, and the root hook
    // that restores it only runs after this one
    process.chdir(originalCwd);
    fs.rmSync(workDir, { recursive: true, force: true, maxRetries: 5 });
  });

  describe(RstestTestRunner.prototype.capabilities.name, () => {
    it('should be able to reload the environment', () => {
      // Every run forks new rstest pool workers
      expect(sut.capabilities()).deep.eq({ reloadEnvironment: true });
    });
  });

  describe(RstestTestRunner.prototype.init.name, () => {
    it('should write the setup file into the sandbox', async () => {
      await sut.init();

      const [setupFile] = fs
        .readdirSync(workDir)
        .filter((file) => file.startsWith('.stryker-rstest-setup-'));
      expect(setupFile, 'no setup file was written').ok;
      expect(fs.readFileSync(path.join(workDir, setupFile), 'utf8')).contains(
        '__STRYKER_MODE__',
      );
    });

    it('should not write a sourceMappingURL, rspack would look for a source map', async () => {
      await sut.init();

      const [setupFile] = fs
        .readdirSync(workDir)
        .filter((file) => file.startsWith('.stryker-rstest-setup-'));
      expect(
        fs.readFileSync(path.join(workDir, setupFile), 'utf8'),
      ).not.contains('sourceMappingURL');
    });

    it('should reject when the rstest version is too old', async () => {
      sinon.replace(rstestWrapper, 'version', '0.10.0');

      await expect(sut.init()).rejectedWith(
        `requires rstest >=${MIN_RSTEST_VERSION}, but found 0.10.0`,
      );
    });

    it('should load the config file from the rstest.configFile option', async () => {
      options.rstest.configFile = 'my-rstest.config.ts';

      await sut.init();

      expect(rstestWrapper.loadUserConfig).calledWithMatch({
        path: 'my-rstest.config.ts',
      });
    });
  });

  describe(RstestTestRunner.prototype.dryRun.name, () => {
    beforeEach(async () => {
      await sut.init();
    });

    it('should run in dry-run mode with the configured global namespace', async () => {
      await sut.dryRun(factory.dryRunOptions());

      expect(lastInlineConfig().env).deep.contains({
        __STRYKER_MODE__: 'dry-run',
        __STRYKER_NAMESPACE__: '__stryker2__',
      });
    });

    it('should put the Stryker setup file in front of the user setup files', async () => {
      userConfig.setupFiles = ['./my-setup.ts'];

      await sut.init();
      await sut.dryRun(factory.dryRunOptions());

      const setupFiles = lastInlineConfig().setupFiles as string[];
      expect(setupFiles).lengthOf(2);
      expect(setupFiles[0]).contains('.stryker-rstest-setup-');
      expect(setupFiles[1]).eq('./my-setup.ts');
    });

    it('should override the options Stryker owns', async () => {
      userConfig.pool = { type: 'threads', maxWorkers: 8 };
      userConfig.reporters = ['default'];
      userConfig.coverage = { enabled: true };
      userConfig.retry = 3;

      await sut.init();
      await sut.dryRun(factory.dryRunOptions());

      expect(lastInlineConfig()).deep.contains({
        pool: { type: 'forks', maxWorkers: 1 },
        maxConcurrency: 1,
        isolate: true,
        retry: 0,
        bail: 1,
        coverage: { enabled: false },
        update: false,
        passWithNoTests: true,
        silent: true,
      });
      // Stryker's own reporter replaces the user's, so nothing is written to
      // stdout and Stryker can collect the test locations it needs
      expect(lastInlineConfig().reporters).lengthOf(1);
    });

    it('should not ask rstest for task locations outside of incremental mode', async () => {
      options.incremental = false;

      await sut.dryRun(factory.dryRunOptions());

      expect(lastInlineConfig()).property('includeTaskLocation', false);
    });

    it('should ask rstest for task locations in incremental mode', async () => {
      options.incremental = true;

      await sut.dryRun(factory.dryRunOptions());

      expect(lastInlineConfig()).property('includeTaskLocation', true);
    });

    it('should keep the other user config options', async () => {
      userConfig.include = ['tests/*.spec.ts'];
      userConfig.testEnvironment = 'jsdom';

      await sut.init();
      await sut.dryRun(factory.dryRunOptions());

      expect(lastInlineConfig()).deep.contains({
        include: ['tests/*.spec.ts'],
        testEnvironment: 'jsdom',
      });
    });

    it('should not bail when bail is disabled for the run', async () => {
      await sut.dryRun(factory.dryRunOptions({ disableBail: true }));

      expect(lastInlineConfig()).property('bail', 0);
    });

    it('should bail on the first failure by default', async () => {
      await sut.dryRun(factory.dryRunOptions({ disableBail: false }));

      expect(lastInlineConfig()).property('bail', 1);
    });

    it('should run the provided test files', async () => {
      await sut.dryRun(
        factory.dryRunOptions({ testFiles: ['tests/add.spec.ts'] }),
      );

      expect(runRstestStub.lastCall.firstArg.files).deep.eq([
        path.resolve('tests/add.spec.ts'),
      ]);
    });

    it('should run all test files when none are provided', async () => {
      await sut.dryRun(factory.dryRunOptions());

      expect(runRstestStub.lastCall.firstArg.files).undefined;
      expect(runRstestStub.lastCall.firstArg.testNamePattern).undefined;
    });

    it('should report an error that occurred outside of a test', async () => {
      runRstestStub.resolves(
        createRunResult({
          ok: false,
          unhandledErrors: [
            { name: 'Error', message: 'Config is invalid', stack: 'stack' },
          ],
        }),
      );

      const result = await sut.dryRun(factory.dryRunOptions());

      expect(result.status).eq('error');
      expect(result).property(
        'errorMessage',
        'An error occurred outside of a test run: stack',
      );
    });

    it('should override the root when the rstest.root option is set', async () => {
      options.rstest.root = 'packages/app';

      await sut.init();
      await sut.dryRun(factory.dryRunOptions());

      expect(lastInlineConfig()).property('root', path.resolve('packages/app'));
    });
  });

  describe(RstestTestRunner.prototype.mutantRun.name, () => {
    beforeEach(async () => {
      await sut.init();
    });

    it('should activate the mutant via the environment', async () => {
      await sut.mutantRun(
        factory.mutantRunOptions({
          activeMutant: factory.mutant({ id: '42' }),
          mutantActivation: 'static',
          hitLimit: 100,
        }),
      );

      expect(lastInlineConfig().env).deep.contains({
        __STRYKER_MODE__: 'mutant',
        __STRYKER_MUTANT__: '42',
        __STRYKER_ACTIVATION__: 'static',
        __STRYKER_HIT_LIMIT__: '100',
      });
    });

    it('should not set a hit limit when there is none', async () => {
      await sut.mutantRun(factory.mutantRunOptions({ hitLimit: undefined }));

      expect(lastInlineConfig().env).not.property('__STRYKER_HIT_LIMIT__');
    });

    it('should translate the test filter into test files and a name pattern', async () => {
      await sut.mutantRun(
        factory.mutantRunOptions({
          testFilter: [
            'tests/add.spec.ts#add > should add',
            'tests/math.spec.ts#math > should negate',
          ],
        }),
      );

      expect(runRstestStub.lastCall.firstArg.files).deep.eq([
        path.resolve('tests/add.spec.ts'),
        path.resolve('tests/math.spec.ts'),
      ]);
      expect(
        (runRstestStub.lastCall.firstArg.testNamePattern as RegExp).source,
      ).eq('^add > should add$|^math > should negate$');
    });

    it('should report a timeout when the hit limit was reached', async () => {
      runRstestStub.resolves(
        createRunResult({
          files: [
            {
              status: 'fail',
              name: 'tests/add.spec.ts',
              testPath: path.resolve('tests/add.spec.ts'),
              project: 'rstest',
              meta: { hitCount: 101 },
              results: [],
            },
          ],
        }),
      );

      const result = await sut.mutantRun(
        factory.mutantRunOptions({ hitLimit: 100 }),
      );

      expect(result.status).eq('timeout');
    });
  });

  describe(RstestTestRunner.prototype.dispose.name, () => {
    it('should remove the setup file from the sandbox', async () => {
      await sut.init();

      await sut.dispose();

      expect(
        fs
          .readdirSync(workDir)
          .filter((file) => file.startsWith('.stryker-rstest-setup-')),
      ).lengthOf(0);
    });

    it('should not reject when init was never called', async () => {
      await expect(sut.dispose()).not.rejected;
    });
  });
});
