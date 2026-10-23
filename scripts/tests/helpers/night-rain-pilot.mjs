// The same observer/controller drives unit and real browser playtests. It only
// emits ordinary world movement and button presses; never alters game state.
import { loadTypescriptModule } from './load-typescript-module.mjs';
const { findPath } = await loadTypescriptModule('src/components/nightRain/companion.ts');
const { enemyAttack } = await loadTypescriptModule('src/components/nightRain/enemyCombat.ts');
const { weaponAttack } = await loadTypescriptModule('src/components/nightRain/weapons.ts');
export const NIGHT_ROUTE = [
  { x: 1, z: 15, interact: 'laptop' },
  { x: 10, z: 15 }, { x: 10, z: 8 }, { x: 10, z: -1 },
  { x: 7, z: -1 }, { x: 7, z: 7 }, { x: 0, z: 8, interact: 'courtyard' },
  { x: -3, z: 4 }, { x: -8, z: 2 }, { x: -13, z: 1 },
  { x: -15.5, z: 0, interact: 'alley-cache' },
  { x: -15.5, z: -5 }, { x: -15.5, z: -10 }, { x: -15.5, z: -16 },
  { x: -15.5, z: -22.5, interact: 'roof-charm' },
  { x: -11, z: -22 }, { x: -6, z: -22 }, { x: -3.5, z: -22.5, interact: 'rooftop-note' },
  { x: 2.5, z: -22.5 }, { x: 2.5, z: -29 }, { x: 2.5, z: -35 },
  { x: 4, z: -36.5, ignoreBoss: true }, { x: 12, z: -36.5, ignoreBoss: true }, { x: 12, z: -29, ignoreBoss: true },
  { x: 12, z: -21 }, { x: 13, z: -10.7, interact: 'shortcut' },
  { x: 11.3, z: -6.5 }, { x: 11.3, z: -1 }, { x: 7, z: -1 }, { x: 7, z: 7 },
  { x: 0, z: 8, upgrade: true },
  { x: 7, z: 7 }, { x: 7, z: -1 }, { x: 11.3, z: -1 }, { x: 12, z: -12 },
  { x: 12, z: -28 }, { x: 12, z: -38 }, { x: 5, z: -41 },
  { x: 4, z: -46, interact: 'food' },
];

const gap = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
export function chooseInput(s, destination, { parryOnly = false } = {}) {
  const p = s.player;
  const enemy = s.enemies.filter(e => e.hp > 0 && e.aggro && !(destination.ignoreBoss && e.kind === 'boss') && Math.abs(e.y - p.y) < 1.5 && gap(e, p) < 8)
    .sort((a, b) => gap(a, p) - gap(b, p))[0];
  if (!enemy) {
    if (s.lockedId) return { x: 0, z: 0, lock: true };
    const dx = destination.x - p.x; const dz = destination.z - p.z; const d = Math.hypot(dx, dz);
    return { x: d > 0.12 ? dx / d : 0, z: d > 0.12 ? dz / d : 0 };
  }
  const d = gap(enemy, p); const dx = (enemy.x - p.x) / Math.max(d, 0.01); const dz = (enemy.z - p.z) / Math.max(d, 0.01);
  const input = { x: 0, z: 0 };
  if (!s.lockedId) input.lock = true;
  const attack = enemyAttack(enemy); const sweep = !attack.parryable;
  if (p.action !== 'idle') return input;
  const resonance = s.bossFields?.find(f => f.kind === 'resonance' && !f.hit && Math.abs(f.y - p.y) < 1 && gap(f, p) <= f.radius + .3 && f.delay + (gap(f, p) / f.radius) * f.duration - f.age > -.1 && f.delay + (gap(f, p) / f.radius) * f.duration - f.age < .7);
  if (resonance) {
    const arrival = resonance.delay + (gap(resonance, p) / resonance.radius) * resonance.duration - resonance.age;
    if (arrival < .28 && p.jumpHeight === 0) input.jump = true;
    return input;
  }
  const hazard = s.bossFields?.find(f => {
    if(Math.abs(f.y-p.y)>=1) return false;
    if(['pine','freeze','leap','starfall'].includes(f.kind)) return gap(f,p)<f.radius+0.5;
    if(f.kind==='beam') {const x=p.x-f.x,z=p.z-f.z;return x*Math.sin(f.facing)+z*Math.cos(f.facing)>0 && Math.abs(x*Math.cos(f.facing)-z*Math.sin(f.facing))<f.radius+0.5;}
    return false;
  });
  if(hazard) {
    const away=gap(hazard,p);
    const lateral=hazard.kind==='beam'||away<.1;
    input.x=lateral?Math.cos(hazard.facing):(p.x-hazard.x)/away;
    input.z=lateral?-Math.sin(hazard.facing):(p.z-hazard.z)/away;
    return input;
  }
  const starcards=s.bossFields?.find(f=>f.owner===enemy.id&&f.kind==='starcards'&&f.age<f.delay+f.duration);
  if(starcards) { const back=d<3.5?1:0; input.x=dz-dx*back;input.z=-dx-dz*back;return input; }
  const stance=s.bossFields?.find(f=>f.owner===enemy.id&&['counter','shield'].includes(f.kind)&&f.age<f.delay+f.duration);
  if(stance?.kind==='counter') {
    const front=Math.abs(Math.atan2(Math.sin(Math.atan2(p.x-enemy.x,p.z-enemy.z)-enemy.facing),Math.cos(Math.atan2(p.x-enemy.x,p.z-enemy.z)-enemy.facing)))<1.5;
    if(front){input.x=dz;input.z=-dx;return input;}
  }
  const channel=s.bossFields?.find(f=>f.owner===enemy.id&&['song','drones'].includes(f.kind)&&f.age<f.delay+f.duration);
  if((channel||stance?.kind==='shield')&&d<2.6&&p.stamina>45){input.heavy=true;return input;}

  if (enemy.action === 'stagger') {
    if (d < 2.35) input.light = true;
    else { input.x = dx; input.z = dz; }
  } else if (s.projectiles?.some(b => { const speed2=b.vx*b.vx+b.vz*b.vz; const t=((p.x-b.x)*b.vx+(p.z-b.z)*b.vz)/speed2; return t>=0&&t<.16&&Math.hypot(b.x+b.vx*t-p.x,b.z+b.vz*t-p.z)<.45&&Math.abs(b.y-(p.y+1))<.9; })) {
    input.parry = true;
  } else if (!attack.skill && !attack.support && !attack.projectile && enemy.action === 'windup' && enemy.timer <= 0.14) {
    if (sweep) { input.dodge = true; input.x = -dx; input.z = -dz; }
    else input.parry = true;
  } else if (p.hp <= 48 && p.flasks > 0 && enemy.action === 'recover' && enemy.timer > 0.8) {
    input.heal = true;
  } else if (!parryOnly && enemy.action === 'recover' && enemy.timer > weaponAttack(s, 'heavy').duration + 0.08 && d < 2.6 && p.stamina > 55) {
    input.heavy = true;
  } else if (!parryOnly && enemy.action === 'recover' && enemy.timer > weaponAttack(s, 'light1').duration + 0.08 && d < 2.25 && p.stamina > 35) {
    input.light = true;
  } else if (d > (sweep ? 2.1 : 1.7) && enemy.action !== 'attack') {
    input.x = dx; input.z = dz;
  }
  return input;
}

export function walkTo(engine, s, target, limitMs = 45000, options = {}) {
  let ms = 0; let blockedMs = 0; let detour = [];
  while (ms < limitMs && s.mode === 'playing') {
    const inCombat = s.enemies.some(e => e.hp > 0 && e.aggro && !(target.ignoreBoss && e.kind === 'boss') && Math.abs(e.y - s.player.y) < 1.5 && gap(e, s.player) < 8);
    if (gap(s.player, target) < 0.22 && !inCombat && s.player.action === 'idle') return ms;
    if (inCombat) detour = [];
    while (detour.length && gap(s.player, detour[0]) < 0.22) detour.shift();
    const before = { ...s.player };
    engine.stepGame(s, 40, chooseInput(s, detour[0] ?? target, options)); ms += 40;
    blockedMs = !inCombat && s.player.action === 'idle' && gap(before, s.player) < 0.01 ? blockedMs + 40 : 0;
    // Combat can leave the pilot on the other side of a crate from its old waypoint.
    // Replan the walking path, as a player or the live guide would, without teleporting.
    if (blockedMs >= 600) { detour = findPath(s.player, target, s).slice(1); blockedMs = 0; }
  }
  throw new Error(`Route stalled at ${JSON.stringify(target)} after ${ms}ms: ${JSON.stringify({ p: s.player, mode: s.mode, enemies: s.enemies.filter(e => e.aggro), target })}`);
}

export function playFirstLevel(engine, s = engine.createGame(), options = {}) {
  engine.startGame(s);
  const stages = [];
  for (const target of NIGHT_ROUTE) {
    walkTo(engine, s, target, 90000, options);
    if (target.interact) {
      engine.interact(s);
      if (target.interact === 'food' && s.mode !== 'interlude') throw new Error('Dinner did not enter its story interlude');
      if (target.interact === 'shortcut' && !s.shortcut) throw new Error('Inside lever did not open shortcut');
    }
    if (target.upgrade && !engine.upgrade(s)) throw new Error('Earned money could not be used at checkpoint');
    stages.push({ target, time: s.time, hp: s.player.hp, kills: s.kills, parries: s.parries, executions: s.executions });
  }
  return { state: s, stages };
}
