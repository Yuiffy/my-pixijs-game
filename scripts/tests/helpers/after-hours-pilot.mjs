export function createPilot(engine, world, g) {
  function turn(yaw) {
    engine.look(g, Math.atan2(Math.sin(yaw - g.player.yaw), Math.cos(yaw - g.player.yaw)), 0);
  }
  function walk(point, run = false) {
    const route = world.findPath(g.player, point, g);
    if (!route.length) throw Error('No route: ' + JSON.stringify({ from: g.player, to: point, stage: g.stage }));
    for (const target of route) {
      for (let i = 0; i < 240; i++) {
        if (g.mode !== 'playing') throw Error('Unexpected mode: ' + g.mode);
        const dx = target.x - g.player.x; const dz = target.z - g.player.z; const distance = Math.hypot(dx, dz);
        if (distance < .04) break;
        turn(Math.atan2(-dx, -dz));
        engine.stepGame(g, Math.min(50, distance / (run && g.player.stamina > 1 ? 3.7 : 2.05) * 1000), { forward: 1, right: 0, run });
      }
    }
    if (Math.hypot(g.player.x - point.x, g.player.z - point.z) > .15) throw Error('Walk stalled: ' + JSON.stringify({ player: g.player, target: point }));
  }
  function reach(id, run = false) {
    const spot = world.activeSpots(g).find(s => s.id === id);
    if (!spot) throw Error('Inactive spot: ' + id);
    const choices = [];
    for (let x = -1.4; x <= 1.4; x += .2) for (let z = -1.4; z <= 1.4; z += .2) {
      const point = { x: spot.x + x, z: spot.z + z };
      const distance = Math.hypot(x, z);
      if (distance < .5 || distance > (spot.reach || 1.3) - .12 || !world.walkable(point, g) || !world.clearLine(point, spot, g, 0, true)) continue;
      const route = world.findPath(g.player, point, g);
      if (route.length) choices.push({ point, cost: route.reduce((n, v, i) => n + Math.hypot(v.x - (route[i - 1] || g.player).x, v.z - (route[i - 1] || g.player).z), 0) });
    }
    choices.sort((a, b) => a.cost - b.cost);
    if (!choices.length) throw Error('No reachable spot: ' + id);
    walk(choices[0].point, run);
    turn(Math.atan2(g.player.x - spot.x, g.player.z - spot.z)); engine.stepGame(g, 0);
    if (world.focusedSpot(g)?.id !== id) throw Error('Wrong focus: ' + JSON.stringify({ id, actual: g.focus, player: g.player }));
  }
  function interact(id, run = false) { reach(id, run); engine.interact(g); }
  function toChase() {
    engine.startGame(g); interact('echo'); interact('computer'); interact('fridge'); g.panel = 'none'; interact('fuse');
    for (const index of [1, 0, 2]) engine.fuseSwitch(g, index);
    for (const id of ['tape-shelf', 'tape-bedroom', 'tape-kitchen']) interact(id);
    interact('notebook'); g.panel = 'none'; interact('computer'); engine.submitCode(g, '0017');
    for (const id of ['clock', 'portrait', 'radio']) interact(id);
  }
  function toChoice() { toChase(); for (const id of ['fuse', 'computer', 'mirror']) interact(id, true); interact('computer'); }
  return { turn, walk, reach, interact, toChase, toChoice };
}
