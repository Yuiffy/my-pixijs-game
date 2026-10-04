import type { EnemyKind } from './types';
import { CHARACTER_APPEARANCES as A, type CharacterId } from './characterAppearance';

export const BOSS_ROSTER: Partial<Record<EnemyKind, { name: string; legacy: string; hair: string; coat: string; trim: string; eye: string; character?: CharacterId; motif: string; first: string; second: string; tip: string }>> = {
  colossus: { ...A.rutice, character: 'rutice', name: '露缇 · 藏骨巨像', legacy: '露缇 · 藏骨巨像', motif: 'stone', first: '墓灯迟落', second: '刻名震地', tip: '露缇举槌后会长停顿；重砸收招很长，震地红环请跳跃或退开。' },
  sentinel: { name: '沐石 · 风息守望', legacy: '沐石 · 风息守望', hair: '#b9d4c7', coat: '#59877b', trim: '#bdcb9d', eye: '#d7edbe', motif: 'rock', first: '岩槌听雨', second: '风息回旋', tip: '沐石约为旅人的三倍高。退到槌尖外，等双手落地再靠近；回旋范围很大。' },
  boss: { ...A.shiori, character: 'shiori', name: '栞栞 · 雨切守街', legacy: '封街人 · 铁伞', motif: 'otter', first: '栞铃点雨', second: '花返雨切', tip: '拔刀会停半拍，等刀真正出鞘再弹反；花返横切需要跳跃或退开。' },
  captain: { ...A.nagisa, character: 'nagisa', name: '米汀 · 双象断潮', legacy: '双象卫长 · 铜印', motif: 'sailor', first: '双刀听潮', second: '断潮换步', tip: '收刀时会侧步换位，留意锁定方向；重切后的长收招是机会。' },
  regent: { ...A.mizuki, character: 'mizuki', name: '弥月 · 机巧雨冠', legacy: '长夜司灯 · 雨冠', motif: 'rabbit', first: '兔耳点射', second: '双月齐鸣', tip: '兔耳炮直线点射。横移躲开射线，双炮迟落后有较长空档。' },
  warden: { ...A.harei, character: 'harei', name: '花礼 · 沉舟花渡', legacy: '沉舟摆渡 · 缚流', motif: 'flower', first: '花舟守渡', second: '落花起浪', tip: '花桨落地才算重击；第二式花浪扫得更远，贴身贪刀容易被卷回。' },
  abbot: { ...A.rhea, character: 'rhea', name: '瑞娅 · 霜钟听澜', legacy: '无声住持 · 听澜', motif: 'ice', first: '霜钟凝雨', second: '静界听澜', tip: '第二式霜界会拖慢近处的体力恢复；退到霜环外再调整呼吸。' },
  serpent: { ...A.yua, character: 'yua', name: '悠亚 · 星河守愿', legacy: '那伽守愿 · 千流', motif: 'star', first: '星河引灯', second: '天外归流', tip: '星杖直刺很远，绕开正面；天外环流必须跳过或及时远离。' },
  elegist: { ...A.sumi, character: 'sumi', name: '礼墨 · 末灯绘名', legacy: '末灯守簿 · 无名', motif: 'ink', first: '墨笔守名', second: '千纸归灯', tip: '墨笔会故意迟落。看手腕而不是纸叶，落笔后的空档适合反击。' },
};
