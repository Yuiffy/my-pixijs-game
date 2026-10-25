const { makePilot } = require('./sui-delivery-pilot.cjs');

/** Fresh-save first order, using the same seven buttons and no state injection. */
function makeVaultPilot({ approach = 800, delay = 6, complete = true, walkRoof = false } = {}) {
  const p = makePilot();
  p.tick({ interact: true }); p.tick({}, 5); p.mark('take-soup');
  p.go(365); p.go(735, 240, true, 65); p.go(approach, 120); p.mark('vault-approach');
  p.tick({ right: true }, 3);
  p.tick({ right: true, run: !walkRoof, jump: true }, delay); p.mark('vault-jump');
  p.tick({ right: true, run: !walkRoof, jump: true, attack: true }, 16); p.mark('vault-contact');
  if (walkRoof) {
    for (let i = 0; i < 250; i++) {
      const delta = 1100 - p.s.player.x - p.s.player.vx * 0.12;
      p.tick({ right: delta > 4, left: delta < -4, jump: true });
      if (Math.abs(p.s.player.x - 1100) < 10 && Math.abs(p.s.player.vx) < 60 && p.s.player.grounded) break;
    }
  } else p.go(1100, 190, true, 190);
  p.mark('vault-rooftop');
  p.go(1160, 180); p.mark('old-sign');
  if (!complete) return p;
  p.go(1470, 300); p.mark('bread-alcove');
  p.go(1650, 300); p.tick({ interact: true }); p.mark('repairer-kindness');
  p.go(1710, 200); p.go(1840, 200, true, 190); p.mark('awning-compressed');
  p.go(2000, 200, true, 180, false); p.mark('upper-balcony');
  p.go(2200, 200); p.go(2390, 200, true, 130); p.mark('cart-rider');
  p.tick({}, 800); p.mark('cart-docked');
  p.go(3000, 220, true, 100); p.tick({}, 3); p.mark('attic-checkpoint');
  p.go(3170, 180, true, 100); p.go(3345, 160); p.mark('customer');
  p.tick({ interact: true }); p.mark('delivered');
  return p;
}
module.exports = { makeVaultPilot };
