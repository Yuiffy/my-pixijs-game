const model = require('./sui-delivery-model.cjs');

/** Author-time route: every frame uses the same seven public buttons as a player. */
function makePilot(save = model.freshDeliverySave(), levelId, mode = 'story') {
  const s = model.createDelivery(save); model.startDelivery(s, mode, undefined, levelId);
  const tape = []; const milestones = [];
  function tick(value = {}, frames = 1) {
    for (let i = 0; i < frames; i++) { const input = { ...model.deliveryInput(), ...value }; tape.push(input); model.stepDelivery(s, input); }
  }
  function go(x, frames = 500, jump = false, hold = 100, stopOnLanding = true) {
    for (let i = 0; i < frames && s.phase === 'playing'; i++) {
      const delta = x - s.player.x - s.player.vx * 0.12;
      tick({ right: delta > 4, left: delta < -4, run: true, jump: jump && i < hold });
      if (stopOnLanding && Math.abs(s.player.x - x) < 10 && Math.abs(s.player.vx) < 60 && s.player.grounded) break;
    }
  }
  function mark(name) { milestones.push({ name, frame: tape.length, state: structuredClone(model.deliveryPublicState(s)) }); }
  function courtyard() {
    tick({ interact: true }); tick({}, 5); mark('take-soup');
    go(365); go(735, 240, true, 65); go(800, 120);
    tick({ right: true }, 3); tick({ attack: true }, 15); mark('first-loft');
    go(875, 150, true, 125); mark('first-bounce');
    go(970, 120); tick({ right: true }, 2); tick({ attack: true }, 12);
    go(1055, 200, true, 150); go(1160, 180); mark('old-sign');
  }
  function journey() {
    courtyard(); go(1470, 300); mark('bread-alcove');
    go(1650, 300); tick({ interact: true }); mark('repairer-kindness');
    go(1710, 200); go(1840, 200, true, 190); mark('awning-compressed');
    go(2000, 200, true, 180, false); mark('upper-balcony');
    go(2200, 200); go(2390, 200, true, 130); mark('cart-rider');
    tick({}, 800); mark('cart-docked');
    go(3000, 220, true, 100); tick({}, 3); mark('attic-checkpoint');
    go(3170, 180, true, 100); go(3345, 160); mark('customer');
    tick({ interact: true }); mark('delivered');
    return { s, tape, milestones };
  }
  return { s, tape, tick, go, mark, milestones, courtyard, journey };
}
module.exports = { makePilot };
