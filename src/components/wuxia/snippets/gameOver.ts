import { StorySnippet } from "../logic/types";
import { rand } from "../logic/utils";

export const gameOverSnippets: StorySnippet[] = [
  {
    id: 'near_death_experience',
    tags: ['game_over'],
    weight: 100,
    // 只在玩家生命值低于等于0且游戏未结束时触发
    req: (hero, world) => hero.status === 'dead' && !world.flags?.gameOver,
    run: (hero, world) => {
      // 30% 的几率有路过的好心人相救
      if (Math.random() < 0.3) {
        const saviors = [
          { name: '神秘老者', desc: '一位白须飘飘的老者' },
          { name: '游方道士', desc: '一位仙风道骨的道士' },
          { name: '路过大侠', desc: '一位路过的侠客' },
          { name: '隐世高人', desc: '一位深藏不露的隐士' }
        ];
        const savior = rand(saviors);

        return {
          lines: [
            { text: '你的意识逐渐模糊，最后看到的是一片黑暗...', type: 'narrative' },
            { text: '......', type: 'narrative' },
            { text: `朦胧中，你感觉有人将你扶起，一股暖流涌入你的经脉...`, type: 'narrative' },
            { text: `你缓缓睁开眼，只见${savior.desc}正关切地看着你。`, type: 'narrative' },
            {
              text: `"小友，你终于醒了。老朽路过此地，见你受伤不轻，便出手相救。"`,
              type: 'dialogue',
              speaker: savior.name
            },
            {
              text: `"江湖险恶，小友日后行走江湖，还需多加小心。"`,
              type: 'dialogue',
              speaker: savior.name
            },
            { text: `说完，${savior.name}便飘然离去，只留下你一人静养。`, type: 'narrative' },
          ],
          // 恢复部分生命值
          addHp: 30,
          // 标记已触发过救援，避免重复触发
          addFlag: 'was_rescued',
          removeFlag: 'gameOver',
          setStatus: 'alive',
          choices: [{
            text: '太好了，活过来了',
            result: {
              lines: [{ text: '你睁开眼，发现自己还活着。', type: 'narrative' }],
            },
          }]
        };
      }
      // 无人相救，游戏结束
      return {
        lines: [
          { text: '你的意识逐渐模糊，最后看到的是一片黑暗...', type: 'narrative' },
          { text: '......', type: 'narrative' },
          { text: '【游戏结束】', type: 'narrative' }
        ],
        // 设置游戏结束标志
        endGame: true,
        // advanceStage: true,
        // // 添加重新开始按钮
        // choices: [{
        //   text: '重新开始',
        //   result: {
        //     lines: [{ text: '正在重新开始游戏...', type: 'narrative' }],
        //     restartGame: true
        //   }
        // }]
      };

    }
  }
];
