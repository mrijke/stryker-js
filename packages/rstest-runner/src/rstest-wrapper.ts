import { createRequire } from 'module';
import path from 'path';
import { pathToFileURL } from 'node:url';

import { loadConfig as loadConfigOriginal } from '@rstest/core';
import { runRstest as runRstestOriginal } from '@rstest/core/api';
import type { RstestUserConfig } from '@rstest/core/api';

// Try to load the project's local rstest installation, so the version the
// project depends on is the version that runs its tests. The specifier is
// resolved from the project's cwd at runtime, so a static import cannot
// express it; the static imports above are the fallback.
let loadConfig = loadConfigOriginal;
let runRstest = runRstestOriginal;
let version: string;

try {
  const require = createRequire(path.join(process.cwd(), 'package.json'));

  const rstestCore = await import(
    pathToFileURL(require.resolve('@rstest/core')).href
  );
  const rstestApi = await import(
    pathToFileURL(require.resolve('@rstest/core/api')).href
  );
  loadConfig = rstestCore.loadConfig ?? loadConfigOriginal;
  runRstest = rstestApi.runRstest ?? runRstestOriginal;

  version = require(require.resolve('@rstest/core/package.json')).version;
} catch {
  const require = createRequire(import.meta.url);
  version = require(require.resolve('@rstest/core/package.json')).version;
}

async function loadUserConfig(options: {
  cwd: string;
  path?: string;
}): Promise<{ content: RstestUserConfig; filePath?: string }> {
  const { content, filePath } = await loadConfig(options);
  return {
    // `@rstest/core` and `@rstest/core/api` each declare the config shape:
    // `RstestConfig` and `RstestUserConfig` are structurally identical, but
    // nominally distinct, so the config has to be handed over explicitly.
    content: (content ?? {}) as RstestUserConfig,
    filePath: filePath ?? undefined,
  };
}

export const rstestWrapper = {
  loadUserConfig,
  runRstest,
  version,
};

export type { RstestUserConfig, TestRunResult } from '@rstest/core/api';
