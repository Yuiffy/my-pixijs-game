import assert from "node:assert/strict";
import test from "node:test";
import { solveActivity } from "./helpers/hush-minigame-pilot.mjs";
import { loadTypescriptModule } from "./helpers/load-typescript-module.mjs";

const e = await loadTypescriptModule("src/components/hushLive/engine.ts");
const { objective } = await loadTypescriptModule('src/components/hushLive/guide.ts');
const daily = await loadTypescriptModule('src/components/hushLive/daily.ts');
const {
  step,
  emptyInput,
  travel,
  action,
  signal,
  broadcast,
  SPOTS,
} = e;
// Unit regressions below start just after arrival; full journey tests use the real factory.
const createGame = (...args) => { const s = e.createGame(...args); if (s.daily) s.daily.panel = null; return s; };
const advance = (s, seconds, input = emptyInput()) => step(s, seconds, input);
const hold = (s, seconds = action(s, s.target ?? e.nearest(s)).seconds + 0.08) => {
  const a = action(s, s.target ?? e.nearest(s));
  advance(s, seconds, { ...emptyInput(), act: true, focus: s.target ?? e.nearest(s) });
  advance(s, 0.02);
  if (a.mode === 'minigame' && s.delta?.active) {
    while (s.delta.active && s.phase === 'playing') { e.hitDelta(s,s.delta.id); advance(s,.13); }
  }
};
function walk(s, spot) {
  travel(s, spot);
  for (let n = 0; s.path.length && n < 500 && s.phase === "playing"; n++)
    advance(s, 0.05);
  if (
    s.doorClosed &&
    e.distance(s.player, e.interactionPoint(s, spot)) >= 65 &&
    e.nearest(s) === "door"
  ) {
    s.target = "door"; hold(s);
    return walk(s, spot);
  }
  if (spot === "partner" && s.visit) advance(s, .8);
  if (spot === "partner" && s.daily?.stage === 'home' && ['out','inside','back'].includes(s.daily.household.rest.stage)) return;
  assert.ok(
    e.distance(s.player, e.interactionPoint(s, spot)) < 65,
    `walk ${spot}: ${JSON.stringify(s)}`,
  );
}
function cover(s) {
  if (e.nearest(s) === "partner" && s.cooldown === 0) {
    signal(s);
    return;
  }
  for (
    let n = 0;
    (!broadcast(s).music || broadcast(s).remaining < action(s).seconds + 0.2) &&
    n < 600;
    n++
  )
    advance(s, 0.05);
}
function completeNight(s, choice = 'together') {
  for (let i = 0; i < 120 && s.phase === 'playing'; i++) {
    if (s.daily?.panel === 'lock' || s.daily?.panel === 'cook') { timingWin(s); continue; }
    if (s.daily?.panel === 'leisure') { s.daily.volume = 15; advance(s, 9); daily.finishLeisure(s); continue; }
    if (s.daily?.stage === 'sleep') { advance(s, 3.1); continue; }
    if (s.daily?.panel === 'story') { daily.chooseGoodnight(s, choice); advance(s, .1); continue; }
    const next = objective(s);
    walk(s, next.spot);
    if (objective(s).spot !== next.spot || objective(s).key !== next.key) continue;
    assert.equal(action(s, next.spot).key, next.key, JSON.stringify({next,s}));
    if (['food', 'hug', 'kiss', 'pickup-charger'].includes(next.key)) cover(s);
    const a = action(s, next.spot);
    advance(s, a.seconds + .08, {...emptyInput(), act: true, focus: next.spot});
    advance(s, .02);
    if (s.delta?.active) while (s.delta.active && s.phase === 'playing') { e.hitDelta(s,s.delta.id); advance(s,.13); }
  }
  return s;
}
function solve(level, seed = 1, unlocked = level) {
  const s = e.createGame(level, seed, unlocked); s.phase = 'playing';
  return completeNight(s);
}

test("five designed nights and seeded encore can be completed with only legal movement/actions", () => {
  for (const seed of [1, 42, 99, 20260922])
    for (let level = 0; level <= 5; level++) {
      const s = solve(level, seed);
      assert.equal(s.won, true, JSON.stringify(s));
      assert.equal(s.done.length, s.tasks.length);
      assert.ok(s.totalScore > 2000);
    }
});
test("closed doors stop crossing; walls cannot be crossed above the opening", () => {
  const s = createGame();
  s.phase = "playing";
  s.player = { x: 480, y: 200 };
  advance(s, 2, { ...emptyInput(), x: 1 });
  assert.ok(s.player.x <= 506);
  s.player = { x: 480, y: 410 };
  s.doorClosed = true;
  advance(s, 2, { ...emptyInput(), x: 1 });
  assert.ok(s.player.x <= 506);
  s.doorClosed = false;
  advance(s, 2, { ...emptyInput(), x: 1 });
  assert.ok(s.player.x > 534);
});
test("door action is latched until release instead of oscillating under a held E", () => {
  const s = createGame();
  s.phase = "playing";
  walk(s, "door");
  advance(s, 4, { ...emptyInput(), act: true });
  assert.equal(s.doorClosed, true);
  advance(s, 0.05);
  hold(s);
  assert.equal(s.doorClosed, false);
});
test("music, walls, a closed door and eye-contact mute each attenuate real noise", () => {
  const sample = (spot, time, closed = false, muted = 0) => {
    const s = createGame(4);
    s.phase = "playing";
    s.player = { ...SPOTS[spot] };
    s.elapsed = time;
    s.doorClosed = closed;
    s.muted = muted;
    s.quiet = false;
    advance(s, 0.5, { ...emptyInput(), act: true });
    if(spot === "desk") e.hitDelta(s,s.delta.id);
    return s;
  };
  const raw = sample("partner", 1);
  const music = sample("partner", 13);
  const mute = sample("partner", 1, false, 7);
  assert.ok(raw.noise > music.noise * 5);
  assert.equal(mute.noise, 0);
  assert.ok(sample("desk", 1).peak > sample("desk", 1, true).peak * 3);
});
test("reckless voice exposes the secret; idle timeout fails; neither awards progression", () => {
  const s = createGame(2);
  s.phase = "playing";
  s.player = { ...SPOTS.desk };
  s.quiet = false;
  s.suspicion = 65;
  advance(s,.05,{...emptyInput(),act:true}); advance(s,.02);
  for(let i=0;i<5&&s.phase==='playing';i++){e.hitDelta(s,s.delta.id);advance(s,.1);}
  assert.equal(s.reason, "caught");
  assert.equal(s.won, false);
  assert.deepEqual(e.record(e.freshSave(), s), e.freshSave());
  const idle = createGame();
  idle.phase = "playing";
  advance(idle, idle.limit + 1);
  assert.equal(idle.reason, "timeout");
});
test("paused states freeze all simulation and clear routes; resume allows actions", () => {
  const s = createGame();
  s.phase = "playing";
  travel(s, "shelf");
  e.togglePause(s);
  const before = JSON.stringify(s);
  advance(s, 50, { ...emptyInput(), act: true, x: 1 });
  assert.equal(JSON.stringify(s), before);
  assert.equal(s.path.length, 0);
  e.togglePause(s);
  advance(s, 1);
  assert.equal(s.elapsed.toFixed(1), "1.0");
});
test("signal requires proximity and cooldown, bonus affection can only be earned once", () => {
  const s = createGame();
  s.phase = "playing";
  signal(s);
  assert.equal(s.muted, 0);
  walk(s, "partner");
  signal(s);
  assert.equal(s.muted, 7);
  advance(s, 2);
  signal(s);
  assert.ok(s.muted < 6);
  hold(s);
  assert.equal(s.love, 25);
  hold(s, 2);
  assert.equal(s.love, 25);
});
test("progression unlocks nights and equipment, keeps personal bests and validates storage", () => {
  let save = e.freshSave();
  for (let i = 0; i < 5; i++) {
    const s = solve(i);
    save = e.record(save, s);
    assert.equal(save.unlocked, i + 1);
    assert.ok(save.best[i] > 0);
  }
  assert.equal(createGame(5, 42, save.unlocked).slippers, true);
  assert.equal(createGame(5, 42, save.unlocked).seal, true);
  assert.deepEqual(e.parseSave(JSON.stringify(save)), save);
  for (const raw of [
    "{",
    "{}",
    "null",
    JSON.stringify({ ...save, best: [0] }),
    JSON.stringify({ ...save, unlocked: 99 }),
  ])
    assert.deepEqual(e.parseSave(raw), e.freshSave());
});
test("seeded encore repeats exactly and different seeds change the challenge", () => {
  assert.deepEqual(solve(5, 79), solve(5, 79));
  assert.notDeepEqual(createGame(5, 1), createGame(5, 12));
});
test("foreground large steps match fine simulation, sprint route reaches target without oscillation", () => {
  const a = createGame();
  a.phase = "playing";
  const b = structuredClone(a);
  advance(a, 4);
  for (let i = 0; i < 80; i++) advance(b, 0.05);
  assert.ok(Math.abs(a.elapsed - b.elapsed) < 0.00001);
  travel(a, "shelf");
  for (let i = 0; i < 100; i++)
    advance(a, 0.05, { ...emptyInput(), sprint: true });
  assert.ok(e.distance(a.player, SPOTS.shelf) < 5);
});


test('the first-night guide alone leads from charger pickup to home and finish', () => {
  const s = createGame(0); s.phase = 'playing';
  const keys = [];
  for (let i = 0; i < 12 && s.phase === 'playing'; i++) {
    const next = objective(s);
    if (e.nearest(s) !== next.spot) walk(s, next.spot);
    else {
      assert.equal(action(s).key, next.key);
      keys.push(next.key);
      if (next.key === 'pickup-charger') cover(s);
      hold(s);
    }
  }
  assert.deepEqual(keys, ['pickup-charger', 'charger', 'finish']);
  assert.equal(s.won, true);
  assert.equal(s.bonus, false);
  assert.equal(e.stars(s), 3, 'tutorial stars must not require unrelated romantic actions');
});

test('following current objectives completes every integrated night and all after-stream choices', () => {
  const memories = new Set();
  for (let level = 1; level <= 5; level++) for (const seed of [1, 42, 99]) for (const choice of ['care', 'together']) {
    const s = e.createGame(level, seed, level); s.phase = 'playing';
    assert.equal(s.daily.panel, s.daily.household.arrival === 'outside' ? 'lock' : null); completeNight(s, choice);
    assert.equal(s.won, true, JSON.stringify(s)); memories.add(s.daily.memory);
    assert.ok(e.record(e.freshSave(), s).unlocked >= (level < 5 ? level + 1 : 0));
  }
  assert.equal(memories.size, 4);
});

test('the guide prioritizes what is in your hands, and explains a blocking closed door', () => {
  const s = createGame(4); s.phase = 'playing';
  walk(s, 'shelf'); cover(s); hold(s);
  assert.equal(objective(s).spot, 'charging', 'deliver the charger even when food was listed first');
  walk(s, 'door'); hold(s);
  assert.equal(objective(s).spot, 'door');
  assert.match(objective(s).title, /打开/);
  hold(s); assert.equal(objective(s).spot, 'charging');
});


const nav = await loadTypescriptModule('src/components/hushLive/navigation.ts');
const runtime3d = await loadTypescriptModule('src/components/hushLive/runtime3d.ts');

test('3D assisted routes between every interaction stay clear of furniture and walls', () => {
  for (const from of Object.values(SPOTS)) for (const to of Object.values(SPOTS)) {
    if (from === SPOTS.door || to === SPOTS.door) continue;
    const points = nav.route(from, to, false);
    assert.ok(points.length, JSON.stringify({from,to}));
    let position = from;
    for (const point of points) {
      assert.ok(nav.walkable(point, false));
      assert.ok(nav.clearSegment(position, point, false), JSON.stringify({position,point}));
      position = point;
    }
    assert.deepEqual({x:position.x,y:position.y}, {x:to.x,y:to.y});
  }
});

test('3D movement cannot tunnel across a desk, sofa or closed door', () => {
  for (const [from,to,closed] of [
    [{x:220,y:420},{x:220,y:140},false],
    [{x:310,y:220},{x:190,y:145},false],
    [{x:470,y:413},{x:570,y:413},true],
  ]) {
    const moved = nav.moveBody(from,to,closed);
    assert.ok(nav.walkable(moved,closed));
    assert.notDeepEqual(moved,to);
  }
});

test('3D interaction requires a focused object and a nearby body', () => {
  const s=createGame();s.phase='playing';s.player={...SPOTS.shelf};
  advance(s,3,{...emptyInput(),act:true,focus:null});assert.equal(s.carry,null);
  advance(s,.1,{...emptyInput(),focus:'shelf'});
  advance(s,2.2,{...emptyInput(),act:true,focus:'shelf'});assert.equal(s.carry,'charger');
  const distant=createGame();distant.phase='playing';
  advance(distant,3,{...emptyInput(),act:true,focus:'shelf'});assert.equal(distant.carry,null);
});

test('locked mouse rejects warp samples and invalid deltas without limiting continuous fast turns', () => {
  const r=runtime3d.createRuntime(e.freshSave());r.game.phase='playing';r.pointerLocked=true;
  const initial=r.yaw;
  for(let i=0;i<80;i++)runtime3d.rotateLockedView(r,2,0);
  assert.ok(Math.abs(r.yaw-(initial-.4))<1e-10);
  const stable={yaw:r.yaw,pitch:r.pitch};
  for(const [x,y] of [[720,0],[-720,0],[0,800],[Infinity,0],[0,NaN]])runtime3d.rotateLockedView(r,x,y);
  assert.deepEqual({yaw:r.yaw,pitch:r.pitch},stable);
  for(let i=0;i<12;i++)runtime3d.rotateLockedView(r,120,0);
  assert.ok(Math.abs(r.yaw-(stable.yaw-3.6))<1e-10, 'fast motion is not capped per frame');
  runtime3d.go3D(r,'shelf');runtime3d.rotateLockedView(r,2,0);
  const manualYaw=r.yaw;runtime3d.advance3D(r,.2);assert.equal(r.yaw,manualYaw);
  r.pointerLocked=false;runtime3d.rotateLockedView(r,20,0);assert.equal(r.yaw,manualYaw);
  runtime3d.rotateView(r,400,0);assert.equal(r.yaw,manualYaw-1, 'absolute drag has no pointer-lock warp filter');
  runtime3d.rotateView(r,NaN,Infinity);assert.ok(Number.isFinite(r.yaw)&&Number.isFinite(r.pitch));
});

test('first-person movement follows camera heading and manual input cancels assisted walking', () => {
  const r=runtime3d.createRuntime(e.freshSave());r.game.phase='playing';r.yaw=-Math.PI/2;
  const x=r.game.player.x;r.keys.add('w');runtime3d.advance3D(r,.35);assert.ok(r.game.player.x>x+20);
  r.keys.clear();runtime3d.go3D(r,'shelf');assert.ok(r.game.path.length);
  r.keys.add('arrowleft');runtime3d.advance3D(r,.1);assert.equal(r.game.path.length,0);assert.equal(r.assist,null);
  r.held=true;r.stick={x:1,y:1};runtime3d.pause3D(r);
  assert.equal(r.game.phase,'paused');assert.equal(r.keys.size,0);assert.deepEqual(r.stick,{x:0,y:0});assert.equal(r.held,false);
  const before=JSON.stringify(r.game);runtime3d.advance3D(r,40);assert.equal(JSON.stringify(r.game),before);
});


test('quick pickups finish after a tap and one continuous hold never chains into another action',()=>{
  for(const [level,spot,item] of [[0,'shelf','charger'],[1,'entry','food']]) {
    const s=createGame(level);s.phase='playing';s.player={...SPOTS[spot]};
    const a=action(s);assert.equal(a.mode,'tap');assert.ok(a.seconds<=.4);
    advance(s,.02,{...emptyInput(),act:true});assert.equal(s.carry,null);assert.ok(s.busy);
    advance(s,.5);assert.equal(s.carry,item);assert.equal(s.busy,null);
  }
  const s=createGame();s.phase='playing';s.player={...SPOTS.charging};s.carry='charger';
  advance(s,3,{...emptyInput(),act:true});assert.deepEqual(s.done,['charger']);assert.equal(s.phase,'playing');
  advance(s,.01);walk(s,'sofa');hold(s);assert.equal(s.won,true);
});

test('food is placed at the table, then invitation and talking animate and freeze correctly',()=>{
  const s=createGame(1,1);s.phase='playing';s.carry='food';s.player={...SPOTS.partner};
  assert.notEqual(action(s,'partner').key,'food');
  s.player={...SPOTS.table};assert.equal(action(s,'table').key,'food');
  advance(s,.02,{...emptyInput(),act:true,focus:'table'});advance(s,.45);assert.ok(s.busy);assert.equal(s.carry,'food');
  const before=JSON.stringify(s);e.togglePause(s);const frozen=JSON.stringify(s);advance(s,10);assert.equal(JSON.stringify(s),frozen);e.togglePause(s);
  advance(s,.7);assert.ok(s.done.includes('food'));assert.equal(s.carry,null);assert.ok(s.visit);
  advance(s,1.5);assert.ok(e.partnerPose(s).stand>.9);assert.ok(e.partnerBehavior(s).speaking);
  s.player={x:s.visit.x-28,y:s.visit.y+27};e.signal(s);assert.ok(s.muted>0);assert.equal(e.partnerBehavior(s).mouth,0);
  advance(s,3.2,{...emptyInput(),act:true,focus:'partner'});assert.equal(s.bonus,true);assert.ok(s.love>=35);
  advance(s,3);assert.equal(s.visit,null);
  const noVisit=createGame(1,3);noVisit.phase='playing';noVisit.carry='food';noVisit.player={...SPOTS.table};hold(noVisit);assert.equal(noVisit.visit,null);
});

function startDelta(closed=true,quiet=true){
  const s=createGame(2,91,2);s.phase='playing';s.player={...SPOTS.desk};s.doorClosed=closed;s.quiet=quiet;
  advance(s,.02,{...emptyInput(),act:true});advance(s,.01);return s;
}
test('reporting needs actual target hits, rejects stale IDs, expires and retries without E skipping it',()=>{
  const s=startDelta();advance(s,1,{...emptyInput(),act:true});assert.equal(s.delta.hits,0);
  const id=s.delta.id;e.hitDelta(s,id);assert.equal(s.delta.hits,1);e.hitDelta(s,id);assert.equal(s.delta.hits,1);
  const paused=structuredClone(s);e.togglePause(s);const frozen=JSON.stringify(s);advance(s,10);e.hitDelta(s,s.delta.id);assert.equal(JSON.stringify(s),frozen);e.togglePause(s);
  advance(s,6.4);assert.equal(s.delta.active,false);assert.ok(!s.done.includes('delta'));
  advance(s,.02,{...emptyInput(),act:true});advance(s,.01);assert.equal(s.delta.hits,0);assert.equal(s.delta.misses,0);
  for(let i=0;i<8;i++){e.hitDelta(s,s.delta.id);advance(s,.1);}assert.ok(s.done.includes('delta'));
  const miss=startDelta();e.missDelta(miss);e.missDelta(miss);e.missDelta(miss);assert.equal(miss.delta.active,false);assert.equal(miss.done.length,0);
});
test('loud reports trade fewer clicks for noise and door or music really reduces it',()=>{
  const quiet=startDelta(false,true);const loud=startDelta(false,false);const closed=startDelta(true,false);const music=startDelta(false,false);music.elapsed=13;
  for(const s of [quiet,loud,closed,music])e.hitDelta(s,s.delta.id);
  assert.equal(quiet.delta.hits,1);assert.equal(loud.delta.hits,2);
  assert.ok(loud.peak>quiet.peak*2);assert.ok(loud.peak>closed.peak*3);assert.ok(loud.peak>music.peak*5);
});


test('closing the door on a player in the threshold must not trap the body',()=>{
  const s=createGame();s.phase='playing';s.player={x:520,y:411};
  assert.ok(nav.walkable(s.player,false));
  advance(s,.4,{...emptyInput(),act:true,focus:'door'});advance(s,.02);
  assert.ok(nav.walkable(s.player,s.doorClosed),'door collision must never appear around the player');
  const before={...s.player};advance(s,.5,{...emptyInput(),x:1});assert.ok(s.player.x>before.x+15);
});


test('opening a door also refuses to place the open panel around a player',()=>{
  const s=createGame();s.phase='playing';s.doorClosed=true;s.player={x:558,y:378};
  assert.ok(nav.walkable(s.player,true));assert.ok(!nav.walkable(s.player,false));
  advance(s,.4,{...emptyInput(),act:true,focus:'door'});advance(s,.02);
  assert.equal(s.doorClosed,true);assert.ok(nav.walkable(s.player,true));assert.match(s.message,/退一点/);
  advance(s,.4,{...emptyInput(),y:1});hold(s);assert.equal(s.doorClosed,false);assert.ok(nav.walkable(s.player,false));
});
test('safe door operations from either side allow walking away and returning through the opened doorway',()=>{
  for(const x of [474,566]){
    const s=createGame();s.phase='playing';s.player={x,y:410};
    for(let n=0;n<3;n++){hold(s);assert.equal(s.doorClosed,true);assert.ok(nav.walkable(s.player,true));hold(s);assert.equal(s.doorClosed,false);assert.ok(nav.walkable(s.player,false));}
    advance(s,.9,{...emptyInput(),x:x<520?1:-1});assert.ok(x<520?s.player.x>534:s.player.x<506);
  }
});
test('every reachable nearby position stays walkable after opening or closing, including edges',()=>{
  for(const closed of [false,true])for(let x=480;x<=600;x+=3)for(let y=360;y<=455;y+=3){
    const p={x,y};if(!nav.walkable(p,closed)||e.distance(p,SPOTS.door)>=75)continue;
    const s=createGame();s.phase='playing';s.player=p;s.doorClosed=closed;
    advance(s,.4,{...emptyInput(),act:true,focus:'door'});
    assert.ok(nav.walkable(s.player,s.doorClosed),JSON.stringify({p,closed,after:s.doorClosed}));
  }
});
test('a previously trapped player can move out of a door overlap but cannot tunnel through walls',()=>{
  for(const from of [{x:501,y:411},{x:533,y:411}]){
    const to={x:from.x<520?from.x-2:from.x+2,y:from.y};
    assert.deepEqual(nav.moveBody(from,to,true),to);
    const wrong={x:from.x<520?550:480,y:411};assert.notDeepEqual(nav.moveBody(from,wrong,true),wrong);
  }
  const open={x:552,y:380};assert.deepEqual(nav.moveBody(open,{x:552,y:383},false),{x:552,y:383});
  const wall={x:515,y:355};assert.deepEqual(nav.moveBody(wall,{x:480,y:355},true),wall);
  assert.deepEqual(nav.moveBody({x:490,y:410},{x:550,y:410},true),{x:490,y:410});
});


function dailyStart(homemade = false, seed = 1) {
  const s = e.createGame(homemade ? 3 : 2, seed); s.phase = 'playing'; return s;
}
function timingWin(s) { solveActivity(s,daily,advance); }

test('arrival minigames block movement, survive mistakes and freeze while paused', () => {
  const s = dailyStart(); const start = {...s.player};
  daily.activityInput(s,'press');
  advance(s, .4, {...emptyInput(), x: 1, act: true}); assert.deepEqual(s.player, start);
  e.togglePause(s); const mini = structuredClone(s.daily.mini); advance(s, 5); daily.activityInput(s,'turn',40); assert.deepEqual(s.daily.mini,mini);
  e.togglePause(s); timingWin(s); assert.equal(s.phase, 'playing');
});
test('all seven meals and homemade rice run from entry to after-stream choices using real routes', () => {
  const endings = new Set();
  for (const homemade of [false, true]) for (const [index, meal] of daily.MEALS.entries()) {
    const s = dailyStart(homemade, index || 7); timingWin(s);
    if (homemade) { walk(s, 'kitchen'); hold(s); assert.equal(s.daily.panel, 'cook'); timingWin(s); assert.ok(s.done.includes('cook')); }
    else { walk(s, 'entry'); hold(s); }
    assert.equal(s.carry, 'food');
    if (s.daily.meal === 'noodles') {
      walk(s, 'table'); assert.equal(action(s, 'table').key, '');
      walk(s, 'kitchen'); hold(s); assert.equal(s.carry, null);
      advance(s, 12); hold(s); advance(s, 10); hold(s);
      assert.equal(s.daily.household.noodles, 'carrying');
    }
    walk(s, 'table'); hold(s); assert.ok(s.done.includes('food'));
    // Complete each chapter's actual middle activity before resting.
    if (s.tasks.includes('delta')) { walk(s, 'door'); if (!s.doorClosed) hold(s); walk(s, 'desk'); hold(s); }
    if (s.tasks.includes('hug')) { walk(s, 'partner'); cover(s); hold(s); }
    walk(s, 'sofa'); hold(s); assert.equal(s.daily.panel, 'leisure');
    s.daily.entertainment = homemade ? 'game' : 'video'; advance(s, 3);
    assert.ok(s.daily.unread); assert.match(s.daily.messages.at(-1).text, homemade ? /游戏的声音/ : /视频的声音/);
    daily.replyQuietly(s); const love = s.love; daily.replyQuietly(s); assert.equal(s.love, love); assert.equal(s.daily.volume, 15);
    advance(s, 6); daily.finishLeisure(s); assert.ok(s.done.includes('leisure'));
    walk(s, 'bed'); assert.notEqual(action(s, 'bed').key, 'sleep');
    walk(s, 'sofa'); hold(s); assert.equal(s.daily.stage, 'sleep'); assert.ok(s.player.x < 506); advance(s, 3.1); assert.equal(s.daily.stage, 'after'); assert.equal(objective(s).spot, 'partner');
    const elapsed = s.elapsed; advance(s, 1); assert.equal(s.elapsed, elapsed); assert.equal(e.partnerBehavior(s).speaking, false);
    walk(s, s.daily.after === 'rice' ? 'kitchen' : 'sofa'); hold(s); assert.equal(s.daily.panel, 'story');
    const choice = homemade ? 'care' : 'together';
    e.togglePause(s); daily.chooseGoodnight(s, choice); assert.equal(s.daily.stage, 'goodnight'); e.togglePause(s);
    const beforeChoice = s.love;
    daily.chooseGoodnight(s, choice); daily.chooseGoodnight(s, choice); assert.equal(s.love, beforeChoice + 25);
    advance(s, .05); assert.ok(s.won); assert.ok(s.daily.memory.length > 20); endings.add(s.daily.memory);
    assert.equal(e.record(e.freshSave(), s).unlocked, s.level + 1);
    assert.equal(s.daily.meal, homemade ? 'rice' : meal.id);
  }
  assert.equal(endings.size, 4, 'both choices in each after-stream scene must have a reachable distinct ending');
});
test('quiet leisure causes no complaint, short visits do not complete, loud reminders do not spam', () => {
  const s = dailyStart(); timingWin(s); daily.openDailyPanel(s, 'leisure'); s.daily.volume = 0;
  advance(s, 2); daily.finishLeisure(s); assert.ok(!s.done.includes('leisure'));
  daily.openDailyPanel(s, 'leisure'); advance(s, 9); assert.equal(s.daily.messages.length, 1);
  s.daily.volume = 80; advance(s, 30); assert.equal(s.daily.messages.length, 2); assert.ok(s.suspicion < 100);
  daily.finishLeisure(s); assert.ok(s.done.includes('leisure'));
});

test('charger drop uses its own armrest target; sofa center is only for resting', () => {
  const s = createGame(); s.phase = 'playing'; s.carry = 'charger';
  s.player = {...SPOTS.sofa}; assert.equal(action(s, 'sofa').key, '');
  walk(s, 'charging'); assert.equal(action(s, 'charging').key, 'charger'); hold(s);
  assert.ok(s.done.includes('charger')); assert.equal(s.carry, null);
  assert.ok(e.distance(SPOTS.charging, runtime3d.AIM_POINTS.charging) < 65);
  assert.ok(e.distance(SPOTS.sofa, runtime3d.AIM_POINTS.charging) > 90);
});

test('charger tray is reachable from the sofa side without returning to the walk-assist endpoint', () => {
  const s=createGame(); s.phase='playing'; s.carry='charger';
  for (const p of [{x:348,y:320},{x:303,y:380}]) {
    assert.ok(nav.walkable(p,false)); s.player=p;
    assert.equal(action(s,'charging').key,'charger');
    assert.equal(action(s,'sofa').key,'');
  }
  assert.deepEqual(runtime3d.AIM_POINTS.charging,e.CHARGER_TRAY);
});


test('skin migration preserves old scores and defaults unknown costumes to host', () => {
  const old = { ...e.freshSave(), unlocked: 3, best: [70, 80, 90, 0, 0] };
  delete old.skin;
  const migrated = e.parseSave(JSON.stringify(old));
  assert.equal(migrated.skin, 'host');
  assert.equal(migrated.unlocked, 3);
  assert.deepEqual(migrated.best, old.best);
  assert.equal(e.parseSave(JSON.stringify({...old, skin:'missing'})).skin, 'host');
  for(const skin of ['host','sui','nana7mi']) assert.equal(e.parseSave(JSON.stringify({...old,skin})).skin,skin);
});

test('each costume names the same partner throughout objectives and all aftermath choices', () => {
  for(const [skin,name] of [['host','主播酱'],['sui','岁己'],['nana7mi','七海']]) {
    for(const after of ['rice','shower']) for(const choice of ['care','together']) {
      const s=e.createGame(1,1,1,skin);s.phase='playing';
      assert.ok(s.message.includes(name));assert.ok(objective(s).title.includes(name));
      assert.equal(s.daily.messages[0].from,'partner');
      s.daily.stage='after';s.daily.after=after;s.daily.panel=null;
      s.player={...e.partnerPose(s)};
      assert.ok(e.action(s,'partner').label.includes(name));
      daily.discoverDaily(s);
      daily.chooseGoodnight(s,choice);
      assert.ok(s.daily.memory.includes(name));
      for(const other of ['主播酱','岁己','七海'].filter(n=>n!==name))assert.ok(!s.daily.memory.includes(other));
      const saved=e.record({...e.freshSave(),skin},s);
      assert.equal(saved.skin,skin);
    }
  }
});

test('encore independently varies home starts, seven deliveries, homemade meals and task order', () => {
  const arrivals = new Map(), meals = new Map(), plans = new Set(); let homemade = 0;
  for (let seed=1; seed<=3000; seed++) {
    const s = e.createGame(5,seed,5), d=s.daily;
    assert.deepEqual(s,e.createGame(5,seed,5));
    arrivals.set(d.household.arrival,(arrivals.get(d.household.arrival)||0)+1);
    assert.equal(d.panel,d.household.arrival==='outside'?'lock':null);
    assert.ok(nav.walkable(s.player,false));
    if(d.homemade) homemade++; else meals.set(d.meal,(meals.get(d.meal)||0)+1);
    plans.add(s.tasks.join(','));
    assert.equal(new Set(s.tasks).size,s.tasks.length);
    if(d.homemade)assert.ok(s.tasks.indexOf('cook')<s.tasks.indexOf('food'));
  }
  assert.equal(arrivals.size,3);assert.equal(meals.size,7);assert.ok(plans.size>30);
  assert.ok([...arrivals.values()].every(n=>n>700));assert.ok([...meals.values()].every(n=>n>200));
  assert.ok(homemade>450&&homemade<750);
});

test('bucket noodles require boiling and steeping, with hands free for cat chores and paused timers', () => {
  const seed=Array.from({length:1000},(_,i)=>i+1).find(n=>{const s=e.createGame(5,n,5);return s.daily.meal==='noodles'&&s.tasks.includes('cat-food')&&s.tasks.includes('cat-litter');});
  const s=e.createGame(5,seed,5);s.phase='playing';if(s.daily.panel==='lock')timingWin(s);
  walk(s,'entry');hold(s);assert.equal(s.daily.household.noodles,'sealed');
  walk(s,'table');assert.equal(action(s,'table').key,'');assert.ok(!s.done.includes('food'));
  walk(s,'kitchen');hold(s);assert.equal(s.daily.household.noodles,'boiling');assert.equal(s.carry,null);
  e.togglePause(s);const paused=JSON.stringify(s);advance(s,30);assert.equal(JSON.stringify(s),paused);e.togglePause(s);
  walk(s,'cat-bowl');hold(s);assert.ok(s.done.includes('cat-food'));assert.ok(!s.done.includes('food'));
  while(s.daily.household.noodles==='boiling')advance(s,.1);
  walk(s,'kitchen');hold(s);assert.equal(s.daily.household.noodles,'steeping');assert.equal(s.carry,null);
  walk(s,'cat-litter');for(let i=0;i<3;i++)hold(s);assert.equal(s.daily.household.cat.scoops,3);assert.ok(s.done.includes('cat-litter'));
  while(s.daily.household.noodles==='steeping')advance(s,.1);
  walk(s,'kitchen');hold(s);assert.equal(s.daily.household.noodles,'carrying');assert.equal(s.carry,'food');
  walk(s,'table');hold(s);assert.equal(s.daily.household.noodles,'served');assert.ok(s.done.includes('food'));
  if(['out','inside','back'].includes(s.daily.household.rest.stage))assert.ok(!s.message.includes('勾了勾你的手'));
});

test('cats wander around furniture, sleep, eat after feeding, and cleanup cannot farm rewards', () => {
  const seed=Array.from({length:100},(_,i)=>i+1).find(n=>e.createGame(5,n,5).tasks.includes('cat-food'));
  const s=createGame(5,seed,5);s.phase='playing';const modes=new Set();const places=new Set();
  for(let i=0;i<1600;i++){advance(s,.05);const c=s.daily.household.cat;assert.ok(nav.walkable(c,false));modes.add(c.mode);places.add(`${Math.round(c.x/20)},${Math.round(c.y/20)}`);}
  assert.ok(modes.has('walk')&&modes.has('sleep'));assert.ok(places.size>8);
  walk(s,'cat-bowl');hold(s);
  for(let i=0;i<500&&s.daily.household.cat.mode!=='eat';i++)advance(s,.05);
  assert.equal(s.daily.household.cat.mode,'eat');const love=s.love;hold(s);assert.equal(s.love,love);
});

test('partner takes a private bathroom break, walks collision-free both ways, and resumes talking', () => {
  for(const closed of [false,true]){
    const s=createGame(5,21,5);s.phase='playing';s.doorClosed=closed;
    const states=new Set();let muted=false;
    for(let i=0;i<2600&&s.daily.household.rest.stage!=='done';i++){
      advance(s,.05);const b=s.daily.household.rest;states.add(b.stage);
      if(['out','back'].includes(b.stage))assert.ok(nav.walkable(b,s.doorClosed),JSON.stringify(b));
      if(['out','inside','back'].includes(b.stage)){assert.equal(e.partnerBehavior(s).speaking,false);muted=true;}
      if(b.stage==='inside'){assert.equal(action(s,'partner').key,'');}
    }
    assert.deepEqual([...states].sort(),['pending','out','inside','back','done'].sort());
    assert.ok(muted);assert.equal(s.daily.household.rest.visits,1);assert.equal(e.partnerBehavior(s).speaking,true);
    assert.equal(s.doorClosed,closed);
  }
});

test('random nights with changing food, cat chores and bathroom events can all be completed', () => {
  const meals=new Set(),starts=new Set();
  for(let seed=1;seed<=70;seed++){
    const s=solve(5,seed,5);assert.ok(s.won,JSON.stringify(s));assert.equal(s.done.length,s.tasks.length);
    meals.add(s.daily.meal);starts.add(s.daily.household.arrival);
    if(s.daily.meal==='noodles')assert.equal(s.daily.household.noodles,'served');
  }
  assert.equal(meals.size,7);assert.equal(starts.size,3);
});


test('all completed chores allow sofa sleep during every bathroom phase, without inventing task completion', () => {
  for(const stage of ['pending','out','inside','back','done']){
    const s=e.createGame(5,7,5);s.phase='playing';s.daily.panel=null;s.done=[...s.tasks];s.daily.household.rest.stage=stage;
    s.player={...SPOTS.sofa};s.doorClosed=false;
    assert.equal(objective(s).key,'sleep',stage);assert.equal(action(s,'sofa').key,'sleep',stage);
    daily.sleepDaily(s);assert.equal(s.daily.stage,'sleep');assert.equal(s.daily.household.rest.stage,'done');
    advance(s,3.1);assert.equal(s.daily.stage,'after');assert.deepEqual(s.done,s.tasks);
  }
  const s=e.createGame(5,7,5);s.phase='playing';s.daily.panel=null;s.daily.household.rest.stage='inside';
  daily.sleepDaily(s);assert.equal(s.daily.stage,'home');assert.notEqual(objective(s).key,'sleep');
});

test('computer opens recoil practice and can complete the leisure task', () => {
  const s=e.createGame(5,7,5);s.phase='playing';s.daily.panel=null;s.done.push('delta');s.player={...SPOTS.desk};
  assert.equal(action(s,'desk').key,'computer');hold(s);assert.equal(s.daily.panel,'leisure');assert.equal(s.daily.leisurePlace,'computer');assert.equal(s.daily.mini.kind,'recoil');
  s.daily.volume=0;advance(s,9);daily.finishLeisure(s);assert.ok(s.done.includes('leisure'));
});

test('pause releases held minigame inputs and resume never fires by itself', () => {
  const r=runtime3d.createRuntime(e.freshSave());r.game=e.createGame(5,7,5);r.game.phase='playing';
  daily.openDailyPanel(r.game,'leisure',true);daily.activityInput(r.game,'press');advance(r.game,.1);
  runtime3d.pause3D(r);const shots=r.game.daily.mini.shots;assert.equal(r.game.daily.mini.held,false);
  e.togglePause(r.game);advance(r.game,1);assert.equal(r.game.daily.mini.shots,shots);
  daily.activityInput(r.game,'press');e.togglePause(r.game);daily.activityInput(r.game,'release');assert.equal(r.game.daily.mini.held,false);
});
