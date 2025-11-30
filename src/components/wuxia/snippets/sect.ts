import { Person, Sect, StorySnippet } from "../logic/types";
import { getSectMembersList, findRoute, genCityName, genWildName, rand } from "../logic/utils";

// 查看本派弟子
export const displaySectMembersSnippet: StorySnippet = {
  id: 'display_sect_members',
  tags: ['sect_daily'],
  weight: 30,
  req: (hero: Person, world: any) => {
    const currentSect = world.sects.find((s: Sect) => s.id === hero.sectId);
    return currentSect && currentSect.members && currentSect.members.length > 0;
  },
  run: (hero: Person, world: any) => {
    const currentSect = world.sects.find((s: Sect) => s.id === hero.sectId);
    if (!currentSect) {
      return { lines: [{ text: '你目前没有加入任何门派。', type: 'narrative' as const }] };
    }
    const memberList = getSectMembersList(currentSect, world);

    return {
      lines: [
        { text: '你查看了一下本派弟子名册：', type: 'action' },
        { text: memberList, type: 'narrative' }
      ]
    };
  }
};

// 与师父请教
export const sectAskMasterSnippet: StorySnippet = {
  id: 'sect_ask_master',
  tags: ['sect_daily'],
  weight: 20,
  req: (hero: Person, world: any) => {
    const currentSect = world.sects.find((s: Sect) => s.id === hero.sectId);
    return currentSect && currentSect.leader && hero.relations.some(
      r => r.targetId === currentSect.leader && r.type === 'master'
    );
  },
  run: (hero: Person, world: any) => {
    const currentSect = world.sects.find((s: Sect) => s.id === hero.sectId);
    if (!currentSect?.leader) {
      return { lines: [{ text: '本派目前没有掌门。', type: 'narrative' as const }] };
    }
    const master = world.npcs.find((n: Person) => n.id === currentSect.leader);

    if (!master) {
      return { lines: [{ text: '你找不到师父，可能他外出了。', type: 'narrative' }] };
    }

    return {
      lines: [
        { text: `你向【${master.name}】请教武学。`, type: 'action' },
        { text: `"徒儿，今天想学些什么？"`, type: 'dialogue', speaker: master.name },
        { text: '师父耐心地为你讲解武学要诀。', type: 'action' }
      ],
      addKnowledge: 'sect_skill_training',
      addRelations: [{
        targetId: master.id,
        type: 'master' as const,
        value: 5
      }]
    };
  }
};
export const sectMainSnippets: StorySnippet[] = [
  // ... (保留 join_sect 等)

  // 修改：掌门发布任务 (增加 questTarget 标记)
  {
    id: 'sect_mission_deliver',
    tags: ['sect_daily'],
    weight: 20,
    req: (hero, world) => hero.sectId !== 'none' && !hero.flags.hasQuest, // 只有没任务时触发
    run: (hero, world) => {
      // 随机找一个城市作为目标
      const targetCity = world.locations.find((l: any) => l.type === 'city' && l.id !== hero.locationId);

      if (!targetCity) return { lines: [{ text: '掌门今天无事。', type: 'narrative' }] };

      return {
        lines: [
          { text: '掌门把你叫到跟前。', type: 'narrative' },
          { text: `"徒儿，有一封加急信件需要送往【${targetCity.name}】，你即刻启程。"`, type: 'dialogue', speaker: '掌门' }
        ],
        addItem: '掌门密信',
        addFlags: {
          hasQuest: true,
          questType: 'deliver',
          questTarget: targetCity.id, // 关键：记录目标ID
          questTargetName: targetCity.name
        },
        choices: [
          {
            text: '弟子领命',
            result: { lines: [{ text: '你接过书信，准备下山。', type: 'action' }] }
          }
        ]
      };
    }
  },

  // 修改：复命 (任何时候回到门派，如果任务完成)
  {
    id: 'sect_mission_complete',
    tags: ['sect_daily'],
    weight: 1000, // 极高权重，回来优先触发
    req: (hero) => hero.flags.questCompleted === true && hero.locationId.startsWith('sect_') && hero.sectId !== 'none',
    run: (hero, world) => {
      return {
        lines: [
          { text: '你风尘仆仆地回到门派复命。', type: 'action' },
          { text: '"做得好！不愧是我派弟子。"', type: 'dialogue', speaker: '掌门' }
        ],
        removeFlag: 'hasQuest', // 清除任务标记
        addFlags: { questCompleted: false }, // 重置
        // 奖励逻辑...
        addRelation: { targetId: 'master', type: 'master', value: 5 }
      };
    }
  }
  // ...
];

export const sectSnippets = [
  displaySectMembersSnippet,
  sectAskMasterSnippet,
  ...sectMainSnippets,
  // 可以继续添加更多门派相关的事件片段
];
