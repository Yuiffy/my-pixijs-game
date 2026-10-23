const assert = require('node:assert/strict');
const model = require('./sui-delivery-model.cjs');
const { makePilot } = require('./sui-delivery-pilot.cjs');

function setup(save, id, mode = 'story') {
  const p = makePilot(model.readDeliverySave(JSON.stringify(save)), id, mode);
  p.jumpGo = (x, frames = 220, hold = 100) => { p.tick({}, 2); p.go(x, frames, true, hold); };
  p.waitFor = (predicate, frames = 1800) => { let n = 0; while (!predicate() && n++ < frames) p.tick(); assert.ok(predicate(), `${id}: timed out; marks ${JSON.stringify(p.milestones.map(m => [m.name, Math.round(m.state.player.x), Math.round(m.state.player.y), m.state.switches, m.state.deaths]))}`); };
  p.dashGo = (x, trigger = 25, frames = 220) => {
    p.tick({ jump: !p.s.player.grounded }, 2);
    for (let i = 0; i < frames && p.s.phase === 'playing'; i++) {
      const delta = x - p.s.player.x - p.s.player.vx * 0.12;
      p.tick({ right: delta > 4, left: delta < -4, run: true, jump: i < 75, dash: i === trigger });
      if (i === trigger + 1) p.mark(`steam-dash-${p.milestones.filter(m => m.name.startsWith('steam-dash')).length + 1}`);
      if (i > trigger && Math.abs(p.s.player.x - x) < 10 && Math.abs(p.s.player.vx) < 60 && p.s.player.grounded) break;
    }
  };
  p.tick({ interact: true }); p.tick({}, 5); p.mark('take-meal');
  return p;
}

function rain(save, mode = 'story') {
  const p = setup(save, 'rain-relay', mode); const j = p.jumpGo;
  p.go(350); j(480); j(730); p.mark('safe-porch');
  p.tick({ right: true }, 2); p.tick({ attack: true }, 20); p.mark('canopy-open-1');
  j(1020); p.mark('first-awning'); p.waitFor(() => p.s.player.vy < -700, 90); p.dashGo(1320, 35, 230); p.mark('first-balcony');
  p.go(1355); p.tick({ right: true }, 2); p.tick({ attack: true }, 20); p.mark('canopy-open-2');
  p.waitFor(() => model.canopyPhase(p.s, model.deliveryLevel(p.s).rain.canopies[1]) === 'warning'); p.mark('canopy-warning');
  p.waitFor(() => model.canopyPhase(p.s, model.deliveryLevel(p.s).rain.canopies[1]) === 'folded'); p.mark('canopy-folded');
  p.waitFor(() => model.canopyPhase(p.s, model.deliveryLevel(p.s).rain.canopies[1]) === 'open');
  p.mark('canopy-reopened');
  j(1640, 150); p.mark('second-awning'); p.waitFor(() => p.s.player.vy < -680, 200); p.dashGo(2010, 25, 240); p.mark('middle-roof');
  p.go(2130); p.tick({ right: true, run: true }, 18); p.dashGo(2640, 40, 260); p.mark('last-roof'); p.go(2850); p.tick({ interact: true }); p.mark('delivered');
  assert.equal(p.s.phase, 'delivered', JSON.stringify(p.milestones.map(m => [m.name, Math.round(m.state.player.x), Math.round(m.state.player.y), m.state.checkpoint, m.state.deaths]))); return p;
}

function greenhouse(save, mode = 'story') {
  const p = setup(save, 'greenhouse-dinner', mode); const j = p.jumpGo;
  p.go(350); j(480); j(660); j(850); p.go(885); p.tick({ right: true }, 2); p.tick({ attack: true }, 20); p.mark('inlet-open');
  j(1150, 150); p.mark('water-lift-rider'); p.waitFor(() => p.s.rain.liftY <= 425.01); p.mark('water-lift-high');
  j(1400); p.go(1470); p.tick({ right: true }, 2); p.tick({ attack: true }, 20); p.mark('flower-route-open');
  j(1720); j(1920); j(2140); p.mark('flower-bank'); p.go(2260); j(2430); j(2580); j(2800); p.tick({ interact: true }); p.mark('delivered');
  assert.equal(p.s.phase, 'delivered'); return p;
}

function bird(save, mode = 'story') {
  const p = setup(save, 'bird-supper', mode); const j = p.jumpGo;
  p.go(350); j(480); j(730); p.mark('swoop-warning');
  p.waitFor(() => p.s.rain.bird.phase === 'rest'); p.mark('bird-rest');
  p.go(860); p.tick({ right: true, run: true }, 16); p.dashGo(1230, 40); p.mark('second-roof');
  p.go(1360); p.tick({ right: true, run: true }, 16); p.dashGo(1750, 40); p.mark('third-roof');
  p.go(1880); p.tick({ right: true, run: true }, 16); p.dashGo(2350, 40, 260); p.mark('nest-roof');
  p.go(2450); p.tick({ interact: true }); p.mark('ribbon-returned');
  p.dashGo(2780, 25); j(3040); p.tick({ interact: true }); p.mark('delivered');
  assert.equal(p.s.phase, 'delivered', JSON.stringify(p.milestones.map(m => [m.name, Math.round(m.state.player.x), Math.round(m.state.player.y), m.state.player.health, m.state.deaths, m.state.rain.bird.phase]))); return p;
}
module.exports = { rain, greenhouse, bird };
