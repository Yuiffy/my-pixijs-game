const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const cache = new Map();
function load(name) {
  if (cache.has(name)) return cache.get(name);
  const filename = path.resolve(__dirname, '../../src/components/suiPlatformer', `${name}.ts`);
  const source = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const module = { exports: {} }; cache.set(name, module.exports);
  Function('module', 'exports', 'require', source)(module, module.exports, request => load(request.replace('./', '')));
  return module.exports;
}
module.exports = { ...load('content'), ...load('engine') };
