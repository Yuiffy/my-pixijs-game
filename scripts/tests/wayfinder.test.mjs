import assert from 'node:assert/strict';
import test from 'node:test';
import { loadTypescriptModule } from './helpers/load-typescript-module.mjs';

const E = await loadTypescriptModule('src/components/wayfinder/engine.ts');
const W = await loadTypescriptModule('src/components/wayfinder/world.ts');
const { MISSIONS } = await loadTypescriptModule('src/components/wayfinder/content.ts');
const zero = { forward: 0, right: 0, turn: 0 };
function face(g, target) {
  for (let i = 0; i < 8; i++) {
    const delta = ((target - g.player.yaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
    if (Math.abs(delta) < 1e-7) return;
    E.look(g, delta);
  }
}
function walk(g, node) {
  const n = g.world.nodes[node];
  if (n.floor !== g.player.floor) {
    assert.ok(E.takeStairs(g));
    for (let i = 0; i < 10 && g.transition; i++) E.stepGame(g, 200, zero);
    assert.equal(g.player.floor, n.floor); return;
  }
  for (let i = 0; i < 3000 && W.distance(g.player, n) > 0.025; i++) {
    face(g, W.bearing(g.player, n));
    E.stepGame(g, Math.min(50, W.distance(g.player, n) / (g.comfort ? 4.5 : 6.3) * 1000), { ...zero, forward: 1 });
    assert.ok(W.walkable(g.world, g.player.x, g.player.z, g.player.floor, g.blocked));
  }
  assert.ok(W.distance(g.player, n) < 0.03, `Cannot reach node ${node}, ${JSON.stringify(g.player)}`);
}
function travel(g, to) {
  const path = W.route(g.world, W.nearestNode(g.world, g.player).id, to, g.bridgeEvent ? [...g.blocked,g.bridgeEvent.edge] : g.blocked);
  assert.ok(path.length); path.forEach(id => walk(g, id));
}
function deliver(g, correct = true) {
  travel(g, E.targetPlace(g).node); assert.ok(E.interact(g)); assert.equal(g.mode, 'bearing');
  const angle = W.wrap(W.bearing(g.player, W.placeNode(g.world, 'post')) - g.player.yaw);
  E.answerBearing(g, correct ? Math.round(angle / (Math.PI / 4)) % 8 : null);
  E.leaveBearing(g); assert.equal(g.phase, 'home');
  travel(g, g.world.start); assert.ok(E.interact(g)); assert.equal(g.mode, 'result');
}
function fresh(mission = 0) { const g = E.createGame(); g.unlocked = mission; E.startMission(g, mission); E.beginWalk(g); return g; }

test('eight letters complete by legal walking, both floors, winding cave loops and the other staircase', () => {
  const g = E.createGame(); let floors = new Set();
  for (let i = 0; i < MISSIONS.length; i++) {
    assert.ok(E.startMission(g, i)); E.beginWalk(g);
    assert.equal(E.interact(g), true); // Starting post has an optional visit, never a remote delivery.
    assert.equal(g.phase, 'outbound');
    travel(g, E.targetPlace(g).node);
    const stair = g.lastStair; assert.ok(E.interact(g));
    if (i === 2) { assert.equal(g.bridgeEvent.stage,'armed'); assert.equal(g.blocked.length,0); }
    if (i === 4) { assert.equal(g.blocked.length, 1); assert.ok(W.route(g.world, W.nearestNode(g.world, g.player).id, g.world.start, g.blocked).length); }
    if (i === 4) assert.ok(g.blocked.includes(stair));
    E.answerBearing(g, i % 2 === 0 ? 3 : null); E.leaveBearing(g);
    travel(g, g.world.start); E.interact(g);
    assert.equal(g.mode, 'result'); assert.equal(g.records.length, i + 1);
    if (i === 4) assert.notEqual(g.lastStair, stair);
    g.trace.forEach(p => floors.add(p.floor));
    assert.ok(g.stats.distance > 25); assert.ok(g.stats.optimal > 0);
    const last = E.saveGame(g); E.interact(g); assert.equal(E.saveGame(g), last, 'Rewards cannot duplicate after completion');
  }
  assert.deepEqual([...floors].sort(), [0, 1]);
  assert.equal(g.unlocked, 7); assert.equal(g.records.length, 8);
});

test('onboarding clue really permits north then east to the bakery', () => {
  const g = fresh(); [12, 8, 9].forEach(id => walk(g, id));
  E.interact(g); assert.equal(g.mode, 'bearing');
});

test('random worlds are connected, reproducible, vary geometry, and complete 40 unseen routes', () => {
  const layouts = new Set();
  for (let seed = 1; seed <= 40; seed++) {
    const g = fresh(5); E.startMission(g, 5, seed, true); E.beginWalk(g);
    assert.deepEqual(g.world, W.makeWorld(seed, 'harbor', true));
    layouts.add(JSON.stringify(g.world.edges));
    for (const node of g.world.nodes) assert.ok(W.route(g.world, g.world.start, node.id).length);
    for (const e of g.world.edges) {
      const a = g.world.nodes[e.a]; const b = g.world.nodes[e.b];
      assert.ok(W.walkable(g.world, (a.x + b.x) / 2, (a.z + b.z) / 2, a.floor));
    }
    deliver(g); assert.equal(g.records.at(-1).seed, seed);
    assert.ok(g.stats.bearingError <= 22.5001);
  }
  assert.ok(layouts.size > 25, `Only ${layouts.size} distinct road networks`);
});

test('walls and closed roads stop movement; stair travel cannot be triggered remotely or through floors', () => {
  const g = fresh(); face(g, Math.PI / 4);
  for (let i = 0; i < 50; i++) E.stepGame(g, 100, { ...zero, forward: 1 });
  assert.ok(W.walkable(g.world, g.player.x, g.player.z, 0));
  assert.equal(E.takeStairs(g), false);
  for (const e of g.world.edges) {
    const a = g.world.nodes[e.a]; const b = g.world.nodes[e.b];
    assert.equal(W.walkable(g.world, (a.x + b.x) / 2, (a.z + b.z) / 2, a.floor, [W.edgeId(e.a, e.b)]), false);
  }
  const mall = fresh(3); travel(mall, 2); assert.equal(mall.player.floor, 0); E.interact(mall); assert.equal(mall.phase, 'outbound');
  travel(mall, 0); assert.equal(E.takeStairs(mall), true);
  E.toggleMap(mall); assert.equal(mall.mode, 'playing');
  const before = { ...mall.player }; E.stepGame(mall, 100, { forward: 1, right: 1, turn: 1 });
  assert.deepEqual(mall.player, before, 'Movement cannot escape a floor transition');
});

test('map is a separate view; location retrieval, wrong-floor feedback and map closure preserve state', () => {
  const g = fresh(3); E.toggleMap(g); const at = { ...g.player };
  E.stepGame(g, 200, { forward: 1, right: 1, turn: 1 }); assert.deepEqual(g.player, at);
  assert.equal(E.showPosition(g), false);
  E.requestLocation(g); E.locateAt(g, at.x, at.z, 1); assert.match(g.locateResult, /你在 1F/);
  assert.equal(g.stats.locations, 1); assert.equal(g.mapFloor, 0); assert.equal(E.showPosition(g), true);
  E.toggleMap(g); E.toggleMap(g); assert.equal(E.showPosition(g), false);
  E.requestLocation(g); E.locateAt(g, at.x + 3, at.z + 4, 0); assert.equal(g.stats.locateErrors.at(-1), 5);
  E.toggleMap(g); E.toggleMap(g); E.revealLocation(g); assert.equal(g.stats.locations, 3);
  E.revealLocation(g); assert.equal(g.stats.locations, 3, 'Same reveal is counted once');
  assert.equal(g.stats.mapOpens, 3); g.comfort = true; assert.equal(E.showPosition(g), true);
});

test('help escalates and rescues are free, explicit, and retain deliveries', () => {
  const g = fresh(2); E.hint(g); assert.equal(g.hintLevel, 1); E.hint(g); assert.equal(g.hintLevel, 2); E.hint(g); assert.equal(g.hintLevel, 3);
  assert.equal(g.stats.hints, 3); travel(g, E.targetPlace(g).node); E.interact(g); E.answerBearing(g, null); E.leaveBearing(g);
  const stamps = [...g.stamps]; E.rescue(g); assert.equal(g.stats.rescues, 1); assert.deepEqual(g.stamps, stamps);
  assert.equal(g.phase, 'home'); E.interact(g); assert.equal(g.mode, 'result');
  assert.equal(g.records[0].rescues, 1);
});

test('pause, title and invalid input are inert; movement is normalized and delta bounded', () => {
  const g = E.createGame(); const at = E.saveGame(g); E.stepGame(g, 200, { forward: 1, right: 0, turn: 0 }); assert.equal(E.saveGame(g), at);
  E.startMission(g, 0); E.beginWalk(g); E.pause(g); const paused = E.saveGame(g);
  E.stepGame(g, 100, { forward: 1, right: 0, turn: 0 }); E.look(g, 0.5); assert.equal(E.saveGame(g), paused);
  E.pause(g); const t = g.time; E.stepGame(g, NaN); E.stepGame(g, -20); assert.equal(g.time, t);
  E.stepGame(g, 9000, { forward: NaN, right: Infinity, turn: NaN }); assert.ok(g.time - t <= .201); assert.ok(Number.isFinite(g.player.x));
  const a = fresh(); const b = fresh(); E.stepGame(a, 100, { ...zero, forward: 1 }); E.stepGame(b, 100, { ...zero, forward: 999 }); assert.deepEqual(a.player, b.player);
});

test('save resumes halfway through a delivery, return blockage, bearing prompt and stair travel', () => {
  let g = fresh(4); travel(g, 0); E.takeStairs(g); E.stepGame(g, 200); g = E.loadGame(E.saveGame(g));
  assert.ok(g); assert.equal(g.player.floor, 1); assert.equal(g.transition, null);
  travel(g, E.targetPlace(g).node); E.interact(g); assert.equal(g.mode, 'bearing');
  g = E.loadGame(E.saveGame(g)); assert.equal(g.mode, 'bearing'); assert.equal(g.blocked.length, 1);
  E.answerBearing(g, 0); E.leaveBearing(g); g = E.loadGame(E.saveGame(g));
  travel(g, g.world.start); E.interact(g); assert.equal(g.mode, 'result');
  const resumed = E.loadGame(E.saveGame(g)); assert.equal(resumed.mode, 'result'); assert.equal(resumed.records.length, 1);
  E.openJournal(g); const journal = E.loadGame(E.saveGame(g)); assert.equal(journal.mode, 'result');
  E.interact(journal); assert.equal(journal.records.length, 1, 'Reading the result journal and reloading never awards twice');
});

test('corrupted storage cannot inject geometry, invalid positions or progress values', () => {
  for (const raw of [null, '{', '{}', 'null', JSON.stringify({ version: 99 }), 'x'.repeat(2000001)]) assert.equal(E.loadGame(raw), null);
  const valid = JSON.parse(E.saveGame(fresh()));
  for (const bad of [{ mission: 12 }, { phase: 'done' }, { seed: -2 }, { player: { ...valid.player, x: 999 } }, { stats: { ...valid.stats, distance: 'ten' } }, { stamps: [null] }, { blocked: ['9-900'] }, { records: [{}] }, { trace: [] }]) assert.equal(E.loadGame(JSON.stringify({ ...valid, ...bad })), null);
  const restored = E.loadGame(JSON.stringify({ ...valid, world: { nodes: [], edges: [] } })); assert.equal(restored.world.nodes.length, 16);
  assert.equal(E.startMission(restored, 5), false, 'Locked story cannot skip');
});

test('postcards reward discovery once and do not grant remote delivery', () => {
  const g = fresh(); travel(g, g.world.places.find(p => p.id === 'clock').node); E.interact(g);
  const count = g.stamps.length; E.interact(g); assert.equal(g.stamps.length, count); assert.equal(g.phase, 'outbound');
  assert.equal(g.records.length, 0); assert.equal(MISSIONS.length, 8);
});

test('journal, pause and loss of focus nest without trapping the player', () => {
  const g = fresh();
  E.pause(g); E.openJournal(g); E.closeJournal(g); assert.equal(g.mode, 'pause');
  E.pause(g); assert.equal(g.mode, 'playing');
  E.openJournal(g); E.pause(g); E.pause(g); assert.equal(g.mode, 'journal');
  E.closeJournal(g); assert.equal(g.mode, 'playing');
  E.toggleMap(g); E.pause(g); E.pause(g); assert.equal(g.mode, 'map'); E.toggleMap(g); assert.equal(g.mode, 'playing');
});

test('a shared expedition preserves story locks and resumes without granting story progress', () => {
  const g = E.createGame(); assert.ok(E.startMission(g, 5, 778899, true)); E.beginWalk(g);
  travel(g, E.targetPlace(g).node); const resumed = E.loadGame(E.saveGame(g)); assert.ok(resumed); assert.equal(resumed.unlocked, 0);
  E.interact(resumed); E.answerBearing(resumed, null); E.leaveBearing(resumed); travel(resumed, resumed.world.start); E.interact(resumed);
  assert.equal(resumed.mode, 'result'); assert.equal(resumed.unlocked, 0); assert.equal(E.startMission(resumed, 4), false);
  assert.equal(resumed.referenceTrace.length > 1, true);
});

test('shortest route distances match an independent Floyd-Warshall solver including stairs', () => {
  for (const theme of ['arcade', 'harbor','cave']) for (let seed = 0; seed < 10; seed++) {
    const world = W.makeWorld(seed, theme, true); const size = world.nodes.length;
    const distances = Array.from({ length: size }, (_, a) => Array.from({ length: size }, (_, b) => a === b ? 0 : Infinity));
    for (const edge of world.edges) {
      const a = world.nodes[edge.a]; const b = world.nodes[edge.b];
      distances[edge.a][edge.b] = distances[edge.b][edge.a] = Math.hypot(a.x - b.x, a.z - b.z) + Math.abs(a.floor - b.floor) * 7;
    }
    for (let k = 0; k < size; k++) for (let a = 0; a < size; a++) for (let b = 0; b < size; b++) distances[a][b] = Math.min(distances[a][b], distances[a][k] + distances[k][b]);
    for (let a = 0; a < size; a++) for (let b = 0; b < size; b++) assert.ok(Math.abs(W.pathLength(world, W.route(world, a, b)) - distances[a][b]) < 1e-8);
  }
});

test('sprinting is faster, normalized and cannot tunnel through walls or a broken bridge',()=>{
  const a=fresh(); const b=fresh();
  E.stepGame(a,100,{...zero,forward:1});E.stepGame(b,100,{...zero,forward:1,sprint:true});
  assert.ok((27-b.player.z)/(27-a.player.z)>1.8); assert.equal(b.running,true);
  E.stepGame(b,100,zero);assert.equal(b.running,false);E.pause(b);assert.equal(b.running,false);
  const cave=fresh(6);
  for(let i=0;i<200;i++) E.stepGame(cave,200,{forward:1,right:1,turn:.3,sprint:true});
  assert.ok(W.walkable(cave.world,cave.player.x,cave.player.z,0));
});

test('carp only jumps on returning near the bridge, collapses mid-event and persists safely',()=>{
  let g=fresh(2);travel(g,E.targetPlace(g).node);assert.equal(g.bridgeEvent,null);
  E.interact(g);E.answerBearing(g,null);E.leaveBearing(g);assert.equal(g.blocked.length,0);
  face(g,Math.PI);
  while(g.bridgeEvent.stage==='armed') E.stepGame(g,100,{...zero,forward:1,sprint:true});
  assert.equal(g.bridgeEvent.stage,'jump');const at={...g.player};
  E.stepGame(g,200,{...zero,forward:1,sprint:true});assert.deepEqual(g.player,at);
  g=E.loadGame(E.saveGame(g));assert.ok(g);assert.equal(g.bridgeEvent.stage,'jump');
  for(let i=0;i<20;i++) E.stepGame(g,200,zero);
  assert.equal(g.bridgeEvent.stage,'broken');assert.deepEqual(g.blocked,['2-6']);
  const e=g.world.edges.find(e=>e.bridge);const a=g.world.nodes[e.a];const b=g.world.nodes[e.b];
  assert.equal(W.walkable(g.world,(a.x+b.x)/2,(a.z+b.z)/2,0,g.blocked),false);
  for(let i=0;i<30;i++) E.stepGame(g,200,{...zero,forward:1,sprint:true});
  assert.ok(g.player.z < -20.4);assert.ok(W.walkable(g.world,g.player.x,g.player.z,0,g.blocked));
  // Walk back to the near bank before using the alternative legal route.
  walk(g,2);travel(g,g.world.start);E.interact(g);assert.equal(g.mode,'result');
  const loaded=E.loadGame(E.saveGame(g));assert.equal(loaded.bridgeEvent.stage,'broken');
});

test('cave branch recall freezes input, distinguishes new/visited paths and chalk is voluntary',()=>{
  let g=fresh(6);travel(g,4);face(g,W.bearing(g.player,g.world.nodes[5]));
  assert.equal(g.chalk.length,0);assert.equal(g.edgeVisits['4-5'],undefined);
  E.recallBranch(g);assert.equal(g.branchRecall.actual,false);const at={...g.player};
  E.stepGame(g,200,{...zero,forward:1,sprint:true});E.look(g,1);assert.deepEqual(g.player,at);
  E.answerBranch(g,true);E.answerBranch(g,false);assert.equal(g.stats.branchChecks,1);assert.equal(g.stats.branchMistakes,1);
  g.branchRecall=null;E.leaveChalk(g);E.leaveChalk(g);assert.deepEqual(g.chalk,['4-5']);assert.equal(g.stats.marks,1);
  walk(g,5);walk(g,4);face(g,W.bearing(g.player,g.world.nodes[5]));E.recallBranch(g);
  assert.equal(g.branchRecall.actual,true);E.answerBranch(g,true);assert.equal(g.stats.branchChecks,2);
  assert.equal(g.edgeVisits['4-5'],2);assert.ok(g.stats.repeated >= W.distance(g.world.nodes[4],g.world.nodes[5]));
  g.branchRecall=null;g=E.loadGame(E.saveGame(g));assert.ok(g);assert.deepEqual(g.chalk,['4-5']);assert.equal(g.edgeVisits['4-5'],2);
  E.rescue(g);assert.equal(g.lastNode,g.world.start);assert.equal(g.stats.marks,1);
});

test('cave graph has diagonal bends, loops, dead ends, narrow walls and no crossing shortcuts',()=>{
  const w=W.makeWorld(31013,'cave');assert.ok(w.edges.length>w.nodes.length);
  assert.ok(w.edges.filter(e=>w.nodes[e.a].x!==w.nodes[e.b].x && w.nodes[e.a].z!==w.nodes[e.b].z).length>20);
  assert.ok(w.nodes.filter(n=>w.edges.filter(e=>[e.a,e.b].includes(n.id)).length===1).length>=3);
  for(const e of w.edges){const a=w.nodes[e.a],b=w.nodes[e.b];assert.ok(W.walkable(w,(a.x+b.x)/2,(a.z+b.z)/2,0));}
  for(const n of w.nodes) assert.ok(W.route(w,0,n.id).length);
  assert.equal(W.walkable(w,37,5,0),false);
});

test('old six-letter saves keep their journey and open the new cave chapter afterwards',()=>{
  const g=fresh(5);deliver(g);const d=JSON.parse(E.saveGame(g));d.unlocked=5;
  for(const metrics of [d.stats,...d.records]) for(const key of ['repeated','branchChecks','branchMistakes','marks']) delete metrics[key];
  for(const key of ['edgeVisits','chalk','bridgeEvent','lastNode','running','branchRecall']) delete d[key];
  const loaded=E.loadGame(JSON.stringify(d));assert.ok(loaded);assert.equal(loaded.stats.branchChecks,0);
  E.startMission(loaded,5);E.beginWalk(loaded);deliver(loaded);assert.equal(loaded.unlocked,6);
  assert.ok(E.startMission(loaded,6));assert.equal(loaded.world.theme,'cave');
});
