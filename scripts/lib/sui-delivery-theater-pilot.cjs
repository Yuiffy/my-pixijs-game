const assert = require('node:assert/strict');
const model = require('./sui-delivery-model.cjs');
const { makePilot } = require('./sui-delivery-pilot.cjs');

function setup(save, id, mode = 'story') {
  const p = makePilot(model.readDeliverySave(JSON.stringify(save)), id, mode);
  const status = () => JSON.stringify(p.milestones.map(m => [m.name, Math.round(m.state.player.x), Math.round(m.state.player.y), m.state.player.health, m.state.deaths, m.state.switches]));
  p.jumpGo = (x, frames = 220, hold = 100) => { p.tick({}, 2); p.go(x, frames, true, hold); };
  p.waitFor = (predicate, frames = 2000) => { let n = 0; while (!predicate() && n++ < frames) p.tick(); assert.ok(predicate(), `${id}: timeout at ${p.s.player.x},${p.s.player.y}: ${status()}`); };
  p.dashGo = (x, trigger = 35, frames = 240) => {
    p.tick({ jump: !p.s.player.grounded }, 2);
    for (let i = 0; i < frames && p.s.phase === 'playing'; i++) {
      const delta = x - p.s.player.x - p.s.player.vx * 0.12;
      p.tick({ right: delta > 4, left: delta < -4, run: true, jump: i < 100, dash: i === trigger });
      if (i === trigger + 1) p.mark(`steam-${p.milestones.filter(m => m.name.startsWith('steam-')).length + 1}`);
      if (i > trigger && Math.abs(p.s.player.x - x) < 10 && Math.abs(p.s.player.vx) < 60 && p.s.player.grounded) break;
    }
  };
  p.reflect = id => {
    p.tick({ right: true }, 2); let n = 0; let seen = false;
    while (!p.s.switches.includes(id) && n++ < 1800) {
      const shot = p.s.projectiles.find(v => !v.reflected && v.x > p.s.player.x && Math.abs(v.y - p.s.player.y - 22) < 40);
      p.tick({ attack: !!shot && shot.x - p.s.player.x < 94 && shot.x - p.s.player.x > 38 });
      if (!seen && p.s.projectiles.some(v => v.reflected)) { seen = true; p.mark(`${id}-reflection`); }
    }
    assert.ok(p.s.switches.includes(id), status()); p.mark(`${id}-open`);
  };
  p.hook = name => { p.tick({ right: true }, 2); p.tick({ attack: true }, 20); p.mark(name); };
  p.board = (id, x) => {
    const lift = model.deliveryLevel(p.s).theater.lifts.find(l => l.id === id);
    p.waitFor(() => p.s.theater.lifts[id] >= lift.y - 5);
    p.jumpGo(x, 200); p.mark(`${id}-rider`);
    assert.ok(Math.abs(p.s.player.y + 44 - p.s.theater.lifts[id]) < 1, status());
    p.waitFor(() => p.s.theater.lifts[id] <= lift.high + 0.01);
    p.mark(`${id}-high`);
  };
  p.finish = () => { p.tick({ interact: true }); p.mark('delivered'); assert.equal(p.s.phase, 'delivered', status()); return p; };
  p.tick({ interact: true }); p.tick({}, 5); p.mark('take-meal');
  return p;
}
function scenery(save, mode = 'story') {
  const p = setup(save, 'scenery-lifts', mode); const j = p.jumpGo;
  p.go(350); j(480); j(730); p.go(755); p.hook('first-rope-open');
  p.board('stage-lift-1', 1030);
  p.waitFor(() => model.liftPhase(p.s, 'stage-rope-1') === 'warning'); p.mark('lift-descent-warning');
  p.waitFor(() => model.liftPhase(p.s, 'stage-rope-1') === 'descending'); p.tick({}, 60); p.mark('lift-descending-rider');
  p.waitFor(() => p.s.theater.lifts['stage-lift-1'] >= 599.99); p.mark('lift-returned-low');
  p.waitFor(() => p.s.theater.lifts['stage-lift-1'] <= 400.01); j(1340); p.mark('low-beam-gallery');
  p.go(1425); p.hook('second-rope-open'); p.go(1540); p.board('stage-lift-2', 1730);
  j(2030); p.reflect('stage-bell'); p.go(2180); p.dashGo(2610); p.mark('scenery-bridge');
  p.dashGo(3010); p.go(3060); return p.finish();
}
function lastTable(save, mode = 'story') {
  const p = setup(save, 'last-table', mode); const j = p.jumpGo;
  p.go(350); j(480); j(730); p.go(745); p.hook('backstage-rope-open');
  p.board('table-lift', 980); j(1260); p.tick({ interact: true }); p.mark('first-basket-served'); p.tick({}, 2);
  assert.ok(p.s.switches.includes('table-served'));
  p.go(1860); p.mark('curtain-bridge'); j(2140, 180); p.waitFor(() => p.s.player.vy < -700, 120); p.mark('spring-launch');
  p.dashGo(2600, 65, 300); p.mark('long-table-landing'); p.go(2690); p.tick({ right: true, run: true }, 12); p.dashGo(3000, 40); p.go(3020); return p.finish();
}
function banquet(save, mode = 'story') {
  const p = setup(save, 'banquet-machine', mode); const j = p.jumpGo;
  p.go(350); j(480); j(710); p.mark('machine-observation'); p.go(1010); p.reflect('banquet-heat');
  p.go(1350); j(1480); p.board('banquet-lift', 1740); j(2010); p.go(2025); p.hook('crank-stopped');
  assert.ok(p.s.switches.includes('banquet-crank')); j(2240); p.dashGo(2580, 35); p.mark('crown-deck');
  if (!p.s.switches.includes('banquet-crown')) {
    p.waitFor(() => model.crownPhase(p.s) === 'warning'); p.mark('crown-warning');
    p.waitFor(() => model.crownPhase(p.s) === 'open'); p.mark('crown-open'); p.hook('crown-stopped');
  }
  assert.ok(model.banquetReady(p.s)); p.go(2760); p.go(2930); p.mark('table-before-serving');
  p.tick({ interact: true }); p.mark('banquet-served'); p.tick({}, 2); p.go(3210); p.mark('reserved-seat');
  return p.finish();
}
module.exports = { scenery, lastTable, banquet };
