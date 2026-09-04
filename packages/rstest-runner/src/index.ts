import fs from 'fs';

import { declareFactoryPlugin, PluginKind } from '@stryker-mutator/api/plugin';

import { rstestTestRunnerFactory } from './rstest-test-runner.js';

export const strykerPlugins = [
  declareFactoryPlugin(
    PluginKind.TestRunner,
    'rstest',
    rstestTestRunnerFactory,
  ),
];
export const strykerValidationSchema: typeof import('../schema/rstest-runner-options.json') =
  JSON.parse(
    fs.readFileSync(
      new URL('../schema/rstest-runner-options.json', import.meta.url),
      'utf-8',
    ),
  );
