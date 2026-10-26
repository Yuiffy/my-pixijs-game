import assert from 'node:assert/strict';
import test from 'node:test';
import { loadTypescriptModule } from './helpers/load-typescript-module.mjs';

const e = await loadTypescriptModule('src/components/remainingSeat/engine.ts');
const finishChapter = state => e.CHAPTERS[state.chapter].required.reduce((run, id) => e.choose(run, id, 'keep'), state);
const finalChapter = () => {
  let state = e.newGame();
  for (let chapter = 0; chapter < 2; chapter++) state = e.choose(finishChapter(state), 'door', 'next');
  return state;
};

test('a new night starts with a concrete lead and cannot skip through the locked door', () => {
  const state = e.newGame();
  assert.equal(e.ready(state), false);
  assert.match(e.objective(state), /信/);
  assert.deepEqual(e.inspect(state, 'door').choices.map(choice => choice.id), ['close']);
  assert.equal(e.choose(state, 'door', 'next'), state);
  assert.equal(e.choose(state, 'window', 'air'), state);
  assert.equal(e.choose(state, 'table', 'seat'), state);
});

test('each chapter requires all its clues and clears only current-room progress at the door', () => {
  let state = e.newGame();
  let memories = 0;
  for (let chapter = 0; chapter < 3; chapter++) {
    assert.equal(state.chapter, chapter);
    for (const [index, id] of e.CHAPTERS[chapter].required.entries()) {
      const before = structuredClone(state);
      const next = e.choose(state, id, 'keep');
      assert.deepEqual(state, before, 'actions must not mutate previous state or its journal');
      state = next;
      assert.equal(e.ready(state), index === 2);
      assert.equal(state.memories.length, ++memories);
    }
    if (chapter < 2) {
      assert.deepEqual(e.inspect(state, 'door').choices.map(choice => choice.id), ['next']);
      state = e.choose(state, 'door', 'next');
      assert.deepEqual(state.interacted, []);
      assert.equal(state.memories.length, memories, 'the journal survives a changed room');
    }
  }
  assert.equal(state.memories.length, 9);
  assert.deepEqual(e.inspect(state, 'door').choices.map(choice => choice.id), ['close']);
});

test('revisiting an object never duplicates a journal entry, but its next-chapter story is new', () => {
  let state = e.choose(e.newGame(), 'table', 'keep');
  assert.equal(e.choose(state, 'table', 'keep'), state);
  const first = state.memories[0];
  state = e.choose(finishChapter(state), 'door', 'next');
  state = e.choose(state, 'table', 'keep');
  assert.equal(state.memories.filter(memory => memory.object === 'table').length, 2);
  assert.notEqual(state.memories.at(-1).title, first.title);
  assert.notEqual(state.memories.at(-1).text, first.text);
});

test('optional objects can be read without satisfying a missing chapter clue', () => {
  let state = e.newGame();
  for (const id of ['desk', 'clock', 'cradle', 'window']) state = e.choose(state, id, 'keep');
  assert.equal(e.ready(state), false);
  assert.match(e.objective(state), /信/);
  assert.equal(e.choose(state, 'door', 'next'), state);
  state = finishChapter(state);
  assert.equal(e.ready(state), true);
  assert.equal(state.memories.length, 7);
});

test('both endings require the final clues, come from distinct objects, and freeze further actions', () => {
  const locked = finalChapter();
  assert.equal(e.choose(locked, 'window', 'air'), locked);
  assert.equal(e.choose(locked, 'table', 'seat'), locked);
  const unlocked = finishChapter(locked);
  assert.equal(e.choose(unlocked, 'table', 'air'), unlocked);
  assert.equal(e.choose(unlocked, 'window', 'seat'), unlocked);
  for (const [object, ending] of [['window', 'air'], ['table', 'seat']]) {
    const result = e.choose(unlocked, object, ending);
    assert.equal(result.ending, ending);
    assert.match(e.objective(result), /结束/);
    for (const id of Object.keys(e.OBJECT_NAMES)) {
      for (const choice of ['keep', 'next', 'air', 'seat', 'close']) assert.equal(e.choose(result, id, choice), result);
    }
    assert.deepEqual(e.restoreSave(JSON.stringify(result)), result);
    assert.ok(e.ENDINGS[ending].text.length >= 3);
  }
});

test('close, unknown choices and choices from another object cannot advance the story', () => {
  const state = finishChapter(e.newGame());
  for (const [object, choice] of [['letter', 'next'], ['door', 'keep'], ['clock', 'air'], ['portrait', 'unknown'], ['window', 'close']]) {
    assert.equal(e.choose(state, object, choice), state);
  }
});

test('valid progress survives save roundtrips at each chapter and every clue', () => {
  let state = e.newGame();
  for (let chapter = 0; chapter < 3; chapter++) {
    for (const id of e.CHAPTERS[chapter].required) {
      state = e.choose(state, id, 'keep');
      assert.deepEqual(e.restoreSave(JSON.stringify(state)), state);
    }
    if (chapter < 2) state = e.choose(state, 'door', 'next');
  }
  assert.deepEqual(e.restoreSave(JSON.stringify({ ...state, interacted: [...state.interacted, state.interacted[0]] })).interacted, state.interacted);
});

test('corrupt, oversized and impossible ending saves are rejected instead of crashing boot', () => {
  const valid = e.newGame();
  const corrupt = [null, '', '{', 'null', '[]', '{}', 'false',
    ...[
      { version: 2 }, { chapter: -1 }, { chapter: 3 }, { chapter: '0' }, { ending: 'other' },
      { ending: 'air' }, { chapter: 2, ending: 'seat' },
      { interacted: null }, { interacted: ['unseen'] }, { interacted: Array(9).fill('letter') },
      { memories: null }, { memories: [null] }, { memories: Array(25).fill({ chapter: 0, object: 'letter', title: '', text: '' }) },
      { memories: [{ chapter: 3, object: 'letter', title: '', text: '' }] },
      { memories: [{ chapter: 0, object: 'letter', title: 5, text: '' }] },
      { memories: [{ chapter: 0, object: 'letter', title: '', text: 'x'.repeat(4000) }] },
    ].map(patch => JSON.stringify({ ...valid, ...patch }))];
  for (const raw of corrupt) assert.equal(e.restoreSave(raw), null, String(raw).slice(0, 100));
});
