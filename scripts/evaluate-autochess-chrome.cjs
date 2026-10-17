// Full-game strength evaluation in the installed Chrome JavaScript runtime.
// This does not render WebGL or request screenshots; UI verification is separate.
const { readFileSync, writeFileSync, mkdirSync, renameSync } = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const ts = require('typescript');
const option = (key, fallback) => {
  const index = process.argv.indexOf(key);
  return index < 0 ? fallback : process.argv[index + 1];
};
const root = path.resolve(option('--source-root', '.'));
const output = path.resolve(option('--output', 'tmp/muzero/chrome-evaluation.json'));
const level = option('--level', 'novice');
const seed = Number(option('--seed', '86500'));
const runs = Number(option('--runs', '32'));
if (!['novice', 'veteran', 'deep', 'oracle'].includes(level) || !Number.isInteger(seed)
  || !Number.isInteger(runs) || runs < 1) throw new Error('Invalid evaluation configuration');
const sources = new Map();
const visit = relative => {
  const key = relative.replaceAll('\\', '/');
  if (sources.has(key)) return key;
  const content = readFileSync(path.join(root, key), 'utf8');
  sources.set(key, { content });
  if (key.endsWith('.json')) {
    sources.set(key, { content, code: `module.exports = {default: ${content}};`, deps: {} });
    return key;
  }
  const ast = ts.createSourceFile(key, content, ts.ScriptTarget.Latest, true);
  const deps = {};
  for (const statement of ast.statements) {
    if (!(ts.isImportDeclaration(statement) || ts.isExportDeclaration(statement))
      || statement.importClause?.isTypeOnly || statement.isTypeOnly || !statement.moduleSpecifier) continue;
    const specifier = statement.moduleSpecifier.text;
    if (!specifier.startsWith('.')) throw new Error(`External simulation dependency: ${specifier}`);
    let dependency = path.posix.normalize(path.posix.join(path.posix.dirname(key), specifier));
    if (!path.posix.extname(dependency)) dependency += '.ts';
    deps[specifier] = visit(dependency);
  }
  const code = ts.transpileModule(content, { fileName: key,
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  sources.set(key, { content, code, deps });
  return key;
};
const bridgeModule = visit('src/components/autoChessGame/phaser/EngineBridge.ts');
const pilotModule = visit('src/components/autoChessGame/ai/AutoChessAutopilot.ts');
const fingerprint = createHash('sha256');
fingerprint.update(readFileSync(__filename));
for (const [key, value] of [...sources].sort(([a], [b]) => a.localeCompare(b))) fingerprint.update(key).update(value.content);
const hash = fingerprint.digest('hex');
const moduleCode = [...sources].map(([key, { code, deps }]) =>
  `${JSON.stringify(key)}: {deps:${JSON.stringify(deps)},run:function(module,exports,require){\n${code}\n}}`).join(',\n');
const workerCode = `const modules={${moduleCode}};const cache={};
function load(key){if(cache[key])return cache[key].exports;const module={exports:{}};cache[key]=module;
modules[key].run(module,module.exports,specifier=>load(modules[key].deps[specifier]));return module.exports;}
const {EngineBridge}=load(${JSON.stringify(bridgeModule)});
const {AutoChessAutopilot}=load(${JSON.stringify(pilotModule)});
onmessage=({data})=>{try{
const bridge=new EngineBridge(data.seed,1,{simulation:true,battleStepHz:60});bridge.setConsoleLogging(false);
const pilot=new AutoChessAutopilot(bridge,'evolution',{},'balanced','normal',20,undefined,true,data.level,true);
let now=1000,wins=0,cleared=false;const trace=[];pilot.startFromTitle();
while(trace.length<32){const s=bridge.engine.state;const round=s.round;let ticks=0;
while(s.phase!=='battle'&&s.phase!=='gameover'&&ticks<600){pilot.tick(now+=2400);ticks++;}
if(s.phase!=='battle')throw Error('Preparation did not reach battle');
const battleGold=s.gold;bridge.skipBattle();const won=Boolean(s.result?.won);wins+=Number(won);
if(round===16&&won)cleared=true;
trace.push({seed:data.seed,level:data.level,round,hp:s.hp,gold:s.gold,battleGold,wins,ticks,won,cleared});
if(bridge.engine.resultEndsRun||s.hp<=0||round>=32||s.phase==='gameover')break;
for(let tick=0;s.phase!=='preparation'&&tick<100;tick++)pilot.tick(now+=2400);
if(s.phase!=='preparation')throw Error('Result did not advance');
}
postMessage({...trace.at(-1),trace});}catch(error){postMessage({error:error.stack});}};`;
let chromium;
for (const candidate of [process.env.PLAYWRIGHT_MODULE, 'playwright',
  'C:/Users/yuiffy/AppData/Local/npm-cache/_npx/9833c18b2d85bc59/node_modules/playwright'].filter(Boolean)) {
  try { ({ chromium } = require(candidate)); break; } catch { /* Try installed runtime. */ }
}
if (!chromium) throw new Error('Installed Playwright runtime unavailable');
(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--mute-audio'] });
  try {
    const page = await browser.newPage();
    await page.addInitScript(() => { if (window.speechSynthesis) window.speechSynthesis.speak = () => {}; });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.evaluate(code => {
      window.evaluationWorker = new Worker(URL.createObjectURL(new Blob([code], { type: 'text/javascript' })));
    }, workerCode);
    const results = [];
    const started = Date.now();
    for (let run = 0; run < runs; run += 1) {
      const result = await page.evaluate(config => new Promise((resolve, reject) => {
        window.evaluationWorker.onerror = event => reject(new Error(event.message));
        window.evaluationWorker.onmessage = ({ data }) => data.error ? reject(new Error(data.error)) : resolve(data);
        window.evaluationWorker.postMessage(config);
      }), { seed: seed + run, level });
      results.push(result);
      console.log(JSON.stringify({ ...result, trace: undefined, elapsed: (Date.now() - started) / 1000 }));
      mkdirSync(path.dirname(output), { recursive: true });
      writeFileSync(`${output}.pending`, JSON.stringify({ config: { level, seed, runs, battles: 32, sourceRoot: root },
        fingerprint: hash, runtime: { browser: browser.version(), engine: 'Chrome Worker', hz: 60, rolloutHz: 20 },
        meanWins: results.reduce((n, r) => n + r.wins, 0) / results.length,
        clears: results.filter(r => r.cleared).length, results, errors }, null, 2));
      renameSync(`${output}.pending`, output);
    }
    if (errors.length) throw new Error(errors.join('\n'));
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
