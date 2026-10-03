import { enemyRole, isBoss, ROLE_NAMES } from './encounters';
import { BOSS_ROSTER } from './bossRoster';
import type { Enemy } from './types';

export function bestiaryKey(e: Pick<Enemy, 'id' | 'kind'>) { return e.id === 'cave-hulk' ? 'giant:guard' : isBoss(e) ? `boss:${e.kind}` : `role:${enemyRole(e)}`; }
export function bestiaryDescription(e: Pick<Enemy, 'id' | 'kind'>) {
  if (e.id === 'cave-hulk') return '岩苔巨躯在石隙尽头守望渡客，比寻常持盾人高出许多。举盾迟落与顶盾抢步交替；柱子能阻住它的追击，绕到侧面再出手。';
  if (isBoss(e)) return BOSS_ROSTER[e.kind]?.tip ?? (e.kind === 'nana' ? '七海守着七重潮门。快刺之后有延迟落潮，红色返潮需要跳跃或退开。' : '阿梓用切分与休止符试探旅人。留意迟落拍，圆舞横扫请跳跃或闪避。');
  return ({ skirmisher: '短棍游击者。普通挥打、延迟回敲与抢步扑击交替；扑空后会留出长收招。', bulwark: '正面架盾时抵挡轻击。绕到身后、等迟落重棍收招，或以重击撬开防线。', blade: '刀客擅长拔刀与踏影突进。收刀停顿不是空档；等刀光出现再弹反。', pike: '长枪卫控制狭窄路口。直刺射程长、角度窄；侧闪或引到开阔地再近身。', reaper: '钩镰客守在岸边转角。迟钩与扫苇覆盖侧面，扫苇不可正面防住。', staff: '竹杖行者以长杖、迟杖与扫堂控制距离。扫叶杖可以跃过，贴身贪刀很危险。', crossbow: '弩手先平举、绷弦，再放出可见箭矢。发射前方向会固定，横移、掩体、防御都有效；近身后会改用短刃。', slinger: '投石者举石蓄势，石块飞行较慢。借岩柱接近；追到身旁会迫使它用短刃。', boss: '' })[enemyRole(e)];
}
export function bestiaryName(e: Pick<Enemy, 'id' | 'kind' | 'name'>) { return isBoss(e) || e.id === 'cave-hulk' ? e.name : ROLE_NAMES[enemyRole(e)]; }
