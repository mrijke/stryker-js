import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import semver from 'semver';
import {
  INSTRUMENTER_CONSTANTS,
  type MutantCoverage,
  type Position,
  type StrykerOptions,
} from '@stryker-mutator/api/core';
import type { Logger } from '@stryker-mutator/api/logging';
import {
  commonTokens,
  type Injector,
  type PluginContext,
  tokens,
} from '@stryker-mutator/api/plugin';
import {
  type DryRunOptions,
  type DryRunResult,
  DryRunStatus,
  type MutantRunOptions,
  type MutantRunResult,
  type TestResult,
  type TestRunner,
  type TestRunnerCapabilities,
  determineHitLimitReached,
  toMutantRunResult,
} from '@stryker-mutator/api/test-runner';
import { testFilesProvided } from '@stryker-mutator/util';
import type { RstestUserConfig, TestRunResult } from '@rstest/core/api';

import { rstestWrapper } from './rstest-wrapper.js';
import {
  collectHitCount,
  collectMutantCoverage,
  convertTestToTestResult,
  toRunFilter,
  toTestId,
} from './rstest-helpers.js';
import type { RstestRunnerOptionsWithStrykerOptions } from './rstest-runner-options-with-stryker-options.js';

type StrykerNamespace = '__stryker__' | '__stryker2__';

const STRYKER_SETUP = fileURLToPath(
  new URL('./stryker-setup.js', import.meta.url),
);

/**
 * The first version that ships the programmatic `runRstest` API and the task
 * metadata this plugin needs to transport mutant coverage.
 */
export const MIN_RSTEST_VERSION = '0.11.0';

interface RunEnv {
  __STRYKER_MODE__: 'dry-run' | 'mutant';
  __STRYKER_NAMESPACE__: StrykerNamespace;
  __STRYKER_MUTANT__?: string;
  __STRYKER_ACTIVATION__?: 'runtime' | 'static';
  __STRYKER_HIT_LIMIT__?: string;
}

export class RstestTestRunner implements TestRunner {
  public static inject = [
    commonTokens.options,
    commonTokens.logger,
    'globalNamespace',
  ] as const;

  private readonly options: RstestRunnerOptionsWithStrykerOptions;
  private userConfig: RstestUserConfig = {};
  private readonly localSetupFile = path.resolve(
    `.stryker-rstest-setup-${process.env.STRYKER_MUTATOR_WORKER ?? 0}.mjs`,
  );
  /**
   * The position of each test, by Stryker test id. Only collected in
   * incremental mode, where Stryker uses it to tell tests apart after a test
   * file changed.
   */
  private readonly startPositions = new Map<string, Position>();

  constructor(
    options: StrykerOptions,
    private readonly log: Logger,
    private readonly globalNamespace: StrykerNamespace,
  ) {
    this.options = options as RstestRunnerOptionsWithStrykerOptions;
  }

  public capabilities(): TestRunnerCapabilities {
    // Each run builds and forks fresh pool workers, so the test environment is
    // always reloaded and static mutants need no special treatment.
    return { reloadEnvironment: true };
  }

  public async init(): Promise<void> {
    if (
      !semver.satisfies(rstestWrapper.version, `>=${MIN_RSTEST_VERSION}`, {
        includePrerelease: true,
      })
    ) {
      throw new Error(
        `@stryker-mutator/rstest-runner requires rstest >=${MIN_RSTEST_VERSION}, but found ${rstestWrapper.version}. Please update your rstest installation.`,
      );
    }

    await this.#writeStrykerSetupFile();

    const { content, filePath } = await rstestWrapper.loadUserConfig({
      cwd: process.cwd(),
      path: this.options.rstest.configFile,
    });
    // The config is loaded once and passed inline on every run. That keeps the
    // Stryker setup file in front of the user's setup files, which rstest's
    // config merging (arrays are appended) wouldn't do.
    this.userConfig = content;
    if (this.log.isDebugEnabled()) {
      this.log.debug(
        `rstest config loaded from ${filePath ?? '(no config file found)'}: ${JSON.stringify(this.userConfig, null, 2)}`,
      );
    }
  }

  /**
   * Writes the Stryker setup file into the sandbox without its
   * `sourceMappingURL`. We don't need a source map for it, but we do want
   * rspack to handle source maps for other files. Removing it prevents rspack
   * from warning about (and looking for) a source map that isn't there.
   */
  async #writeStrykerSetupFile(): Promise<void> {
    const setupFileContents = await fs.promises.readFile(STRYKER_SETUP, 'utf8');
    const lines = setupFileContents
      .split('\n')
      .filter((line) => !line.startsWith('//# sourceMappingURL='));
    await fs.promises.writeFile(this.localSetupFile, lines.join('\n'));
  }

  public async dryRun(options: DryRunOptions): Promise<DryRunResult> {
    const runResult = await this.#run({
      env: {
        __STRYKER_MODE__: 'dry-run',
        __STRYKER_NAMESPACE__: this.globalNamespace,
      },
      disableBail: options.disableBail,
      testFiles: testFilesProvided(options) ? options.testFiles : undefined,
    });
    if (runResult.result.status !== DryRunStatus.Complete) {
      return runResult.result;
    }
    const mutantCoverage: MutantCoverage = collectMutantCoverage(
      runResult.files,
    );
    return { ...runResult.result, mutantCoverage };
  }

  public async mutantRun(options: MutantRunOptions): Promise<MutantRunResult> {
    const runResult = await this.#run({
      env: {
        __STRYKER_MODE__: 'mutant',
        __STRYKER_NAMESPACE__: this.globalNamespace,
        __STRYKER_MUTANT__: options.activeMutant.id,
        __STRYKER_ACTIVATION__: options.mutantActivation,
        ...(options.hitLimit === undefined
          ? {}
          : { __STRYKER_HIT_LIMIT__: String(options.hitLimit) }),
      },
      disableBail: options.disableBail,
      testFilter: options.testFilter,
    });
    const hitCount = collectHitCount(runResult.files);
    const timeout = determineHitLimitReached(hitCount, options.hitLimit);
    return toMutantRunResult(timeout ?? runResult.result);
  }

  async #run({
    env,
    disableBail,
    testFilter,
    testFiles,
  }: {
    env: RunEnv;
    disableBail: boolean;
    testFilter?: string[];
    testFiles?: readonly string[];
  }): Promise<{ result: DryRunResult; files: TestRunResult['files'] }> {
    let files = testFiles?.map((testFile) => path.resolve(testFile));
    let testNamePattern: RegExp | undefined;
    if (testFilter?.length) {
      const filter = toRunFilter(testFilter);
      files = filter.testFiles;
      testNamePattern = filter.testNamePattern;
    }

    this.startPositions.clear();
    const runResult = await rstestWrapper.runRstest({
      cwd: process.cwd(),
      inlineConfig: this.#toInlineConfig(env, disableBail),
      files,
      testNamePattern,
    });

    const tests: TestResult[] = [];
    for (const file of runResult.files) {
      for (const result of file.results) {
        tests.push(
          convertTestToTestResult(
            result,
            this.startPositions.get(toTestId(result)),
          ),
        );
      }
    }

    if (runResult.unhandledErrors.length) {
      const errorMessage = runResult.unhandledErrors
        .map((error) => error.stack ?? `${error.name}: ${error.message}`)
        .join('\n');
      return {
        result: {
          status: DryRunStatus.Error,
          errorMessage: `An error occurred outside of a test run: ${errorMessage}`,
        },
        files: runResult.files,
      };
    }

    return {
      result: { status: DryRunStatus.Complete, tests },
      files: runResult.files,
    };
  }

  #toInlineConfig(env: RunEnv, disableBail: boolean): RstestUserConfig {
    const setupFiles = [
      this.localSetupFile,
      ...[this.userConfig.setupFiles ?? []].flat(),
    ];
    return {
      ...this.userConfig,
      ...(this.options.rstest.root === undefined
        ? {}
        : { root: path.resolve(this.options.rstest.root) }),
      setupFiles,
      env: { ...this.userConfig.env, ...env },
      // Stryker runs test runners in parallel itself, see
      // https://stryker-mutator.io/docs/stryker-js/parallel-workers/
      pool: { type: 'forks', maxWorkers: 1 },
      maxConcurrency: 1,
      isolate: true,
      // A retry could turn a killed mutant into a survived one.
      retry: 0,
      bail: disableBail ? 0 : 1,
      // Stryker has its own coverage analysis.
      coverage: { enabled: false },
      update: false,
      onlyFailures: false,
      passWithNoTests: true,
      includeTaskLocation: this.options.incremental,
      reporters: [
        {
          flushOutputStreams: false,
          onTestCaseStart: ({ location, ...test }) => {
            if (location) {
              this.startPositions.set(toTestId(test), {
                // Stryker works 0-based internally, rstest reports 1-based lines
                line: location.line - 1,
                column: location.column,
              });
            }
          },
        },
      ],
      silent: true,
      printConsoleTrace: false,
      onConsoleLog: () => false,
    };
  }

  public async dispose(): Promise<void> {
    await fs.promises.rm(this.localSetupFile, { force: true });
  }
}

export const rstestTestRunnerFactory = createRstestTestRunnerFactory();

export function createRstestTestRunnerFactory(
  namespace:
    | typeof INSTRUMENTER_CONSTANTS.NAMESPACE
    | '__stryker2__' = INSTRUMENTER_CONSTANTS.NAMESPACE,
): {
  (injector: Injector<PluginContext>): RstestTestRunner;
  inject: ['$injector'];
} {
  rstestTestRunnerFactory.inject = tokens(commonTokens.injector);
  function rstestTestRunnerFactory(
    injector: Injector<PluginContext>,
  ): RstestTestRunner {
    return injector
      .provideValue('globalNamespace', namespace)
      .injectClass(RstestTestRunner);
  }
  return rstestTestRunnerFactory;
}
