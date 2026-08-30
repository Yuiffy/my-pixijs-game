import { StorySnippet, StoryLine } from "../logic/types";
import { getCompanion, getRelationValue } from "./companionUtils";

type Personality = 'gentle' | 'bold' | 'cunning' | 'righteous' | 'mysterious' | 'playful' | 'serious' | 'passionate';

// 告别互动
export const companionFarewellSnippet: StorySnippet = {
  id: 'companion_farewell',
  tags: ['sect_daily'],
  weight: 30,
  req: (hero, world) => !!world.companionId && hero.locationId?.startsWith('sect_'),
  run: (hero, world) => {
    const companion = getCompanion(world);
    if (!companion) return { lines: [{ text: '无事发生', type: 'narrative' }] };

    const relationValue = getRelationValue(hero, companion.id);
    const genderText = companion.gender === 'female' ? '她' : '他';
    const selfText = companion.gender === 'female' ? '我' : '我';

    const farewellDialogue: Record<Personality, string> = {
      gentle: `'少侠，既然你已回到师门，${selfText}也该告辞了。'`,
      bold: `'哈哈，少侠，我们后会有期！'`,
      cunning: `'少侠，${selfText}还有要事，就此别过。'`,
      righteous: `'少侠，保重！我们江湖再见！'`,
      mysterious: `'...（${genderText}深深看了你一眼，转身离去）'`,
      playful: `'少侠，${selfText}会想你的！'`,
      serious: `'少侠，就此别过，保重。'`,
      passionate: `'少侠，${selfText}舍不得你，但${selfText}必须走了。'`,
    };

    const personality: Personality = companion.personality || 'gentle';
    const dialogue = farewellDialogue[personality];

    return {
      lines: [
        { text: `你回到了师门，【${companion.name}】知道该告别了。`, type: 'narrative' },
        { text: dialogue, type: 'dialogue', speaker: companion.name },
        {
          text: relationValue >= 80
            ? `【${companion.name}】${genderText}的眼神中满是不舍。`
            : `【${companion.name}】与你告别，离开了。`,
          type: 'narrative'
        },
      ],
      removeCompanion: true,
    };
  },
};

// 日常互动
export const companionDailySnippet: StorySnippet = {
  id: 'companion_daily',
  tags: ['city_daily', 'wild_daily', 'sect_daily'],
  weight: 20,
  req: (hero, world) => !!world.companionId,
  run: (hero, world) => {
    const companion = getCompanion(world);
    if (!companion) return { lines: [{ text: '无事发生', type: 'narrative' }] };

    const relationValue = getRelationValue(hero, companion.id);
    const genderText = companion.gender === 'female' ? '她' : '他';

    // 根据关系值生成不同的互动
    let lines: StoryLine[] = [];
    if (relationValue >= 80) {
      lines = [
        { text: `【${companion.name}】主动找你聊天，${genderText}似乎有很多话想对你说。`, type: 'narrative' as const },
        { text: `"今天天气真好，能和你一起出来走走真开心。"`, type: 'dialogue' as const, speaker: companion.name }
      ];
    } else if (relationValue >= 50) {
      lines = [
        { text: `【${companion.name}】和你聊起了江湖上的趣闻。`, type: 'narrative' as const },
        { text: `"听说最近江湖上发生了不少有趣的事情..."`, type: 'dialogue' as const, speaker: companion.name }
      ];
    } else {
      lines = [
        { text: `【${companion.name}】静静地跟在你身边。`, type: 'narrative' as const }
      ];
    }

    return {
      lines,
      addTurn: 1
    };
  }
};
