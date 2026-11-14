import assert from 'node:assert/strict';
import test from 'node:test';
import { loadTypescriptModule } from './helpers/load-typescript-module.mjs';

const { calculate, parseSession, emptySession, QUESTIONS } = await loadTypescriptModule('src/components/uwaki/questions.ts');
const { QUESTIONNAIRES, storageKey } = await loadTypescriptModule('src/components/uwaki/questionnaires.ts');
const { emptyIdeal, parseIdeal, idealBudget, validIdeal, idealSummary } = await loadTypescriptModule('src/components/uwaki/ideal.ts');

test('questionnaires use independent storage and count-aware validation, retaining the legacy save', () => {
  assert.equal(storageKey('boundary'), 'love-boundary-zh-v1');
  assert.equal(new Set(['boundary', 'heavy', 'dependence', 'ideal'].map(storageKey)).size, 4);
  assert.deepEqual(QUESTIONNAIRES.map(q => q.questions.length), [40, 30, 30]);
  for (const q of QUESTIONNAIRES.slice(1)) {
    const finished = { step: 31, answers: Array(30).fill(1), reflection: null, notes: '自己的补充' };
    assert.deepEqual(parseSession(JSON.stringify(finished), 30, false), finished);
    assert.equal(parseSession(JSON.stringify({ ...finished, answers: [null, ...Array(29).fill(1)] }), 30, false).step, 0);
    assert.deepEqual(parseSession(JSON.stringify(finished)), emptySession());
    assert.equal(q.labels.length, 3);
  }
});

test('ideal creator validates allocation, unique drawbacks, preference ranges and skill budgets', () => {
  const valid = { ...emptyIdeal(), step: 4, abilities: [6, 5, 4, 3, 3, 2, 2], preferences: [0, 1, 3, 3, 3, 3, 3], debuffs: [0, 8, 16], skills: [0, 1], notes: '理想中的人' };
  assert.equal(validIdeal(valid), true);
  assert.equal(idealBudget(valid), 0);
  assert.deepEqual(parseIdeal(JSON.stringify(valid)), valid);
  assert.match(idealSummary(valid), /情绪察觉/);
  assert.equal(parseIdeal(JSON.stringify({ ...valid, abilities: Array(7).fill(1) })).step, 0);
  for (const bad of [{ ...valid, skills: [14] }, { ...valid, debuffs: [0, 0, 0] }, { ...valid, preferences: [9, 1, 1, 1, 1, 1, 1] }, { ...valid, abilities: [-1, 6, 4, 4, 4, 4, 4] }, { ...valid, skills: [-1] }, { ...valid, notes: 42 }]) {
    assert.deepEqual(parseIdeal(JSON.stringify(bad)), emptyIdeal());
  }
});

test('all original score boundaries map to the four expected types', () => {
  assert.equal(QUESTIONS.length, 40);
  for (const [score, name] of [[0, '松弛信任派'], [15, '松弛信任派'], [16, '平衡边界派'], [35, '平衡边界派'], [36, '有点在意派'], [55, '有点在意派'], [56, '坚定守线派'], [80, '坚定守线派']]) {
    const answers = Array.from({ length: 40 }, (_, i) => i < Math.floor(score / 2) ? 0 : i === Math.floor(score / 2) && score % 2 ? 1 : 2);
    const result = calculate(answers);
    assert.equal(result.score, score);
    assert.equal(result.type.name, name);
    assert.equal(result.counts.reduce((a, b) => a + b), 40);
  }
});

test('invalid storage is reset and incomplete sessions cannot reveal results', () => {
  for (const raw of ['invalid', 'null', '{}', '{"answers":[]}', JSON.stringify({ ...emptySession(), step: 99 }), JSON.stringify({ ...emptySession(), answers: Array(40).fill('0') })]) {
    assert.deepEqual(parseSession(raw), emptySession());
  }
  assert.equal(parseSession(JSON.stringify({ ...emptySession(), step: 41 })).step, 0);
  assert.equal(parseSession(JSON.stringify({ step: 41, answers: Array(40).fill(0), reflection: null })).step, 40);
  const completed = { step: 41, answers: Array(40).fill(2), reflection: false };
  assert.deepEqual(parseSession(JSON.stringify(completed)), completed);
});
