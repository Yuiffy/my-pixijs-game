import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { loadTypescriptModule } from './helpers/load-typescript-module.mjs';

const { createGame, startGame, aiInput, prepareServe, stepGame, emptyInput, readAim, shotVector, CHARACTER_IDS,
  FLOOR, NET_X, NET_TOP, BALL_RADIUS, STEP } = await loadTypescriptModule('src/components/beachVolley/engine.ts');
const { selectCinematic, nextCinematic } = await loadTypescriptModule('src/components/beachVolley/cinematics.ts');
const media = JSON.parse(await readFile('public/games/beach-volley/media.json', 'utf8'));
const idle = () => [emptyInput(), emptyInput()];
const aimInput = (lift, depth, side) => ({ ...emptyInput(),
  aimUp: lift === 'lob', aimDown: lift === 'down',
  [side === 0 ? 'right' : 'left']: depth === 'deep',
  [side === 0 ? 'left' : 'right']: depth === 'near' });
function contact(side = 0, character = 'sui') {
  const g = createGame({ mode: 'local', character });
  g.phase = 'rally';
  g.players[side].x = side === 0 ? 450 : 830;
  g.players[side].y = 378;
  g.ball = { x: g.players[side].x, y: 260, vx: 0, vy: 100, spin: 0, lastHit: 1 - side, lock: 0, power: null };
  return g;
}

test('direction chord selects nine aims for either side, with down priority and neutral opposing keys', () => {
  for (const side of [0, 1]) for (const lift of ['lob', 'drive', 'down']) for (const depth of ['near', 'middle', 'deep']) {
    assert.deepEqual(readAim(aimInput(lift, depth, side), side), { lift, depth });
  }
  assert.deepEqual(readAim({ ...emptyInput(), left: true, right: true, jump: true }, 0), { lift: 'lob', depth: 'middle' });
  assert.equal(readAim({ ...emptyInput(), jump: true, aimUp: true, aimDown: true }, 0).lift, 'down');
});

test('actual nine directional contacts clear the net and land at near, middle or baseline, mirrored for 2P', () => {
  const traces = [];
  for (const side of [0, 1]) for (const depth of ['near', 'middle', 'deep']) {
    const arcs = [];
    for (const lift of ['lob', 'drive', 'down']) {
      const g = contact(side);
      const inputs = idle(); inputs[side] = { ...aimInput(lift, depth, side), hit: true };
      stepGame(g, inputs);
      assert.equal(g.ball.lastHit, side);
      assert.deepEqual(g.ball.shot, { lift, depth });
      assert.equal(g.hits[side], 1);
      // Isolate the launched ball from receivers to measure its real discrete path.
      g.players.forEach(p => { p.y = -4000; p.vy = 0; });
      let apex = g.ball.y, crossed = false, seconds = 0;
      while (g.phase === 'rally' && seconds < 3) {
        stepGame(g, idle()); seconds += STEP; apex = Math.min(apex, g.ball.y);
        if (side === 0 ? g.ball.x > NET_X : g.ball.x < NET_X) {
          crossed = true;
          assert.notEqual(g.event?.type, 'net');
        }
      }
      const target = NET_X + (side === 0 ? 1 : -1) * { near: 140, middle: 325, deep: 545 }[depth];
      assert.ok(crossed && g.phase === 'point', `${side}/${lift}/${depth} completes a shot`);
      assert.ok(Math.abs(g.ball.x - target) < 13, `${side}/${lift}/${depth}: landed ${g.ball.x}, target ${target}`);
      assert.equal(g.score[side], 1);
      arcs.push({ lift, seconds, apex, landing: g.ball.x });
    }
    assert.ok(arcs[0].apex + 60 < arcs[1].apex, 'lob is visibly higher');
    assert.ok(arcs[1].seconds > arcs[2].seconds + 0.1, 'down shot reaches sand sooner');
    traces.push({ side, depth, arcs });
  }
  console.log(JSON.stringify({ directionalShots: traces }));
});

test('buffered swing keeps its original aim after directions are released or changed', () => {
  const g = contact(); g.ball.x = 80; g.ball.y = 80;
  const inputs = idle(); inputs[0] = { ...aimInput('down', 'deep', 0), hit: true };
  stepGame(g, inputs);
  assert.equal(g.hits[0], 0);
  assert.deepEqual(g.players[0].shotAim, { lift: 'down', depth: 'deep' });
  g.ball.x = g.players[0].x; g.ball.y = g.players[0].y - 118; g.ball.vy = 100;
  inputs[0] = aimInput('lob', 'near', 0); stepGame(g, inputs);
  assert.deepEqual(g.players[0].aim, { lift: 'lob', depth: 'near' });
  assert.deepEqual(g.ball.shot, { lift: 'down', depth: 'deep' });
});

test('directional serves use current aim; specials retain character speed and lock their aim until contact', () => {
  for (const side of [0, 1]) {
    const g = createGame({ mode: 'local' }); g.server = side; prepareServe(g);
    const inputs = idle(); inputs[side] = { ...aimInput('lob', 'near', side), hit: true };
    stepGame(g, inputs);
    assert.equal(g.phase, 'rally'); assert.deepEqual(g.ball.shot, { lift: 'lob', depth: 'near' });
    assert.equal(Math.sign(g.ball.vx), side === 0 ? 1 : -1);
  }
  for (const character of CHARACTER_IDS) {
    const velocities = [];
    for (const depth of ['near', 'middle', 'deep']) {
      const g = contact(0, character); const inputs = idle(); g.players[0].energy = 100;
      inputs[0] = { ...aimInput('down', depth, 0), special: true }; stepGame(g, inputs);
      assert.deepEqual(g.ball.shot, { lift: 'down', depth });
      assert.equal(g.ball.power, character); assert.equal(g.players[0].energy, 0);
      velocities.push(g.specialWindup.vx);
    }
    assert.ok(velocities[0] < velocities[1] && velocities[1] < velocities[2]);
  }
  assert.ok(shotVector({ x: 450, y: 260 }, 0, { lift: 'drive', depth: 'middle' }, 'sui').vx >
    shotVector({ x: 450, y: 260 }, 0, { lift: 'drive', depth: 'middle' }, 'shiori').vx + 100);
});

test('unarmed auto receive preserves the forgiving neutral arc regardless of held aim', () => {
  const shots = [];
  for (const lift of ['lob', 'drive', 'down']) {
    const g = contact(); g.players[0].y = FLOOR; g.ball.y = FLOOR - 118;
    const inputs = idle(); inputs[0] = aimInput(lift, 'middle', 0); stepGame(g, inputs);
    assert.equal(g.hits[0], 1); assert.equal(g.ball.shot, undefined); shots.push([g.ball.vx, g.ball.vy]);
  }
  assert.deepEqual(shots[0], shots[1]); assert.deepEqual(shots[1], shots[2]);
});

test('cinematic selection follows actual characters and mode, safely bypassing missing media or reduced motion', () => {
  const g = createGame({ character: 'shiori', mode: 'local' }); g.score = [3, 5];
  for (const kind of ['intro', 'special', 'point', 'result']) {
    for (const side of [0, 1]) {
      const plan = selectCinematic(g, media, 'all', false, kind, side);
      assert.equal(plan.character, side === 0 ? 'shiori' : 'sui');
      if (kind !== 'intro') assert.ok(plan.src.includes(plan.character));
      assert.ok(plan.duration > 0 && plan.poster);
      assert.equal(selectCinematic(g, media, 'off', false, kind, side), null);
      assert.equal(selectCinematic(g, media, 'all', true, kind, side), null);
      assert.equal(selectCinematic(g, null, 'all', false, kind, side), null);
      assert.equal(!!selectCinematic(g, media, 'key', false, kind, side), kind !== 'point');
    }
  }
  assert.ok(selectCinematic(g, media, 'all', false, 'point', 1).line.includes('3 : 5'));
  assert.ok(media.characters.sui.result.win.duration > media.characters.sui.point.win.duration);
  assert.equal(selectCinematic(g, { ...media, characters: {} }, 'all', false, 'special'), null);
});

test('new roster combinations sequence the actual winner and loser, while only Sui/Shiori reuse paired footage', () => {
  for (const character of CHARACTER_IDS) for (const opponent of CHARACTER_IDS) {
    const g = createGame({ mode: 'local', character, opponent });
    assert.equal(g.players[0].character, character); assert.equal(g.players[1].character, opponent);
    for (const side of [0, 1]) for (const kind of ['point', 'result']) {
      const plan = selectCinematic(g, media, 'all', false, kind, side);
      assert.equal(plan.character, g.players[side].character); assert.equal(plan.outcome, 'win');
      const paired = character !== opponent && character !== 'nagisa' && opponent !== 'nagisa';
      assert.equal(plan.clips.length, paired ? 1 : 2);
      if (paired) assert.equal(nextCinematic(plan), null);
      else {
        const loser = nextCinematic(plan);
        assert.equal(loser.character, g.players[1-side].character); assert.equal(loser.outcome, 'lose');
        assert.ok(loser.src.includes(loser.character) && loser.src.includes('lose'));
        assert.notEqual(loser.id, plan.id); assert.equal(nextCinematic(loser), null);
      }
    }
    const intro = selectCinematic(g, media, 'all', false, 'intro');
    assert.equal(intro.clips.length, character !== opponent && ![character, opponent].includes('nagisa') ? 1 : 2);
  }
});

test('Nagisa can play on either side, uses a distinct charged shot, and seeded AI matches finish', () => {
  for (const side of [0, 1]) {
    const g = contact(side, side === 0 ? 'nagisa' : 'sui');
    if (side === 1) g.players[1].character = 'nagisa';
    g.players[side].energy = 100; const inputs = idle(); inputs[side].special = true;
    stepGame(g, inputs);
    assert.equal(g.ball.power, 'nagisa'); assert.equal(g.specials[side], 1);
    assert.ok(Math.abs(g.specialWindup.vx) > 765 && Math.abs(g.specialWindup.vx) < 980);
    assert.equal(g.players[side].energy, 0);
  }
  for (const [character, opponent] of [['sui', 'nagisa'], ['shiori', 'nagisa'], ['nagisa', 'sui'], ['nagisa', 'shiori'], ['nagisa', 'nagisa']]) for (const difficulty of ['easy', 'normal', 'hard']) for (const seed of [8121, 922]) {
    const g = createGame({ character, opponent, difficulty }, seed);
    startGame(g);
    for (let i=0; i<120*1200 && g.phase !== 'result'; i++) stepGame(g, [aiInput(g,0,STEP), emptyInput()]);
    assert.equal(g.phase, 'result', `${character}/${opponent}/${difficulty}/${seed} finishes`);
    assert.ok(g.hits[0]+g.hits[1]>10);
  }
});
