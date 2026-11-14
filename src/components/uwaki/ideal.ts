export const ABILITIES = ['爱意｜专一与爱的分量', '表达｜情话与肢体接触', '包容｜温柔与接纳', '知性｜头脑与对话', '魅力｜外貌与氛围', '生活｜工作、家务与金钱观', '合拍｜价值观、笑点与爱好'];
export const PREFERENCES = [
  { title: '联系频率', options: ['有事才联系', '每天适度联系', '想一直聊天'] },
  { title: '相处距离', options: ['珍惜彼此的独处时间', '基本在一起，偶尔分开行动', '可以的话想一直在一起'] },
  { title: '表达爱意', options: ['语言：“喜欢你”“真可爱”', '行动：接送、照顾', '肢体接触', '礼物与惊喜'] },
  { title: '吃醋', options: ['几乎不吃醋', '吃醋但不说', '直接说“我吃醋了”', '占有欲很强'] },
  { title: '吵架', options: ['当场马上沟通', '冷静几个小时再谈', '留到第二天再说', '总之先抱住对方'] },
  { title: '宠你的方式', options: ['“加油！”型', '“不用勉强自己”型', '默默帮你把事情都做好', '一起解决问题'] },
  { title: '对未来的态度', options: ['现在开心就好', '交往后再考虑', '一开始就以结婚为前提', '开始交往时就想到一起养老'] },
];
export const DEBUFFS = [
  ['穿搭很土', '严重路痴', '起床气特别大', '打呼噜很响', '完全不会做饭', '回消息稍慢', '不擅长记纪念日', '不擅长收拾'],
  ['爱好完全不合', '工作相当忙', '很需要独处时间', '经常优先安排朋友的邀约', '不太重视生日和纪念日', '房间很乱', '花钱有些大手大脚', '消息和电话很少'],
  ['几乎不表达爱意', '吵架后到第二天都不想说话', '相当顽固', '异性朋友很多', '异地恋', '工作狂', '浪费钱', '容易优先自己的时间'],
  ['和前任仍是关系很好的朋友', '嫉妒心很强', '吵架后沉默好几天', '明确把工作放在恋人之前', '结婚意愿很低', '将来想移居海外', '绝对不想同居', '独处时基本不想被联系'],
].flatMap((names, i) => names.map(name => ({ name, cost: i + 1 })));
export const SKILLS = [
  ['情绪察觉', '不用你说，也能发现你今天有点没精神。', 3],
  ['完全记忆', '记得你喜欢的食物和随口说过想要的东西。', 3],
  ['我来接你', '遇到困难时会马上来帮你。', 3],
  ['生活帮手', '擅长做饭、打扫和各类家务。', 3],
  ['沟通天才', '吵架也不逃避，能清楚表达感受并沟通。', 5],
  ['绝对的同伴', '无论什么情况，都会先站在你身边。', 5],
  ['宠爱专家', '低落时能察觉你需要的话语、距离与爱意表达。', 5],
  ['逗笑你的人', '无论多失落，最后总能让你笑出来。', 5],
  ['永久恋爱加成', '交往多年，依然像刚在一起时一样喜欢你。', 7],
  ['完全相互理解', '即使吵架或错过，沟通后最终总能互相理解。', 7],
  ['出轨可能性归零', '一生都不会对你以外的人产生恋爱感情。', 7],
  ['爱意保证', '环境、外貌、年龄变化，也不会动摇对你的喜欢。', 7],
  ['命运共同体', '无论人生发生什么，都会继续选择如何在一起。', 9],
  ['永远的恋人', '相伴数十年，恋爱感情、爱意表达和对你的兴趣也几乎不减。', 9],
  ['独一无二', '即使遇到有魅力的人，也会一生爱你，视你为不可替代的特别之人。', 9],
].map(([name, description, cost]) => ({ name: String(name), description: String(description), cost: Number(cost) }));

export type IdealSession = { step: number; abilities: number[]; preferences: (number | null)[]; debuffs: number[]; skills: number[]; notes: string };
export const emptyIdeal = (): IdealSession => ({ step: 0, abilities: [0, 0, 0, 0, 0, 0, 0], preferences: PREFERENCES.map(() => null), debuffs: [], skills: [], notes: '' });
export const idealBudget = (s: IdealSession) => s.debuffs.reduce((sum, i) => sum + DEBUFFS[i].cost, 0) - s.skills.reduce((sum, i) => sum + SKILLS[i].cost, 0);
export const validIdeal = (s: IdealSession) => s.abilities.reduce((a, b) => a + b, 0) === 25 && s.preferences.every(v => v !== null) && s.debuffs.length === 3 && idealBudget(s) >= 0;
export function parseIdeal(raw: string | null): IdealSession {
  try {
    const s = JSON.parse(raw || 'null');
    const indexes = (list: unknown, max: number) => Array.isArray(list) && new Set(list).size === list.length && list.every(v => Number.isInteger(v) && v >= 0 && v < max);
    if (!s || !Number.isInteger(s.step) || s.step < 0 || s.step > 4 || !Array.isArray(s.abilities) || s.abilities.length !== 7 || !s.abilities.every((v: unknown) => Number.isInteger(v) && Number(v) >= 0 && Number(v) <= 6)
      || !Array.isArray(s.preferences) || s.preferences.length !== 7 || !s.preferences.every((v: unknown, i: number) => v === null || (Number.isInteger(v) && Number(v) >= 0 && Number(v) < PREFERENCES[i].options.length))
      || !indexes(s.debuffs, DEBUFFS.length) || s.debuffs.length > 3 || !indexes(s.skills, SKILLS.length) || typeof s.notes !== 'string' || s.notes.length > 500 || idealBudget(s) < 0) return emptyIdeal();
    if (s.step === 4 && !validIdeal(s)) s.step = 0;
    return s;
  } catch { return emptyIdeal(); }
}

export function idealSummary(s: IdealSession) {
  return ['我的理想恋人创建表', ...ABILITIES.map((a, i) => `${a}：${s.abilities[i]}`), '', ...PREFERENCES.map((p, i) => `${p.title}：${p.options[s.preferences[i] ?? 0]}`), '', `缺点：${s.debuffs.map(i => DEBUFFS[i].name).join('、')}`, ...s.skills.map(i => `技能「${SKILLS[i].name}」：${SKILLS[i].description}`), `剩余技能点：${idealBudget(s)}`, '', s.notes].join('\n');
}
