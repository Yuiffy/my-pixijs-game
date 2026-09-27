import test from 'node:test';
import assert from 'node:assert/strict';
import { loadTypescriptModule } from './helpers/load-typescript-module.mjs';
const E = await loadTypescriptModule('src/components/resetRush/engine.ts');
const slots = ['luna', 'sol', 'astra'];
const names = {
  2: ['GPT-5.6 Luna', 'GPT-5.6 Sol', 'GPT-6 Astra'],
  3: ['GPT-5.6 Luna', 'GPT-6 Sol', 'GPT-6 Astra'],
  4: ['GPT-6 Luna', 'GPT-6 Sol', 'GPT-6 Astra'],
  5: ['GPT-6 Luna', 'GPT-6 Sol', 'GPT-6.1 Astra · 虚构推演'],
};

test('short seasons start in the recent era; upgrades preserve free Luna and flag fictional futures', () => {
  for (const days of [21, 42]) {
    const g = E.createGame(55, days);
    assert.equal(g.platform.stage, 2);
    for (let stage = 2; stage <= 5; stage++) {
      g.platform.stage = stage;
      assert.deepEqual(slots.map(m => E.modelEdition(g, m).name), names[stage]);
      assert.equal(E.modelEdition(g, 'astra').fictional, stage === 5);
      assert.equal(E.developmentStats(g, g.players[0], { model: 'luna', effort: 'medium', turbo: false }).cost, 0);
      assert.doesNotMatch(JSON.stringify(E.textState(g)), /5\.0|GPT-4o|GPT-5 mini/);
    }
  }
});

test('seeded 21/42-day seasons have 14–28-day intervals, sometimes bundled, never a rushed release ladder', () => {
  const firstStages = new Set(), counts = new Set();
  let fictional = 0;
  for (const days of [21, 42]) for (let seed = 0; seed < 64; seed++) {
    let g = E.createGame(seed, days), last = 1;
    const announcements = [];
    while (g.phase !== 'over') {
      if (g.event.effect === 'technology') {
        assert.ok(g.day - last >= 14 && g.day - last <= 28);
        announcements.push({ day: g.day, stage: g.platform.stage }); last = g.day;
        if (announcements.length === 1) firstStages.add(g.platform.stage);
        if (g.platform.stage === 5) {
          fictional++;
          assert.ok(g.day >= 29); assert.equal(announcements.at(-2).stage, 4);
          assert.match(g.event.detail, /虚构未来/);
        }
      }
      assert.equal('nextRelease' in E.textState(g).platform, false);
      // Calendar-only simulation: skip work, preserving the real event/reveal pipeline.
      g.minute = 480;
      const restored = E.restoreGame(JSON.stringify(g)); assert.ok(restored);
      assert.deepEqual(E.nextDay(E.endDay(restored)), E.nextDay(E.endDay(g)));
      g = E.nextDay(E.endDay(g));
    }
    assert.ok(announcements.length <= (days === 21 ? 1 : 2));
    if (days === 42) { assert.ok(announcements.length >= 1); counts.add(announcements.length); }
  }
  assert.deepEqual([...firstStages].sort(), [3, 4]);
  assert.deepEqual([...counts].sort(), [1, 2]); assert.ok(fictional > 0);
});

test('legacy saves retain assets, simulation and current calibration, with a fresh minimum release interval', () => {
  const old = [
    ['5.0 Luna', '5.0 Sol', '5.0 Astra'], ['5.6 Luna', '5.0 Sol', '5.0 Astra'],
    ['5.6 Luna', '5.0 Sol', '5.0 Astra'], ['5.6 Luna', '6 Sol', '5.0 Astra'],
    ['6 Luna', '6 Sol', '5.0 Astra'], ['6 Luna', '6 Sol', '6 Astra'],
  ];
  for (let stage = 0; stage <= 5; stage++) {
    const g = E.createGame(77 + stage, 42); g.platform.stage = stage; delete g.modelRules;
    g.event = { ...E.EVENTS.find(e => e.id === 'tech-1'), title: '5.6 Luna 发布' };
    for (const p of g.players) for (let i = 0; i < slots.length; i++) p.experience[slots[i]] = { edition: old[stage][i], work: 60 };
    g.players[1].experience.luna = { edition: 'outdated-generation', work: 60 };
    g.logs = [{ day: 1, minute: 0, player: 0, text: '5.0 Luna / 5.6 Luna / 6 Luna / GPT-6 Astra' }];
    const restored = E.restoreGame(JSON.stringify(g)); assert.ok(restored);
    assert.equal(restored.platform.stage, Math.min(4, Math.max(2, stage)));
    assert.equal(restored.platform.nextRelease, g.day + 14);
    assert.equal(restored.rng, g.rng); assert.equal(restored.minute, g.minute);
    assert.equal(restored.event.chance, g.event.chance); assert.equal(restored.event.title, '模型时代已更新');
    assert.equal(restored.logs[0].text, 'GPT-5.6 Luna / GPT-5.6 Luna / GPT-6 Luna / GPT-6 Astra');
    for (let i = 0; i < g.players.length; i++) {
      const before = structuredClone(g.players[i]), after = structuredClone(restored.players[i]);
      delete before.experience; delete after.experience;
      for (const a of before.accounts) a.meter = null;
      assert.deepEqual(after, before);
    }
    for (const m of slots) assert.equal(E.modelExperience(restored, restored.players[0], m), 60);
    assert.equal(E.modelExperience(restored, restored.players[1], 'luna'), 0);
    assert.deepEqual(E.restoreGame(JSON.stringify(restored)), restored);
  }
});

test('only upgraded slots need recalibration; invalid model rule markers reject safely', () => {
  const g = E.createGame(55, 42);
  for (const m of slots) g.players[0].experience[m] = { edition: E.modelEdition(g, m).name, work: 60 };
  g.platform.stage = 3;
  assert.deepEqual(slots.map(m => E.modelExperience(g, g.players[0], m)), [60, 0, 60]);
  g.platform.stage = 4;
  assert.deepEqual(slots.map(m => E.modelExperience(g, g.players[0], m)), [0, 0, 60]);
  g.modelRules = 2; assert.equal(E.restoreGame(JSON.stringify(g)), null);
});
