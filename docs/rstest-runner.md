---
title: Rstest Runner
custom_edit_url: https://github.com/stryker-mutator/stryker-js/edit/master/docs/rstest-runner.md
---

_Since v10.1_

A plugin to use the [rstest](https://rstest.rs/) test runner in Stryker.

## Install

Install `@stryker-mutator/rstest-runner` locally within your project folder, like so:

```bash
npm i --save-dev @stryker-mutator/rstest-runner
```

## Bring your own test runner

This plugin does not come packaged with it's own version of `rstest`, instead install your own version of `@rstest/core` in your project. See [`@stryker-mutator/rstest-runner`'s package.json file](https://github.com/stryker-mutator/stryker-js/blob/master/packages/rstest-runner/package.json) to discover the minimal required version of `@rstest/core`.

## Configuring

You can configure the `@stryker-mutator/rstest-runner` using the `stryker.config.json` (or `stryker.config.js`) config file.

```json
{
  "testRunner": "rstest",
  "rstest": {
    "configFile": "rstest.config.ts",
    "root": "packages/app"
  }
}
```

### `rstest.configFile` [`string` | `undefined`]

Default: `undefined`

Specify a ['rstest.config.ts' file](https://rstest.rs/config/) to be loaded. By default, rstest will look for a `rstest.config.ts` (or `.js`) file in the root of your project.

### `rstest.root` [`string` | `undefined`]

Default: `undefined`

Configure the `-r, --root <root>` command line option. Your test files are discovered relative to this directory. See https://rstest.rs/guide/basic/cli.

## Non overridable options

The following options will be set by Stryker and cannot be overridden:

```javascript
{
  pool: { type: 'forks', maxWorkers: 1 },
  maxConcurrency: 1,
  isolate: true,
  retry: 0,
  bail: options.disableBail ? 0 : 1,
  coverage: { enabled: false },
  update: false,
  onlyFailures: false,
  passWithNoTests: true,
  reporters: [strykerOwnReporter],
  includeTaskLocation: options.incremental,
  silent: true,
  printConsoleTrace: false,
  onConsoleLog: () => false,
}
```

As you can see, the rstest runner:

- Will run your tests in a **single worker**, one test at a time.  
  This is done because StrykerJS uses it's own [parallel workers](./parallel-workers.md). It also makes sure that Stryker can attribute the code that a test covers to that exact test.
- Will **bail** on the first test failure (unless you set `disableBail` to `true`).  
  This is done to boost performance.
- Will **not retry** failed tests.  
  A test that only passes on a retry would report the mutant as survived.
- Will **disable code coverage reporting**  
  This is done because StrykerJS uses it's own [coverage analysis](./configuration.md#coverageanalysis-string), which _is_ supported.
- Will **not update snapshots**.  
  A mutant should never be able to rewrite the snapshot files it is tested against.

Your own [`setupFiles`](https://rstest.rs/config/test/setupFiles) are loaded as usual. Stryker adds one setup file of its own in front of them, which is used to activate the mutant under test and to report back which mutants your tests covered.

When you run Stryker in [incremental mode](./incremental.md), `includeTaskLocation` is enabled as well. Stryker uses the position of your tests to recognize them after you've changed a test file, so it can reuse more results from the previous run.

## Limitations

The rstest runner has the following limitations:

- Rstest's [Browser Mode](https://rstest.rs/guide/browser-testing/) is not supported. If you're using browser mode and want support for it in StrykerJS, please open a [feature request](https://github.com/stryker-mutator/stryker-js/issues/new?assignees=&labels=%F0%9F%9A%80+Feature+request&projects=&template=feature_request.md&title=[rstest]+support+browser+mode).
- Multiple [`projects`](https://rstest.rs/config/test/projects) in one rstest config file are untested.
- Tests that share their full name (the names of the `describe` blocks and the test joined together) with another test in the same file cannot be told apart. Stryker will run both of them for a mutant that is covered by either one.
