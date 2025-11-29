import { Person, Sect, StorySnippet } from "../logic/types";
import { getSectMembersList } from "../logic/utils";

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

export const sectSnippets = [
  displaySectMembersSnippet,
  sectAskMasterSnippet,
  // Add more sect-related snippets here
];
