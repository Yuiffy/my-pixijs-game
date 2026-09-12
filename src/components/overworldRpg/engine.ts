import { CHARACTERS, ENTITIES, REGIONS, TILE, WORLD_HEIGHT, WORLD_WIDTH, isWalkable } from './content';
import type { BattleUnit, Point, RpgInput, RpgState, WorldEntity } from './types';

const HOME = { x: 10.5 * TILE, y: 10.5 * TILE };
const PLAYABLE = ['biscuit_sui', 'sui', 'shiori', 'pako', 'seki_boar_king'];
const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));
const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
const entityById = (id: string) => ENTITIES.find((e) => e.id === id);
export const xpToNextLevel = (level: number) => 45 * level + 25;
export const upgradeCost = (weapon: number) => 65 + weapon * 55;

export function createGame(): RpgState {
  return {
    version: 1,
mode: 'title',
player: { ...HOME },
party: [{ id: 'biscuit_sui', hp: CHARACTERS.biscuit_sui.hp }],
active: ['biscuit_sui'],
    level: 1,
xp: 0,
gold: 30,
potions: 3,
weapon: 0,
completed: [],
opened: [],
visited: ['town_camp'],
shards: 0,
    dialogue: null,
battle: null,
result: null,
manual: false,
paused: false,
playTime: 0,
message: '屏幕一闪，你成了虚境里的一块饼干。先去找岁己聊聊。',
facing: 1,
  };
}

export function startGame(state: RpgState): void {
  if (state.mode !== 'title') return;
  state.mode = 'explore';
}

export function maxHp(state: RpgState, id: string): number {
  return Math.round((CHARACTERS[id]?.hp ?? 1) * (1 + (state.level - 1) * 0.16));
}

export function nearestEntity(state: RpgState): WorldEntity | undefined {
  if (state.mode !== 'explore') return undefined;
  return ENTITIES.filter((e) => distance(state.player, e) <= 100)
    .sort((a, b) => distance(state.player, a) - distance(state.player, b))[0];
}

export function objective(state: RpgState): string {
  if (state.mode === 'ending') return '归途已至 · 感谢这一路的同行';
  if (state.completed.includes('rift_tyrant')) return '走向断线之门东侧的光，回到现实';
  if (!state.party.some((p) => p.id === 'sui')) return '在回音镇与岁己交谈，邀请她同行';
  if (!state.completed.includes('bamboo_echo')) return '前往东南的青笺林，找回栞栞的书页';
  if (!state.party.some((p) => p.id === 'shiori')) return '回到青笺林北侧，与栞栞交谈';
  if (state.shards < 3) return `收集归途碎片 ${state.shards}/3 · 暮泽守望者 / 停摆司钟 / 忘却镇守`;
  return '三枚碎片已齐 · 前往东部断线之门，挑战虚境主宰';
}

function campDialogue(state: RpgState, entity: WorldEntity): void {
  if (!state.visited.includes(entity.id)) state.visited.push(entity.id);
  state.dialogue = {
    entityId: entity.id,
speaker: entity.name,
    text: `${entity.description}\n全队可免费休息；武器锻造让每位伙伴的伤害提升。已到访的驿站之间可以自由往返。`,
    choices: [
      { id: 'rest', label: '免费休息 · 全队恢复' },
      { id: 'upgrade', label: state.weapon >= 4 ? '武器已锻造至最高' : `锻造全队武器 · ${upgradeCost(state.weapon)} 金`, disabled: state.weapon >= 4 || state.gold < upgradeCost(state.weapon) },
      { id: 'potion', label: '购买恢复药 · 20 金', disabled: state.gold < 20 || state.potions >= 99 },
      ...ENTITIES.filter((e) => e.kind === 'camp' && e.id !== entity.id && state.visited.includes(e.id)).map((e) => ({ id: `travel:${e.id}`, label: `前往${e.name}` })),
      { id: 'leave', label: '继续赶路' },
    ],
  };
}

export function interact(state: RpgState, id?: string): void {
  if (state.mode !== 'explore' || state.paused) return;
  const entity = id ? entityById(id) : nearestEntity(state);
  if (!entity || distance(state.player, entity) > 100) return;
  state.mode = 'dialogue';
  const leave = { id: 'leave', label: '再走走' };
  if (entity.kind === 'camp') { campDialogue(state, entity); return; }
  if (entity.kind === 'npc') {
    const recruited = state.party.some((p) => p.id === entity.characterId);
    const ready = !entity.requires || state.completed.includes(entity.requires);
    state.dialogue = {
      entityId: entity.id,
speaker: entity.name,
      text: recruited ? '「我就在队伍里。别忘了休息，我们会陪你走到最后。」' : ready ? `${entity.description}\n${entity.requires ? '噪声已经散去，这段记忆终于完整。' : ''}「带上我吧，一起去找回家的路。」` : entity.description,
      choices: !recruited && ready ? [{ id: 'recruit', label: `邀请${entity.name}加入队伍` }, leave] : [leave],
    };
    return;
  }
  if (entity.kind === 'chest') {
    state.dialogue = { entityId: entity.id, speaker: entity.name, text: state.opened.includes(entity.id) ? '行囊里的补给已被取走，祝你一路平安。' : entity.description, choices: state.opened.includes(entity.id) ? [leave] : [{ id: 'open', label: `收下补给 · ${entity.gold} 金 / 恢复药 ×2` }, leave] };
    return;
  }
  if (entity.kind === 'portal') {
    const ready = state.completed.includes('rift_tyrant');
    state.dialogue = { entityId: entity.id, speaker: entity.name, text: ready ? entity.description : '归途的光仍被虚境主宰锁住。伙伴们还在等你一起完成最后的约定。', choices: ready ? [{ id: 'return', label: '与伙伴道别，回到现实' }, { id: 'leave', label: '再留一会儿' }] : [leave] };
    return;
  }
  const complete = state.completed.includes(entity.id);
  const locked = entity.requires === 'shards' ? state.shards < 3 : !!entity.requires && !state.completed.includes(entity.requires);
  state.dialogue = {
    entityId: entity.id,
speaker: entity.name,
    text: complete ? '这里的噪声已经散去，道路重新安静下来。' : locked ? `还需收集三枚归途碎片（${state.shards}/3）。它们在晚风泽、鸣钟岭和星陨旧城。` : `${entity.description}\n对手：${(entity.enemies ?? []).map((enemy) => CHARACTERS[enemy].name).join('、')}。战后气血会保留，驿站可以免费恢复。`,
    choices: complete || locked ? [leave] : [{ id: 'fight', label: '整队迎战' }, { id: 'leave', label: '先准备一下' }],
  };
}

function closeDialogue(state: RpgState): void { state.dialogue = null; state.mode = 'explore'; }
function healParty(state: RpgState): void { state.party.forEach((p) => { p.hp = maxHp(state, p.id); }); }

export function chooseDialogue(state: RpgState, choiceId: string): void {
  if (state.mode !== 'dialogue' || !state.dialogue || state.paused) return;
  const choice = state.dialogue.choices.find((c) => c.id === choiceId);
  const entity = entityById(state.dialogue.entityId);
  if (!entity || !choice || choice.disabled) return;
  if (choiceId === 'leave') { closeDialogue(state); return; }
  if (choiceId === 'recruit' && entity.kind === 'npc' && entity.characterId && !state.party.some((p) => p.id === entity.characterId) && (!entity.requires || state.completed.includes(entity.requires))) {
    state.party.push({ id: entity.characterId, hp: maxHp(state, entity.characterId) });
    if (state.active.length < 4) state.active.push(entity.characterId);
    state.message = `${entity.name}加入队伍！${state.active.includes(entity.characterId) ? '已自动上阵。' : '在队伍页调整上阵伙伴（最多四人）。'}`;
    closeDialogue(state);
  } else if (choiceId === 'open' && entity.kind === 'chest' && !state.opened.includes(entity.id)) {
    state.opened.push(entity.id); state.gold += entity.gold ?? 0; state.potions = Math.min(99, state.potions + 2);
    state.message = `收获 ${entity.gold} 金与恢复药 ×2。`; closeDialogue(state);
  } else if (choiceId === 'fight' && entity.kind === 'encounter' && !state.completed.includes(entity.id) && (entity.requires !== 'shards' || state.shards >= 3)) {
    beginBattle(state, entity);
  } else if (choiceId === 'return' && entity.kind === 'portal' && state.completed.includes('rift_tyrant')) {
    state.completed.push('home'); state.mode = 'ending'; state.dialogue = null;
    state.message = '你在电脑前醒来。屏幕里传来熟悉的「晚上好」。那些同行的声音，始终都在。';
  } else if (entity.kind === 'camp') {
    if (choiceId === 'rest') { healParty(state); state.message = '全队恢复完毕。歇过脚，路就没那么远了。'; }
    if (choiceId === 'potion' && state.gold >= 20 && state.potions < 99) { state.gold -= 20; state.potions += 1; state.message = '买到一瓶恢复药。旅途或战斗中可恢复一名伤员。'; }
    if (choiceId === 'upgrade' && state.weapon < 4 && state.gold >= upgradeCost(state.weapon)) { state.gold -= upgradeCost(state.weapon); state.weapon += 1; state.message = `全队武器升至 +${state.weapon}，攻击力提高。`; }
    if (choiceId.startsWith('travel:')) {
      const target = entityById(choiceId.slice(7));
      if (target?.kind === 'camp' && state.visited.includes(target.id)) { state.player = { x: target.x, y: target.y + 30 }; state.message = `已抵达${target.name}。`; closeDialogue(state); return; }
    }
    campDialogue(state, entity);
  }
}

export function toggleMember(state: RpgState, id: string): void {
  if (state.mode !== 'explore' || id === 'biscuit_sui' || !state.party.some((p) => p.id === id)) return;
  if (state.active.includes(id)) { state.active = state.active.filter((member) => member !== id); state.message = `${CHARACTERS[id].name}暂时在后方休息。`; } else if (state.active.length < 4) { state.active.push(id); state.message = `${CHARACTERS[id].name}已上阵。`; } else state.message = '最多四人同时上阵。先让一位伙伴休息，再换人。';
}

function beginBattle(state: RpgState, entity: WorldEntity): void {
  const allies = state.active.map((id, i): BattleUnit => {
    const def = CHARACTERS[id];
    const member = state.party.find((p) => p.id === id)!;
    return { ...def, uid: `ally-${id}`, characterId: id, side: 'ally', x: def.range > 100 ? 195 : 320, y: 160 + i * 92, hp: member.hp, maxHp: maxHp(state, id), attack: Math.round(def.attack * (1 + (state.level - 1) * 0.14 + state.weapon * 0.13)), defense: Math.round(def.defense * (1 + (state.level - 1) * 0.12)), cooldown: 0.3 + i * 0.13, skillCooldown: 2.5 + i * 0.4, flash: 0, damage: 0 };
  });
  if (!allies.some((unit) => unit.hp > 0)) { state.message = '队伍已无力作战。先在驿站免费休息。'; closeDialogue(state); return; }
  const enemies = (entity.enemies ?? []).map((id, i): BattleUnit => {
    const def = CHARACTERS[id]; const power = entity.power ?? 1;
    const hp = Math.round(def.hp * power);
    return { ...def, uid: `enemy-${i}`, characterId: id, side: 'enemy', x: def.range > 100 ? 790 : 670, y: 190 + i * 110, hp, maxHp: hp, attack: Math.round(def.attack * power), defense: Math.round(def.defense * power), cooldown: 0.6 + i * 0.17, skillCooldown: 4.3 + i * 0.8, flash: 0, damage: 0 };
  });
  state.battle = { encounterId: entity.id, elapsed: 0, units: [...allies, ...enemies], effects: [], effectCounter: 0 };
  state.mode = 'battle'; state.dialogue = null; state.result = null; state.message = `${entity.name} · ${state.manual ? '手控饼干岁，伙伴自动作战' : '全队自动作战'}`;
}

function effect(state: RpgState, target: Point, kind: 'hit' | 'heal' | 'skill', text: string, color: number, from?: Point): void {
  const { battle } = state;
  if (!battle) return;
  battle.effects.push({ id: ++battle.effectCounter, x: target.x, y: target.y, kind, text, color, life: kind === 'skill' ? 1.1 : 0.8, ...(from ? { targetX: from.x, targetY: from.y } : {}) });
  if (battle.effects.length > 45) battle.effects.splice(0, battle.effects.length - 45);
}

function hit(state: RpgState, unit: BattleUnit, target: BattleUnit, multiplier = 1): void {
  if (target.hp <= 0) return;
  const amount = Math.max(2, Math.round(unit.attack * multiplier - target.defense * 0.55));
  target.hp = Math.max(0, target.hp - amount); target.flash = 0.14; unit.damage += amount;
  effect(state, target, 'hit', `−${amount}`, unit.side === 'ally' ? 0xffda88 : 0xffa0a3, unit);
}

function heal(state: RpgState, unit: BattleUnit, amount: number): void {
  if (unit.hp <= 0) return;
  const gained = Math.min(unit.maxHp - unit.hp, Math.round(amount));
  if (gained <= 0) return;
  unit.hp += gained; effect(state, unit, 'heal', `+${gained}`, 0xa7e8b0);
}

function castSkill(state: RpgState, unit: BattleUnit, target: BattleUnit, foes: BattleUnit[], friends: BattleUnit[]): void {
  const id = unit.characterId;
  effect(state, unit, 'skill', CHARACTERS[id].skill, CHARACTERS[id].color);
  unit.skillCooldown = id === 'sui' ? 7 : id === 'rift-tyrant' ? 5.5 : 6.5;
  if (id === 'sui') {
    const weakest = [...friends].sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp)[0];
    friends.forEach((friend) => heal(state, friend, unit.attack * (friend === weakest ? 2.8 : 1.1)));
  } else if (id === 'pako' || id === 'raccoon-archer') { hit(state, unit, target, 1.6); hit(state, unit, target, 1.1); } else if (id === 'shiori' || id === 'clock-gunner') {
    foes.filter((foe) => distance(foe, target) < 125).forEach((foe) => { hit(state, unit, foe, 1.85); foe.cooldown = Math.max(foe.cooldown, 0.8); });
  } else if (id === 'rift-tyrant') { foes.forEach((foe) => hit(state, unit, foe, unit.hp < unit.maxHp / 2 ? 1.2 : 0.9)); } else if (id === 'rift-stalker-head') {
    const back = [...foes].sort((a, b) => b.range - a.range)[0];
    unit.x = clamp(back.x + (unit.side === 'enemy' ? 35 : -35), 45, 915); unit.y = clamp(back.y + 20, 90, 540); hit(state, unit, back, 1.7);
  } else {
    foes.filter((foe) => distance(foe, unit) < 115).forEach((foe) => {
      hit(state, unit, foe, id === 'biscuit_sui' ? 2.2 : 1.55);
      foe.cooldown = Math.max(foe.cooldown, 0.7);
      if (id === 'seki_boar_king') foe.x = clamp(foe.x + 26, 45, 915);
    });
    if (id === 'seki_boar_king') heal(state, unit, unit.maxHp * 0.13);
  }
}

export function usePotion(state: RpgState): void {
  if ((state.mode !== 'explore' && state.mode !== 'battle') || state.paused) return;
  if (state.potions <= 0) { state.message = '恢复药用完了。驿站可以免费休息，也能购买恢复药。'; return; }
  if (state.mode === 'battle' && state.battle) {
    const unit = state.battle.units.filter((u) => u.side === 'ally' && u.hp > 0 && u.hp < u.maxHp).sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp)[0];
    if (!unit) { state.message = '当前没有受伤且仍在场的伙伴。'; return; }
    state.potions -= 1; heal(state, unit, unit.maxHp * 0.6); state.message = `${unit.name}使用恢复药。`;
  } else {
    const member = [...state.party].filter((p) => p.hp < maxHp(state, p.id)).sort((a, b) => a.hp / maxHp(state, a.id) - b.hp / maxHp(state, b.id))[0];
    if (!member) { state.message = '全队气血充足，先把药留着。'; return; }
    state.potions -= 1; member.hp = Math.min(maxHp(state, member.id), member.hp + Math.round(maxHp(state, member.id) * 0.6)); state.message = `${CHARACTERS[member.id].name}恢复了气血。`;
  }
}

function finishBattle(state: RpgState, won: boolean): void {
  const { battle } = state;
  if (!battle) return;
  const entity = entityById(battle.encounterId)!;
  battle.units.filter((u) => u.side === 'ally').forEach((unit) => { const member = state.party.find((p) => p.id === unit.characterId); if (member) member.hp = Math.round(unit.hp); });
  let gold = 0; let xp = 0; let shard = false;
  let text = '队伍撤回最近的驿站，掌柜已经备好了热茶。全队免费恢复，没有损失金币或碎片。调整伙伴、锻造武器后再来。';
  if (won && !state.completed.includes(entity.id)) {
    state.completed.push(entity.id); gold = entity.gold ?? 0; xp = entity.xp ?? 0; shard = !!entity.shard;
    state.gold += gold; state.xp += xp; if (shard) state.shards += 1;
    const before = state.level;
    while (state.level < 10 && state.xp >= xpToNextLevel(state.level)) { state.xp -= xpToNextLevel(state.level); state.level += 1; }
    text = shard ? `归途碎片 ${state.shards}/3。远方的光又亮了一点，伙伴们记起了更多现实世界的事情。` : entity.id === 'bamboo_echo' ? '书页回到你的手中。去青笺林北侧找栞栞，她正在等你。' : entity.id === 'rift_tyrant' ? '无尽的噪声终于止息。向东走吧，归途就在光里。' : '这一带的道路安静下来。继续寻找伙伴与归途碎片。';
    if (state.level > before) { healParty(state); text += `\n队伍升至 ${state.level} 级！全队气血恢复，属性提升。`; }
  }
  if (!won) {
    const camp = ENTITIES.filter((e) => e.kind === 'camp' && state.visited.includes(e.id)).sort((a, b) => distance(a, state.player) - distance(b, state.player))[0]!;
    state.player = { x: camp.x, y: camp.y + 30 }; healParty(state);
  }
  state.result = { won, title: won ? `${entity.name} · 已平息` : '暂时撤退', text, gold, xp, shard };
  state.mode = 'result'; state.message = won ? '胜利！查看战报后继续旅程。' : '失败没有带走你的旅程。整队后再来。';
}

export function continueResult(state: RpgState): void {
  if (state.mode !== 'result' || state.paused) return;
  state.mode = 'explore'; state.result = null; state.battle = null;
}

function moveWorld(state: RpgState, dt: number, input: RpgInput): void {
  let dx = input.x; let dy = input.y;
  if (!dx && !dy && input.target) { dx = input.target.x - state.player.x; dy = input.target.y - state.player.y; }
  const length = Math.hypot(dx, dy);
  if (!Number.isFinite(length) || length < 1) return;
  const amount = Math.min(190 * dt, input.target && !input.x && !input.y ? length : Infinity);
  dx = (dx / length) * amount; dy = (dy / length) * amount;
  if (isWalkable(state.player.x + dx, state.player.y)) state.player.x += dx;
  if (isWalkable(state.player.x, state.player.y + dy)) state.player.y += dy;
  if (Math.abs(dx) > 0.01) state.facing = dx > 0 ? 1 : -1;
  for (const region of REGIONS) if (distance(state.player, region) < 240 && !state.visited.includes(region.id)) state.visited.push(region.id);
  for (const entity of ENTITIES) if (entity.kind === 'camp' && distance(state.player, entity) <= 100 && !state.visited.includes(entity.id)) { state.visited.push(entity.id); state.message = `发现${entity.name}。可免费休息，并与其他驿站往返。`; }
}

function stepBattle(state: RpgState, dt: number, input: RpgInput): void {
  const battle = state.battle!;
  battle.elapsed += dt;
  battle.effects.forEach((e) => { e.life -= dt; }); battle.effects = battle.effects.filter((e) => e.life > 0);
  for (const unit of battle.units) {
    unit.flash = Math.max(0, unit.flash - dt); unit.cooldown = Math.max(0, unit.cooldown - dt); unit.skillCooldown = Math.max(0, unit.skillCooldown - dt);
    if (unit.hp <= 0) continue;
    const foes = battle.units.filter((u) => u.side !== unit.side && u.hp > 0);
    const friends = battle.units.filter((u) => u.side === unit.side && u.hp > 0);
    if (!foes.length) break;
    const target = [...foes].sort((a, b) => distance(unit, a) - distance(unit, b))[0];
    const manual = state.manual && unit.characterId === 'biscuit_sui' && unit.side === 'ally';
    if (manual) {
      const dx = input.x || (!input.y && input.target ? input.target.x - unit.x : 0);
      const dy = input.y || (!input.x && input.target ? input.target.y - unit.y : 0);
      const length = Math.hypot(dx, dy);
      if (length > 1e-6) { const amount = Math.min(155 * dt, input.target && !input.x && !input.y ? length : Infinity); unit.x = clamp(unit.x + (dx / length) * amount, 45, 915); unit.y = clamp(unit.y + (dy / length) * amount, 90, 540); }
    } else if (distance(unit, target) > unit.range + 12) {
      const length = distance(unit, target); const amount = Math.min(unit.speed * dt, length - unit.range);
      unit.x += ((target.x - unit.x) / length) * amount; unit.y += ((target.y - unit.y) / length) * amount;
    }
    if (unit.skillCooldown <= 0 && (!manual || input.skill) && (unit.characterId === 'sui' || unit.characterId === 'rift-tyrant' || distance(unit, target) <= Math.max(110, unit.range + 25))) castSkill(state, unit, target, foes, friends);
    if (unit.cooldown <= 0 && distance(unit, target) <= unit.range + 15) {
      hit(state, unit, target); unit.cooldown = unit.characterId === 'rift-tyrant' && unit.hp < unit.maxHp / 2 ? 0.72 : unit.range > 100 ? 1.1 : 0.9;
    }
  }
  // Separate same-side bodies to keep the melee readable without changing target choice.
  const living = battle.units.filter((u) => u.hp > 0);
  living.forEach((unit, index) => living.slice(index + 1).forEach((other) => {
    if (unit.side !== other.side) return;
    const length = distance(unit, other);
    if (length >= 34) return;
    const dx = length < 0.01 ? 0 : (unit.x - other.x) / length;
    const dy = length < 0.01 ? 1 : (unit.y - other.y) / length;
    const push = Math.min((34 - length) / 2, 32 * dt);
    unit.x = clamp(unit.x + dx * push, 45, 915); unit.y = clamp(unit.y + dy * push, 90, 540);
    other.x = clamp(other.x - dx * push, 45, 915); other.y = clamp(other.y - dy * push, 90, 540);
  }));
  if (!battle.units.some((u) => u.side === 'enemy' && u.hp > 0)) finishBattle(state, true);
  else if (!battle.units.some((u) => u.side === 'ally' && u.hp > 0) || battle.elapsed >= 150) finishBattle(state, false);
}

export function stepGame(state: RpgState, ms: number, input: RpgInput): void {
  if (state.paused || !Number.isFinite(ms) || ms <= 0 || (state.mode !== 'explore' && state.mode !== 'battle')) return;
  let remaining = Math.min(ms, 60000) / 1000;
  while (remaining > 0.000001 && (state.mode === 'explore' || state.mode === 'battle')) {
    const dt = Math.min(0.05, remaining); remaining -= dt; state.playTime += dt;
    if (state.mode === 'explore') moveWorld(state, dt, input); else stepBattle(state, dt, input);
  }
}

export function findPath(from: Point, to: Point): Point[] {
  if (!isWalkable(to.x, to.y) || !isWalkable(from.x, from.y)) return [];
  const columns = WORLD_WIDTH / TILE; const rows = WORLD_HEIGHT / TILE;
  const sx = Math.floor(from.x / TILE); const sy = Math.floor(from.y / TILE); const tx = Math.floor(to.x / TILE); const ty = Math.floor(to.y / TILE);
  const start = sy * columns + sx; const goal = ty * columns + tx;
  if (start === goal) return [{ ...to }];
  const parent = new Int32Array(columns * rows).fill(-1); parent[start] = start; const queue = [start];
  for (let i = 0; i < queue.length && parent[goal] === -1; i += 1) {
    const current = queue[i]; const x = current % columns; const y = Math.floor(current / columns);
    for (const [dx, dy] of [[1, 0], [0, 1], [-1, 0], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]]) {
      const nx = x + dx; const ny = y + dy; const next = ny * columns + nx;
      if (nx < 0 || ny < 0 || nx >= columns || ny >= rows || parent[next] !== -1 || !isWalkable((nx + 0.5) * TILE, (ny + 0.5) * TILE)) continue;
      if (dx && dy && (!isWalkable((x + dx + 0.5) * TILE, (y + 0.5) * TILE) || !isWalkable((x + 0.5) * TILE, (y + dy + 0.5) * TILE))) continue;
      parent[next] = current; queue.push(next);
    }
  }
  if (parent[goal] === -1) return [];
  const path: Point[] = [];
  for (let node = goal; node !== start; node = parent[node]) path.push({ x: ((node % columns) + 0.5) * TILE, y: (Math.floor(node / columns) + 0.5) * TILE });
  path.reverse(); path.push({ ...to }); return path;
}

export function saveGame(state: RpgState): string {
  // Party HP is only committed after combat, so a battle save safely returns to its entrance.
  return JSON.stringify({ ...state, mode: state.mode === 'ending' ? 'ending' : 'explore', dialogue: null, battle: null, result: null, paused: false, message: state.mode === 'battle' ? '已返回开战前。整理队伍后可再次挑战。' : state.message });
}

function object(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null && !Array.isArray(value); }
function finite(value: unknown, min: number, max: number, integer = false): value is number { return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max && (!integer || Number.isInteger(value)); }
function strings(value: unknown, allowed: string[], max: number): value is string[] { return Array.isArray(value) && value.length <= max && value.every((id) => typeof id === 'string' && allowed.includes(id)) && new Set(value).size === value.length; }

export function loadGame(raw: string): RpgState | null {
  try {
    if (typeof raw !== 'string' || raw.length > 100000) return null;
    const value: unknown = JSON.parse(raw);
    if (!object(value) || value.version !== 1 || !['explore', 'ending'].includes(String(value.mode)) || !object(value.player) || !finite(value.player.x, 0, WORLD_WIDTH) || !finite(value.player.y, 0, WORLD_HEIGHT) || !isWalkable(value.player.x, value.player.y)) return null;
    if (!finite(value.level, 1, 10, true) || !finite(value.xp, 0, 100000, true) || !finite(value.gold, 0, 100000, true) || !finite(value.potions, 0, 99, true) || !finite(value.weapon, 0, 4, true) || !finite(value.shards, 0, 3, true) || !finite(value.playTime, 0, 100000000) || !finite(value.facing, -1, 1, true) || typeof value.manual !== 'boolean') return null;
    if (!strings(value.completed, ENTITIES.filter((e) => e.kind === 'encounter' || e.kind === 'portal').map((e) => e.id), ENTITIES.length) || !strings(value.opened, ENTITIES.filter((e) => e.kind === 'chest').map((e) => e.id), ENTITIES.length) || !strings(value.visited, [...REGIONS.map((r) => r.id), ...ENTITIES.filter((e) => e.kind === 'camp').map((e) => e.id)], ENTITIES.length + REGIONS.length) || !value.visited.includes('town_camp')) return null;
    if (!Array.isArray(value.party) || value.party.length < 1 || value.party.length > PLAYABLE.length || !value.party.every((p) => object(p) && typeof p.id === 'string' && PLAYABLE.includes(p.id) && finite(p.hp, 0, Math.round(CHARACTERS[p.id].hp * (1 + (Number(value.level) - 1) * 0.16))))) return null;
    const members = value.party as { id: string; hp: number }[];
    if (new Set(members.map((p) => p.id)).size !== members.length || !members.some((p) => p.id === 'biscuit_sui') || !strings(value.active, members.map((p) => p.id), 4) || !value.active.includes('biscuit_sui')) return null;
    const { completed } = value;
    if (value.shards !== ENTITIES.filter((e) => e.shard && completed.includes(e.id)).length || (completed.includes('rift_tyrant') && value.shards !== 3) || (value.mode === 'ending' && !completed.includes('home')) || (completed.includes('home') && !completed.includes('rift_tyrant'))) return null;
    if (members.some((p) => { const npc = ENTITIES.find((e) => e.kind === 'npc' && e.characterId === p.id); return npc?.requires && !completed.includes(npc.requires); })) return null;
    if (value.level < 10 && value.xp >= xpToNextLevel(value.level)) return null;
    const restored = createGame();
    return { ...restored, mode: value.mode as 'explore' | 'ending', player: { x: value.player.x, y: value.player.y }, level: value.level, xp: value.xp, gold: value.gold, potions: value.potions, weapon: value.weapon, shards: value.shards, playTime: value.playTime, facing: value.facing, manual: value.manual, party: members.map((p) => ({ ...p })), active: [...value.active], completed: [...completed], opened: [...value.opened], visited: [...value.visited], message: typeof value.message === 'string' ? value.message.slice(0, 300) : '旅途已继续。' };
  } catch { return null; }
}
