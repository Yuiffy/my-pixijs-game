const assert = require('node:assert/strict');
const model = require('./sui-delivery-model.cjs');
const { makePilot } = require('./sui-delivery-pilot.cjs');
const rainPilot = require('./sui-delivery-rain-pilot.cjs');
const theaterPilot = require('./sui-delivery-theater-pilot.cjs');

function nextPilot(save, id, mode = 'story') {
  const p = makePilot(model.readDeliverySave(JSON.stringify(save)), id, mode);
  p.jumpGo = (x, frames = 200, hold = 100) => { p.tick({}, 2); p.go(x, frames, true, hold); };
  p.waitFor = (predicate, frames = 1800) => { let n = 0; while (!predicate() && n++ < frames) p.tick(); assert.ok(predicate(), `input route timed out in ${id}`); };
  p.tick({ interact: true }); p.tick({}, 5); p.mark('take-meal');
  return p;
}
function bakery(save) {
  const p = nextPilot(save, 'bakery-backdoor');
  const j = p.jumpGo;
  p.go(360); j(490); p.go(630); j(700, 180, 20); j(820, 180, 30); p.mark('low-kitchen-beam');
  j(1005); p.tick({ attack: true }, 18); p.mark('pan-rising'); p.tick({}, 250); p.mark('pan-rider');
  j(1210); p.go(1310); j(1570); p.mark('flour-shelf');
  p.go(1790, 300); j(1980); j(2220); p.mark('kitchen-window');
  p.go(2450, 280); j(2580, 220, 140); p.mark('cooling-awning'); p.tick({}, 25);
  p.go(2820, 300); j(2990); j(3210); p.mark('backdoor-arrival'); p.tick({ interact: true }); p.mark('delivered');
  assert.equal(p.s.phase, 'delivered');
  return p;
}
function oven(save) {
  const p = nextPilot(save, 'oven-crab');
  const j = p.jumpGo;
  p.go(330); j(430); j(710); p.mark('claw-warning'); p.go(785); j(1070); p.mark('vent-warning');
  for (let stage = 0; stage < 3; stage++) {
    p.waitFor(() => p.s.boss.phase === 'vent'); p.tick({}, 75); p.mark(`pan-raised-${stage}`);
    const b = p.s.boss; const fromRight = p.s.player.x > b.x + 125;
    j(model.crabValve(b).x + (fromRight ? 40 : -50)); p.mark(`on-back-${stage}`);
    p.tick({ [fromRight ? 'left' : 'right']: true }, 2); p.tick({ attack: true }, 20); p.mark(`valve-${stage}`);
    assert.equal(p.s.boss.hits, stage + 1);
    if (stage < 2) { p.tick({}, 120); j(stage === 0 ? 1285 : 1190, 230); }
  }
  j(1800, 300); p.go(2120, 300); p.tick({ interact: true }); p.mark('delivered');
  assert.equal(p.s.phase, 'delivered');
  return p;
}
function market(save) {
  const p = nextPilot(save, 'market-stalls');
  const j = p.jumpGo;
  p.go(350); j(510); p.go(585); j(770); p.go(840); j(1020, 200, 12); p.mark('moving-stall');
  p.tick({}, 100); p.mark('moving-stall-rider'); j(1220, 180, 35); p.mark('market-low-beam');
  p.go(1400, 250); j(1480); p.go(1650, 220); p.tick({ right: true }, 2); p.mark('bell-approach');
  let n = 0; let reflected = false;
  while (!p.s.switches.length && n++ < 1800) {
    const shot = p.s.projectiles.find(v => !v.reflected && v.x > p.s.player.x);
    const attack = shot && shot.x - p.s.player.x < 94 && shot.x - p.s.player.x > 38;
    p.tick({ attack: !!attack });
    if (!reflected && p.s.projectiles.some(v => v.reflected)) { reflected = true; p.mark('reflected-heat'); }
  }
  assert.ok(reflected); assert.ok(p.s.switches.includes('market-bell-gate')); p.mark('bell-open');
  p.go(2340, 400); j(2500); p.go(2580); j(2830); p.go(2960); p.go(3070); j(3240); j(3525);
  p.mark('customer-arrival'); p.tick({ interact: true }); p.mark('delivered'); assert.equal(p.s.phase, 'delivered');
  return p;
}
function freight(save, mode = 'story') {
  const p = nextPilot(save, 'freight-lunch', mode); const j = p.jumpGo;
  p.go(350); j(480); j(680); p.mark('loading-dock'); j(920); p.mark('sloped-rail-rider');
  p.waitFor(() => p.s.cart.station === 1); p.mark('middle-stop'); p.tick({ right: true }, 2);
  let n = 0; let reflected = false;
  while (!p.s.switches.length && n++ < 1800) {
    const shot = p.s.projectiles.find(v => !v.reflected && v.x > p.s.player.x);
    p.tick({ attack: !!shot && shot.x - p.s.player.x < 94 && shot.x - p.s.player.x > 38 });
    if (!reflected && p.s.projectiles.some(v => v.reflected)) { reflected = true; p.mark('dispatch-reflection'); }
  }
  assert.ok(reflected); assert.ok(p.s.switches.includes('freight-dispatch')); p.mark('dispatch-open');
  p.waitFor(() => p.s.cart.x >= 2050); p.mark('under-loading-beam');
  p.waitFor(() => p.s.cart.docked); p.mark('unloading-stop');
  j(2660); j(2820); j(3000); p.mark('unload-arrival'); p.tick({ interact: true }); p.mark('delivered');
  assert.equal(p.s.phase, 'delivered'); return p;
}
function serving(save, mode = 'story') {
  const p = nextPilot(save, 'serving-machine', mode); const j = p.jumpGo;
  p.go(350); j(480); j(710); p.mark('arm-warning');
  p.waitFor(() => p.s.machine.phase === 'sweep' && p.s.machine.timer < 0.35); p.mark('arm-sweep');
  p.waitFor(() => p.s.machine.phase === 'feed'); j(1200, 115, 65);
  for (let stage = 0; stage < 3; stage++) {
    let n = 0; let reflected = false; let warned = false;
    while (p.s.switches.length === stage && n++ < 2500 && p.s.phase === 'playing') {
      const shot = p.s.projectiles.find(v => !v.reflected && v.x > p.s.player.x && Math.abs(v.y - p.s.player.y - 22) < 40);
      const attack = !!shot && shot.x - p.s.player.x < 94 && shot.x - p.s.player.x > 38;
      const delta = 1200 - p.s.player.x - p.s.player.vx * 0.12;
      p.tick({ left: !attack && delta < -4, right: attack || delta > 4, run: true, jump: p.s.machine.phase === 'warning' && p.s.machine.timer < 0.3, attack });
      if (!warned && p.s.machine.phase === 'warning') { warned = true; p.mark(`sweep-warning-${stage}`); }
      if (!reflected && p.s.projectiles.some(v => v.reflected)) { reflected = true; p.mark(`reflected-${stage}`); }
    }
    assert.equal(p.s.switches.length, stage + 1); p.mark(`belt-stopped-${stage}`);
    if (stage < 2) {
      p.go(960, 300); j(stage === 0 ? 960 : 1010, 140); p.mark(`side-step-${stage}`);
      p.waitFor(() => p.s.machine.phase === 'feed' && p.s.machine.timer > 3.8);
      j(1200, 100, 65); p.mark(`upper-belt-${stage + 1}`);
    }
  }
  p.go(1950, 400); p.mark('serving-table-bridge'); p.go(2240, 300); p.tick({ interact: true }); p.mark('delivered');
  assert.equal(p.s.phase, 'delivered'); return p;
}
function campaign() {
  const first = makePilot().journey();
  const second = bakery(first.s.save);
  const third = oven(second.s.save);
  const fourth = market(third.s.save);
  const fifth = freight(fourth.s.save);
  const sixth = serving(fifth.s.save);
  const seventh = rainPilot.rain(sixth.s.save);
  const eighth = rainPilot.greenhouse(seventh.s.save);
  const ninth = rainPilot.bird(eighth.s.save);
  const tenth = theaterPilot.scenery(ninth.s.save);
  const eleventh = theaterPilot.lastTable(tenth.s.save);
  const twelfth = theaterPilot.banquet(eleventh.s.save);
  return [first, second, third, fourth, fifth, sixth, seventh, eighth, ninth, tenth, eleventh, twelfth];
}
module.exports = { bakery, oven, market, freight, serving, campaign };
