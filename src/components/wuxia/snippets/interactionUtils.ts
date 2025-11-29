import { Person } from "../logic/types";

/**
 * 生成队伍描述
 * @param companions 同伴列表
 * @returns 描述队伍的字符串
 */
export const getPartyDescription = (companions: Person[]): string => {
  if (companions.length === 0) return '';

  const companionNames = companions.map(c => `【${c.name}】`);

  if (companionNames.length === 1) {
    return `你和${companionNames[0]}`;
  } if (companionNames.length === 2) {
    return `你们三人（${companionNames.join('、')}）`;
  }
  return `你们一行人（${companionNames.slice(0, -1).join('、')}和${companionNames[companionNames.length - 1]}）`;
};

/**
 * 生成队伍活动描述
 * @param companions 同伴列表
 * @param activity 活动描述
 * @returns 完整的活动描述字符串
 */
export const generateGroupActivity = (companions: Person[], activity: string): string => {
  const groupDesc = getPartyDescription(companions);
  if (!groupDesc) return activity;

  const activities = [
    `${groupDesc}结伴${activity}`,
    `${groupDesc}一起${activity}`,
    `${groupDesc}结伴同行，${activity}`,
    `${groupDesc}结伴而行，${activity}`,
    `${groupDesc}结伴${activity}，有说有笑`,
    `${groupDesc}结伴${activity}，其乐融融`,
    `${groupDesc}结伴${activity}，一路畅谈`,
    `${groupDesc}结伴${activity}，互相照应`,
    `${groupDesc}结伴${activity}，热闹非常`,
  ];

  return activities[Math.floor(Math.random() * activities.length)];
};

/**
 * 生成队伍互动描述
 * @param companions 同伴列表
 * @param activity 活动描述
 * @returns 互动描述数组
 */
export const generateGroupInteraction = (companions: Person[], activity: string): string[] => {
  const lines: string[] = [];

  // 添加主要活动描述
  lines.push(generateGroupActivity(companions, activity));

  // 随机添加同伴互动
  if (Math.random() > 0.5) {
    const companion = companions[Math.floor(Math.random() * companions.length)];
    const interactions = [
      `【${companion.name}】主动走在前面探路`,
      `【${companion.name}】分享了一些干粮给大家`,
      `【${companion.name}】讲起了一个有趣的江湖故事`,
      `【${companion.name}】提醒大家注意安全`,
      `【${companion.name}】哼起了小曲`
    ];
    lines.push(interactions[Math.floor(Math.random() * interactions.length)]);
  }

  return lines;
};

export default {
  getPartyDescription,
  generateGroupActivity,
  generateGroupInteraction
};
