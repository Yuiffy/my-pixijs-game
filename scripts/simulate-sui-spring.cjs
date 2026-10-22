const fs = require('node:fs');
const { LEVELS, createGame, freshSave, startLevel, stepGame, emptyInput, platformPosition } = require('./lib/sui-spring-model.cjs');

function options(s) {
  const p = s.player; const level = LEVELS[s.level];
  const targets = [p.x + 100, p.x + 200, p.x + 290, p.x + 380];
  for (const block of level.platforms) {
    const b = platformPosition(block, s.time);
    if (b.x + b.w < p.x - 30 || b.x > p.x + 400 || b.y < p.y + p.h - 180) continue;
    for (const x of [b.x + 25, b.x + b.w / 2, b.x + b.w - 40]) if (x > p.x + 20 && x < p.x + 410) targets.push(x);
  }
  if (s.bossLock) {
    const boss = s.enemies.find(e => e.alive && e.kind === 'director');
    if (boss) targets.push(boss.x + 10, boss.x - 75, boss.x + 90);
  }
  return [{ target: p.x + 120, jump: false, frames: 40 }, { target: p.x, jump: false, frames: 50 }, ...Array.from(new Set(targets.map(Math.round))).map(target => ({ target, jump: true, frames: 220 }))];
}
function execute(source, action) {
  const s = structuredClone(source); s.events = []; s.particles = [];
  const tape = []; let airborne = !s.player.grounded;
  for (let i = 0; i < action.frames && s.phase === 'playing'; i++) {
    const p = s.player;
    const delta = action.target - p.x - p.vx * 0.13;
    const input = { left: delta < -5, right: delta > 5, run: true, jump: action.jump && i < 65 };
    tape.push(input); stepGame(s, input); s.events = []; s.particles = [];
    if (!p.grounded) airborne = true;
    if (airborne && p.grounded && i > 5) break;
  }
  return { s, tape, action };
}
function score(s, source, collectAll = false) {
  if (s.phase === 'clear') return 100000;
  if (s.phase !== 'playing' || s.deaths > source.deaths) return -100000;
  const boss = s.enemies.find(e => e.kind === 'director');
  const previousBoss = source.enemies.find(e => e.kind === 'director');
  const targetStar = collectAll && LEVELS[s.level].pickups.find(v => v.kind === 'star' && !s.stars.includes(v.id));
  const routeProgress = targetStar ? targetStar.x - Math.hypot(s.player.x + 13 - targetStar.x, (s.player.y + 22 - targetStar.y) * 1.3) + s.stars.length * 1800 : s.player.x + (collectAll ? 5400 : 0);
  const progress = s.bossLock && boss?.alive ? 6400 - Math.abs(s.player.x - boss.x) * 0.8 + (3 - boss.hp) * 1100 + (collectAll ? 5400 : 0) : routeProgress + (boss && !boss.alive ? 3300 : 0);
  return progress + s.player.health * 110 + s.stars.length * 90 + (s.player.grounded ? 35 : -500) + (previousBoss ? (previousBoss.hp - boss.hp) * 1200 : 0);
}
function simulate(index, limit = 18000, collectAll = false) {
  const save = freshSave(); save.unlocked = 3;
  let s = createGame(save); startLevel(s, index); const tape = [];
  for (let decision = 0; tape.length < limit && s.phase !== 'clear'; decision++) {
    const candidates = options(s).map(a => execute(s, a)).sort((a, b) => score(b.s, s, collectAll) - score(a.s, s, collectAll));
    // Two landing lookahead avoids selecting a platform that cannot reach the next bank.
    let best = candidates[0]; let bestScore = -Infinity;
    for (const c of candidates.slice(0, 5)) {
      const immediate = score(c.s, s, collectAll); if (immediate < -90000) continue;
      const next = options(c.s).map(a => execute(c.s, a));
      const future = Math.max(...next.map(v => score(v.s, c.s, collectAll)));
      const value = immediate * 0.45 + future * 0.55;
      if (value > bestScore) { bestScore = value; best = c; }
    }
    if (!best || !best.tape.length) break;
    tape.push(...best.tape); s = best.s;
    if (process.env.SPRING_TRACE && decision % 10 === 0) console.log(index, decision, tape.length, Math.round(s.player.x), Math.round(s.player.y), s.deaths, s.player.health);
  }
  return { level: LEVELS[index].id, phase: s.phase, x: Math.round(s.player.x), time: s.clock, deaths: s.deaths, stars: s.stars, tape };
}
if (require.main === module) {
  fs.mkdirSync('.tmp/sui-spring', { recursive: true });
  for (let i = 0; i < 4; i++) { const result = simulate(i, 9000, true); console.log({ ...result, tape: result.tape.length }); fs.writeFileSync(`.tmp/sui-spring/pilot-${i}.json`, JSON.stringify(result)); }
}
module.exports = { simulate };
