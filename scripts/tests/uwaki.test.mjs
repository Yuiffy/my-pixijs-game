import assert from 'node:assert/strict';
import test from 'node:test';
import { loadTypescriptModule } from './helpers/load-typescript-module.mjs';

const { calculate, parseSession, emptySession, QUESTIONS } = await loadTypescriptModule('src/components/uwaki/questions.ts');

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
