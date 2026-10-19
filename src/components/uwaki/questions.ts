export const QUESTIONS = [
  '和异性单独去吃午饭',
  '和学生时代就认识的异性挚友单独吃饭',
  '下班后和异性同事单独喝酒',
  '和你也认识的异性朋友单独出去玩',
  '和异性朋友单独去看电影',
  '在异性朋友生日时送礼物',
  '收到异性朋友送的生日礼物',
  '每天和异性朋友聊微信',
  '深夜和认识很久的异性通电话',
  '向异性倾诉感情问题',
  '被异性夸“可爱／帅气”，很自然地感到开心',
  '对异性说“你今天真好看”',
  '注意到异性换了发型或穿搭，并主动夸赞',
  '和异性朋友拥有同款物品',
  '把和异性朋友的双人合照发到社交平台',
  '在手机里保留和异性的双人合照',
  '和异性朋友用只有彼此才懂的昵称互相称呼',
  '和异性朋友聊起只属于两个人的回忆，聊得很开心',
  '被异性称为“关系最好的异性朋友”',
  '被异性开玩笑说“和你谈恋爱一定很开心”，笑着带过',
  '异性朋友心情低落，单独见面听对方倾诉',
  '开车送错过末班车的异性回家',
  '照顾喝醉了的异性朋友',
  '安慰正在哭泣的异性朋友',
  '把外套借给看起来很冷的异性',
  '单独去帮异性朋友搬家',
  '异性朋友问“现在能见一面吗”，就出门赴约',
  '和异性朋友单独逛街，请对方帮忙挑衣服',
  '和异性朋友单独去唱 K',
  '和异性朋友单独去游乐园',
  '仍然关注着前任的社交账号',
  '给前任的动态点赞',
  '收到前任的“新年快乐”，也回复祝福',
  '前任发来生日祝福，回复“谢谢！”',
  '继续使用前任送的钱包',
  '没有删除和前任的合照',
  '带现在的恋人去曾经和前任留下回忆的地方',
  '在共同朋友的婚礼上，和前任正常聊天',
  '听说前任有了新恋人，心里觉得“那就好”',
  '前任发来“好久不见，最近好吗”，简单聊几句近况',
] as const;

export const LABELS = ['算越界', '不算，但介意', '完全 OK'] as const;
export const TYPES = [
  { max: 15, name: '松弛信任派', description: '大多数时候，你愿意相信对方，也愿意给彼此自由。把在意的事说出来，同样是信任的一部分。' },
  { max: 35, name: '平衡边界派', description: '你能接纳正常的朋友往来，也有自己不愿被跨过的界线。让对方知道你的边界，比默默期待更有效。' },
  { max: 55, name: '有点在意派', description: '有些事你不一定认定是越界，但心里还是会介意。那些小小的不舒服，也值得被认真听见。' },
  { max: 80, name: '坚定守线派', description: '你对亲密关系的专属感有明确期待。试着把“我希望”变成双方都认可的约定。' },
] as const;

export type Answer = 0 | 1 | 2;
export type Session = { step: number; answers: (Answer | null)[]; reflection: boolean | null };
export const emptySession = (): Session => ({ step: -1, answers: QUESTIONS.map(() => null), reflection: null });

export function parseSession(raw: string | null): Session {
  try {
    const value = JSON.parse(raw || 'null');
    if (!value || !Array.isArray(value.answers) || value.answers.length !== QUESTIONS.length
      || !value.answers.every((a: unknown) => a === null || a === 0 || a === 1 || a === 2)
      || !Number.isInteger(value.step) || value.step < -1 || value.step > QUESTIONS.length + 1
      || ![null, true, false].includes(value.reflection)) return emptySession();
    const missing = value.answers.indexOf(null);
    if (value.step > QUESTIONS.length - 1 && missing !== -1) value.step = missing;
    if (value.step === QUESTIONS.length + 1 && value.reflection === null) value.step = QUESTIONS.length;
    return value;
  } catch { return emptySession(); }
}

export function calculate(answers: (Answer | null)[]) {
  const counts = LABELS.map((_, i) => answers.filter(a => a === i).length);
  const score = counts[0] * 2 + counts[1];
  return { counts, score, type: TYPES.find(t => score <= t.max) || TYPES[3] };
}
