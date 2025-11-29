import { StorySnippet, Sect, Person, Personality, StoryStage, RelationType } from "../logic/types";
import { getSectMembersList, getAvailableCompanions, updateLastInteraction, rand, genName } from "../logic/utils";
import { generateCompanionRomanticEvent } from "./common";

export const friendSnippets: StorySnippet[] = [
  // ===================================
  // 👥 同行事件系统
  // ===================================

  // 查看本派弟子
  {
    id: 'display_sect_members',
    tags: ['sect_daily'],
    weight: 30,
    req: (hero, world) => {
      const currentSect = world.sects.find((s: Sect) => s.id === hero.sectId);
      return currentSect && currentSect.members && currentSect.members.length > 0;
    },
    run: (hero, world) => {
      const currentSect = world.sects.find((s: Sect) => s.id === hero.sectId);
      const memberList = getSectMembersList(currentSect, world);

      return {
        lines: [
          { text: '你查看了一下本派弟子名册：', type: 'action' },
          { text: memberList, type: 'narrative' }
        ]
      };
    }
  },

  // 同行：露营 (遍历所有队友)
  {
    id: 'companion_camping',
    tags: ['wild_daily'],
    weight: 20,
    req: (hero, world) => world.party && world.party.length > 0 && hero.locationId.startsWith('wild_'),
    run: (hero, world) => {
      // 随机选一个队友互动，或者全体互动
      const companionIds = world.party as string[];
      const companion = world.npcs.find((n: Person) => n.id === rand(companionIds));
      if (!companion) return { lines: [{ text: '...', type: 'narrative' }] };

      const addRelations = [];
      for (const companionId of companionIds) {
        addRelations.push({ targetId: companionId, type: 'friend' as RelationType, value: 2 });
      }

      return {
        lines: [
          { text: `【${companion.name}】提议："天色已晚，大家在此休息吧。"`, type: 'dialogue', speaker: companion.name },
          { text: '众人在避风处搭起帐篷，围坐在篝火旁。', type: 'action' }
        ],
        // 可以给全队加好感，这里简化为给互动的加
        addRelations
      };
    }
  },

  // 同行：吃饭 (已修复：只允许当前队友触发)
  {
    id: 'companion_meal',
    tags: ['city_daily'],
    weight: 20,
    req: (hero, world) => {
    // 🆕 修复：检查 companionId
      return !!world.companionId && hero.locationId.startsWith('city_');
    },
    run: (hero, world) => {
      const companion = world.npcs.find((n: Person) => n.id === world.companionId);
      if (!companion) return { lines: [{ text: '你独自一人走进酒楼。', type: 'narrative' }] };

      const updatedNpc = updateLastInteraction(companion, world.turn);
      const relation = hero.relations.find(r => r.targetId === companion.id);
      const currentVal = relation?.value || 0;
      const currentType = relation?.type || 'friend';

      const personality: Personality = companion.personality || 'gentle';
      const meals = {
        gentle: '清蒸鲈鱼',
        bold: '红烧肉',
        cunning: '叫花鸡',
        righteous: '素斋',
        mysterious: '不知道是什么的神秘料理',
        playful: '糖醋排骨',
        serious: '白切鸡',
        passionate: '麻辣火锅'
      };

      const meal = meals[personality] || '家常小菜';

      return {
        lines: [
          { text: `【${companion.name}】邀请你一起用餐。`, type: 'narrative' },
          { text: `"我点了${meal}，希望合你口味。"`, type: 'dialogue', speaker: companion.name },
          { text: '你们一边享用美食，一边聊着江湖趣事。', type: 'action' }
        ],
        addNpc: updatedNpc,
        addRelations: [{ targetId: companion.id, type: currentType, value: currentVal + 3 }]
      };
    }
  },

  // 同行：聊天
  {
    id: 'companion_chat',
    tags: ['sect_daily', 'city_daily', 'wild_daily'],
    weight: 25,
    req: (hero, world) => !!world.companionId,
    run: (hero, world) => {
      const companion = world.npcs.find((n: Person) => n.id === world.companionId);
      if (!companion) return { lines: [{ text: '无事发生', type: 'narrative' }] };

      const personality: Personality = companion.personality || 'gentle';
      const chatTopics: Record<Personality, string[]> = {
        gentle: ['你们聊起了江湖上的趣事', '你们谈论着各自的经历', '你们分享着对武学的见解'],
        bold: ['你们豪迈地谈论着江湖', '你们讨论着行侠仗义的故事', '你们畅谈着未来的计划'],
        cunning: ['你们交换着江湖上的情报', '你们讨论着各种计策', '你们分享着各自的见闻'],
        righteous: ['你们谈论着正义与邪恶', '你们讨论着如何行侠仗义', '你们分享着各自的原则'],
        mysterious: [`【${companion.name}】向你透露了一些秘密`, '你们谈论着一些不为人知的事情', `【${companion.name}】的话语中似乎藏着深意`],
        playful: ['你们开心地聊着天', `【${companion.name}】讲了个有趣的笑话`, '你们互相打趣，气氛轻松'],
        serious: ['你们认真地讨论着武学', '你们谈论着江湖上的大事', '你们交换着各自的看法'],
        passionate: ['你们热烈地讨论着', `【${companion.name}】激动地分享着自己的想法`, '你们聊得十分投缘'],
      };

      const topic = rand(chatTopics[personality]);

      return {
        lines: [
          { text: `【${companion.name}】主动找你聊天。`, type: 'narrative' },
          { text: `${topic}。`, type: 'narrative' },
          { text: '你们的关系更加亲近了。', type: 'inner' },
        ],
        addRelations: [{
          targetId: companion.id,
          type: hero.relations.find((r) => r.targetId === companion.id)?.type || 'friend',
          value: (hero.relations.find((r) => r.targetId === companion.id)?.value || 0) + 3
        }],
        addTurn: 1,
      };
    },
  },

  // 同行：逛街（城市）
  {
    id: 'companion_shopping',
    tags: ['city_daily'],
    weight: 15,
    req: (hero, world) => !!world.companionId && hero.locationId.startsWith('city_'),
    run: (hero, world) => {
      const companion = world.npcs.find((n: Person) => n.id === world.companionId);
      if (!companion) return { lines: [{ text: '无事发生', type: 'narrative' }] };

      return {
        lines: [
          { text: `【${companion.name}】提议一起去街上逛逛。`, type: 'narrative' },
        ],
        choices: [
          {
            text: '同意一起去',
            result: {
              lines: [
                { text: '你们在街上闲逛，看看各种小摊。', type: 'action' },
                { text: `【${companion.name}】似乎很开心，${companion.gender === 'female' ? '她' : '他'}的笑容让你心情也好了起来。`, type: 'narrative' },
              ],
              addRelations: [{
                targetId: companion.id,
                type: hero.relations.find((r) => r.targetId === companion.id)?.type || 'friend',
                value: (hero.relations.find((r) => r.targetId === companion.id)?.value || 0) + 8,
              }],
              addTurn: 1,
            },
          },
          {
            text: '婉言拒绝',
            result: {
              lines: [
                { text: '\'抱歉，我还有事。\'你礼貌地拒绝了。', type: 'dialogue', speaker: '你' },
                { text: `【${companion.name}】虽然有些失望，但还是表示理解。`, type: 'narrative' },
              ],
            },
          },
        ],
      };
    },
  },

  // 同行：暧昧对话（好感度高）
  {
    id: 'companion_romantic',
    tags: ['sect_daily', 'city_daily', 'wild_daily'],
    weight: 10,
    req: (hero, world) => {
      if (!world.companionId) return false;
      const companion = world.npcs.find((n: Person) => n.id === world.companionId);
      if (!companion) return false;
      const relation = hero.relations.find((r) => r.targetId === companion.id);
      return (relation?.value || 0) >= 80;
    },
    run: (hero, world) => {
      const companion = world.npcs.find((n: Person) => n.id === world.companionId);
      if (!companion) return { lines: [{ text: '无事发生', type: 'narrative' }] };

      const relation = hero.relations.find((r) => r.targetId === companion.id);
      const lines = generateCompanionRomanticEvent(companion, relation?.value || 0);

      if (lines.length === 0) return { lines: [{ text: '无事发生', type: 'narrative' }] };

      return {
        lines,
        choices: [
          {
            text: '表达心意',
            result: {
              lines: [
                { text: `'其实，${companion.gender === 'female' ? '我' : '我'}也...'你有些紧张地说道。`, type: 'dialogue', speaker: '你' },
                { text: `【${companion.name}】${companion.gender === 'female' ? '她' : '他'}的脸更红了，${companion.gender === 'female' ? '她' : '他'}轻轻点了点头。`, type: 'narrative' },
                { text: '你们的关系更进一步了。', type: 'inner' },
              ],
              addRelations: [{
                targetId: companion.id,
                type: 'crush',
                value: (relation?.value || 0) + 15,
              }],
            },
          },
          {
            text: '保持距离',
            result: {
              lines: [
                { text: `'${companion.gender === 'female' ? '我' : '我'}...还需要时间。'你有些犹豫地说道。`, type: 'dialogue', speaker: '你' },
                { text: `【${companion.name}】虽然有些失落，但还是表示理解。`, type: 'narrative' },
              ],
            },
          },
        ],
      };
    },
  },

  // 同行：告别（回门派时）
  {
    id: 'companion_farewell',
    tags: ['sect_daily'],
    weight: 30,
    // 只有当有外门派队友在队里，且回到自己门派时触发
    req: (hero, world) => {
      if (!world.party || world.party.length === 0) return false;
      if (!hero.locationId.startsWith('sect_')) return false;

      // 检查是否有非本门派的队友
      const outsiders = world.party.map((id: string) => world.npcs.find((n: Person) => n.id === id))
        .filter((n: Person) => n && n.sectId !== hero.sectId);
      return outsiders.length > 0;
    },
    run: (hero, world) => {
      // 找到第一个外门派队友
      const leaver = world.party.map((id: string) => world.npcs.find((n: Person) => n.id === id))
        .find((n: Person) => n && n.sectId !== hero.sectId);
      const companion = leaver;

      if (!leaver) return { lines: [] };
      const relation = hero.relations.find((r) => r.targetId === companion.id);
      const relationValue = relation?.value || 0;

      const farewellDialogue: Record<Personality, string> = {
        gentle: `'少侠，既然你已回到师门，${companion.gender === 'female' ? '我' : '我'}也该告辞了。'`,
        bold: '\'哈哈，少侠，我们后会有期！\'',
        cunning: `'少侠，${companion.gender === 'female' ? '我' : '我'}还有要事，就此别过。'`,
        righteous: '\'少侠，保重！我们江湖再见！\'',
        mysterious: `'...（${companion.gender === 'female' ? '她' : '他'}深深看了你一眼，转身离去）'`,
        playful: `'少侠，${companion.gender === 'female' ? '我' : '我'}会想你的！'`,
        serious: '\'少侠，就此别过，保重。\'',
        passionate: `'少侠，${companion.gender === 'female' ? '我' : '我'}舍不得你，但${companion.gender === 'female' ? '我' : '我'}必须走了。'`,
      };

      const personality: Personality = companion.personality || 'gentle';
      const dialogue = farewellDialogue[personality];

      return {
        lines: [
          { text: `你回到了师门，【${companion.name}】知道该告别了。`, type: 'narrative' },
          { text: dialogue, type: 'dialogue', speaker: companion.name },
          { text: relationValue >= 80 ? `【${companion.name}】${companion.gender === 'female' ? '她' : '他'}的眼神中满是不舍。` : `【${companion.name}】与你告别，离开了。`, type: 'narrative' },
        ],
        removeFromParty: leaver.id, // 🆕 指定离开的人
      };
    },
  },

  // 2. 强制邂逅恋人 (新增强制保底)
  {
    id: 'force_meet_crush',
    tags: ['city_daily', 'wild_daily'],
    weight: 150,
    stageMin: StoryStage.RISING,
    stageMax: StoryStage.RISING,
    // 如果呆了超过 3 回合还没对象
    req: (hero, world, turn) => !hero.relations.some((r) => r.type === 'crush' || r.type === 'spouse') && turn > 3,
    run: (hero, world) => {
      const targetGender = hero.gender === 'male' ? 'female' : 'male';
      const newName = genName(targetGender);
      const newNpc: Person = {
        id: `npc_crush_${Date.now()}`,
        name: newName,
        sectId: 'none',
        role: 'hero',
        gender: targetGender,
        age: hero.age,
        status: 'alive',
        relations: [],
        locationId: hero.locationId,
        inventory: [],
        flags: {},
        arts: [],
        knowledge: [],
      };

      return {
        lines: [
          { text: `你偶遇一位${targetGender === 'female' ? '清丽脱俗的女子' : '英俊潇洒的少年'}，正为了追回被偷的荷包与小贼对峙。`, type: 'narrative' },
          { text: '你决定...', type: 'inner' },
        ],
        choices: [
          {
            text: '拔刀相助',
            result: {
              lines: [
                { text: '你上前一步，帮对方夺回了财物。', type: 'action' },
                { text: `"多谢少侠相助，在下【${newName}】。"`, type: 'dialogue', speaker: newName },
                { text: '你们互换了姓名，一种异样的情愫在心中蔓延。', type: 'inner' },
                { text: `"少侠若不嫌弃，不如我们结伴而行？"【${newName}】红着脸说道。`, type: 'dialogue', speaker: newName },
              ],
              choices: [
                {
                  text: '同意结伴',
                  result: {
                    lines: [
                      { text: '\'好，那我们就一起走吧。\'你点了点头。', type: 'dialogue', speaker: '你' },
                      { text: `【${newName}】露出了笑容，你们一起踏上了旅程。`, type: 'narrative' },
                    ],
                    addNpc: newNpc,
                    addRelations: [{ targetId: newNpc.id, type: 'crush', value: 60 }],
                    addFlags: { met_crush: true },
                    addToParty: newNpc.id, // 🆕 使用 addToParty
                  },
                },
                {
                  text: '婉言拒绝',
                  result: {
                    lines: [
                      { text: '\'抱歉，我还有要事在身。\'你礼貌地拒绝了。', type: 'dialogue', speaker: '你' },
                      { text: `【${newName}】眼中闪过一丝失望，但还是礼貌地告别了。`, type: 'narrative' },
                    ],
                    addNpc: newNpc,
                    addRelations: [{ targetId: newNpc.id, type: 'crush', value: 50 }],
                    addFlags: { met_crush: true },
                  },
                },
              ],
            },
          },
          {
            text: '匆匆离开',
            result: { lines: [{ text: '你还有要事在身，没有停留。', type: 'narrative' }] },
          },
        ],
      };
    },
  }
];
