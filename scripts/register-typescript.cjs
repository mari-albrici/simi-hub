// Test-only loader: execute pure TypeScript modules without writing build artifacts.
const ts = require('typescript');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');

// Keep the test loader aligned with the application's `@/*` TypeScript path
// alias so tests can exercise the same authorization modules used by the UI.
const resolveFilename = Module._resolveFilename;
Module._resolveFilename = function resolveWithSourceAlias(request, parent, isMain, options) {
  const aliased = request.startsWith('@/')
    ? path.resolve(__dirname, '..', 'src', request.slice(2))
    : request;
  return resolveFilename.call(this, aliased, parent, isMain, options);
};

require.extensions['.ts'] = (module, filename) => {
  const source = fs.readFileSync(filename, 'utf8');
  const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } });
  module._compile(outputText, filename);
};
