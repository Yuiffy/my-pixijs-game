import assert from 'node:assert/strict';
import test from 'node:test';
import { loadTypescriptModule } from './helpers/load-typescript-module.mjs';

const ai = await loadTypescriptModule('src/components/miniGames/agiEngine.ts');
const race = await loadTypescriptModule('src/components/miniGames/agiRace.ts');
const fresh = () => ai.createAi(42, 'efficient', 'deepseek', 'standard');

test('race ranks every company by internal capability with stable shared ranks', () => {
  const game = fresh();
  game.capability = 50;
  game.rivals.forEach(rival => { rival.capability = 10; });
  game.rivals[0].capability = 50;
  game.rivals[1].capability = 40;
  game.rivals[2].product = 100;
  const report = race.getAiRaceReport(game);
  assert.equal(report.rows.length, 11);
  assert.deepEqual(report.rows.slice(0, 3).map(row => row.rank), [1, 1, 3]);
  assert.equal(report.leader, report.player);
  assert.equal(report.rows[1].company, game.rivals[0].company);
  assert.equal(report.rows[3].company, game.rivals[2].company, 'Published product does not determine the research rank');
  assert.match(report.headline, /并列领跑/);
});

test('race gives the player a truthful lead or deficit including decimal capability', () => {
  const game = fresh();
  game.capability = 66.8;
  game.rivals.forEach(rival => { rival.capability = 30; });
  assert.match(race.getAiRaceReport(game).headline, /你领跑 · 领先第二名 36.8/);
  game.rivals[0].capability = 70.2;
  game.rivals[1].capability = 70.2;
  const report = race.getAiRaceReport(game);
  assert.equal(report.player.rank, 3);
  assert.match(report.headline, /并列领先 · 你落后 3.4/);
});

test('threat uses all four thresholds and can differ from the capability leader', () => {
  const game = fresh();
  Object.assign(game.rivals[0], { capability: 100, compute: 5, reliability: 90, safety: 10 });
  Object.assign(game.rivals[1], { capability: 92, compute: 5, reliability: 70, safety: 40 });
  const report = race.getAiRaceReport(game);
  assert.equal(report.leader.company, game.rivals[0].company);
  assert.equal(report.leader.stage, 'building');
  assert.equal(report.leader.launchReady, false);
  assert.equal(report.threat.company, game.rivals[1].company);
  assert.equal(report.threat.stage, 'near');
  assert.match(report.detail, /接近 AGI/);
  assert.match(report.detail, /自研能力差 8（92\/100）/);
  assert.equal(report.threat.progress, 98);
  assert.deepEqual(report.leader.requirements.map(target => target.required), [100, 5, 70, 40]);
});

test('near warning requires capability, compute, reliability and safety to be close', () => {
  const game = fresh();
  const rival = game.rivals[0];
  const near = { capability: 80, compute: 4, reliability: 60, safety: 30 };
  Object.assign(rival, near);
  const row = () => race.getAiRaceReport(game).rows.find(row => row.company === rival.company);
  assert.equal(row().stage, 'near');
  assert.equal(row().missing.length, 4);
  for (const key of Object.keys(near)) {
    Object.assign(rival, near, { [key]: near[key] - 1 });
    assert.equal(row().stage, 'building', key);
  }
});

test('a fully qualified rival is clearly ready without an invented quarter countdown', () => {
  const game = fresh();
  Object.assign(game.rivals[0], { capability: 100, compute: 5, reliability: 70, safety: 40, cash: 0 });
  const report = race.getAiRaceReport(game);
  assert.equal(report.threat.stage, 'ready');
  assert.equal(report.threat.launchReady, true);
  assert.equal(report.threat.progress, 100);
  assert.deepEqual(report.threat.missing, []);
  assert.match(report.detail, /可冲线/);
  assert.doesNotMatch(report.detail, /还剩.*季|必定|下一季.*赢/);
});

test('player unsafe launch remains possible and is not falsely presented as a safe AGI', () => {
  const game = fresh();
  Object.assign(game, { capability: 100, compute: 5, safety: 20 });
  game.industry.reliability = 70;
  const report = race.getAiRaceReport(game);
  assert.equal(report.player.launchReady, true);
  assert.equal(report.player.stage, 'building');
  assert.match(report.player.gapText, /安全差 20/);
  assert.match(report.detail, /仍可冒险启动/);
  assert.match(report.detail, /失控结局/);
});

test('finished races report final standings instead of an impending opponent turn', () => {
  const game = fresh();
  Object.assign(game.rivals[0], { capability: 100, compute: 5, reliability: 70, safety: 40 });
  game.ending = { title: '结束', text: '终局', won: false };
  const report = race.getAiRaceReport(game);
  assert.match(report.detail, /竞赛已结束/);
  assert.doesNotMatch(report.detail, /可冲线|下一季|正在冲刺/);
});

test('race snapshots neither mutate saves nor consume random state', () => {
  const game = fresh();
  const before = structuredClone(game);
  const freeze = object => {
    Object.freeze(object);
    Object.values(object).forEach(value => { if (value && typeof value === 'object') freeze(value); });
  };
  freeze(game);
  const first = race.getAiRaceReport(game);
  assert.deepEqual(race.getAiRaceReport(game), first);
  assert.deepEqual(game, before);
});
