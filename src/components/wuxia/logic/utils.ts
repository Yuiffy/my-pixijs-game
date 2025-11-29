import { Appearance, LocationInfo, Person, Personality, Sect, RelationType, Relation, StoryChoice } from './types';
import { MALE_FIRST_NAMES, FEMALE_FIRST_NAMES, LAST_NAMES, SECTS_DATA, CITY_PREFIXES, CITY_SUFFIXES, WILD_PREFIXES, WILD_SUFFIXES } from './constants';
import { getSectArts } from './skills';

export const rand = <T>(arr: T[]): T => {
  if (!arr || arr.length === 0) return {} as T;
  return arr[Math.floor(Math.random() * arr.length)];
};

export const genName = (gender: 'male' | 'female') => {
  const firstNames = gender === 'male' ? MALE_FIRST_NAMES : FEMALE_FIRST_NAMES;
  return `${rand(LAST_NAMES)}${rand(firstNames)}`;
};

export const genCityName = () => `${rand(CITY_PREFIXES)}${rand(CITY_SUFFIXES)}城`;
export const genWildName = () => `${rand(WILD_PREFIXES)}${rand(WILD_SUFFIXES)}`;
// 生成性格
export const genPersonality = (): Personality => rand(['gentle', 'bold', 'cunning', 'righteous', 'mysterious', 'playful', 'serious', 'passionate'] as Personality[]);

// 生成外表
export const genAppearance = (gender: 'male' | 'female', role: Person['role']): Appearance => {
  const maleFaces = ['剑眉星目', '浓眉大眼', '面如冠玉', '英气逼人', '棱角分明', '温润如玉'];
  const femaleFaces = ['眉目如画', '清丽脱俗', '明眸皓齿', '娇美动人', '英姿飒爽', '温婉可人'];
  const maleBuilds = ['身材魁梧', '身形修长', '体态匀称', '虎背熊腰', '精悍干练'];
  const femaleBuilds = ['身姿窈窕', '体态轻盈', '身材高挑', '娇小玲珑', '婀娜多姿'];
  const maleClothing = ['一袭青衫', '黑衣劲装', '白衣胜雪', '粗布麻衣', '锦袍华服'];
  const femaleClothing = ['素衣如雪', '红衣如火', '青衣淡雅', '紫衣华贵', '布衣朴素'];

  const weapons = ['长剑', '短刀', '长枪', '双刀', '软鞭', '暗器', '拳套', '棍棒'];

  const face = gender === 'male' ? rand(maleFaces) : rand(femaleFaces);
  const build = gender === 'male' ? rand(maleBuilds) : rand(femaleBuilds);
  const clothing = gender === 'male' ? rand(maleClothing) : rand(femaleClothing);
  const weapon = role === 'bandit' || role === 'hero' ? rand(weapons) : undefined;

  return {
    face, build, clothing, weapon,
  };
};

// 描述角色外表（首次见面）
export const getAgeDescription = (person: Person): string => {
  if (person.age < 20) return '弱冠之年';
  if (person.age < 30) return '风华正茂';
  if (person.age < 40) return '而立之年';
  if (person.age < 50) return '不惑之年';
  if (person.age < 60) return '知天命之年';
  return '花甲之年';
};
// ... (此处省略 genAppearance, getAgeDescription 等函数，直接从原文件移动过来)

export const initSectRelations = (sects: Sect[]): void => {
  sects.forEach((s1: Sect) => {
    // Ensure relations object exists
    const relations: { [key: string]: number } = s1.relations || {};
    s1.relations = relations;

    sects.forEach((s2: Sect) => {
      if (s1.id === s2.id) return;

      let baseValue = 0;
      if (s1.type !== s2.type) {
        // 正邪不两立
        baseValue = -60 - Math.floor(Math.random() * 40); // -60 ~ -100 for enemies
      } else {
        // 同为正派或邪派，关系较好但可能有竞争
        baseValue = 10 + Math.floor(Math.random() * 40); // 10 ~ 50 for allies
      }

      relations[s2.id] = baseValue;
    });
  });
};

// 🆕 地理系统：生成复杂的世界地图
export const generateWorldMap = (): LocationInfo[] => {
  const locations: LocationInfo[] = [];

  // 生成多个城市
  const cities: LocationInfo[] = [];
  for (let i = 0; i < 3; i += 1) {
    const cityId = `city_${i}`;
    const city: LocationInfo = {
      id: cityId,
      name: genCityName(),
      type: 'city',
      x: i * 200 + 100,
      y: 300,
      connections: [],
    };
    cities.push(city);
    locations.push(city);

    // 每个城市有客栈和官府
    const inn: LocationInfo = {
      id: `${cityId}_inn`,
      name: `${city.name}·悦来客栈`,
      type: 'inn',
      parentId: cityId,
      connections: [],
    };
    const government: LocationInfo = {
      id: `${cityId}_government`,
      name: `${city.name}·官府`,
      type: 'government',
      parentId: cityId,
      connections: [],
    };
    locations.push(inn, government);
  }

  // 生成村庄
  const villages: LocationInfo[] = [];
  for (let i = 0; i < 2; i += 1) {
    const villageId = `village_${i}`;
    const village: LocationInfo = {
      id: villageId,
      name: `${rand(['小', '大', '古', '新'])}${rand(['村', '庄', '镇'])}`,
      type: 'village',
      x: i * 250 + 150,
      y: 200,
      connections: [],
    };
    villages.push(village);
    locations.push(village);
  }

  // 生成多个门派
  const sects: LocationInfo[] = [];
  SECTS_DATA.forEach((sectData, idx) => {
    const sect: LocationInfo = {
      id: sectData.locationId,
      name: `${sectData.name}驻地`,
      type: 'sect',
      x: (idx % 3) * 200 + 50,
      y: 50 + Math.floor(idx / 3) * 150,
      connections: [],
    };
    sects.push(sect);
    locations.push(sect);
  });

  // 生成野外区域（连接各个地点）
  const wilds: LocationInfo[] = [];
  for (let i = 0; i < 5; i += 1) {
    const wildId = `wild_${i}`;
    const wild: LocationInfo = {
      id: wildId,
      name: genWildName(),
      type: 'wild',
      x: 100 + (i % 3) * 200,
      y: 100 + Math.floor(i / 3) * 200,
      connections: [],
    };
    wilds.push(wild);
    locations.push(wild);
  }

  // 🆕 建立连接关系（图结构）
  // 城市之间通过野外连接
  cities.forEach((city, idx) => {
    if (idx < cities.length - 1) {
      const nextCity = cities[idx + 1];
      const wildBetween = wilds[idx % wilds.length];
      if (city.connections) city.connections.push(wildBetween.id);
      if (wildBetween.connections) {
        wildBetween.connections.push(city.id);
        wildBetween.connections.push(nextCity.id);
      }
      if (nextCity.connections) nextCity.connections.push(wildBetween.id);
    }
  });

  // 村庄连接到最近的野外
  villages.forEach((village, idx) => {
    const nearestWild = wilds[idx % wilds.length];
    if (village.connections) village.connections.push(nearestWild.id);
    if (nearestWild.connections) nearestWild.connections.push(village.id);
  });

  // 门派连接到最近的野外
  sects.forEach((sect, idx) => {
    const nearestWild = wilds[idx % wilds.length];
    if (sect.connections) sect.connections.push(nearestWild.id);
    if (nearestWild.connections) nearestWild.connections.push(sect.id);
  });

  // 城市内的地点连接到城市
  locations.forEach((loc) => {
    if (loc.parentId) {
      const parent = locations.find((l) => l.id === loc.parentId);
      if (parent) {
        // 创建副本避免修改参数
        const locIndex = locations.indexOf(loc);
        const parentIndex = locations.indexOf(parent);

        if (locIndex >= 0) {
          locations[locIndex] = { ...locations[locIndex], connections: [parent.id] };
        }
        if (parentIndex >= 0 && !parent.connections) {
          locations[parentIndex] = { ...locations[parentIndex], connections: [] };
        }
        if (parentIndex >= 0 && !locations[parentIndex].connections?.includes(loc.id)) {
          locations[parentIndex] = {
            ...locations[parentIndex],
            connections: [...(locations[parentIndex].connections || []), loc.id],
          };
        }
      }
    }
  });

  return locations;
};

// ... 其他辅助函数如 findPath, getReachableLocations, describeAppearance 等
// 🆕 路径查找：找到从A到B的路径
export const findPath = (fromId: string, toId: string, locations: LocationInfo[]): string[] => {
  if (fromId === toId) return [];

  const visited = new Set<string>();
  const queue: { id: string; path: string[] }[] = [{ id: fromId, path: [] }];

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (current.id === toId) {
      return current.path;
    }

    if (visited.has(current.id)) continue;
    visited.add(current.id);

    const location = locations.find((l) => l.id === current.id);
    if (!location || !location.connections) continue;

    location.connections.forEach((nextId) => {
      if (!visited.has(nextId)) {
        queue.push({ id: nextId, path: [...current.path, nextId] });
      }
    });
  }

  return []; // 无法到达
};

// 🆕 获取可到达的地点列表
export const getReachableLocations = (currentId: string, locations: LocationInfo[]): LocationInfo[] => {
  const current = locations.find((l) => l.id === currentId);
  if (!current || !current.connections) return [];

  return current.connections
    .map((id) => locations.find((l) => l.id === id))
    .filter((loc): loc is LocationInfo => loc !== undefined);
};

export const LOCATION_TEMPLATES: LocationInfo[] = [
  { id: 'loc_sect_main', name: '门派驻地', type: 'sect' },
  { id: 'loc_city', name: '随机城市', type: 'city' },
  { id: 'loc_wild', name: '随机险地', type: 'wild' },
];

// 🆕 辅助函数：根据ID获取门派数据
export const getSectById = (sectId: string, sects: Sect[] = SECTS_DATA): Sect | undefined => {
  return sects.find((sect) => sect.id === sectId);
};

// 🆕 辅助函数：根据名称获取门派数据
export const getSectByName = (sectName: string): Sect | undefined => SECTS_DATA.find((sect) => sect.name === sectName);

// 🆕 辅助函数：检查角色是否可以加入门派
export const canJoinSect = (person: Person, sect: Sect): { canJoin: boolean; reason?: string } => {
  // 检查性别限制
  if (sect.recruitGender && sect.recruitGender !== 'both') {
    if (person.gender !== sect.recruitGender) {
      const genderText = sect.recruitGender === 'male' ? '男性' : '女性';
      return { canJoin: false, reason: `${sect.name}只收${genderText}弟子` };
    }
  }

  // 检查是否已被逐出该门派
  if (person.sectHistory) {
    const expelledRecord = person.sectHistory.find((h) => h.sectId === sect.id && h.action === 'expel');
    if (expelledRecord) {
      return { canJoin: false, reason: `你已被${sect.name}逐出师门，无法重新加入` };
    }
  }

  // 检查是否已经在其他门派
  if (person.sectId && person.sectId !== 'none' && person.sectId !== sect.id) {
    const otherSectName = getSectById(person.sectId)?.name || '其他门派';
    return { canJoin: false, reason: `你已加入${otherSectName}，不能同时加入多个门派` };
  }

  return { canJoin: true };
};

// 🆕 辅助函数：处理角色加入门派
export const joinSect = (person: Person, sect: Sect, turn: number, reason?: string): { person: Person; sect: Sect } => {
  const updatedPerson = { ...person };
  const updatedSect = { ...sect };

  // 更新当前门派
  updatedPerson.sectId = sect.id;

  // 清除被逐出状态
  updatedPerson.expelled = false;

  // 记录入派时间
  updatedPerson.joinSectTime = turn;

  // 添加门派历史记录
  if (!updatedPerson.sectHistory) {
    updatedPerson.sectHistory = [];
  }
  updatedPerson.sectHistory.push({
    sectId: sect.id,
    action: 'join',
    time: turn,
    reason: reason || '正式拜师入门',
  });

  // 更新门派成员列表
  if (!updatedSect.members) {
    updatedSect.members = [];
  }
  if (!updatedSect.members.includes(person.id)) {
    updatedSect.members.push(person.id);
  }

  return { person: updatedPerson, sect: updatedSect };
};

// 🆕 辅助函数：处理角色离开门派
export const leaveSect = (person: Person, sect: Sect, turn: number, action: 'leave' | 'expel', reason?: string): { person: Person; sect: Sect } => {
  const updatedPerson = { ...person };
  const updatedSect = { ...sect };

  // 如果是被逐出，标记为被逐出状态
  if (action === 'expel') {
    updatedPerson.expelled = true;
  }

  // 记录出派时间
  updatedPerson.leaveSectTime = turn;

  // 添加门派历史记录
  if (!updatedPerson.sectHistory) {
    updatedPerson.sectHistory = [];
  }
  updatedPerson.sectHistory.push({
    sectId: sect.id,
    action,
    time: turn,
    reason: reason || (action === 'expel' ? '被逐出师门' : '主动离开'),
  });

  // 从门派成员列表中移除
  if (updatedSect.members) {
    updatedSect.members = updatedSect.members.filter((id) => id !== person.id);
  }

  return { person: updatedPerson, sect: updatedSect };
};

export const generateHiddenMaster = (worldNpcs: Person[], sects: Sect[], locations: LocationInfo[]): Person => {
  // 随机选择一个门派作为隐藏高手的出身
  const sourceSect = rand(sects);
  const leader = worldNpcs.find(n => n.id === sourceSect.leader);

  // 随机生成年龄和性别
  const gender = Math.random() > 0.5 ? 'male' : 'female';
  const age = 60 + Math.floor(Math.random() * 30); // 60-90岁

  // 随机选择一种身份模板
  const relationTemplates: Array<{
    type: 'traitor' | 'retired_elder' | 'wandering_hero';
    desc: string;
    relVal: number;
    relType: RelationType;
  }> = [
    { type: 'traitor', desc: '昔日因偷练禁术被逐出的长老', relVal: -80, relType: 'rival' },
    { type: 'retired_elder', desc: '看不惯现任掌门作风而归隐的师叔', relVal: -20, relType: 'master' },
    { type: 'wandering_hero', desc: '掌门的结拜义兄，云游四海', relVal: 80, relType: 'friend' }
  ];
  const template = rand(relationTemplates);

  // 创建隐藏高手
  const master: Person = {
    id: `npc_hidden_master_${Date.now()}`,
    name: genName(gender),
    sectId: 'none', // 无门派
    role: 'mystery',
    gender,
    age,
    birthYear: new Date().getFullYear() - age,
    status: 'alive',
    relations: [],
    locationId: rand(locations.filter(l => l.type === 'wild' || l.type === 'city')).id, // 随机一个野外或城市
    inventory: ['绝世秘籍残页'],
    flags: {},
    arts: [],
    knowledge: [],
    personality: 'mysterious',
    appearance: {
      face: '鹤发童颜，双目如电',
      build: '身形枯瘦却如苍松劲柏',
      clothing: '一袭洗得发白的旧道袍',
      weapon: '无'
    },
    identity: {
      type: template.type as any,
      originalSect: sourceSect.id,
      relatedNpcId: leader?.id,
      relationDesc: template.desc
    }
  };

  // 添加门派的镇派武学
  const sectArts = getSectArts(sourceSect.name);
  if (sectArts.length > 0) {
    // 只添加最强的武学
    master.arts.push(sectArts[sectArts.length - 1].name);
  }

  // 添加与掌门的关系
  if (leader) {
    master.relations.push({ targetId: leader.id, type: template.relType, value: template.relVal });
    if (!leader.relations) leader.relations = [];
    leader.relations.push({ targetId: master.id, type: template.relType, value: template.relVal });
  }

  return master;
};

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

// 🆕 Feature 3: 生成战斗胜利后的通用选择
export const getBattleOutcomeChoices = (
  enemy: Person,
  hero: Person,
  world: any,
  baseRelationVal: number = 0,
  ally?: Person // 新增参数：战斗中的盟友
) => {
  // 基础选择：没有盟友时的选项
  const baseChoices = [
    {
      text: '斩草除根',
      desc: '杀死敌人，永绝后患',
      result: {
        lines: [
          { text: '你眼神一冷，手起刀落。', type: 'action' as const },
          { text: `【${enemy.name}】倒在了血泊中。`, type: 'narrative' as const },
          { text: `【${enemy.name}】已气绝身亡。`, type: 'narrative' as const }
        ],
        addFlag: `killed_${enemy.id}`,
        removeItem: enemy.id,
        addRelations: [{ targetId: enemy.id, type: 'enemy' as RelationType, value: -100 }],
        // Mark the NPC as dead and remove them from the world
        setNpcStatus: { id: enemy.id, status: 'dead' as const },
        removeFromWorld: [enemy.id]
      }
    },
    {
      text: '放他一马',
      desc: '增加名声',
      result: {
        lines: [
          { text: '你收起兵刃："滚吧。"', type: 'dialogue' as const, speaker: '你' },
          { text: `【${enemy.name}】连滚带爬地逃走了。`, type: 'narrative' as const },
          { text: `【${enemy.name}】对你好感度提升了。`, type: 'narrative' as const }
        ],
        addRelations: [{ targetId: enemy.id, type: 'acquaintance' as RelationType, value: baseRelationVal + 10 }]
      }
    },
    {
      text: '邀请入伙',
      desc: '化敌为友',
      result: {
        lines: [
          { text: '"我看你身手不错，不如随我一同闯荡江湖？"', type: 'dialogue' as const, speaker: '你' },
          { text: `【${enemy.name}】一愣，随即拱手："愿效犬马之劳！"`, type: 'dialogue' as const, speaker: enemy.name }
        ],
        addRelations: [{ targetId: enemy.id, type: 'friend' as RelationType, value: 60 }],
        addToParty: enemy.id
      }
    }
  ];

  // 如果有盟友，添加额外的互动选项
  if (ally) {
    // 盟友对敌人的态度（随机生成，但受角色性格影响）
    const allyWantsToKill = Math.random() > 0.5;
    const allyDialogue = allyWantsToKill
      ? `【${ally.name}】怒目圆睁："此贼作恶多端，今日定要取他性命！"`
      : `【${ally.name}】收起兵刃："既然已被你制服，就饶他一命吧。"`;

    return [
      {
        text: '让盟友决定',
        desc: '让盟友决定敌人的命运',
        result: {
          lines: [
            { text: `你看向【${ally.name}】，示意由他/她来决定。`, type: 'action' as const },
            { text: allyDialogue, type: 'dialogue' as const, speaker: ally.name },
            ...(allyWantsToKill ? [
              { text: `【${enemy.name}】惊恐地看着【${ally.name}】，似乎想要求饶。`, type: 'narrative' as const },
              { text: '你决定...', type: 'narrative' as const }
            ] : [
              { text: `【${enemy.name}】感激地看了【${ally.name}】一眼，又转向你。`, type: 'narrative' as const },
              { text: '你决定...', type: 'narrative' as const }
            ])
          ],
          choices: [
            {
              text: allyWantsToKill ? '劝说盟友饶他一命' : '同意放人',
              desc: allyWantsToKill ? '尝试说服盟友放人' : '同意盟友的意见',
              result: {
                lines: [
                  {
                    text: allyWantsToKill
                      ? `"且慢！"你上前一步，"得饶人处且饶人，不如给他一个改过自新的机会？"`
                      : '"好，就依你所言。"',
                    type: 'dialogue' as const,
                    speaker: '你'
                  },
                  ...(allyWantsToKill ? [
                    {
                      text: `【${ally.name}】沉思片刻，终于点了点头："罢了，就看在你的面子上。"`,
                      type: 'dialogue' as const,
                      speaker: ally.name
                    },
                    {
                      text: `【${enemy.name}】如蒙大赦，连连作揖："多谢两位大侠不杀之恩！"`,
                      type: 'dialogue' as const,
                      speaker: enemy.name
                    },
                    {
                      text: `【${enemy.name}】对你好感度大幅提升！`,
                      type: 'narrative' as const
                    }
                  ] : [
                    {
                      text: `【${enemy.name}】感激地抱拳："多谢两位不杀之恩，后会有期！"`,
                      type: 'dialogue' as const,
                      speaker: enemy.name
                    },
                    {
                      text: `【${enemy.name}】对你好感度提升了。`,
                      type: 'narrative' as const
                    }
                  ])
                ],
                addRelations: [
                  { targetId: enemy.id, type: 'friend' as RelationType, value: 30 },
                  { targetId: ally.id, type: 'friend' as RelationType, value: 10 }
                ],
                // 有几率敌人会请求加入队伍
                ...(Math.random() > 0.7 ? {
                  lines: [
                    ...(allyWantsToKill ? [
                      {
                        text: `【${enemy.name}】犹豫了一下，突然跪倒在地："两位大侠，在下愿追随左右，以报不杀之恩！"`,
                        type: 'dialogue' as const,
                        speaker: enemy.name
                      }
                    ] : [
                      {
                        text: `【${enemy.name}】走了几步又回头："两位大侠，在下对江湖不熟，不知能否与两位同行？"`,
                        type: 'dialogue' as const,
                        speaker: enemy.name
                      }
                    ]),
                    {
                      text: `你看向【${ally.name}】，等待他/她的意见...`,
                      type: 'narrative' as const
                    },
                    {
                      text: `【${ally.name}】微微一笑："多一个朋友多一条路，不如就让他/她加入吧。"`,
                      type: 'dialogue' as const,
                      speaker: ally.name
                    }
                  ],
                  choices: getCompanionInviteChoices(enemy, hero, ally)
                } : {})
              }
            },
            {
              text: allyWantsToKill ? '同意处决' : '执意要杀',
              desc: allyWantsToKill ? '同意盟友的决定' : '坚持要杀死敌人',
              result: {
                lines: [
                  {
                    text: allyWantsToKill
                      ? `你点了点头："此人作恶多端，确实该杀。"`
                      : `"不行！此贼不除，后患无穷！"你厉声道。`,
                    type: 'dialogue' as const,
                    speaker: '你'
                  },
                  {
                    text: allyWantsToKill
                      ? `【${ally.name}】手起刀落，结果了【${enemy.name}】的性命。`
                      : `【${ally.name}】叹了口气："既然你执意如此..."`,
                    type: 'narrative' as const
                  },
                  {
                    text: `【${enemy.name}】倒在了血泊中。`,
                    type: 'narrative' as const
                  },
                  {
                    text: allyWantsToKill
                      ? `【${ally.name}】对你的好感度提升了。`
                      : `【${ally.name}】似乎对你的决定有些不满...`,
                    type: 'narrative' as const
                  }
                ],
                addFlag: `killed_${enemy.id}`,
                removeItem: enemy.id,
                addRelations: [
                  { targetId: enemy.id, type: 'enemy' as RelationType, value: -100 },
                  {
                    targetId: ally.id,
                    type: 'friend' as RelationType,
                    value: allyWantsToKill ? 15 : -10
                  }
                ],
                // 处理后续剧情
                ...(Math.random() > 0.5 ? {
                  lines: [
                    ...(allyWantsToKill ? [
                      {
                        text: `【${ally.name}】收起染血的武器，转身对你说道："少侠武艺高强，在下佩服。"`,
                        type: 'dialogue' as const,
                        speaker: ally.name
                      },
                      {
                        text: `"不知少侠接下来有何打算？若是不嫌弃，在下愿与少侠同行，共闯江湖！"`,
                        type: 'dialogue' as const,
                        speaker: ally.name
                      }
                    ] : [
                      {
                        text: `【${ally.name}】看着你，欲言又止："少侠..."`,
                        type: 'dialogue' as const,
                        speaker: ally.name
                      },
                      {
                        text: `"但说无妨。"你说道。`,
                        type: 'dialogue' as const,
                        speaker: '你'
                      },
                      {
                        text: `"在下与少侠一见如故，不知能否有幸与少侠结伴同行？"`,
                        type: 'dialogue' as const,
                        speaker: ally.name
                      }
                    ])
                  ],
                  choices: getCompanionInviteChoices(ally, hero)
                } : {})
              }
            }
          ]
        }
      },
      ...baseChoices
    ];
  }

  return baseChoices;
};

/**
 * 生成同伴邀请的选择项
 * @param npc 要邀请的NPC
 * @param hero 主角
 * @param ally 战斗中的盟友（可选）
 * @returns 包含邀请选项的StoryChoice数组
 */
export const getCompanionInviteChoices = (
  npc: Person,
  hero: Person,
  ally?: Person
): StoryChoice[] => {
  const inviteResult = {
    text: ally ? '同意入伙' : '邀请入伙',
    desc: '化敌为友',
    result: {
      lines: ally
        ? [
          { text: `"好，从今以后我们就是同伴了。"`, type: 'dialogue' as const, speaker: '你' },
          { text: `【${npc.name}】欣喜若狂："多谢两位！在下定当竭尽所能！"`, type: 'dialogue' as const, speaker: npc.name }
        ]
        : [
          { text: `"我看你身手不错，不如随我一同闯荡江湖？"`, type: 'dialogue' as const, speaker: hero.name },
          { text: `【${npc.name}】一愣，随即拱手："愿效犬马之劳！"`, type: 'dialogue' as const, speaker: npc.name }
        ],
      addRelations: [
        { targetId: npc.id, type: 'friend' as const, value: ally ? 80 : 60 },
        ...(ally ? [{ targetId: ally.id, type: 'friend' as const, value: 20 }] : [])
      ],
      ...(ally ? { addToParty: [npc.id] } : { addToParty: npc.id })
    }
  };

  const declineResult = {
    text: '婉拒',
    desc: '婉拒邀请',
    result: {
      lines: ally
        ? [
          { text: '"抱歉，我们还有要事在身，不便同行。"', type: 'dialogue' as const, speaker: '你' },
          { text: `【${npc.name}】略显失望："是在下唐突了。后会有期！"`, type: 'dialogue' as const, speaker: npc.name }
        ]
        : [
          { text: `"多谢你的邀请，但我现在还有要事在身，不便同行。"`, type: 'dialogue' as const, speaker: hero.name },
          { text: `【${npc.name}】略显失望："是在下唐突了。后会有期！"`, type: 'dialogue' as const, speaker: npc.name }
        ],
      addRelations: [
        { targetId: npc.id, type: 'friend' as const, value: ally ? 40 : 30 },
        ...(ally ? [{ targetId: ally.id, type: 'friend' as const, value: 5 }] : [])
      ]
    }
  };

  return [inviteResult, declineResult];
};
