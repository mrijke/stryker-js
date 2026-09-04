import { StrykerOptions } from '@stryker-mutator/api/core';

import { StrykerRstestRunnerOptions } from '../src-generated/rstest-runner-options.js';

export interface RstestRunnerOptionsWithStrykerOptions
  extends StrykerRstestRunnerOptions, StrykerOptions {}
