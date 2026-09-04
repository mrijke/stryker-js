import { afterAll, afterEach, beforeAll, beforeEach } from '@rstest/core';

// This file is copied to the sandbox dir and bundled by rspack as an rstest
// setup file. Don't import anything local (and nothing but types outside of
// `@rstest/core`), see https://github.com/stryker-mutator/stryker-js/issues/5305
//
// Rstest has no `provide`/`inject` bridge between the host process and its pool
// workers, so the host communicates through environment variables (part of the
// per-run runtime config) and this file communicates back through task metadata.
// The env variable names are asserted in test/unit/stryker-setup.spec.ts.

// Deliberately _not_ `__STRYKER_ACTIVE_MUTANT__`: that name is read by the
// instrumented header itself, which would make every mutant statically active.
const activeMutant = process.env.__STRYKER_MUTANT__;
const globalNamespace = (process.env.__STRYKER_NAMESPACE__ ?? '__stryker__') as
  | '__stryker__'
  | '__stryker2__';
const hitLimit = process.env.__STRYKER_HIT_LIMIT__;
const mode = process.env.__STRYKER_MODE__;

const ns = (globalThis[globalNamespace] ??= {});

if (mode === 'mutant') {
  ns.hitLimit = hitLimit === undefined ? undefined : Number(hitLimit);
  ns.hitCount = 0;

  if (process.env.__STRYKER_ACTIVATION__ === 'static') {
    // The top level of a setup file is evaluated before the test file (and thus
    // before the code under test) is imported, so the mutant is already active
    // during static initialization.
    ns.activeMutant = activeMutant;
  } else {
    beforeAll(() => {
      ns.activeMutant = activeMutant;
    });
  }

  beforeAll(() => {
    ns.hitCount = 0;
  });

  afterAll((suite) => {
    suite.meta.hitCount = ns.hitCount ?? 0;
  });
} else {
  ns.activeMutant = undefined;

  beforeEach((ctx) => {
    ns.currentTestId = ctx.task.id;
  });

  afterEach((ctx) => {
    // Ship the coverage of this test on the test's own result. That way the host
    // can key it with the Stryker test id it already computed for that result,
    // without having to map rstest's internal task ids.
    ctx.task.meta.mutantCoverage =
      ns.mutantCoverage?.perTest[ctx.task.id] ?? {};
    delete ns.mutantCoverage?.perTest[ctx.task.id];
    ns.currentTestId = undefined;
  });

  afterAll((suite) => {
    suite.meta.staticCoverage = ns.mutantCoverage?.static ?? {};
  });
}
