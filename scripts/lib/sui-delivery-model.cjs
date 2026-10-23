const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const cache = new Map();
function load(filename) {
  if (cache.has(filename)) return cache.get(filename).exports;
  const module = { exports: {} }; cache.set(filename, module);
  const code = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  Function('module', 'exports', 'require', code)(module, module.exports, request => {
    if (!request.startsWith('.')) throw new Error(`Unexpected external simulation import ${request}`);
    return load(path.resolve(path.dirname(filename), `${request}.ts`));
  });
  return module.exports;
}
const root = path.resolve(__dirname, '../../src/components/suiDelivery');
module.exports = Object.assign({}, ...['content', 'levels', 'save', 'engine', 'machinery', 'market', 'rain', 'theater', 'home', 'feedback', 'playerAnimation'].map(name => load(path.join(root, `${name}.ts`))));
module.exports.DeliveryAudio = load(path.join(root, 'audio.ts')).default;
