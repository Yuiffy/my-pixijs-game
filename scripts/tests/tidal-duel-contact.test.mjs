import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { loadTypescriptModule } from './helpers/load-typescript-module.mjs';
const E = await loadTypescriptModule('src/components/tidalDuel/engine.ts');
const R = await loadTypescriptModule('src/components/tidalDuel/roster.ts');
const C = await loadTypescriptModule('src/components/tidalDuel/collision.ts');
const A = await loadTypescriptModule('src/components/tidalDuel/animation.ts');
const actors = R.FIGHTERS.map(f => f.id);
const input = a => ({ ...E.emptyInput(), ...a });
function match(character = 'sui', opponent = character, gap = 109) {
  const g = E.createGame({ mode: 'local', character, opponent });
  E.startGame(g); E.skipTransition(g); g.events = [];
  g.fighters[0].x = 400; g.fighters[1].x = 400 + gap;
  return g;
}
function ticks(g, a = {}, b = {}, count = 1) {
  for (let i = 0; i < count; i++) E.stepGame(g, [input(a), input(b)]);
}
function active(g, side, id = 'punch', extra = {}) {
  const f = g.fighters[side], m = R.getFighter(f.character).moves[id];
  Object.assign(f, { state: 'attack', move: id, moveTime: m.startup,
    stateDuration: m.startup + m.active + m.recovery, moveHit: false, contact: 'none', ...extra });
  return f;
}
function wave(g, side = 0, patch = {}) {
  const target = g.fighters[1 - side];
  const p = { id: 999, side, sourceSide: side, sourceCharacter: 'shiori', reflections: 0,
    move: 'signature', serial: 12, x: target.x, y: target.y - 225,
    velocity: side ? -640 : 640, radius: 35, ttl: 1, ...patch };
  g.projectiles.push(p); return p;
}

test('all 168 canonical contours have verified sources, binary-grid geometry and bounded complexity', async () => {
  const j = JSON.parse(await readFile('public/games/tidal-duel/pixel/collision-contours.json', 'utf8'));
  assert.equal(j.cell, 8); assert.deepEqual(j.anchor, A.SPRITE_LAYOUT.anchor);
  let count = 0;
  for (const actor of actors) for (const [sheet, frames] of Object.entries(j.characters[actor])) {
    assert.equal(frames.length, sheet === 'combat' ? 24 : 16);
    for (const frame of frames) {
      count++; assert.ok(frame.hurt.length > 0 && frame.hurt.length <= 32);
      for (const rect of [...frame.hurt, ...frame.strike]) {
        assert.ok(rect.every(n => Number.isInteger(n) && n % 8 === 0));
        const [x,y,w,h] = rect;
        assert.ok(x >= 0 && y >= 0 && w > 0 && h > 0 && x + w <= 448 && y + h <= 448);
      }
    }
  }
  assert.equal(count, 168);
  for (const source of j.sources) {
    const bytes = await readFile(`public/games/tidal-duel/pixel/${source.file}`);
    assert.equal(createHash('sha256').update(bytes).digest('hex'), source.sha256);
  }
});

test('facing mirrors every segment; costumes keep the same rules and art clock', () => {
  for (const actor of actors) for (const id of Object.keys(R.getFighter(actor).moves)) {
    const g = match(actor), f = active(g, 0, id), right = E.fighterBoxes(f);
    for (const skin of R.getFighter(actor).skins) {
      f.skin = skin.id; assert.deepEqual(E.fighterBoxes(f), right);
    }
    f.facing = -1;
    const left = E.fighterBoxes(f);
    for (const key of ['hurt','strikes']) right[key].forEach((b,i) => {
      assert.equal(left[key][i].x, 2 * f.x - b.x - b.w);
      assert.equal(left[key][i].y, b.y); assert.equal(left[key][i].w, b.w);
    });
    assert.deepEqual(left.pose, A.pixelFrame(f));
  }
});

test('body contours exclude the rear hair and cat hat and move with crouch/air reactions', () => {
  const g = match(), f = g.fighters[0];
  let boxes = E.fighterBoxes(f);
  assert.ok(boxes.hurt.length > 3);
  const point = (x,y) => ({ x: f.x + (x - 224) * 2, y: f.y + (y - 440) * 2, w: 1, h: 1 });
  for (const p of [point(158,290),point(244,250)]) assert.equal(boxes.hurt.some(b => E.intersects(b,p)),false);
  assert.ok(boxes.hurt.some(b => E.intersects(b,point(234,310))));
  f.state = 'crouch'; f.stateTime = .2;
  const crouchTop = Math.min(...E.fighterBoxes(f).hurt.map(b => b.y));
  assert.ok(crouchTop > Math.min(...boxes.hurt.map(b => b.y)) + 100);
  f.state = 'jump'; f.y -= 130;
  boxes = E.fighterBoxes(f); assert.deepEqual(boxes.pose, A.pixelFrame(f));
});

test('same-tick strikes trade with snapshot counter damage, in both slots including a double KO', () => {
  for (const actor of actors) for (const reverse of [false,true]) {
    const g = match(actor, 'shiori');
    if (reverse) g.fighters.reverse().forEach((f,i) => { f.side = i; f.facing = i ? -1 : 1; f.x = 400 + i * 109; });
    g.fighters.forEach((f,side) => active(g,side));
    ticks(g);
    assert.equal(g.events.filter(e => e.type === 'hit').length,2);
    for (const f of g.fighters) {
      const source = R.getFighter(g.fighters[1 - f.side].character);
      assert.equal(f.hp, 300 - Math.round(source.moves.punch.damage * source.power * 1.2));
      assert.equal(f.state,'hit');
    }
    const ko = match(actor); ko.fighters.forEach((f,side) => { active(ko,side); f.hp = 1; });
    ticks(ko); assert.equal(ko.phase,'roundEnd'); assert.equal(ko.winner,null);
    assert.deepEqual(ko.fighters.map(f => f.hp), [0,0]);
  }
});

test('distal-only fists clash once, freeze, recover symmetrically and cannot confirm a paid cancel', () => {
  for (const [actor,gap] of [['sui',370],['shiori',410],['mizuki',330]]) {
    const g = match(actor, actor, gap);
    g.fighters.forEach((f,i) => { active(g,i); f.meter = 100; });
    ticks(g); assert.equal(g.events.filter(e => e.type === 'clash').length,1);
    assert.deepEqual(g.fighters.map(f => f.hp),[300,300]);
    assert.ok(g.fighters.every(f => f.state === 'clash' && f.contact === 'none'));
    const times = g.fighters.map(f => f.moveTime);
    ticks(g,{sidestep:true},{sidestep:true},4);
    assert.deepEqual(g.fighters.map(f => f.moveTime),times);
    assert.ok(g.fighters.every(f => f.meter === 100));
    ticks(g,{}, {},40); assert.ok(g.fighters.every(f => f.state === 'idle' && f.move === null));
    assert.equal(g.events.filter(e => e.type === 'clash').length,1);
  }
  const empty = match('sui','sui',450); active(empty,0); active(empty,1); ticks(empty);
  assert.equal(empty.events.length,0,'transparent gap cannot clash');
  const stepped = match('sui','sui',370); active(stepped,0); active(stepped,1);
  stepped.fighters[1].z = .8; ticks(stepped);
  assert.equal(stepped.events.length,0,'separate side-step lanes do not clash');
});

test('heavy does not automatically beat light; real body connections retain both hit intents', () => {
  for (const side of [0,1]) {
    const g = match(); active(g,side,'kick'); active(g,1-side,'punch'); ticks(g);
    assert.equal(g.events.filter(e => e.type === 'hit').length,2);
    assert.equal(g.events.some(e => e.type === 'clash'),false);
  }
});

test('fresh relative back within three frames gives exact defense on either side', () => {
  for (const side of [0,1]) for (const id of ['punch','lowKick','super']) {
    const g = match(); active(g,1-side,id);
    const f = g.fighters[side]; f.guardGauge = 5; f.guardDelay = 1;
    const back = side ? 'right' : 'left', defense = { [back]:true, crouch:id === 'lowKick' };
    ticks(g, side ? {} : defense, side ? defense : {});
    assert.equal(f.hp,300); assert.equal(f.guardGauge,5);
    assert.equal(f.stun,6/60); assert.equal(f.perfectGuard,0);
    assert.ok(g.events.some(e => e.type === 'perfectGuard' && e.side === side));
    assert.equal(g.fighters[1-side].contact,'block');
  }
});

test('late, held, wrong-height, airborne and facing-flip defense cannot become an automatic perfect guard', () => {
  const early = match(); ticks(early,{}, {right:true},8); active(early,0,'super'); ticks(early,{}, {right:true});
  assert.equal(early.fighters[1].hp,292); assert.equal(early.events.some(e => e.type === 'perfectGuard'),false);
  const held = match(); held.fighters[1].previous.right = true; active(held,0); ticks(held,{}, {right:true});
  assert.equal(held.events.at(-1).type,'block');
  const wrong = match(); active(wrong,0,'lowKick'); ticks(wrong,{}, {right:true}); assert.ok(wrong.fighters[1].hp < 300);
  const flip = match(); flip.fighters[1].previous.right = true; flip.fighters[1].facing = -1;
  ticks(flip,{}, {right:true}); assert.equal(flip.fighters[1].perfectGuard,0);
  const air = match(); Object.assign(air.fighters[1],{state:'jump',y:500,vy:-100});
  ticks(air,{}, {right:true}); assert.equal(air.fighters[1].perfectGuard,0);
});

test('perfect guard window survives hitstop but cannot be rearmed by repeated tapping', () => {
  const g = match(); g.freeze = .1; ticks(g,{}, {right:true});
  const window = g.fighters[1].perfectGuard;
  ticks(g,{}, {right:true},5); assert.equal(g.fighters[1].perfectGuard,window);
  g.freeze = 0; active(g,0); ticks(g,{}, {right:true});
  assert.equal(g.events.at(-1).type,'perfectGuard');
  ticks(g,{}, {},1); ticks(g,{}, {right:true}); assert.equal(g.fighters[1].perfectGuard,0);
});

test('early mid hold reflects once; later or already-returned waves are dispelled, wrong heights get hit', () => {
  for (const side of [0,1]) for (const [age,returned,expected] of [[0,0,'reflect'],[E.REFLECT_WINDOW-E.STEP,0,'reflect'],[E.REFLECT_WINDOW,0,'hold'],[.1,0,'hold'],[0,1,'hold']]) {
    const g = match('shiori','sui',400), defender = g.fighters[1-side];
    Object.assign(defender,{state:'hold',stateTime:age,stateDuration:.5,holdHeight:'mid'});
    const p = wave(g,side,{reflections:returned}); ticks(g);
    assert.equal(g.events.at(-1).type,expected);
    assert.equal(defender.hp,300);
    if (expected === 'reflect') {
      assert.equal(p.side,defender.side); assert.equal(p.reflections,1);
      assert.equal(Math.sign(p.velocity),defender.facing);
      assert.equal(p.sourceCharacter,'shiori'); assert.equal(p.sourceSide,side);
      assert.ok(p.ttl < 1 && p.ttl > .9);
    } else assert.equal(g.projectiles.length,0);
  }
  const wrong = match(); Object.assign(wrong.fighters[1],{state:'hold',stateDuration:.5,holdHeight:'high'}); wave(wrong); ticks(wrong);
  assert.ok(wrong.fighters[1].hp < 300); assert.equal(wrong.events.at(-1).type,'hit');
});

test('returning a wave preserves original damage, credits the new owner, and cannot confirm their unrelated attack', () => {
  const g = match('shiori','mizuki',400); const d = g.fighters[1];
  Object.assign(d,{state:'hold',stateDuration:.5,holdHeight:'mid'});
  const p = wave(g); ticks(g); assert.equal(p.side,1);
  g.freeze = 0; active(g,1,'punch');
  p.x = g.fighters[0].x; p.y = g.fighters[0].y - 225;
  ticks(g); assert.equal(g.projectiles.length,0);
  const original = R.getFighter('shiori');
  assert.equal(g.fighters[0].hp,300-Math.round(original.moves.signature.damage * original.power));
  assert.equal(d.contact,'none'); assert.equal(d.move,'punch'); assert.equal(d.combo,1);
  assert.equal(g.events.at(-1).side,1);
});

test('ordinary strikes never reflect waves; precise defense blocks a wave without changing its owner', () => {
  const attack = match('sui','shiori',400); active(attack,1); wave(attack); ticks(attack);
  assert.ok(attack.fighters[1].hp < 300); assert.equal(attack.events.some(e => e.type === 'reflect'),false);
  const defense = match('shiori','sui',400); wave(defense); ticks(defense,{}, {right:true});
  assert.equal(defense.events.at(-1).type,'perfectGuard'); assert.equal(defense.projectiles.length,0);
  assert.equal(defense.fighters[1].hp,300); assert.equal(defense.fighters[1].guardGauge,100);
});

test('opposing waves cancel by two-dimensional distance, and circle corners do not hit empty body space', () => {
  const g = match('shiori','shiori',800);
  wave(g,0,{x:800,y:400}); wave(g,1,{x:802,y:400}); ticks(g);
  assert.equal(g.projectiles.length,0); assert.equal(g.events.at(-1).type,'clash');
  const separated = match('shiori','shiori',800);
  wave(separated,0,{x:800,y:200}); wave(separated,1,{x:802,y:400}); ticks(separated);
  assert.equal(separated.projectiles.length,2);
  assert.equal(C.circleIntersects({x:0,y:0,radius:10},{x:9,y:9,w:10,h:10}),false);
  assert.equal(C.circleIntersects({x:0,y:0,radius:10},{x:5,y:5,w:10,h:10}),true);
});

test('box transforms avoid image reads and remain within a modest simulation budget', () => {
  const g = match('mizuki','shiori',400); active(g,0,'airHeavy'); active(g,1,'kick');
  const start = performance.now(); let segments = 0;
  for (let i = 0; i < 20000; i++) {
    const b = E.fighterBoxes(g.fighters[i%2]); segments += b.hurt.length;
  }
  assert.ok(segments > 100000);
  assert.ok(performance.now() - start < 2500, '20,000 pure contour transforms fit in 2.5 seconds on this host');
});
