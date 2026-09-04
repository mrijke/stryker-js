import fs from 'fs';
import { fileURLToPath } from 'url';

import { expect } from 'chai';

/**
 * Rstest has no `provide`/`inject` bridge, so the runner communicates with the
 * setup file that runs in the rstest worker through environment variables. Both
 * sides hardcode those names (the setup file cannot import them: it is copied
 * into the sandbox and bundled on its own), so this test guards the contract.
 */
describe('stryker-setup', () => {
  const setupFileContents = fs.readFileSync(
    // The compiled file, which is what gets copied into the sandbox.
    fileURLToPath(new URL('../../src/stryker-setup.js', import.meta.url)),
    'utf8',
  );

  const envVariables = [
    '__STRYKER_MODE__',
    '__STRYKER_NAMESPACE__',
    '__STRYKER_MUTANT__',
    '__STRYKER_ACTIVATION__',
    '__STRYKER_HIT_LIMIT__',
  ];

  for (const envVariable of envVariables) {
    it(`should read ${envVariable} from the environment`, () => {
      expect(setupFileContents).contains(`process.env.${envVariable}`);
    });
  }

  it('should not activate mutants via __STRYKER_ACTIVE_MUTANT__', () => {
    // That name is read by the instrumented header itself, which would make
    // every mutant statically active.
    expect(setupFileContents).not.contains(
      'process.env.__STRYKER_ACTIVE_MUTANT__',
    );
  });

  it('should not import anything but @rstest/core', () => {
    // It is copied into the sandbox, so local imports cannot be resolved.
    // @see https://github.com/stryker-mutator/stryker-js/issues/5305
    const imports = [
      ...setupFileContents.matchAll(/from ['"](?<specifier>[^'"]+)['"]/g),
    ].map((match) => match.groups!.specifier);

    expect(imports).deep.eq(['@rstest/core']);
  });
});
