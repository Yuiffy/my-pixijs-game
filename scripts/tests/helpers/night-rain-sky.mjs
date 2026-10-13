import { loadTypescriptModule as load } from './load-typescript-module.mjs';
export const engine = await load('src/components/nightRain/engine.ts');
export const world = await load('src/components/nightRain/world.ts');
export function place(s, p) { Object.assign(s.player, p, { lastGround: { ...p }, fallPeak: p.y, jumpHeight: 0, jumpVelocity: 0, action: 'idle', attack: null }); }
export function riverCompleted() {
  const s = engine.createGame(); engine.startGame(s);
  s.level = 8; s.weapon = 'ironUmbrella'; s.weaponLevel = 2;
  s.bossDefeated = true; s.chapterComplete = true; s.valleyComplete = true;
  s.chapterGates = ['archive-door']; s.valleyGates = ['valley-entry', 'river-door'];
  s.collected = ['food', 'chapter-bell', 'mill-sluice', 'monastery-sluice', 'river-heart'];
  s.defeatedGuests = ['gate-captain', 'rain-regent', 'drowned-warden', 'silent-abbot', 'river-serpent'];
  for (const e of s.enemies) if (e.kind === 'boss' || s.defeatedGuests.includes(e.id)) Object.assign(e, { hp: 0, action: 'dead' });
  s.player.hp = engine.maxHp(s); s.player.stamina = engine.maxStamina(s);
  place(s, { x: -150, y: 8, z: -533 });
  return s;
}
export const SKY_ROUTE = [
  [-139, -533, 'sky-entry'], [-133, -533], [-108, -533], [-108, -570],
  [-115.8, -574, 'sky-lamp'], [-108, -574], [-108, -570], [-132, -570],
  [-132, -591], [-146, -589, 'sky-cache'], [-146, -599], [-146, -626],
  [-143, -632, 'sky-dew'], [-126, -633], [-94, -633], [-94, -600.2, 'sky-return'],
  [-94, -590], [-76, -589, 'sky-prism-rose'], [-66, -590], [-66, -634],
  [-58, -634], [-18.8, -635, 'sky-court-lamp'], [-22, -645, 'sky-prism-moon'],
  [-40, -654.8, 'sky-door'], [-40, -668], [-40, -682], [-44, -697],
  [-44, -717], [-51.8, -723, 'sky-home-lamp'], [-43, -723, 'sky-heart'],
];
