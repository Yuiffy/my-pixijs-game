import { engine, world, riverCompleted, place } from './night-rain-sky.mjs';
export { engine, world, place };
export function skyCompleted() {
  const s = riverCompleted();
  s.skyGates = ['sky-entry', 'sky-door', 'sky-return'];
  s.collected.push('sky-prism-rose', 'sky-prism-moon', 'sky-heart', 'sky-dew');
  s.skyComplete = true; s.defeatedGuests.push('sky-astronomer');
  Object.assign(s.enemies.find(e => e.id === 'sky-astronomer'), { hp: 0, action: 'dead' });
  s.litLamps.push('sky-home-lamp'); s.checkpoint = 'sky-home-lamp';
  s.player.hp = engine.maxHp(s); s.player.stamina = engine.maxStamina(s);
  place(s, { x: -44, y: 40, z: -725 });
  return s;
}
export const BELL_ROUTE = [
  [-44, -732.4, 'bell-entry'], [-44, -758], [-53.8, -761, 'bell-porch-lamp'],
  [-61, -770], [-78, -770], [-78, -798], [-78, -806], [-84, -815],
  [-85, -819, 'bell-clapper'], [-86, -813], [-100, -813], [-109, -813],
  [-113, -817, 'bell-silence'], [-116, -806, 'bell-cache'], [-109, -813],
  [-96, -813], [-85, -813], [-70, -819], [-50, -814], [-50, -838],
  [-32, -838], [-20, -838], [-20, -821], [-9.8, -818, 'bell-court-lamp'],
  [-20, -818], [-20, -793.6, 'bell-return'], [-20, -780], [-20, -770],
  [-44, -770], [-53.8, -761, 'bell-porch-lamp'], [-44, -770], [-20, -770],
  [-20, -780], [-20, -798], [-20, -818], [-20, -838], [-32, -838],
  [-44, -840.4, 'bell-door'], [-44, -850], [-44, -866], [-44, -885],
  [-54.8, -892, 'bell-home-lamp'], [-44, -894, 'bell-heart'],
];
