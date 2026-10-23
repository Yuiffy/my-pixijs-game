import type { EnemyKind } from './types';
import { CHARACTER_APPEARANCES as A, type CharacterId } from './characterAppearance';

export const BOSS_ROSTER: Partial<Record<EnemyKind, { name: string; legacy: string; previous?: string; hair: string; coat: string; trim: string; eye: string; character?: CharacterId; motif: string; first: string; second: string; tip: string }>> = {
  bellkeeper: { name: '无声钟守 · 余响', legacy: '无声钟守 · 余响', hair: '#7d9a91', coat: '#456d68', trim: '#d3b46d', eye: '#ffe4a7', motif: 'bell', first: '止水听钟', second: '长夜三响', tip: '举槌停顿后才会落下，可弹反；低扫要跳过。金色震圈依次扩散，第二阶段三连响，跳过或退到圈外；抄经室止鸣绳能压住第三响。' },
  astronomer: { ...A.chu2u, character: 'chu2u', name: '羽啾 · 观星守望', legacy: '羽啾 · 观星守望', motif: 'star', first: '旧位观测', second: '三声归星', tip: '落星只记住旧位置；离开金圈。三枚星弹逐次发射，横移或弹反，第三发后近身反击。' },
  colossus: { ...A.rutice, character: 'rutice', name: '露缇 · 藏骨巨像', legacy: '露缇 · 藏骨巨像', motif: 'stone', first: '墓灯迟落', second: '刻名震地', tip: '露缇举槌后会长停顿；重砸收招很长，震地红环请跳跃或退开。' },
  sentinel: { name: '沐石 · 风息守望', legacy: '沐石 · 风息守望', hair: '#b9d4c7', coat: '#59877b', trim: '#bdcb9d', eye: '#d7edbe', motif: 'rock', first: '岩槌听雨', second: '风息回旋', tip: '沐石约为旅人的三倍高。退到槌尖外，等双手落地再靠近；回旋范围很大。' },
  boss: { ...A.harei, character: 'harei', name: '花礼 · 夜市迎客', legacy: '封街人 · 铁伞', previous: '栞栞 · 雨切守街', motif: 'flower', first: '迎客怪话', second: '松影留客', tip: '吧唧弹看见后向侧面走；松苗变亮前离开，近身收招时反击。' },
  captain: { ...A.shiori, character: 'shiori', name: '栞栞 · 海獭守印', legacy: '双象卫长 · 铜印', previous: '米汀 · 双象断潮', motif: 'otter', first: '栞铃点雨', second: '海獭冲阵', tip: '跃袭会先标记落点。侧移躲落点，等栞栞落地再反击。' },
  regent: { ...A.rhea, character: 'rhea', name: '瑞娅 · 霜钟司夜', legacy: '长夜司灯 · 雨冠', previous: '弥月 · 机巧雨冠', motif: 'ice', first: '霜钟凝雨', second: '北欧静界', tip: '霜钟亮起后离开冻域；敌我同受时停，领域外才是反击位置。' },
  warden: { ...A.nana, character: 'nana', name: '七海 · 镐筑潮庭', legacy: '沉舟摆渡 · 缚流', previous: '花礼 · 沉舟花渡', motif: 'shark', first: '镐筑听潮', second: '凿凿反击', tip: '镐亮时七海会架势反击，不要贪刀；等反击架势结束或绕背出手。' },
  abbot: { ...A.azi, character: 'azi', name: '阿梓 · 终场歌庭', legacy: '无声住持 · 听澜', previous: '瑞娅 · 霜钟听澜', motif: 'frog', first: '青杖切分', second: '终场歌唱', tip: '留意唱段间隔与火弹方向。沿侧翼接近，在换气的空档反击。' },
  serpent: { ...A.yua, character: 'yua', name: '悠亚 · 星河守愿', legacy: '那伽守愿 · 千流', motif: 'star', first: '星河引灯', second: '天外归流', tip: '光束有细线预警，锁定后向侧面走；跳跃不能躲光束，双星光线会错开发射。' },
  elegist: { ...A.sumi, character: 'sumi', name: '礼墨 · 末灯绘名', legacy: '末灯守簿 · 无名', motif: 'ink', first: '墨笔守名', second: '千纸归灯', tip: '墨笔会故意迟落。看手腕而不是纸叶，落笔后的空档适合反击。' },
  nana: { ...A.nagisa, character: 'nagisa', name: '米汀 · 双象守潮', legacy: '七海 · 七重潮声', previous: '七海 · 七重潮声', motif: 'sailor', first: '双刀听潮', second: '脑控潮盾', tip: '米汀正面护盾亮起时绕到侧后，避免在盾前连续轻击。' },
  azi: { ...A.mizuki, character: 'mizuki', name: '弥月 · 苔灯机巧', legacy: '阿梓 · 苔灯夜曲', previous: '阿梓 · 苔灯夜曲', motif: 'rabbit', first: '兔耳点射', second: '浮游齐鸣', tip: '机械兔耳放出前先瞄准；观察炮位横移，贴近本体抓收招。' },
};

/** Encounter kind is a stable location key; character identity may move between chapters. */
export const bossCharacter = (kind: EnemyKind) => BOSS_ROSTER[kind]?.character;
