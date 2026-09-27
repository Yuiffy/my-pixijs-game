import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import test from 'node:test';
import ts from 'typescript';
import { loadTypescriptModule } from './helpers/load-typescript-module.mjs';

const require = createRequire(import.meta.url);
const source = await readFile(new URL('../../src/components/resetRush/i18n.tsx', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, {
  fileName: 'i18n.tsx',
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
}).outputText;
const module = { exports: {} };
Function('module', 'exports', 'require', compiled)(module, module.exports, require);
const { browserLocale, translateResetText } = module.exports;
const engine = await loadTypescriptModule('src/components/resetRush/engine.ts');
const hasChinese = (value) => /[\u3400-\u9fff]/.test(value);

test('browser preference resolves Chinese and English while preserving Chinese saves', () => {
  assert.equal(browserLocale(['zh-CN', 'en-US']), 'zh');
  assert.equal(browserLocale(['en-US', 'zh-CN']), 'en');
  assert.equal(browserLocale(['fr-FR', 'zh-TW']), 'zh');
  assert.equal(browserLocale(['fr-FR']), 'en');
  assert.equal(translateResetText('只有一条命', 'zh'), '只有一条命');
  assert.equal(translateResetText('只有一条命', 'en'), 'One Life Only');
  assert.equal(translateResetText('你的开发履历', 'en'), 'Your portfolio');
});

test('every project, category and event has English presentation text', () => {
  const values = [
    ...engine.TEMPLATES.map(([name]) => name),
    ...engine.EVENTS.flatMap((event) => [event.title, event.detail]),
    ...Object.values(engine.CATEGORIES).flatMap((category) => [category.name, category.perk]),
    ...Object.values(engine.DIFFICULTIES),
    ...Object.values(engine.MODELS).map((model) => model.description),
    ...engine.createGame().awards.map((award) => award.name),
  ];
  for (const value of values) {
    assert.equal(hasChinese(translateResetText(value, 'en')), false, value);
  }
});

test('a full season translates public messages, receipts and generated logs', () => {
  let game = engine.createGame(260926, 42);
  const unknown = new Set();
  const check = (value) => {
    if (value && hasChinese(translateResetText(value, 'en'))) unknown.add(value);
  };
  for (let day = 1; day <= 42; day++) {
    check(game.event.title);
    check(game.event.detail);
    check(game.message);
    game = engine.endDay(game);
    check(game.message);
    check(game.receipt?.title);
    check(game.receipt?.text);
    for (const entry of game.logs) check(entry.text);
    game = engine.nextDay(game);
  }
  assert.equal(game.phase, 'over');
  assert.deepEqual([...unknown], []);
});
