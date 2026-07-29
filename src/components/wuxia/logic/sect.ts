import type { LocationInfo, Person, RelationType, Sect } from "./types";
import { SECTS_DATA } from "./constants";
import { getSectArts } from "./skills";
import { genName, rand } from "./world";

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
