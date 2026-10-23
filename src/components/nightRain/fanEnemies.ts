import type { Enemy } from './types';
import type { EnemyAttack } from './bossCombat';

export type Fan = 'biscuit' | 'otter' | 'shark' | 'rabbit' | 'frog';
const FAN_NAMES: Record<Fan, string> = { biscuit: '饼干岁', otter: '獭獭栞', shark: '脆鲨', rabbit: '机巧兔', frog: '蛙蛙' };
// Uniforms carry fan identity while preserving each post's authored combat role.
const FAN_UNIFORMS: Record<string, [Fan, string]> = {
  'stair-prowler': ['biscuit', '高阶伏兵'],
  'roof-duelist': ['biscuit', '屋脊刀客'],
  'canal-guard': ['rabbit', '侧廊看守'],
  'temple-duelist': ['frog', '守钟客'],
  'temple-prowler': ['frog', '石阶拾灯人'],
  'tide-guard': ['rabbit', '听潮守阶人'],
  'spice-prowler': ['biscuit', '雨披拾荒客'],
  'spice-spearman': ['biscuit', '水街长枪客'],
  'lower-guard': ['rabbit', '织坊看守'],
  'orchid-prowler': ['rabbit', '兰院伏客'],
  'weaver-prowler': ['rabbit', '染布伏兵'],
  'weaver-duelist': ['rabbit', '染布刀客'],
  'wall-lancer': ['otter', '烽灯枪卫'],
  'wall-duelist': ['otter', '高墙巡刀'],
  'overlook-guard': ['otter', '望楼守饷人'],
  'cistern-upper': ['shark', '苔壁拾灯人'],
  'cistern-duelist': ['shark', '水院守瓶客'],
  'cistern-guard': ['shark', '水闸看守'],
  'archive-lancer': ['frog', '经院铜枪卫'],
  'archive-duelist': ['frog', '抄经执刀人'],
  'bridge-guard': ['otter', '千灯桥卫'],
  'royal-lancer': ['frog', '王寺长枪卫'],
  'royal-duelist': ['frog', '雨冠侍刀'],
  'valley-reaver': ['otter', '崖廊蓑衣客'],
  'river-reaver': ['otter', '萤栈钩镰客'],
  'river-lancer': ['otter', '水栈渔矛卫'],
  'salt-reaver': ['shark', '盐市收债客'],
  'salt-monk': ['shark', '旧仓行脚僧'],
  'aqueduct-reaver': ['shark', '白沫钩镰客'],
  'aqueduct-monk': ['shark', '引水桥行僧'],
  'mountain-monk': ['frog', '竹影拦路僧'],
  'bamboo-reaver': ['frog', '竹关蓑衣客'],
  'garden-monk': ['frog', '灵露守竹人'],
  'east-monk': ['frog', '流经行脚僧'],
  'reed-reaver': ['otter', '芦苇藏钩客'],
  'bridge-monk': ['frog', '锁桥护灯僧'],
  'names-watch': ['biscuit', '删名巡册人'],
  'names-return-watch': ['biscuit', '旧巷守灯客'],
  'boatyard-watch': ['shark', '沉船钩镰客'],
  'boatyard-loft-watch': ['shark', '焚图行脚僧'],
  'well-monk': ['frog', '无名库守簿人'],
  'alley-ambusher': ['biscuit', '箱后伏伞客'],
  'market-ambusher': ['biscuit', '柱后拔刀客'],
  'crypt-blade': ['biscuit', '墓门试刃客'],
  'crypt-bow': ['rabbit', '骨廊守弩人'],
  'crypt-shield': ['biscuit', '藏骨持盾人'],
  'cave-pike': ['otter', '石隙执枪客'],
  'cave-slinger': ['rabbit', '晶苇投石人'],
  'cave-hulk': ['shark', '岩苔巨躯'],
  'sky-pass-guard': ['otter', '引渠执灯卫'],
  'sky-salt-blade': ['shark', '盐阶巡夜人'],
  'sky-prism-guard': ['shark', '折镜护卫'],
  'sky-pool-slinger': ['rabbit', '晒盐投石客'],
  'sky-tower-guard': ['otter', '废台守星人'],
  'sky-bridge-bow': ['rabbit', '折光望哨'],
  'sky-court-blade': ['frog', '镜湖巡礼者'],
  'bell-stair-pike': ['otter', '守阶钟卫'],
  'bell-store-guard': ['biscuit', '下库持盾人'],
  'bell-store-slinger': ['rabbit', '藏钟投石客'],
  'bell-archive-blade': ['frog', '无声抄经人'],
  'bell-rise-reaper': ['shark', '提钟钩镰卫'],
  'bell-gallery-bow': ['rabbit', '归声望哨'],
};
export const FAN_ENEMIES: Record<string, { fan: Fan; name: string; previous: string; cosmeticOnly?: boolean }> = {
  ...Object.fromEntries(Object.entries(FAN_UNIFORMS).map(([id, [fan, previous]]) => [id, { fan, name: `${FAN_NAMES[fan]} · ${previous}`, previous, cosmeticOnly: true }])),
  'courtyard-prowler': { fan: 'biscuit', name: '饼头人 · 雨巷巡夜', previous: '雨巷游荡者' },
  'alley-guard': { fan: 'biscuit', name: '饼干岁 · 护食盾卫', previous: '守巷棍客' },
  'harbor-prowler': { fan: 'rabbit', name: '机巧兔 · 工坊搬运', previous: '提灯收网人' },
  'net-duelist': { fan: 'rabbit', name: '机巧兔 · 试作护卫', previous: '晒网刀客' },
  'elephant-lancer': { fan: 'otter', name: '獭獭栞 · 门前冲锋', previous: '象门长枪卫' },
  'wall-guard': { fan: 'otter', name: '獭獭栞 · 护印卫', previous: '西垛守夜人' },
  'salt-guard': { fan: 'shark', name: '脆鲨 · 方块仓卫', previous: '盐市守仓人' },
  'mill-bank-reaver': { fan: 'shark', name: '脆鲨 · 建造巡逻', previous: '水车收网客' },
  'mill-lancer': { fan: 'shark', name: '脆鲨 · 镐庭门卫', previous: '沉舟守院人' },
  'monastery-monk': { fan: 'frog', name: '蛙蛙 · 歌庭听众', previous: '山寺迎客僧' },
  'monastery-lancer': { fan: 'frog', name: '蛙蛙 · 百阶引座', previous: '百阶执枪僧' },
};
export const fanOf = (e: Pick<Enemy, 'id'>) => FAN_ENEMIES[e.id]?.fan;
export const combatFanOf = (e: Pick<Enemy, 'id'>) => (FAN_ENEMIES[e.id]?.cosmeticOnly ? undefined : fanOf(e));
export const FAN_COLORS: Record<Fan, string> = { biscuit: '#d1a267', otter: '#99826e', shark: '#6fa8bf', rabbit: '#b4a3ce', frog: '#9cad65' };
export const FAN_TIPS: Record<Fan, string> = {
  biscuit: '饼头人把饼盾举过头时，会给附近同伴补给。用重击打崩架势，或趁它分饼时绕到侧后。',
  otter: '獭獭栞先压低身体，再沿直线滑冲。冲锋只覆盖窄道，向侧面让开后反击长收招。',
  shark: '脆鲨用施工镐守着七海的方块庭院。高举镐时稍等半拍，落地后有较长空档。',
  rabbit: '弥月工坊的机巧兔先抬起兔耳瞄准，随后射出可见弹体。侧移或借掩体接近。',
  frog: '歌庭听众用低位扫杆保护阿梓的唱段。扫杆可跳过；直刺需要侧移或弹反。',
};

export function fanAttack(e: Enemy): EnemyAttack | null {
  const fan = combatFanOf(e); const index = e.attackIndex % 3;
  const base: EnemyAttack = { name: '巡夜挥击', damage: 20, windup: 1.1, recovery: 1.25, range: 2.6, arc: 0.8, lunge: 0.4, parryable: true };
  if (fan === 'biscuit' && index === 1) return { ...base, name: '分饼 · 同伴补给', damage: 0, windup: 1.5, recovery: 1.6, range: 3.5, lunge: 0, support: true, style: 'overhead' };
  if (fan === 'otter' && index === 2) return { ...base, name: '獭獭滑冲', windup: 1.2, range: 4.3, arc: 0.35, lunge: 2.1, recovery: 1.9, style: 'thrust', damage: 25 };
  if (fan === 'shark' && index === 1) return { ...base, name: '脆鲨 · 方块重凿', windup: 1.85, recovery: 1.75, range: 3.2, damage: 30, style: 'overhead' };
  if (fan === 'rabbit' && index !== 2) return { ...base, name: '机巧兔 · 试作点射', range: 7, windup: 1.35, projectile: true, lunge: 0, style: 'shot', damage: 17 };
  if (fan === 'frog' && index === 2) return { ...base, name: '蛙蛙 · 低杆扫席', range: 3.2, arc: 2, parryable: false, jumpable: true, style: 'sweep' };
  return null;
}
