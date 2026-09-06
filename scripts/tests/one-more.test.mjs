import assert from 'node:assert/strict';
import test from 'node:test';
import { loadTypescriptModule } from './helpers/load-typescript-module.mjs';
import { playFight } from './helpers/one-more-pilot.mjs';

const { Sparring, MOVES, BOSSES, CHARMS, DIFFICULTIES, CONTENT_VERSION, readProgress, freshProgress, DEFAULT_BINDINGS, challengeUrl, parseChallenge } = await loadTypescriptModule('src/components/oneMoreGame/core.ts');
const fight = () => { const game = new Sparring(); game.start(); return game; };
const until = (game, predicate, limit = 40000) => {
  for (let ms = 0; !predicate(game.state) && ms < limit && game.state.phase === 'fight'; ms += 10) game.advance(10);
  assert.ok(predicate(game.state), JSON.stringify(game.snapshot()));
};
const beforeImpact = (game, move, margin = 80) => until(game, s => s.boss.mode === 'windup' && s.boss.move === move
  && MOVES[move].hits[s.boss.hitIndex] - s.boss.clock <= margin);

test('three unique bosses form a chapter with resumable intermissions and a complete ending', () => {
  let game = new Sparring();
  for (let index = 0; index < 3; index += 1) {
    game.start(); const result = playFight(game);
    assert.equal(result.phase, index === 2 ? 'ending' : 'won');
    assert.ok(result.stats.breaks > 0); assert.ok(result.stats.counters > 0);
    assert.equal(game.progress.campaign.cleared.length, index + 1);
    game = new Sparring(readProgress(JSON.stringify(game.progress)));
    assert.equal(game.state.phase, index === 2 ? 'ending' : 'won');
    assert.equal(game.bossDefinition.id, BOSSES[index].id);
    if (index < 2) { game.nextBoss(); assert.equal(game.state.phase, 'ready'); }
  }
  assert.equal(game.progress.chapterWins, 1);
  assert.equal(new Set(BOSSES.flatMap(boss => boss.moves)).size, 9);
  game.start(); game.nextBoss(); game.advance(60000);
  assert.equal(game.progress.chapterWins, 1); assert.equal(game.state.phase, 'ending');
  game.newChapter(17, 'rematch');
  assert.equal(game.state.phase, 'ready'); assert.equal(game.progress.campaign.cleared.length, 0);
  assert.equal(game.progress.chapterWins, 1); assert.equal(game.progress.campaign.seed, 17);
});

test('all difficulty levels and vows can complete all three fights through input alone', () => {
  for (const difficulty of Object.keys(DIFFICULTIES)) for (const vow of ['clear', 'combo', 'perfect']) {
    const game = new Sparring(); game.setDifficulty(difficulty); game.choose(vow);
    for (let index = 0; index < 3; index += 1) {
      game.start(); playFight(game);
      assert.ok(['won', 'ending'].includes(game.state.phase), `${difficulty}/${vow}/${index}`);
      assert.equal(game.vowMet, true, `${difficulty}/${vow}/${index}`);
      if (index < 2) game.nextBoss();
    }
  }
});

test('parry pauses an actual boss action and enables a stronger counterattack', () => {
  const game = fight(); beforeImpact(game, 'sweep');
  game.input('guard', true); until(game, s => s.stats.parries === 1);
  const t = game.state.t; const clock = game.state.boss.clock; const feedback = game.state.feedbackT;
  assert.equal(game.state.boss.mode, 'stagger'); assert.ok(game.state.boss.counterReady);
  game.advance(50);
  assert.equal(game.state.t, t); assert.equal(game.state.boss.clock, clock);
  assert.ok(game.state.feedbackT > feedback);
  game.input('guard', false); game.advance(50);
  const health = game.state.boss.spirit;
  game.input('attack', true); game.advance(180);
  assert.equal(game.state.stats.counters, 1);
  assert.ok(health - game.state.boss.spirit >= 10);
});

test('pressure break cancels queued blows and grants exactly one opening counter', () => {
  const game = fight(); beforeImpact(game, 'sweep');
  game.input('guard', true); game.advance(110); game.input('guard', false);
  for (let i = 0; i < 3; i += 1) {
    beforeImpact(game, 'triple'); game.input('guard', true); game.advance(115); game.input('guard', false);
  }
  assert.equal(game.state.stats.triple, true);
  assert.equal(game.state.stats.breaks, 1); assert.equal(game.state.boss.mode, 'broken');
  const hp = game.state.player.hp;
  game.advance(600); assert.equal(game.state.player.hp, hp);
  const health = game.state.boss.spirit;
  game.input('attack', true); game.advance(200);
  assert.equal(game.state.stats.counters, 1); assert.equal(health - game.state.boss.spirit, 19);
  game.input('attack', false); game.advance(1600);
  assert.notEqual(game.state.boss.mode, 'broken'); assert.ok(game.state.boss.poise < 100);
});

test('ordinary flinches preserve recovery progress and cannot create an infinite stun lock', () => {
  const game = fight(); beforeImpact(game, 'sweep'); game.input('guard', true); game.advance(110); game.input('guard', false);
  until(game, s => s.boss.mode === 'recover');
  const sequence = game.state.boss.sequence;
  game.input('attack', true); game.advance(5500);
  assert.ok(game.state.boss.sequence > sequence);
});

test('attacking a guarded front spends stamina and builds pressure instead of free health damage', () => {
  const game = fight(); until(game, s => s.boss.mode === 'windup');
  const stamina = game.state.player.stamina;
  game.input('attack', true); game.advance(180);
  assert.equal(game.state.boss.spirit, 100); assert.ok(game.state.boss.poise > 0);
  assert.equal(game.state.stats.blockedAttacks, 1); assert.ok(game.state.player.stamina < stamina);
});

test('walking cannot pass through the enemy, while facing updates only before the committed strike', () => {
  const game = fight(); game.input('right', true); game.advance(1300); game.input('right', false);
  assert.ok(game.state.player.x < game.state.boss.x);
  const b = game.state.boss; const p = game.state.player;
  b.mode = 'windup'; b.move = 'triple'; b.hitIndex = 0; b.clock = 930; b.facing = -1; b.x = 600; p.x = 720;
  game.advance(20); assert.equal(b.facing, -1, 'Committed attack should not snap around');
  b.clock = 200; game.advance(20); assert.equal(b.facing, 1, 'Next readable windup reacquires the player');
  p.x = 100; b.x = 150; game.input('left', true); game.advance(100);
  assert.ok(p.x >= 100, 'Body separation must not push the player past the wall');
});

test('low stamina blocks dodge but a precise parry can restore stamina', () => {
  const game = fight(); game.state.player.stamina = 2;
  game.input('dodge', true); assert.equal(game.state.player.dashAt, -10000); game.input('dodge', false);
  beforeImpact(game, 'sweep'); game.state.player.stamina = 2; game.state.player.exertionAt = game.state.t;
  game.input('guard', true); game.advance(110);
  assert.equal(game.state.stats.parries, 1); assert.ok(game.state.player.stamina >= 22);
});

test('holding guard cannot parry and heavy attacks retain a fixed dodgeable area', () => {
  const game = fight(); game.input('guard', true);
  until(game, s => s.boss.mode === 'recover' && s.boss.move === 'triple');
  assert.equal(game.state.stats.parries, 0); assert.equal(game.state.stats.guards, 4);
  beforeImpact(game, 'slam'); const target = game.state.boss.targetX; const hp = game.state.player.hp;
  game.advance(160); assert.equal(game.state.player.hp, hp - 1); assert.equal(game.state.boss.targetX, target);
});

test('targeted ground and leap attacks can be avoided through the visible dodge contract', () => {
  for (const move of ['slam', 'redCrash']) {
    const game = fight(); const b = game.state.boss;
    b.mode = 'windup'; b.move = move; b.clock = MOVES[move].hits[0] - 130; b.targetX = game.state.player.x;
    game.input('dodge', true); game.advance(180);
    assert.equal(game.state.player.hp, 5); assert.equal(b.targetX, 430);
  }
});

test('two representative attack/dodge/backstab policies lose while the counter strategy clears', () => {
  for (const seed of [7, 90601, 513089]) for (const style of ['spam', 'backstab']) {
    const game = new Sparring(); game.newChapter(seed); game.start(); playFight(game, style);
    assert.equal(game.state.phase, 'lost'); assert.ok(game.state.stats.blockedAttacks > 0);
    assert.equal(game.progress.campaign.cleared.length, 0);
  }
});

test('pause freezes stamina, combat and feedback; changing difficulty cannot affect an active attempt', () => {
  const game = fight(); game.input('attack', true); game.advance(700); game.pause('test');
  const snapshot = JSON.stringify(game.snapshot());
  game.advance(60000); game.input('dodge', true); game.setDifficulty('relaxed');
  assert.equal(JSON.stringify(game.snapshot()), snapshot);
  game.resume(); game.advance(100); assert.equal(game.state.phase, 'fight');
});

test('failure retries the same boss and seed; refresh preserves earlier victories', () => {
  let game = new Sparring(); game.start(); playFight(game); game.nextBoss(); game.start(); game.advance(60000);
  assert.equal(game.state.phase, 'lost'); const seed = game.progress.campaign.seed;
  game = new Sparring(readProgress(JSON.stringify(game.progress)));
  assert.equal(game.state.phase, 'ready'); assert.equal(game.progress.campaign.bossIndex, 1); assert.equal(game.progress.campaign.cleared.length, 1);
  game.start(); assert.equal(game.state.boss.spirit, BOSSES[1].health); assert.equal(game.state.player.hp, 5); assert.equal(game.state.player.stamina, 100);
  assert.equal(game.progress.campaign.seed, seed);
});

test('all four charms have their intended mechanical effects and lock after the first victory', () => {
  const wind = new Sparring(); wind.setCharm('wind'); wind.start(); assert.equal(wind.dodgeCost, 21);
  const breath = new Sparring(); breath.setCharm('breath'); breath.start(); breath.state.player.stamina = 10; breath.advance(1000);
  const normal = fight(); normal.state.player.stamina = 10; normal.advance(1000);
  assert.ok(breath.state.player.stamina > normal.state.player.stamina);
  const steady = new Sparring(); steady.setCharm('steady'); steady.start(); steady.input('guard', true); beforeImpact(steady, 'sweep'); steady.advance(110);
  const guarded = fight(); guarded.input('guard', true); beforeImpact(guarded, 'sweep'); guarded.advance(110);
  assert.ok(steady.state.player.stamina > guarded.state.player.stamina);
  const breaker = new Sparring(); breaker.setCharm('breaker'); breaker.start(); until(breaker, s => s.boss.mode === 'windup'); breaker.input('attack', true); breaker.advance(180);
  assert.ok(breaker.state.boss.poise > 4);
  const windHit = new Sparring(); windHit.setCharm('wind'); windHit.start(); windHit.state.boss.mode = 'recover';
  windHit.input('right', true); windHit.input('dodge', true); windHit.advance(310);
  windHit.input('right', false); windHit.input('dodge', false); windHit.input('attack', true); windHit.advance(200);
  assert.equal(windHit.state.boss.spirit, 94, 'A wind-charm dash empowers the next clean hit');
  const game = new Sparring(); game.setCharm('breath'); game.start(); playFight(game); game.nextBoss(); game.setCharm('wind');
  assert.equal(game.progress.charm, 'breath'); assert.equal(CHARMS.length, 5);
});

test('P0 storage migrates preferences without pretending one boss was a completed chapter', () => {
  const old = readProgress(JSON.stringify({ version: 1, attempts: 7, wins: 3, assist: true, muted: false, bindings: DEFAULT_BINDINGS }));
  assert.equal(old.version, 2); assert.equal(old.wins, 3); assert.equal(old.chapterWins, 0); assert.equal(old.campaign.bossIndex, 0);
  assert.deepEqual(old.difficulties, ['relaxed', 'relaxed', 'relaxed']); assert.equal(old.muted, false);
  assert.deepEqual(readProgress('{broken'), freshProgress());
  const game = new Sparring(old); game.setBinding('guard', 'KeyL'); game.setBinding('dodge', 'KeyL');
  assert.equal(game.progress.bindings.guard, 'Space'); assert.equal(new Set(Object.values(game.progress.bindings)).size, 6);
  assert.deepEqual(readProgress(JSON.stringify(game.progress)).bindings, game.progress.bindings);
});

test('share links round-trip the content version, seed, difficulty plan and charm', () => {
  const progress = freshProgress(); progress.campaign.seed = 41128; progress.difficulties = ['relaxed', 'standard', 'challenge']; progress.charm = 'breaker';
  const url = new URL(challengeUrl('https://example.com', progress)); const parsed = parseChallenge(url);
  assert.deepEqual(parsed, { revision: CONTENT_VERSION, seed: 41128, difficulties: progress.difficulties, charm: 'breaker' });
  const game = new Sparring(); game.loadChallenge(parsed); game.setDifficulty('standard');
  const restored = new Sparring(readProgress(JSON.stringify(game.progress)));
  assert.equal(restored.progress.campaign.challengeKey, JSON.stringify(parsed));
  assert.equal(restored.difficulty, 'standard');
  restored.newChapter(parsed.seed, 'rematch'); assert.equal(restored.progress.campaign.challengeKey, JSON.stringify(parsed));
  url.searchParams.set('rev', '0.1.0'); assert.equal(parseChallenge(url), null);
  for (const value of ['NaN', '-1', '4294967296']) { const invalid = new URL(challengeUrl('https://example.com', progress)); invalid.searchParams.set('seed', value); assert.equal(parseChallenge(invalid), null); }
});

test('corrupt or missing middle results cannot skip a chapter boss', () => {
  const game = new Sparring();
  for (let i = 0; i < 3; i += 1) { game.start(); playFight(game); if (i < 2) game.nextBoss(); }
  const data = structuredClone(game.progress); data.campaign.cleared[1].bossId = 'master';
  const progress = readProgress(JSON.stringify(data));
  assert.equal(progress.campaign.cleared.length, 1); assert.equal(progress.campaign.bossIndex, 1); assert.equal(progress.campaign.checkpoint, 'ready');
});

test('fixed steps preserve the same unattended fight at 30 and 120 fps', () => {
  const a = fight(); const b = fight();
  for (let i = 0; i < 1800; i += 1) a.advance(1000 / 30);
  for (let i = 0; i < 7200; i += 1) b.advance(1000 / 120);
  assert.equal(a.state.phase, 'lost'); assert.deepEqual(a.state.stats, b.state.stats); assert.equal(a.state.t, b.state.t);
});

const bossFight = index => { const progress = freshProgress(); progress.campaign.bossIndex = index; const game = new Sparring(progress); game.start(); return game; };

test('keeper bells travel before contact and a parry damages and staggers only when the bell returns', () => {
  const game = bossFight(1);
  until(game, s => s.projectiles.length === 1);
  assert.equal(game.state.player.hp, 5);
  const firstX = game.state.projectiles[0].x;
  game.advance(200); assert.ok(game.state.projectiles[0].x < firstX - 50);
  until(game, () => game.incomingBellMs < 80);
  assert.ok(game.parryWindowOpen);
  const health = game.state.boss.spirit;
  game.input('guard', true); until(game, s => s.stats.parries === 1); game.input('guard', false);
  assert.equal(game.state.boss.spirit, health);
  assert.notEqual(game.state.boss.mode, 'stagger');
  assert.equal(game.state.projectiles[0].reflected, true);
  until(game, s => s.boss.spirit < health);
  assert.equal(game.state.boss.spirit, health - 10);
  assert.equal(game.state.boss.mode, 'stagger');
  assert.equal(game.state.boss.poise, 25);
  assert.equal(game.state.projectiles.length, 0);
});

test('a held guard absorbs a travelling bell without reflecting it', () => {
  const game = bossFight(1); game.input('guard', true);
  until(game, s => s.stats.guards > 0);
  assert.equal(game.state.stats.parries, 0);
  assert.equal(game.state.player.hp, 5);
  assert.equal(game.state.projectiles.length, 0);
  assert.equal(game.state.boss.spirit, BOSSES[1].health);
});

test('keeper ward has two outside pulses and a stable safe center, unlike a targeted slam', () => {
  for (const position of [350, 640, 940]) {
    const game = bossFight(1); const b = game.state.boss;
    Object.assign(b, { mode: 'windup', move: 'bellCrash', clock: 2090, targetX: 640, x: 1100 });
    game.state.player.x = position; game.input('guard', true);
    game.advance(900);
    assert.equal(game.state.player.hp, position === 640 ? 5 : 3);
    assert.equal(b.hitIndex, 2); assert.equal(b.targetX, 640);
  }
});

test('master rush covers ground, passes the player, and visibly commits its destination', () => {
  const game = bossFight(2); const b = game.state.boss;
  Object.assign(b, { mode: 'windup', move: 'crossCut', clock: 640, x: 760 });
  game.advance(30); const destination = b.motionToX;
  assert.equal(destination, 330);
  game.input('right', true); until(game, s => s.boss.clock >= MOVES.crossCut.motion.end); game.input('right', false);
  assert.equal(b.motionToX, destination); assert.equal(b.x, destination);
  assert.ok(game.state.player.x > b.x + 100, 'Rush crosses the player instead of body-pushing them');
});

test('a timed parry stops the rush instead of allowing its motion or followup to continue', () => {
  const game = bossFight(2); const b = game.state.boss;
  Object.assign(b, { mode: 'windup', move: 'crossCut', clock: 640, x: 760 });
  game.advance(250); game.input('guard', true);
  until(game, s => s.stats.parries === 1); game.input('guard', false);
  const stoppedX = b.x;
  assert.equal(b.mode, 'stagger'); assert.equal(b.resumeMode, 'recover');
  assert.ok(stoppedX > b.motionToX + 50);
  game.advance(500); assert.equal(b.x, stoppedX); assert.equal(game.state.player.hp, 5);
});

test('master spin hits behind him while a committed coach slash does not', () => {
  for (const move of ['sweep', 'finalChain']) {
    const game = fight(); const b = game.state.boss;
    Object.assign(b, { mode: 'windup', move, clock: MOVES[move].hits[0] - 10, x: 600, facing: -1 });
    game.state.player.x = 720; game.advance(30);
    assert.equal(game.state.player.hp, move === 'finalChain' ? 4 : 5);
  }
});

test('leap leaves sword height and lands at its original marker, with a punishable recovery', () => {
  const game = bossFight(2); const b = game.state.boss;
  Object.assign(b, { mode: 'windup', move: 'redCrash', clock: 640, x: 760, targetX: 430 });
  until(game, s => s.boss.elevation > 150);
  game.state.player.x = b.x - 74;
  const health = b.spirit; const pressure = b.poise;
  game.input('attack', true); game.advance(180); game.input('attack', false);
  assert.equal(b.spirit, health); assert.equal(b.poise, pressure);
  assert.equal(game.state.events.at(-1).cue, 'whiff');
  game.input('right', true); until(game, s => s.boss.mode === 'recover'); game.input('right', false);
  assert.equal(b.x, 430); assert.ok(b.elevation < 1); assert.equal(b.targetX, 430); assert.ok(b.counterReady);
  assert.equal(game.state.player.hp, 5);
});

test('stamina denial survives combat feedback, is throttled, and clears after a successful action', () => {
  const game = fight(); const p = game.state.player;
  p.stamina = 0; p.exertionAt = game.state.t;
  game.input('attack', true); game.advance(300);
  assert.equal(game.snapshot().denial.reason, 'stamina'); assert.equal(game.snapshot().denial.action, 'attack');
  assert.equal(game.state.events.filter(event => event.cue === 'exhausted').length, 1);
  game.state.notice = '架势崩溃'; game.state.noticeUntil = game.state.t + 1000;
  assert.equal(game.snapshot().denial.reason, 'stamina');
  game.advance(700); assert.ok(p.attackAt > 0); assert.equal(game.snapshot().denial, null);
  game.input('attack', false); game.advance(500);
  p.stamina = 100; game.input('dodge', true); game.input('dodge', false); game.advance(50); game.input('dodge', true);
  assert.equal(game.snapshot().denial.reason, 'cooldown');
  game.input('dodge', false); game.advance(800); p.stamina = 1; p.exertionAt = game.state.t; game.input('dodge', true);
  assert.equal(game.snapshot().denial.reason, 'stamina'); assert.equal(game.snapshot().denial.cost, game.dodgeCost);
});
