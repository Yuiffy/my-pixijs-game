import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import test from 'node:test';
import ts from 'typescript';
import { loadTypescriptModule } from './helpers/load-typescript-module.mjs';

const require = createRequire(import.meta.url);
const messageSource = await readFile(new URL('../../src/components/resetRush/messages.ts', import.meta.url), 'utf8');
const messageModule = { exports: {} };
Function('module', 'exports', ts.transpileModule(messageSource, {
  fileName: 'messages.ts',
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText)(messageModule, messageModule.exports);
const source = await readFile(new URL('../../src/components/resetRush/i18n.tsx', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, {
  fileName: 'i18n.tsx',
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
}).outputText;
const module = { exports: {} };
Function('module', 'exports', 'require', compiled)(module, module.exports, (name) => name === './messages' ? messageModule.exports : require(name));
const { browserLocale, createResetI18n, translateResetText } = module.exports;
const engine = await loadTypescriptModule('src/components/resetRush/engine.ts');
const hasChinese = (value) => /[\u3400-\u9fff]/.test(value);

test('all named UI catalogs have matching keys and English fallback', () => {
  const entries = (object, prefix = '') => Object.entries(object).flatMap(([key, value]) =>
    typeof value === 'string' ? [[`${prefix}${key}`, value]] : entries(value, `${prefix}${key}.`));
  const catalogs = messageModule.exports.resetMessages;
  const chinese = entries(catalogs.zh.translation);
  const english = entries(catalogs.en.translation);
  for (const [locale, resource] of Object.entries(catalogs)) {
    assert.deepEqual(entries(resource.translation).map(([key]) => key), english.map(([key]) => key), locale);
  }
  for (const [key, value] of chinese) assert.equal(hasChinese(value), true, key);
  for (const [key, value] of english) assert.equal(hasChinese(value), false, key);
  const i18n = createResetI18n();
  assert.equal(i18n.t('restartCopy', { lng: 'en' }), catalogs.en.translation.restartCopy);
  assert.equal(i18n.t('restartCopy', { lng: 'fr' }), catalogs.en.translation.restartCopy);
});

test('Chinese UI literals have an English presentation or are language names', async () => {
  const componentSource = await readFile(new URL('../../src/components/resetRush/ResetRush.tsx', import.meta.url), 'utf8');
  const tree = ts.createSourceFile('ResetRush.tsx', componentSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const untranslated = [];
  const inspect = (node) => {
    let value;
    if (ts.isJsxText(node)) value = node.getText(tree).replace(/\s+/g, ' ').trim();
    if (ts.isStringLiteral(node)) value = node.text;
    if (value && value !== '简体中文' && hasChinese(value) && hasChinese(translateResetText(value, 'en'))) {
      untranslated.push(`${tree.getLineAndCharacterOfPosition(node.pos).line + 1}: ${value}`);
    }
    ts.forEachChild(node, inspect);
  };
  inspect(tree);
  assert.deepEqual(untranslated, []);
});

test('browser preference resolves Chinese and English while preserving Chinese saves', () => {
  assert.equal(browserLocale(['zh-CN', 'en-US']), 'zh');
  assert.equal(browserLocale(['en-US', 'zh-CN']), 'en');
  assert.equal(browserLocale(['fr-FR', 'zh-TW']), 'zh');
  assert.equal(browserLocale(['fr-FR']), 'en');
  assert.equal(translateResetText('只有一条命', 'zh'), '只有一条命');
  assert.equal(translateResetText('只有一条命', 'en'), 'One Life Only');
  assert.equal(translateResetText('你的开发履历', 'en'), 'Your portfolio');
});

test('composed studio risk and quality summaries translate each complete label', () => {
  for (const risk of ['摸底中 · 已留安全余量', '摸底中 · 可能返工', '0% / 20 进度']) {
    for (const quality of ['品质摸底中', '预计合格 · 基础收益', '预计精品 · 回款/声望 +40%']) {
      const text = ` ·《极简记账本》${risk} · ${quality} · 2 精力/对话/天`;
      assert.equal(hasChinese(translateResetText(text, 'en')), false, text);
    }
  }
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
