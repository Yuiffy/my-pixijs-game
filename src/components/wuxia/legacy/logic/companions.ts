import type { Person, Relation, Sect } from "./types";

export const describeAppearance = (person: Person): string => {
  if (!person.appearance) return '';
  const {
    face, build, clothing, weapon,
  } = person.appearance;
  let desc = `【${person.name}】${face}，${build}，${clothing}`;
  if (weapon) desc += `，腰间${weapon}寒光闪闪`;
  return desc;
};

/**
 * 过滤掉已死亡的NPC
 * @param npcs 要过滤的NPC数组
 * @returns 存活的NPC数组
 */
export const filterAliveNpcs = (npcs: Person[]): Person[] => {
  return npcs.filter(npc => npc.status !== 'dead' && !npc.flags?.isDead);
};

// 描述角色外表变化（再次见面）
export const getSectMembersList = (sect: Sect, world: any): string => {
  if (!sect.members || sect.members.length === 0) {
    return '本派目前没有弟子。';
  }

  const memberNames = sect.members.map(memberId => {
    const member = world.npcs.find((n: Person) => n.id === memberId);
    return member ? member.name : '未知弟子';
  });

  return `本派弟子：${memberNames.join('、')}，共 ${memberNames.length} 人。`;
};

export const updateLastInteraction = (npc: Person, turn: number): Person => {
  return {
    ...npc,
    flags: {
      ...npc.flags,
      lastInteraction: turn
    }
  };
};

export const getAvailableCompanions = (hero: Person, world: any): { npc: Person, relation: Relation }[] => {
  return hero.relations
    .filter((r: Relation) => (r.type === 'friend' || r.type === 'crush' || r.type === 'apprentice') &&
      r.value > 30)
    .map((r: Relation) => {
      const npc = world.npcs.find((n: Person) => n.id === r.targetId);
      return npc ? { npc, relation: r } : null;
    })
    .filter((item): item is { npc: Person, relation: Relation } => item !== null)
    .sort((a, b) => {
      const aLast = a.npc.flags?.lastInteraction || 0;
      const bLast = b.npc.flags?.lastInteraction || 0;
      return aLast - bLast || b.relation.value - a.relation.value;
    });
};

export const describeAppearanceChange = (person: Person): string => {
  if (!person.appearance || !person.lastSeenAppearance) return describeAppearance(person);

  const changes: string[] = [];
  if (person.appearance.face !== person.lastSeenAppearance.face) {
    changes.push(`面容似乎比上次更加${person.appearance.face}`);
  }
  if (person.appearance.clothing !== person.lastSeenAppearance.clothing) {
    changes.push(`换了一身${person.appearance.clothing}`);
  }
  if (person.appearance.weapon !== person.lastSeenAppearance.weapon) {
    changes.push(`武器也换成了${person.appearance.weapon}`);
  }

  if (changes.length === 0) {
    return `【${person.name}】还是那副模样，${person.appearance.face}，${person.appearance.clothing}`;
  }

  return `【${person.name}】${changes.join('，')}。`;
};

// 描述招式对比
export const describeMoveComparison = (
  person: Person,
  currentMove: string,
  artName: string,
): string => {
  if (!person.lastUsedMove) {
    return `【${person.name}】使出【${artName}】中的"${currentMove}"！`;
  }

  if (person.lastUsedMove === currentMove) {
    // 同一招，看是否精进
    const improved = Math.random() > 0.5;
    if (improved) {
      return `【${person.name}】再次使出"${currentMove}"，但这次更加娴熟，威力更胜从前！`;
    }
    return `【${person.name}】再次使出"${currentMove}"，招式依然凌厉。`;
  }
  return `【${person.name}】上次用的是"${person.lastUsedMove}"，这次却换成了"${currentMove}"，招式变化莫测！`;
};

// 🆕 Feature 1: 获取所有同行伙伴的名字列表 (适配 party 数组)
export const getCompanionNamesList = (world: any): string => {
  if (!world.party || world.party.length === 0) return '无';

  const names = world.party.map((id: string) => {
    const p = world.npcs.find((n: Person) => n.id === id);
    return p ? p.name : '未知';
  });

  return names.map((n: string) => `【${n}】`).join('、');
};
