// Test-only navigator: plans around shipped collision geometry, emits normal
// movement/steering/brake actions, and never teleports or changes quest state.
const path = require('node:path');
const { pathToFileURL } = require('node:url');
async function model() {
  const { loadTypescriptModule } = await import(pathToFileURL(path.join(process.cwd(), 'scripts/tests/helpers/load-typescript-module.mjs')));
  return loadTypescriptModule('src/components/liuzhou/world.ts');
}
function solid(p, buildings, radius) {
  return buildings.some(b => {
    const dx = p.x - b.x; const dz = p.z - b.z;
    if (b.footprint) {
      let inside = false;
      for (let i = 0, j = b.footprint.length - 1; i < b.footprint.length; j = i++) {
        const a = b.footprint[i]; const c = b.footprint[j]; const length = (c.x-a.x)**2+(c.z-a.z)**2;
        const t = Math.max(0,Math.min(1,((p.x-a.x)*(c.x-a.x)+(p.z-a.z)*(c.z-a.z))/(length||1)));
        if (Math.hypot(p.x-a.x-(c.x-a.x)*t,p.z-a.z-(c.z-a.z)*t)<radius) return true;
        if ((a.z>p.z)!==(c.z>p.z) && p.x<(c.x-a.x)*(p.z-a.z)/(c.z-a.z)+a.x) inside=!inside;
      }
      return inside;
    }
    const x = dx * Math.cos(b.angle) - dz * Math.sin(b.angle); const z = dx * Math.sin(b.angle) + dz * Math.cos(b.angle);
    return Math.abs(x) < b.w / 2 + radius && Math.abs(z) < b.d / 2 + radius;
  });
}
class Heap {
  list = [];
  push(item) { const a = this.list; a.push(item); let i = a.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (a[p].f <= item.f) break; a[i] = a[p]; i = p; } a[i] = item; }
  pop() { const a = this.list; const first = a[0]; const last = a.pop(); if (a.length) { let i = 0; while (i * 2 + 1 < a.length) { let c = i * 2 + 1; if (c + 1 < a.length && a[c + 1].f < a[c].f) c++; if (last.f <= a[c].f) break; a[i] = a[c]; i = c; } a[i] = last; } return first; }
}
async function plan(from, to, radius = 1.35, npcs = []) {
  const w = await model(); const size = 3; const width = 330; const height = 394;
  const { DONGMEN: gate, GATE_SOLIDS: volumes } = await (async () => {
    const { loadTypescriptModule } = await import(pathToFileURL(path.join(process.cwd(), 'scripts/tests/helpers/load-typescript-module.mjs')));
    return loadTypescriptModule('src/components/liuzhou/dongmen.ts');
  })();
  const { STREET_SOLIDS: furniture } = await (async () => {
    const { loadTypescriptModule } = await import(pathToFileURL(path.join(process.cwd(), 'scripts/tests/helpers/load-typescript-module.mjs')));
    return loadTypescriptModule('src/components/liuzhou/street.ts');
  })();
  // Ground-level navigation avoids the stair flight; the landmark playtest
  // walks that elevation explicitly using normal movement inputs.
  const obstacles = [...w.BUILDINGS, ...volumes.filter(b => b.at[1] - b.size[1] / 2 < 1.9).map(b => ({
    x: gate.x + b.at[0], z: gate.z + b.at[2], w: b.size[0], d: b.size[2], angle: 0,
  })), ...furniture.filter(b => b.at[1] - b.size[1] / 2 < 1.9).map(b => ({
    x: b.at[0], z: b.at[2], w: b.size[0], d: b.size[2], angle: b.angle || 0,
  })), ...npcs.map(n => ({ x: n.x, z: n.z, w: n.kind === 'car' ? 3.4 : 2, d: n.kind === 'car' ? 3.4 : 2, angle: 0 }))];
  const cell = p => ({ x: Math.round((p.x + 440) / size), z: Math.round((p.z + 400) / size) });
  const point = c => ({ x: c.x * size - 440, z: c.z * size - 400 });
  const start = cell(from); const goal = cell(to); const key = p => p.z * width + p.x;
  const open = new Heap(); const parents = new Map(); const costs = new Map([[key(start), 0]]); const pass = new Map();
  const valid = c => {
    const k = key(c); if (pass.has(k)) return pass.get(k);
    const p = point(c); const ok = c.x >= 0 && c.x < width && c.z >= 0 && c.z < height && w.canTraverse(p) && (!w.inRiver(p) || w.onBridge(p, -radius)) && !solid(p, obstacles, radius);
    pass.set(k, ok); return ok;
  };
  const heuristic = c => Math.hypot(c.x - goal.x, c.z - goal.z);
  open.push({ ...start, f: heuristic(start), g: 0 }); let end;
  const seen = new Set();
  while (open.list.length && seen.size < 150000) {
    const c = open.pop(); const k = key(c); if (seen.has(k)) continue; seen.add(k);
    if (heuristic(c) <= 1.5) { end = c; break; }
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]]) {
      const n = { x: c.x + dx, z: c.z + dz }; if (!valid(n) || dx && dz && (!valid({ x: c.x + dx, z: c.z }) || !valid({ x: c.x, z: c.z + dz }))) continue;
      const nk = key(n); const cost = c.g + Math.hypot(dx, dz);
      if (cost >= (costs.get(nk) ?? Infinity)) continue; costs.set(nk, cost); parents.set(nk, c); open.push({ ...n, g: cost, f: cost + heuristic(n) });
    }
  }
  if (!end) throw new Error(`No navigable path ${JSON.stringify(from)} -> ${JSON.stringify(to)} (${seen.size} cells)`);
  const result = [point(end)]; let c = end;
  while (parents.has(key(c))) { c = parents.get(key(c)); result.push(point(c)); }
  result.reverse(); result[0] = from; result.push(to);
  const clear = (a, b) => { const d = w.distance(a, b); for (let t = 0; t <= d; t += 1) { const p = { x: a.x + (b.x - a.x) * t / (d || 1), z: a.z + (b.z - a.z) * t / (d || 1) }; if (!w.canTraverse(p) || (w.inRiver(p) && !w.onBridge(p, -radius)) || solid(p, obstacles, radius)) return false; } return true; };
  const simple = [from]; let i = 0;
  while (i < result.length - 1) { let next = i + 1; for (let j = i + 2; j < result.length; j++) { if (clear(result[i], result[j])) next = j; else break; } simple.push(result[next]); i = next; }
  return simple;
}
async function travel(p, destination, { tolerance = 2.6, maxTicks = 14000 } = {}) {
  let s = JSON.parse(await p.evaluate(() => window.render_game_to_text()));
  if (s.phase !== 'playing' || s.dialogue) throw new Error(`Navigator needs active play without dialogue: ${JSON.stringify({ phase: s.phase, dialogue: s.dialogue })}`);
  let route = await plan(s.player, destination, s.vehicle ? 1.55 : 0.8, [...(s.vehicle ? s.npcs : []), ...(s.traffic || [])]);
  let index = 1; let ticks = 0; let stalled = 0; let lastPosition = { ...s.player }; let replans = 0;
  while (ticks < maxTicks) {
    const waypoint = route[index];
    const result = await p.evaluate(({ waypoint, destination, tolerance, last }) => {
      const t = window.liuzhouTest; const g = t.game; const actor = g.player;
      for (let i = 0; i < 6; i++) {
        const dx = waypoint.x - actor.x; const dz = waypoint.z - actor.z; const d = Math.hypot(dx, dz);
        const end = Math.hypot(destination.x - actor.x, destination.z - actor.z);
        if (last && end < tolerance && Math.abs(actor.speed) < 0.6) return { reached: true, d, end };
        if (g.vehicle) {
          const desired = Math.atan2(dx, dz); const diff = Math.atan2(Math.sin(desired - actor.angle), Math.cos(desired - actor.angle));
          const wanted = last && end < tolerance + 4 ? Math.max(0, (end - tolerance + 0.3) * 1.1) : Math.abs(diff) > 0.5 ? 3 : d < 10 ? 5 : 12;
          t.move({ forward: Math.abs(actor.speed) < wanted ? 1 : 0, turn: Math.max(-1, Math.min(1, -diff * 2.7)), brake: Math.abs(actor.speed) > wanted + 0.6 }, 1);
        } else {
          const desired = Math.atan2(dx, dz) - t.rig.yaw;
          t.move({ forward: Math.cos(desired), turn: -Math.sin(desired), sprint: d > 10 }, 1);
        }
      }
      return { d: Math.hypot(waypoint.x - actor.x, waypoint.z - actor.z), end: Math.hypot(destination.x - actor.x, destination.z - actor.z), player: { ...actor }, blocked: g.blocked };
    }, { waypoint, destination, tolerance, last: index === route.length - 1 });
    ticks += 6;
    if (result.reached || result.end < tolerance && !s.vehicle) return { ticks, route };
    const moved = result.player ? Math.hypot(result.player.x-lastPosition.x,result.player.z-lastPosition.z) : 1;
    stalled = moved < 0.015 ? stalled + 6 : 0;
    if (result.player) lastPosition = result.player;
    if (stalled > 60 && replans < 24) {
      s = JSON.parse(await p.evaluate(() => window.render_game_to_text()));
      if (s.vehicle && (s.traffic || []).some(c=>Math.hypot(c.x-s.player.x,c.z-s.player.z)<6)) {
        await p.evaluate(()=>{window.liuzhouTest.move({forward:-1},60);window.liuzhouTest.move({brake:true},45);});
        s = JSON.parse(await p.evaluate(() => window.render_game_to_text()));
      }
      route = await plan(s.player, destination, s.vehicle ? 1.55 : 0.8, [...(s.vehicle ? s.npcs : []), ...(s.traffic || [])]);
      index = 1; stalled = 0; replans++;
      continue;
    }
    if (index < route.length - 1 && result.d < (s.vehicle ? 3 : 1.2)) index++;
  }
  s = JSON.parse(await p.evaluate(() => window.render_game_to_text())); throw new Error(`Navigator stuck at waypoint ${index}/${route.length}: ${JSON.stringify({ destination, route, phase: s.phase, dialogue: s.dialogue, player: s.player, vehicle: s.vehicle, interaction: s.interaction, blocked: s.blocked, traffic:s.traffic, replans })}`);
}
module.exports = { plan, travel, model };
