// ==========================================
// 基础数据结构
// ==========================================

export type RelationType = 'master' | 'apprentice' | 'friend' | 'enemy' | 'acquaintance' | 'crush' | 'spouse' | 'rival';

export interface Relation {
  targetId: string;
  type: RelationType;
  value: number;
}

export interface MartialArt {
  id: string;
  name: string;
  type: 'inner' | 'outer';
  weapon: 'fist' | 'sword' | 'blade' | 'stick' | 'hidden';
  desc: string;
  moves: string[];
}

export type Personality = 'gentle' | 'bold' | 'cunning' | 'righteous' | 'mysterious' | 'playful' | 'serious' | 'passionate';
export type Appearance = {
  face: string; // 面容描述
  build: string; // 身材描述
  clothing: string; // 衣着描述
  weapon?: string; // 武器描述
};

export interface Person {
  id: string;
  name: string;
  sectId: string;
  role: 'leader' | 'disciple' | 'hero' | 'villager' | 'merchant' | 'bandit' | 'mystery' | 'boss';
  gender: 'male' | 'female';
  age: number;
  status: 'alive' | 'dead';
  relations: Relation[];
  locationId: string;
  inventory: string[];
  flags: Record<string, boolean>;
  arts: string[];
  knowledge: string[]; // 🆕 新增：江湖情报库
  personality?: Personality; // 🆕 性格
  appearance?: Appearance; // 🆕 外表描述
  lastSeenAppearance?: Appearance; // 🆕 上次见面的外表（用于对比）
  lastUsedMove?: string; // 🆕 上次使用的招式（用于对比）
  meetCount?: number; // 🆕 见面次数
  // 🆕 门派状态跟踪
  expelled?: boolean; // 是否被逐出师门
  joinSectTime?: number; // 入派时间（回合数）
  leaveSectTime?: number; // 出派时间（回合数）
  sectHistory?: SectHistory[]; // 门派历史记录
}

export interface SectHistory {
  sectId: string;
  action: 'join' | 'expel' | 'leave'; // 加入、被逐、出走
  time: number; // 发生时间（回合数）
  reason?: string; // 原因描述
}

export interface Sect {
  id: string;
  name: string;
  type: 'good' | 'evil';
  locationId: string;
  // 🆕 扩展字段
  recruitGender?: 'male' | 'female' | 'both'; // 收徒性别限制
  history?: string; // 历史介绍
  description?: string; // 门派描述
  leader?: string; // 掌门人ID（可动态更换）
  chiefDisciple?: string; // 首席弟子ID（可动态更换）
  members?: string[]; // 成员ID列表
  reputation?: number; // 门派声望（0-100）
}

export interface Location {
  id: string;
  name: string;
  type: 'sect' | 'city' | 'wild' | 'village' | 'inn' | 'government';
  x?: number; // 🆕 地图坐标X
  y?: number; // 🆕 地图坐标Y
  parentId?: string; // 🆕 父地点（如客栈属于城市）
  connections?: string[]; // 🆕 连接的地点ID列表
}

export enum StoryStage {
  BEGINNING = 0, // 初出茅庐
  RISING = 1, // 江湖扬名
  CRISIS = 2, // 阴谋浮现
  CLIMAX = 3, // 决战巅峰
  ENDING = 4, // 大结局
}

// ==========================================
// 剧情片段系统
// ==========================================

export type SnippetTag = 'sect_daily' | 'city_daily' | 'wild_daily' | 'quest' | 'relationship' | 'main_story';

export interface StoryLine {
  text: string;
  type: 'narrative' | 'dialogue' | 'action' | 'inner' | 'time-pass';
  speaker?: string;
}

export interface StoryChoice {
  text: string;
  result: SnippetResult;
}

export interface SnippetResult {
  lines: StoryLine[];
  addItem?: string;
  removeItem?: string;
  newLocationId?: string;
  addNpc?: Person | Person[];
  addRelation?: Relation;
  addFlag?: string;
  addArt?: string;
  addKnowledge?: string; // 🆕 新增：获得情报指令
  setCompanion?: string; // 🆕 设置同行伙伴（NPC ID）
  removeCompanion?: boolean; // 🆕 移除同行伙伴
  advanceStage?: boolean;
  addTurn?: number;
  endGame?: boolean;
  choices?: StoryChoice[];
}

export interface StorySnippet {
  id: string;
  tags: SnippetTag[];
  weight?: number;
  stageMin?: StoryStage;
  stageMax?: StoryStage;
  req?: (hero: Person, world: any, turnInStage: number) => boolean;
  run: (hero: Person, world: any) => SnippetResult;
}

// ==========================================
// 🎲 随机生成库 & 武功库
// ==========================================

export const MALE_FIRST_NAMES = ['风', '云', '雪', '冲', '无忌', '不败', '寻欢', '留香', '过', '靖', '康', '松', '竹', '虎', '龙', '天', '峰', '逍', '遥', '破天', '翠山', '平之', '复', '延庆', '不群', '沧海', '伯光', '问天'];
export const FEMALE_FIRST_NAMES = ['灵珊', '盈盈', '语嫣', '素素', '莫愁', '芷若', '敏', '嫣然', '婉清', '弄玉', '铁心', '凤凰', '蓉', '念慈', '如是', '小玩', '双', '弗之', '龙儿', '语花', '木兰', '岁', '岁己', '小岁'];
export const LAST_NAMES = ['李', '张', '独孤', '令狐', '东方', '西门', '慕容', '郭', '杨', '陆', '花', '叶', '林', '岳', '萧', '沈', '燕', '楚', '袁', '胡', '苗', '范', '欧阳', '上官', '段', '乔', '李', '张'];
// 🆕 完整的门派数据结构
export const SECTS_DATA: Sect[] = [
  {
    id: 'sect_qingyun',
    name: '青云门',
    type: 'good',
    locationId: 'sect_qingyun',
    recruitGender: 'both',
    history: '青云门始创于三百年前，由一代奇人青云子所创。门派以道法自然为宗旨，门中弟子多修习雷法剑术，门派曾多次主持武林大会，声名显赫。近年来门派内部出现分歧，掌门一脉坚持传统道法，而部分长老倾向于更激进的修炼方式。',
    description: '江湖上最古老的门派之一，以雷法剑术闻名天下。门派位于青云山巅，山清水秀，灵气充沛。',
    reputation: 85,
  },
  {
    id: 'sect_xuedao',
    name: '血刀堂',
    type: 'evil',
    locationId: 'sect_xuedao',
    recruitGender: 'both',
    history: '血刀堂起源于北方苦寒之地，由魔道中人血刀老祖创立。门派以血刀秘法著称，修炼者需以自身精血为引，威力极大但极易走火入魔。近年来血刀堂扩张迅速，与各大正派多次冲突，已成江湖一大祸患。',
    description: '魔道门派，以血刀秘法闻名。修炼者性格多偏激，行事狠辣，但门派内部纪律严明。',
    reputation: 25,
  },
  {
    id: 'sect_tingyu',
    name: '听雨阁',
    type: 'good',
    locationId: 'sect_tingyu',
    recruitGender: 'female',
    history: '听雨阁为江湖上唯一的女侠门派，由一代女侠听雨仙子创立。门派以轻功和暗器闻名，弟子多为江湖侠女。听雨阁从不参与江湖纷争，但门中弟子常在暗中行侠仗义，帮助弱者。',
    description: '江湖上唯一的女侠门派，以轻功和暗器闻名。门派位于江南水乡，环境优雅宁静。',
    reputation: 70,
  },
  {
    id: 'sect_wanshou',
    name: '万兽山庄',
    type: 'evil',
    locationId: 'sect_wanshou',
    recruitGender: 'both',
    history: '万兽山庄位于深山密林之中，庄主自称能够与百兽沟通。门派以驭兽术闻名，弟子常与各种猛兽为伴。山庄与外界交往不多，但偶尔有弟子下山为非作歹，引起江湖注意。',
    description: '神秘的驭兽门派，与百兽为伴。门派位于深山之中，鲜有外人踏足。',
    reputation: 45,
  },
  {
    id: 'sect_gai',
    name: '丐帮',
    type: 'good',
    locationId: 'sect_gai',
    recruitGender: 'both',
    history: '丐帮为江湖第一大帮派，起源于宋朝，由江湖乞丐组成。门派以打狗棒法和降龙十八掌闻名天下。丐帮弟子遍布江湖各地，消息灵通，是正道的中坚力量。近年来丐帮内部出现帮主之争，影响了门派的团结。',
    description: '江湖第一大帮派，以乞丐为主要成员。门派以消息灵通著称，弟子众多。',
    reputation: 90,
  },
  {
    id: 'sect_shaolin',
    name: '少林',
    type: 'good',
    locationId: 'sect_shaolin',
    recruitGender: 'male',
    history: '少林寺为武林圣地，始创于南北朝时期。寺中以禅武合一著称，门派武功博大精深，包括易筋经、罗汉拳等绝学。少林弟子多为僧人，严守清规戒律，从不主动参与江湖争端，但遇不平事必会出手。',
    description: '武林圣地，以禅武合一著称。门派严守清规戒律，只收男弟子。',
    reputation: 95,
  },
  {
    id: 'sect_emei',
    name: '峨眉',
    type: 'good',
    locationId: 'sect_emei',
    recruitGender: 'female',
    history: '峨眉派为江湖第二大门派，由女侠郭襄创立。门派以峨眉剑法和佛门心法闻名，弟子多为女尼或女侠。峨眉派与武当派交好，共同维护江湖正义。近年来门派人才辈出，成为正道的重要力量。',
    description: '江湖第二大门派，以剑法闻名天下。只收女弟子，门派位于峨眉山巅。',
    reputation: 85,
  },
  {
    id: 'sect_wudang',
    name: '武当',
    type: 'good',
    locationId: 'sect_wudang',
    recruitGender: 'male',
    history: '武当派由张三丰真人创立，门派以太极拳和太极剑闻名天下。武当讲究以柔克刚，阴阳平衡之道。门派位于武当山，环境清幽，适合修炼。武当弟子多为道士，性格温和，但武功高强。',
    description: '道家门派，以太极拳和太极剑闻名。讲究以柔克刚，阴阳平衡。',
    reputation: 88,
  },
  {
    id: 'sect_huashan',
    name: '华山',
    type: 'good',
    locationId: 'sect_huashan',
    recruitGender: 'both',
    history: '华山派位于华山之巅，以险峻的地势和独孤九剑闻名。门派由风清扬等前辈创立，讲究剑术的精妙变化。华山派弟子性格多豪爽直率，重视剑术的艺术性。',
    description: '剑术门派，以独孤九剑闻名。门派位于华山之巅，环境险峻。',
    reputation: 75,
  },
  {
    id: 'sect_kunlun',
    name: '昆仑',
    type: 'good',
    locationId: 'sect_kunlun',
    recruitGender: 'both',
    history: '昆仑派为江湖古老门派之一，位于昆仑山深处。门派以昆仑剑法和玄功闻名，修炼者需耐得住高山严寒。昆仑弟子性格坚韧，武功扎实，但门派较为封闭，与外界交往不多。',
    description: '古老的剑术门派，位于昆仑山深处。修炼者需耐得住严寒考验。',
    reputation: 65,
  },
];

// 🆕 保留原有数组用于兼容性（只包含名称）
export const SECT_NAMES = SECTS_DATA.map((sect) => sect.name);

const CITY_PREFIXES = ['襄', '洛', '长', '扬', '苏', '杭', '汴', '京', '成', '渝', '金', '姑'];
const CITY_SUFFIXES = ['阳', '州', '安', '陵', '京', '都'];
const WILD_PREFIXES = ['迷雾', '断肠', '绝情', '黑风', '落日', '万劫', '无量', '缥缈', '恶人', '神农'];
const WILD_SUFFIXES = ['林', '谷', '崖', '山', '窟', '岭', '沼', '漠'];

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

// 🆕 性格描述
const PERSONALITY_DESCRIPTIONS: Record<Personality, string> = {
  gentle: '温文尔雅',
  bold: '豪爽直率',
  cunning: '机敏狡黠',
  righteous: '刚正不阿',
  mysterious: '神秘莫测',
  playful: '活泼俏皮',
  serious: '严肃认真',
  passionate: '热情如火',
};

// 🆕 生成性格
export const genPersonality = (): Personality => rand(['gentle', 'bold', 'cunning', 'righteous', 'mysterious', 'playful', 'serious', 'passionate'] as Personality[]);

// 🆕 生成外表
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

// 🆕 描述角色外表（首次见面）
export const describeAppearance = (person: Person): string => {
  if (!person.appearance) return '';
  const {
    face, build, clothing, weapon,
  } = person.appearance;
  let desc = `【${person.name}】${face}，${build}，${clothing}`;
  if (weapon) desc += `，腰间${weapon}寒光闪闪`;
  return desc;
};

// 🆕 描述角色外表变化（再次见面）
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

// 🆕 描述招式对比
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

// 🆕 战斗系统：多回合战斗
export const generateBattle = (
  hero: Person,
  enemy: Person,
  heroArt: MartialArt,
  enemyArt: MartialArt | null,
  rounds: number = 3,
): StoryLine[] => {
  const lines: StoryLine[] = [];
  const heroMoves = heroArt.moves;
  const enemyMoves = enemyArt?.moves || ['一刀砍来', '横劈', '直刺', '横扫', '当头一刀'];

  lines.push({ text: '战斗开始！', type: 'action' });

  for (let i = 0; i < rounds; i++) {
    const heroMove = rand(heroMoves);
    const enemyMove = rand(enemyMoves);

    // 记录招式
    if (i === 0) {
      // 第一回合，记录上次使用的招式（如果有）
      if (enemy.lastUsedMove) {
        lines.push({ text: describeMoveComparison(enemy, enemyMove, enemyArt?.name || '基础刀法'), type: 'action' });
      } else {
        lines.push({ text: `【${enemy.name}】${enemyMove}！`, type: 'action' });
      }
    } else {
      lines.push({ text: `【${enemy.name}】${enemyMove}！`, type: 'action' });
    }

    lines.push({ text: `你使出【${heroArt.name}】中的"${heroMove}"！`, type: 'action' });

    // 判断胜负（简化版，可以根据武功强弱调整）
    const heroWins = Math.random() > 0.3; // 70%概率获胜
    if (heroWins) {
      lines.push({ text: `${heroArt.desc}，你占据了上风！`, type: 'narrative' });
    } else {
      lines.push({ text: '对方招式凌厉，你稍落下风。', type: 'narrative' });
    }
  }

  // 最终结果
  const finalWin = Math.random() > 0.2; // 80%概率最终获胜
  if (finalWin) {
    lines.push({ text: `经过${rounds}个回合的激战，你终于击败了【${enemy.name}】！`, type: 'narrative' });
  } else {
    lines.push({ text: `经过${rounds}个回合的激战，【${enemy.name}】见占不到便宜，转身逃走了。`, type: 'narrative' });
  }

  return lines;
};

// 🆕 同行事件：露营
export const generateCompanionCampEvent = (companion: Person): StoryLine[] => {
  const personalityDialogue: Record<Personality, string> = {
    gentle: '\'今晚月色真美，不如我们在此休息一晚？\'',
    bold: '\'天色已晚，我们就在这里扎营吧！\'',
    cunning: '\'前面可能有危险，不如先在这里休息。\'',
    righteous: '\'行侠仗义也要注意休息，我们在此过夜吧。\'',
    mysterious: '\'...（默默开始准备露营）',
    playful: '\'好累啊！我们在这里休息吧，我带了干粮！\'',
    serious: '\'按照计划，我们应该在这里休息。\'',
    passionate: '\'今晚我们一起看星星吧！\'',
  };

  const dialogue = personalityDialogue[companion.personality || 'gentle'];

  return [
    { text: `天色渐晚，【${companion.name}】提议在此露营。`, type: 'narrative' },
    { text: dialogue, type: 'dialogue', speaker: companion.name },
    { text: '你们一起生火做饭，围坐在篝火旁聊天。', type: 'action' },
    { text: '夜晚的江湖，似乎也没有那么危险了。', type: 'inner' },
  ];
};

// 🆕 同行事件：吃饭
export const generateCompanionMealEvent = (companion: Person): StoryLine[] => {
  const personalityDialogue: Record<Personality, string> = {
    gentle: '\'少侠，不如我们找个地方用膳？\'',
    bold: '\'走，我请客！我们去最好的酒楼！\'',
    cunning: '\'我知道一家不错的店，物美价廉。\'',
    righteous: '\'行侠仗义也要填饱肚子，我们去吃饭吧。\'',
    mysterious: '\'...（指向一家小店）',
    playful: '\'我饿了！我们去吃好吃的吧！\'',
    serious: '\'该用膳了，我们去前面的酒楼。\'',
    passionate: '\'我知道一家店，那里的菜特别好吃！\'',
  };

  const dialogue = personalityDialogue[companion.personality || 'gentle'];

  return [
    { text: `【${companion.name}】提议一起去用膳。`, type: 'narrative' },
    { text: dialogue, type: 'dialogue', speaker: companion.name },
    { text: '你们在酒楼里点了几道小菜，边吃边聊。', type: 'action' },
    { text: '江湖路上的这顿饭，格外温馨。', type: 'inner' },
  ];
};

// 🆕 同行事件：暧昧对话（好感度高）
export const generateCompanionRomanticEvent = (
  companion: Person,
  relationValue: number,
): StoryLine[] => {
  if (relationValue < 80) return [];

  const genderText = companion.gender === 'female' ? '她' : '他';
  const romanticDialogue: Record<Personality, string> = {
    gentle: `'少侠，${genderText === '她' ? '我' : '我'}...其实一直想和你说...'`,
    bold: `'少侠，${genderText === '她' ? '我' : '我'}觉得和你在一起很开心！'`,
    cunning: `'少侠，你知道吗？${genderText === '她' ? '我' : '我'}其实...'`,
    righteous: `'少侠，${genderText === '她' ? '我' : '我'}敬佩你的为人。'`,
    mysterious: `'...（${genderText}深深看了你一眼）'`,
    playful: `'少侠，${genderText === '她' ? '我' : '我'}喜欢你！'`,
    serious: `'少侠，${genderText === '她' ? '我' : '我'}想和你一直走下去。'`,
    passionate: `'少侠，${genderText === '她' ? '我' : '我'}的心意，你明白吗？'`,
  };

  const dialogue = romanticDialogue[companion.personality || 'gentle'];

  return [
    { text: `【${companion.name}】似乎有话要对你说。`, type: 'narrative' },
    { text: dialogue, type: 'dialogue', speaker: companion.name },
    { text: `${genderText}的脸微微泛红，${genderText === '她' ? '她' : '他'}的眼神中带着某种期待。`, type: 'narrative' },
  ];
};

// 商人可售物品列表
export const MERCHANT_ITEMS = [
  '匕首', '短剑', '护腕', '玉佩', '银两', '草药', '酒葫芦', '暗器', '绳索', '火折子',
  '地图', '指南针', '解毒丹', '金疮药', '干粮', '水袋', '夜明珠', '丝绸', '香料', '茶叶',
];

// 🆕 地理系统：生成复杂的世界地图
export const generateWorldMap = (): Location[] => {
  const locations: Location[] = [];

  // 生成多个城市
  const cities: Location[] = [];
  for (let i = 0; i < 3; i += 1) {
    const cityId = `city_${i}`;
    const city: Location = {
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
    const inn: Location = {
      id: `${cityId}_inn`,
      name: `${city.name}·悦来客栈`,
      type: 'inn',
      parentId: cityId,
      connections: [],
    };
    const government: Location = {
      id: `${cityId}_government`,
      name: `${city.name}·官府`,
      type: 'government',
      parentId: cityId,
      connections: [],
    };
    locations.push(inn, government);
  }

  // 生成村庄
  const villages: Location[] = [];
  for (let i = 0; i < 2; i += 1) {
    const villageId = `village_${i}`;
    const village: Location = {
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
  const sects: Location[] = [];
  SECTS_DATA.forEach((sectData, idx) => {
    const sect: Location = {
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
  const wilds: Location[] = [];
  for (let i = 0; i < 5; i += 1) {
    const wildId = `wild_${i}`;
    const wild: Location = {
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

// 🆕 路径查找：找到从A到B的路径
export const findPath = (fromId: string, toId: string, locations: Location[]): string[] => {
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
export const getReachableLocations = (currentId: string, locations: Location[]): Location[] => {
  const current = locations.find((l) => l.id === currentId);
  if (!current || !current.connections) return [];

  return current.connections
    .map((id) => locations.find((l) => l.id === id))
    .filter((loc): loc is Location => loc !== undefined);
};

export const LOCATION_TEMPLATES: Location[] = [
  { id: 'loc_sect_main', name: '门派驻地', type: 'sect' },
  { id: 'loc_city', name: '随机城市', type: 'city' },
  { id: 'loc_wild', name: '随机险地', type: 'wild' },
];

// 武功数据 (带武器类型)
export const SECT_ARTS: Record<string, MartialArt[]> = {
  青云门: [
    {
      id: 'qy_sword', name: '神剑御雷真诀', type: 'outer', weapon: 'sword', desc: '引九天玄雷，剑势刚猛无俦', moves: ['平地惊雷', '雷动九天', '电闪雷鸣'],
    },
    {
      id: 'qy_inner', name: '太极玄清道', type: 'inner', weapon: 'fist', desc: '道法自然，生生不息', moves: ['固本培元', '清心寡欲'],
    },
  ],
  血刀堂: [
    {
      id: 'xd_blade', name: '血魔刀法', type: 'outer', weapon: 'blade', desc: '刀刀见血，诡异莫测', moves: ['血流成河', '嗜血如命', '魔刀降世'],
    },
    {
      id: 'xd_inner', name: '修罗阴煞功', type: 'inner', weapon: 'fist', desc: '寒气逼人，阴毒无比', moves: ['阴风怒号', '煞气护体'],
    },
  ],
  丐帮: [
    {
      id: 'gb_palm', name: '降龙十八掌', type: 'outer', weapon: 'fist', desc: '天下第一阳刚掌法', moves: ['亢龙有悔', '飞龙在天', '见龙在田', '神龙摆尾'],
    },
    {
      id: 'gb_stick', name: '打狗棒法', type: 'outer', weapon: 'stick', desc: '变化精微，招式奥妙', moves: ['天下无狗', '棒打双犬', '恶犬拦路'],
    },
  ],
  少林: [
    {
      id: 'sl_fist', name: '罗汉拳', type: 'outer', weapon: 'fist', desc: '佛门正宗，中正平和', moves: ['黑虎掏心', '双峰贯耳'],
    },
    {
      id: 'sl_inner', name: '易筋经', type: 'inner', weapon: 'fist', desc: '脱胎换骨，内力无穷', moves: ['洗髓伐毛', '金刚不坏'],
    },
  ],
  武当: [
    {
      id: 'wd_sword', name: '太极剑', type: 'outer', weapon: 'sword', desc: '以柔克刚，连绵不绝', moves: ['揽雀尾', '单鞭', '白鹤亮翅'],
    },
    {
      id: 'wd_inner', name: '纯阳无极功', type: 'inner', weapon: 'fist', desc: '纯阳紫气，百毒不侵', moves: ['紫气东来', '三花聚顶'],
    },
  ],
  华山: [
    {
      id: 'hs_sword', name: '独孤九剑', type: 'outer', weapon: 'sword', desc: '破尽天下招式，只攻不守', moves: ['破剑式', '破刀式', '总决式'],
    },
    {
      id: 'hs_inner', name: '紫霞神功', type: 'inner', weapon: 'fist', desc: '面若紫霞，绵里藏针', moves: ['紫气东来', '霞光万丈'],
    },
  ],
  default: [
    {
      id: 'basic_fist', name: '太祖长拳', type: 'outer', weapon: 'fist', desc: '江湖流传最广的拳法', moves: ['冲拳', '劈掌'],
    },
    {
      id: 'basic_inner', name: '吐纳法', type: 'inner', weapon: 'fist', desc: '基础呼吸吐纳之术', moves: ['气沉丹田'],
    },
  ],
};

// 辅助函数：获取某门派的武功
export const getSectArts = (sectName: string) => {
  const keys = Object.keys(SECT_ARTS);
  for (let i = 0; i < keys.length; i += 1) {
    const key = keys[i];
    if (sectName.includes(key)) return SECT_ARTS[key];
  }
  return SECT_ARTS.default;
};

// 辅助函数：根据名称获取武功对象
export const getArtByName = (artName: string) => {
  const keys = Object.keys(SECT_ARTS);
  for (let i = 0; i < keys.length; i += 1) {
    const key = keys[i];
    const found = SECT_ARTS[key].find((a) => a.name === artName);
    if (found) return found;
  }
  return SECT_ARTS.default[0];
};

// 🆕 辅助函数：根据ID获取门派数据
export const getSectById = (sectId: string): Sect | undefined => SECTS_DATA.find((sect) => sect.id === sectId);

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

// ==========================================
// 🎭 预设剧情库
// ==========================================

export const SNIPPETS: StorySnippet[] = [

  // ===================================
  // 🌟 通用保底逻辑 (Idle Action)
  // ===================================
  {
    id: 'idle_action_menu',
    tags: ['sect_daily', 'city_daily', 'wild_daily'],
    weight: 100, // 🆕 提高权重，确保总是能选择移动
    run: (hero, world) => {
      const choices: StoryChoice[] = [];

      // --- 城市选项：打听情报 ---
      if (hero.locationId.startsWith('city_')) {
        const gossipEvents = [
          {
            text: '你听到茶馆里有人在谈论最近江湖上的传闻。',
            detail: '"听说【血刀堂】和【青云门】的弟子最近在城外野林子里约架，怕是要出人命啊。"',
            // 🆕 效果：添加具体的情报字符串
            effect: () => ({ addKnowledge: 'rumor_duel' }),
          },
          {
            text: '你在集市上遇到一个神秘的说书人。',
            detail: '他压低声音说："听说某位归隐的前辈高人，最近在城外野地现身了。"',
            effect: () => ({ addKnowledge: 'rumor_hidden_master' }),
          },
          {
            text: '你向几个江湖人士打听消息。',
            detail: '他们告诉你最近城里治安不错，没啥大事。',
            effect: () => ({}), // 无事发生
          },
        ];

        // 动态生成打听结果
        const gossipEvent = rand(gossipEvents);

        choices.push({
          text: '去茶馆打听消息 (获取情报)',
          result: {
            lines: [
              { text: '你走进茶馆，点了一壶茶，竖起耳朵。', type: 'action' },
              { text: gossipEvent.detail, type: 'narrative' },
            ],
            addTurn: 1,
            ...gossipEvent.effect(),
          },
        });

        choices.push({
          text: '去集市逛逛',
          result: {
            lines: [{ text: '集市上琳琅满目，你随意逛了逛。', type: 'narrative' }],
            addTurn: 1,
          },
        });
      } else if (hero.locationId.startsWith('wild_')) {
        // --- 野外选项：探索 ---
        choices.push({
          text: '四处探索 (寻找机缘)',
          result: {
            lines: [{ text: '你在野外四处搜寻...', type: 'action' }],
            addTurn: 1,
          },
        });

        choices.push({
          text: '闭关修炼',
          result: {
            lines: [
              { text: '你在野外找到一处僻静之地，开始闭关修炼。', type: 'action' },
              { text: '山中无甲子，寒尽不知年。', type: 'time-pass' },
            ],
            addTurn: 3,
          },
        });
      } else if (hero.locationId.startsWith('sect_')) {
        // --- 门派选项 ---
        choices.push({
          text: '找师兄弟闲聊',
          result: {
            lines: [{ text: '你与同门闲聊，增进了感情。', type: 'narrative' }],
            addTurn: 1,
          },
        });
        choices.push({
          text: '闭关修炼',
          result: {
            lines: [{ text: '你回到房间，专心修炼内功。', type: 'action' }],
            addTurn: 3,
          },
        });
      }

      // --- 通用移动选项 ---
      if (hero.locationId.startsWith('sect_')) {
        const city = world.locations.find((l: Location) => l.type === 'city');
        if (city) {
          choices.push({
            text: `下山前往【${city.name}】`,
            result: {
              lines: [{ text: '静极思动，你决定下山看看。', type: 'action' }],
              newLocationId: city.id,
              addTurn: 1,
            },
          });
        }
      }

      if (hero.locationId.startsWith('city_')) {
        const wild = world.locations.find((l: Location) => l.type === 'wild');
        if (wild) {
          choices.push({
            text: `前往【${wild.name}】探险`,
            result: {
              lines: [{ text: '听说野外有不少机缘，你决定去碰碰运气。', type: 'action' }],
              newLocationId: wild.id,
              addTurn: 2,
            },
          });
        }
        const sect = world.locations.find((l: Location) => l.type === 'sect');
        if (sect) {
          choices.push({
            text: '返回师门',
            result: {
              lines: [{ text: '外面的世界虽然精彩，但师门才是家。', type: 'action' }],
              newLocationId: sect.id,
              addTurn: 2,
            },
          });
        }
      }

      if (hero.locationId.startsWith('wild_')) {
        const city = world.locations.find((l: Location) => l.type === 'city');
        if (city) {
          choices.push({
            text: `返回【${city.name}】`,
            result: {
              lines: [{ text: '野外虽然有机缘，但也危险重重。你决定先回城中。', type: 'action' }],
              newLocationId: city.id,
              addTurn: 2,
            },
          });
        }
        const sect = world.locations.find((l: Location) => l.type === 'sect');
        if (sect) {
          choices.push({
            text: '返回师门',
            result: {
              lines: [{ text: '外面的世界虽然精彩，但师门才是家。', type: 'action' }],
              newLocationId: sect.id,
              addTurn: 3,
            },
          });
        }
      }

      return {
        lines: [{ text: '一时无事，你决定做点什么：', type: 'narrative' }],
        choices,
      };
    },
  },

  // ===================================
  // 🕵️‍♀️ 情报触发事件 (Rumor Events)
  // ===================================

  // 1. 传闻：野外约战
  {
    id: 'event_rumor_duel',
    tags: ['wild_daily'],
    weight: 200, // 高权重，有情报必触发
    // 🆕 条件：在野外 + 有情报 + 没看过热闹
    req: (hero) => hero.knowledge.includes('rumor_duel') && hero.locationId.startsWith('wild_') && !hero.flags.watched_duel,
    run: (hero, world) => ({
      lines: [
        { text: '你按照茶馆听来的消息，悄悄摸进了一片树林。', type: 'action' },
        { text: '果然！前方空地上，两拨人马正在对峙。', type: 'narrative' },
        { text: '左边是身穿青衣的青云门弟子，右边是手持血刀的血刀堂恶徒。', type: 'narrative' },
        { text: '“今日不是你死，就是我亡！”双方剑拔弩张。', type: 'dialogue', speaker: '青云弟子' },
      ],
      choices: [
        {
          text: '助青云门一臂之力',
          result: {
            lines: [
              { text: '你大喝一声：“路见不平，拔刀相助！”冲入战团。', type: 'action' },
              { text: '青云弟子见有援军，士气大振。', type: 'narrative' },
              { text: '一番激战后，血刀堂恶徒溃败而逃。', type: 'action' },
              { text: '“多谢少侠仗义援手！在下没齿难忘。”', type: 'dialogue', speaker: '青云弟子' },
            ],
            addFlag: 'watched_duel', // 标记已完成
            // 可以在这里 addRelation
          },
        },
        {
          text: '坐山观虎斗',
          result: {
            lines: [
              { text: '你躲在树后，静静看着双方拼得两败俱伤。', type: 'action' },
              { text: '最后双方都倒在血泊中，你悄悄离开了。', type: 'narrative' },
              { text: '虽然有些不厚道，但江湖本就如此残酷。', type: 'inner' },
            ],
            addFlag: 'watched_duel',
          },
        },
      ],
    }),
  },

  // 2. 传闻：隐世高手
  {
    id: 'event_rumor_master',
    tags: ['wild_daily'],
    weight: 200,
    req: (hero) => hero.knowledge.includes('rumor_hidden_master') && hero.locationId.startsWith('wild_') && !hero.flags.met_hidden_master,
    run: (hero, world) => {
      const art = rand(SECT_ARTS.default); // 随机给个基础武功
      return {
        lines: [
          { text: '你在野外苦苦搜寻传闻中的高人踪迹。', type: 'action' },
          { text: '忽然一阵琴声传来，你循声而去，见一位老者正在抚琴。', type: 'narrative' },
          { text: '“既然来了，何不现身一见？”老者头也不回地说道。', type: 'dialogue', speaker: '神秘老者' },
          { text: '你上前行礼，老者见你态度诚恳，便指点了你几句。', type: 'narrative' },
        ],
        choices: [
          {
            text: '虚心请教',
            result: {
              lines: [
                { text: `你获益良多，对【${art.name}】有了新的领悟。`, type: 'inner' },
                { text: '再抬头时，老者已不知去向。', type: 'narrative' },
              ],
              addArt: art.name,
              addFlag: 'met_hidden_master',
            },
          },
        ],
      };
    },
  },

  // ... (保留之前的其他 SNIPPETS) ...
  // ===================================
  // Phase 0: 初出茅庐
  // ===================================
  {
    id: 'intro_quest_start',
    tags: ['sect_daily'],
    weight: 500,
    stageMax: StoryStage.BEGINNING,
    req: (hero, world, turn) => turn >= 1 && !hero.flags.quest_letter_done && !hero.inventory.includes('密信') && !hero.inventory.includes('回信'),
    run: (hero, world) => {
      const master = world.npcs.find((n: Person) => n.relations.some((r) => r.targetId === hero.id && r.type === 'apprentice')) || { name: '掌门' };
      const city = world.locations.find((l: Location) => l.type === 'city') || { name: '附近城市' };
      return {
        lines: [
          { text: '忽然有小童来报，掌门唤你去大殿一叙。', type: 'time-pass' },
          { text: `“徒儿，如今江湖动荡，为师有一件要事。”${master.name}神色凝重。`, type: 'dialogue', speaker: master.name },
          { text: `“我要你去【${city.name}】，送一封密信给当地的大侠。”`, type: 'dialogue', speaker: master.name },
        ],
        choices: [
          {
            text: '弟子领命！',
            result: {
              lines: [{ text: '你接过密信，即刻启程。', type: 'action' }],
              addItem: '密信',
              newLocationId: city.id,
            },
          },
        ],
      };
    },
  },

  {
    id: 'intro_quest_deliver',
    tags: ['city_daily'],
    weight: 200,
    stageMax: StoryStage.RISING,
    req: (hero, world) => hero.inventory.includes('密信') && world.locations.find((l: Location) => l.id === hero.locationId)?.type === 'city',
    run: (hero, world) => {
      let targetNpc = world.npcs.find((n: Person) => n.locationId === hero.locationId && n.role === 'hero');
      let isNewNpc = false;
      if (!targetNpc) {
        isNewNpc = true;
        const gender = Math.random() > 0.5 ? 'male' : 'female';
        targetNpc = {
          id: `npc_hero_${Date.now()}`, name: genName(gender), sectId: 'none', role: 'hero', gender, age: 30, status: 'alive', relations: [], locationId: hero.locationId, inventory: [], flags: {}, arts: [], knowledge: [],
        };
      }
      return {
        lines: [
          { text: `你几经打听，终于见到了大侠【${targetNpc.name}】，呈上书信。`, type: 'action' },
          { text: '“此事我已知晓，这是给贵派掌门的回信。”', type: 'dialogue', speaker: targetNpc.name },
        ],
        removeItem: '密信',
        addItem: '回信',
        addNpc: isNewNpc ? targetNpc : undefined,
        addRelation: { targetId: targetNpc.id, type: 'acquaintance', value: 15 },
        addTurn: 1,
      };
    },
  },

  {
    id: 'intro_quest_complete',
    tags: ['sect_daily'],
    weight: 200,
    stageMax: StoryStage.RISING,
    req: (hero) => hero.inventory.includes('回信') && hero.locationId.startsWith('sect_'),
    run: (hero, world) => {
      const master = world.npcs.find((n: Person) => n.relations.some((r) => r.targetId === hero.id && r.type === 'apprentice')) || { name: '掌门' };
      const sectName = world.sects.find((s: Sect) => s.id === hero.sectId)?.name || 'default';
      const arts = getSectArts(sectName);
      // 🆕 随机给一个本门派的外功
      const rewardArt = arts.find((a) => a.type === 'outer') || arts[0];

      return {
        lines: [
          { text: `${master.name}看完回信，满意地点了点头。`, type: 'narrative' },
          { text: '“好！这次历练你做得很好。为师决定传你本门绝学！”', type: 'dialogue', speaker: master.name },
          { text: `师父将【${rewardArt.name}】的口诀心法悉数传授于你。`, type: 'action' },
          { text: `（${rewardArt.desc}）`, type: 'inner' },
        ],
        removeItem: '回信',
        addFlag: 'quest_letter_done',
        addArt: rewardArt.name, // 🆕 学会招式
        advanceStage: true,
        addTurn: 1,
      };
    },
  },

  // ===================================
  // Phase 1: 江湖扬名 (RISING)
  // ===================================

  // 1. 强制结识宿敌
  {
    id: 'force_meet_villain',
    tags: ['sect_daily', 'city_daily', 'wild_daily'],
    weight: 100,
    stageMin: StoryStage.RISING,
    stageMax: StoryStage.RISING,
    req: (hero, world, turn) => !hero.flags.has_villain && turn >= 2,
    run: (hero) => {
      const villainName = genName('male');
      const newNpc: Person = {
        id: `npc_villain_${Date.now()}`,
        name: villainName,
        sectId: 'none',
        role: 'boss',
        gender: 'male',
        age: 40,
        status: 'alive',
        relations: [],
        locationId: hero.locationId,
        inventory: [],
        flags: {},
        arts: [],
        knowledge: [],
      };

      const evilArts = SECT_ARTS['血刀堂'];
      const villainMove = rand(evilArts[0].moves);

      return {
        lines: [
          { text: '你路见不平，出手教训了一个恶霸。', type: 'action' },
          { text: '没想引来了背后的靠山。', type: 'narrative' },
          { text: `“我是【${villainName}】，小子，你活到头了！”`, type: 'dialogue', speaker: villainName },
          { text: `只见${villainName}使出一招【${villainMove}】，阴风阵阵，直扑面门！`, type: 'action' },
          { text: '你与其对拼一掌，勉强逃脱，但梁子算是结下了。', type: 'narrative' },
        ],
        addNpc: newNpc,
        addFlag: 'has_villain',
        addRelation: { targetId: newNpc.id, type: 'enemy', value: -100 },
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
                    addRelation: { targetId: newNpc.id, type: 'crush', value: 60 },
                    addFlag: 'met_crush',
                    setCompanion: newNpc.id,
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
                    addRelation: { targetId: newNpc.id, type: 'crush', value: 50 },
                    addFlag: 'met_crush',
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
  },

  // 3. 强制推进到 CRISIS
  {
    id: 'force_advance_to_crisis',
    tags: ['sect_daily', 'city_daily', 'wild_daily'],
    weight: 200,
    stageMin: StoryStage.RISING,
    stageMax: StoryStage.RISING,
    req: (hero, world, turn) => turn > 8,
    run: () => ({
      lines: [
        { text: '时光飞逝，转眼又是一年。', type: 'time-pass' },
        { text: '江湖表面平静，实则暗流涌动，一场针对你师门的阴谋正在酝酿。', type: 'narrative' },
      ],
      advanceStage: true,
    }),
  },

  // ===================================
  // Phase 2: 阴谋浮现 (CRISIS)
  // ===================================
  {
    id: 'sect_crisis_event',
    tags: ['sect_daily', 'city_daily', 'wild_daily'],
    weight: 500,
    stageMin: StoryStage.CRISIS,
    stageMax: StoryStage.CRISIS,
    req: (hero, world, turn) => turn >= 1,
    run: (hero, world) => {
      const enemyRel = hero.relations.find((r) => r.type === 'enemy');
      const enemyName = enemyRel ? world.npcs.find((n:Person) => n.id === enemyRel.targetId)?.name : '神秘人';
      const master = world.npcs.find((n: Person) => n.relations.some((r) => r.targetId === hero.id && r.type === 'apprentice')) || { name: '掌门' };

      return {
        lines: [
          { text: '这日，惊天噩耗传来！', type: 'action' },
          { text: `【${enemyName}】竟然率领大批高手攻打你的师门！`, type: 'narrative' },
          { text: '你赶回救援时，只看到漫天火光。', type: 'narrative' },
          { text: `“${hero.name}，快走！留得青山在！”${master.name}拼死为你挡下致命一击。`, type: 'dialogue', speaker: master.name },
          { text: '你含泪逃入深山，发誓定要报此血海深仇。', type: 'inner' },
        ],
        newLocationId: world.locations.find((l: Location) => l.type === 'wild')?.id || hero.locationId,
        advanceStage: true,
      };
    },
  },

  // ===================================
  // Phase 3: 决战巅峰 (CLIMAX)
  // ===================================

  // 1. 苦练 (必须先练一次)
  {
    id: 'climax_training',
    tags: ['wild_daily'],
    weight: 200,
    stageMin: StoryStage.CLIMAX,
    stageMax: StoryStage.CLIMAX,
    req: (hero) => !hero.flags.ready_for_final,
    run: (hero, world) => {
      // 🆕 核心修复：使用主角已学会的武功
      const artName = hero.arts.length > 0 ? hero.arts[0] : '太祖长拳';
      const art = getArtByName(artName);
      const move = rand(art.moves);

      return {
        lines: [
          { text: '身负血仇，你在深山中日夜苦练。', type: 'narrative' },
          { text: `你默念【${art.name}】心法，${art.desc}。`, type: 'action' },
          { text: `寒来暑往，你一遍遍演练“${move}”。`, type: 'action' },
          { text: '终于，你感觉内力充盈，神功大成！', type: 'inner' },
        ],
        choices: [
          {
            text: '杀回城市，找仇人算账！',
            result: {
              lines: [{ text: '你提着兵刃下山，杀气腾腾。', type: 'action' }],
              addFlag: 'ready_for_final',
              newLocationId: world.locations.find((l: Location) => l.type === 'city')?.id || hero.locationId,
            },
          },
        ],
      };
    },
  },

  // 2. 决战
  {
    id: 'final_battle_start',
    tags: ['city_daily'],
    weight: 500,
    stageMin: StoryStage.CLIMAX,
    req: (hero) => !!hero.flags.ready_for_final,
    run: (hero, world) => {
      const enemyRel = hero.relations.find((r) => r.type === 'enemy');
      const enemyName = enemyRel ? world.npcs.find((n:Person) => n.id === enemyRel.targetId)?.name : '魔教教主';

      // 🆕 核心修复：选择最厉害的武功（优先门派武功，然后按类型排序）
      let bestArt: MartialArt | null = null;
      const sectName = world.sects.find((s: Sect) => s.id === hero.sectId)?.name || 'default';
      const sectArts = getSectArts(sectName);

      // 优先选择已学会的门派武功
      const learnedSectArts = sectArts.filter((a) => hero.arts.includes(a.name));
      if (learnedSectArts.length > 0) {
        // 优先选择外功（攻击力更强）
        const outerArts = learnedSectArts.filter((a) => a.type === 'outer');
        bestArt = outerArts.length > 0 ? outerArts[0] : learnedSectArts[0];
      } else if (hero.arts.length > 0) {
        // 如果没有门派武功，选择第一个学会的
        bestArt = getArtByName(hero.arts[0]);
      } else {
        // 如果什么都没学会，用默认的
        bestArt = getArtByName('太祖长拳');
      }

      const art = bestArt;
      const ultMove = rand(art.moves);

      let weaponAction = '收剑入鞘';
      if (art.weapon === 'blade') weaponAction = '收刀入鞘';
      if (art.weapon === 'fist') weaponAction = '收势调息';
      if (art.weapon === 'stick') weaponAction = '收起棍棒';

      return {
        lines: [
          { text: '月圆之夜，紫禁之巅。', type: 'narrative' },
          { text: `你与仇人【${enemyName}】相对而立，杀气弥漫。`, type: 'narrative' },
          { text: '“天堂有路你不走！”对手狞笑着扑来，掌风凌厉。', type: 'dialogue', speaker: enemyName },
        ],
        choices: [
          {
            text: `使出绝学【${art.name}】`,
            result: {
              lines: [
                { text: `你大喝一声，使出【${art.name}】中的绝杀"${ultMove}"！`, type: 'action' },
                { text: `${art.desc}，凌厉的攻势瞬间贯穿了对手的防御。`, type: 'action' },
                { text: '三百回合后，你一击命中对方要害。', type: 'action' },
                { text: '一切都结束了。', type: 'inner' },
                { text: `你${weaponAction}，看着天边的朝阳，转身没入人海。`, type: 'narrative' },
                { text: '江湖上从此多了一个传说。', type: 'narrative' },
              ],
              endGame: true,
              advanceStage: true,
            },
          },
          {
            text: '使用其他武功（可能不敌）',
            result: {
              lines: [
                { text: '你使出了其他武功，但威力不足。', type: 'action' },
                { text: '对手见你招式不够精妙，攻势更加凌厉。', type: 'narrative' },
                { text: '你渐渐落入下风，只能勉强招架。', type: 'action' },
              ],
              choices: [
                {
                  text: '拼死一搏',
                  result: {
                    lines: [
                      { text: '你拼尽全力，终于找到机会反击。', type: 'action' },
                      { text: '虽然受了重伤，但你也重创了对手。', type: 'narrative' },
                      { text: '你们两败俱伤，各自退去。', type: 'narrative' },
                    ],
                    endGame: true,
                    advanceStage: true,
                  },
                },
                {
                  text: '逃跑',
                  result: {
                    lines: [
                      { text: '你见势不妙，虚晃一招，转身就逃。', type: 'action' },
                      { text: '对手紧追不舍，你拼尽全力才逃脱。', type: 'narrative' },
                      { text: '虽然逃过一劫，但你知道，这场恩怨还没结束。', type: 'inner' },
                    ],
                    addFlag: 'escaped_final_battle',
                  },
                },
              ],
            },
          },
          {
            text: '同归于尽',
            result: {
              lines: [
                { text: '你深知对方武功高强，只有这一条路。', type: 'inner' },
                { text: '你放弃防守，任由对方一掌打在胸口，同时发出致命一击。', type: 'action' },
                { text: '两个身影同时倒下，风雪掩盖了一切。', type: 'narrative' },
              ],
              endGame: true,
              advanceStage: true,
            },
          },
        ],
      };
    },
  },

  // ===================================
  // 🌲 通用日常
  // ===================================
  {
    id: 'daily_train', tags: ['sect_daily', 'wild_daily'], weight: 5, run: () => ({ lines: [{ text: '今日练功，略有心得。', type: 'narrative' }] }),
  },
  {
    id: 'daily_tea', tags: ['city_daily'], weight: 5, run: () => ({ lines: [{ text: '你在茶馆听了一下午的说书。', type: 'narrative' }] }),
  },
  {
    id: 'daily_wander_city', tags: ['city_daily'], weight: 5, run: () => ({ lines: [{ text: '集市上人来人往，好不热闹。', type: 'narrative' }] }),
  },
  {
    id: 'sect_chat',
    tags: ['sect_daily'],
    weight: 5,
    run: (hero, world) => ({ lines: [{ text: '你与几位师兄弟闲聊了一会江湖趣闻。', type: 'narrative' }] }),
  },

  // ===================================
  // 👥 角色互动系列
  // ===================================

  // 与同门切磋
  {
    id: 'sect_spar',
    tags: ['sect_daily'],
    weight: 15,
    stageMax: StoryStage.CRISIS,
    req: (hero, world) => {
      const disciples = world.npcs.filter((n: Person) => n.sectId === hero.sectId && n.role === 'disciple' && n.id !== hero.id);
      return disciples.length > 0;
    },
    run: (hero, world) => {
      const disciples = world.npcs.filter((n: Person) => n.sectId === hero.sectId && n.role === 'disciple' && n.id !== hero.id);
      const partner = rand(disciples) as Person;
      const artName = hero.arts.length > 0 ? hero.arts[0] : '太祖长拳';
      const art = getArtByName(artName);
      const move = rand(art.moves);

      return {
        lines: [
          { text: `你与同门【${partner.name}】在演武场切磋。`, type: 'action' },
          { text: `'看招！'你使出一招'${move}'，${partner.name}连忙招架。`, type: 'action' },
          { text: '几个回合下来，你们都有所收获。', type: 'narrative' },
        ],
        addRelation: {
          targetId: partner.id,
          type: 'friend',
          value: (hero.relations.find((r) => r.targetId === partner.id)?.value || 0) + 10,
        },
      };
    },
  },

  // 与师父请教
  {
    id: 'sect_ask_master',
    tags: ['sect_daily'],
    weight: 20,
    stageMax: StoryStage.CRISIS,
    req: (hero, world) => {
      const master = world.npcs.find((n: Person) => n.relations.some((r) => r.targetId === hero.id && r.type === 'apprentice'));
      return !!master && hero.locationId.startsWith('sect_');
    },
    run: (hero, world) => {
      const master = world.npcs.find((n: Person) => n.relations.some((r) => r.targetId === hero.id && r.type === 'apprentice')) || { name: '掌门' };
      const sectName = world.sects.find((s: Sect) => s.id === hero.sectId)?.name || 'default';
      const arts = getSectArts(sectName);
      const randomArt = rand(arts);

      return {
        lines: [
          { text: `你向${master.name}请教武学。`, type: 'action' },
          { text: `“徒儿，${randomArt.desc}，你要牢记在心。”`, type: 'dialogue', speaker: master.name },
          { text: '你认真聆听，感觉对武学的理解更深了一层。', type: 'inner' },
        ],
        addRelation: {
          targetId: master.id,
          type: 'master',
          value: hero.relations.find((r) => r.targetId === master.id)?.value || 50 + 5,
        },
      };
    },
  },

  // 在城中遇到商人
  {
    id: 'city_merchant',
    tags: ['city_daily'],
    weight: 20,
    req: (hero, world) => {
      if (world.locations.find((l: Location) => l.id === hero.locationId)?.type !== 'city') return false;
      // 检查是否已经有商人，如果有，检查冷却时间
      const merchant = world.npcs.find((n: Person) => n.role === 'merchant' && n.locationId === hero.locationId);
      if (merchant) {
        const merchantRel = hero.relations.find((r) => r.targetId === merchant.id);
        const meetCount = merchantRel ? Math.floor((merchantRel.value || 0) / 10) : 0;
        // 如果刚见过（value < 10），需要冷却
        if (meetCount === 0 && merchantRel && merchantRel.value > 0) return false;
      }
      return true;
    },
    run: (hero, world) => {
      const currentCityId = hero.locationId;
      const merchant = world.npcs.find((n: Person) => n.role === 'merchant' && n.locationId === hero.locationId);
      let newMerchant: Person | undefined;
      if (!merchant) {
        const gender = Math.random() > 0.5 ? 'male' : 'female';
        newMerchant = {
          id: `npc_merchant_${Date.now()}`,
          name: genName(gender),
          sectId: 'none',
          role: 'merchant',
          gender,
          age: 40,
          status: 'alive',
          relations: [],
          locationId: currentCityId,
          inventory: [],
          flags: {},
          arts: [],
          knowledge: [],
        };
      }
      const actualMerchant = merchant || newMerchant;
      if (!actualMerchant) return { lines: [{ text: '无事发生', type: 'narrative' }] };
      const merchantName = actualMerchant.name;
      const merchantRel = hero.relations.find((r) => r.targetId === actualMerchant.id);
      const meetCount = merchantRel ? Math.floor((merchantRel.value || 0) / 10) : 0;
      const isFirstMeet = meetCount === 0;

      // 根据见面次数生成不同剧情
      if (isFirstMeet) {
        // 第一次见面：只是介绍，不送东西
        return {
          lines: [
            { text: `你在集市上遇到了一位${actualMerchant.gender === 'female' ? '女' : ''}商人【${merchantName}】。`, type: 'narrative' },
            { text: `'少侠，我是${merchantName}，在这集市上做点小买卖。'`, type: 'dialogue', speaker: merchantName },
            { text: '\'我这里有些江湖上常用的物品，以后有需要可以来找我。\'', type: 'dialogue', speaker: merchantName },
          ],
          addNpc: newMerchant,
          addRelation: {
            targetId: actualMerchant.id,
            type: 'acquaintance',
            value: 5,
          },
        };
      }

      if (meetCount === 1) {
        // 第二次见面：可以买东西或送小礼物
        const randomItem = rand(MERCHANT_ITEMS);
        return {
          lines: [
            { text: `你在集市上又遇到了【${merchantName}】。`, type: 'narrative' },
            { text: '\'少侠，又见面了！今天我这里进了些新货。\'', type: 'dialogue', speaker: merchantName },
          ],
          choices: [
            {
              text: '看看有什么好东西',
              result: {
                lines: [
                  { text: '你看了看商人的货物，发现了一些有趣的物品。', type: 'action' },
                  { text: `'这个【${randomItem}】不错，送给你了，交个朋友！'`, type: 'dialogue', speaker: merchantName },
                ],
                addItem: randomItem,
                addRelation: {
                  targetId: actualMerchant.id,
                  type: 'acquaintance',
                  value: (merchantRel?.value || 5) + 15,
                },
              },
            },
            {
              text: '礼貌地拒绝',
              result: {
                lines: [{ text: '你礼貌地拒绝了，商人也不强求。', type: 'narrative' }],
                addRelation: {
                  targetId: actualMerchant.id,
                  type: 'acquaintance',
                  value: (merchantRel?.value || 5) + 5,
                },
              },
            },
          ],
        };
      }

      // 第三次及以后：老朋友的感觉
      const randomItem = rand(MERCHANT_ITEMS);
      const dialogues = [
        '\'少侠，又来了！今天想买点什么？\'',
        '\'老朋友，最近江湖上可有什么新鲜事？\'',
        '\'少侠，我这里刚到了一批好货，要不要看看？\'',
        '\'哈哈，又见面了！今天心情不错，给你打个折。\'',
      ];
      const randomDialogue = rand(dialogues);

      return {
        lines: [
          { text: `你在集市上遇到了老朋友【${merchantName}】。`, type: 'narrative' },
          { text: randomDialogue, type: 'dialogue', speaker: merchantName },
        ],
        choices: [
          {
            text: '看看有什么好东西',
            result: {
              lines: [
                { text: '你看了看商人的货物。', type: 'action' },
                { text: `'这个【${randomItem}】送给你了，老朋友了！'`, type: 'dialogue', speaker: merchantName },
              ],
              addItem: randomItem,
              addRelation: {
                targetId: actualMerchant.id,
                type: 'friend',
                value: (merchantRel?.value || 20) + 10,
              },
            },
          },
          {
            text: '闲聊几句',
            result: {
              lines: [
                { text: '你们闲聊了几句江湖上的趣事。', type: 'narrative' },
                { text: '你感觉心情舒畅了不少。', type: 'inner' },
              ],
              addRelation: {
                targetId: actualMerchant.id,
                type: merchantRel?.type === 'friend' ? 'friend' : 'acquaintance',
                value: (merchantRel?.value || 20) + 5,
              },
            },
          },
          {
            text: '告辞离开',
            result: {
              lines: [{ text: '你与商人告别，继续在集市上闲逛。', type: 'narrative' }],
            },
          },
        ],
      };
    },
  },

  // 在野外遇到江湖人士
  {
    id: 'wild_meet_wanderer',
    tags: ['wild_daily'],
    weight: 25,
    req: (hero) => hero.locationId.startsWith('wild_'),
    run: (hero, world) => {
      const gender = Math.random() > 0.5 ? 'male' : 'female';
      const wandererName = genName(gender);
      const newNpc: Person = {
        id: `npc_wanderer_${Date.now()}`,
        name: wandererName,
        sectId: 'none',
        role: 'hero',
        gender,
        age: hero.age + Math.floor(Math.random() * 10) - 5,
        status: 'alive',
        relations: [],
        locationId: hero.locationId,
        inventory: [],
        flags: {},
        arts: [],
        knowledge: [],
        personality: genPersonality(),
        appearance: genAppearance(gender, 'hero'),
        meetCount: 0,
      };

      const scenarios = [
        {
          text: `你在山路上遇到了一位独行的${gender === 'female' ? '女' : '男'}侠【${wandererName}】。`,
          dialogue: '\'少侠也是独行江湖？不如结伴而行？\'',
          relation: 'friend' as RelationType,
          value: 30,
          hasBandits: false,
        },
        {
          text: `你看到一位${gender === 'female' ? '女子' : '男子'}【${wandererName}】正在与山贼对峙。`,
          dialogue: '\'少侠来得正好，助我一臂之力！\'',
          relation: 'friend' as RelationType,
          value: 40,
          hasBandits: true, // 标记有山贼需要战斗
        },
        {
          text: `你与一位路过的${gender === 'female' ? '女' : '男'}侠【${wandererName}】在茶摊相遇。`,
          dialogue: '\'江湖路远，能在此相遇也是缘分。\'',
          relation: 'acquaintance' as RelationType,
          value: 20,
          hasBandits: false,
        },
      ];

      const scenario = rand(scenarios);

      // 如果有山贼，生成山贼NPC
      let banditNpc: Person | undefined;
      let banditName = '';
      if (scenario.hasBandits) {
        const banditGender = Math.random() > 0.7 ? 'female' : 'male'; // 30%概率是女山贼
        banditName = genName(banditGender);
        banditNpc = {
          id: `npc_bandit_${Date.now()}`,
          name: banditName,
          sectId: 'none',
          role: 'bandit',
          gender: banditGender,
          age: 25,
          status: 'alive',
          relations: [],
          locationId: hero.locationId,
          inventory: [],
          flags: {},
          arts: [],
          knowledge: [],
          personality: genPersonality(),
          appearance: genAppearance(banditGender, 'bandit'),
          meetCount: 0,
        };
      }

      // 如果有山贼，提供战斗选项
      if (scenario.hasBandits && banditNpc) {
        // 选择最厉害的武功
        const sectName = world.sects.find((s: Sect) => s.id === hero.sectId)?.name || 'default';
        const sectArts = getSectArts(sectName);
        const learnedSectArts = sectArts.filter((a) => hero.arts.includes(a.name));
        let bestArt: MartialArt;
        if (learnedSectArts.length > 0) {
          const outerArts = learnedSectArts.filter((a) => a.type === 'outer');
          bestArt = outerArts.length > 0 ? outerArts[0] : learnedSectArts[0];
        } else if (hero.arts.length > 0) {
          bestArt = getArtByName(hero.arts[0]);
        } else {
          bestArt = getArtByName('太祖长拳');
        }
        const move = rand(bestArt.moves);

        // 🆕 添加外表描述
        const appearanceDesc = newNpc.meetCount && newNpc.meetCount > 1
          ? describeAppearanceChange(newNpc)
          : describeAppearance(newNpc);

        const lines: StoryLine[] = [
          { text: scenario.text, type: 'narrative' },
        ];
        if (appearanceDesc) {
          lines.push({ text: appearanceDesc, type: 'narrative' });
        }
        lines.push(
          { text: `'此路是我开！'为首的【${banditName}】大声喝道。`, type: 'dialogue', speaker: banditName },
          { text: scenario.dialogue, type: 'dialogue', speaker: wandererName },
        );

        return {
          lines,
          choices: [
            {
              text: `使出【${bestArt.name}】助战`,
              result: {
                lines: [
                  ...generateBattle(hero, banditNpc, bestArt, null, 3),
                  { text: `'多谢少侠相助！'【${wandererName}】感激地说道。`, type: 'dialogue', speaker: wandererName },
                  { text: '\'少侠武功高强，不如我们结伴而行？\'', type: 'dialogue', speaker: wandererName },
                ],
                addNpc: [newNpc, banditNpc],
                addRelation: {
                  targetId: newNpc.id,
                  type: 'friend',
                  value: 50,
                },
                choices: [
                  {
                    text: '同意结伴',
                    result: {
                      lines: [
                        { text: '\'好，那我们就一起走吧。\'你点了点头。', type: 'dialogue', speaker: '你' },
                        { text: `【${wandererName}】露出了笑容，你们一起踏上了旅程。`, type: 'narrative' },
                      ],
                      setCompanion: newNpc.id,
                    },
                  },
                  {
                    text: '婉言拒绝',
                    result: {
                      lines: [
                        { text: '\'抱歉，我还有要事在身。\'你礼貌地拒绝了。', type: 'dialogue', speaker: '你' },
                        { text: `【${wandererName}】虽然有些失望，但还是礼貌地告别了。`, type: 'narrative' },
                      ],
                    },
                  },
                ],
              },
            },
            {
              text: '坐山观虎斗',
              result: {
                lines: [
                  { text: '你选择在一旁观察，看看情况。', type: 'action' },
                  { text: `【${wandererName}】虽然武功不弱，但面对多个山贼，渐渐落入下风。`, type: 'narrative' },
                  { text: `你最终还是出手相助，但【${wandererName}】对你的态度冷淡了许多。`, type: 'narrative' },
                ],
                addNpc: [newNpc, banditNpc],
                addRelation: {
                  targetId: newNpc.id,
                  type: 'acquaintance',
                  value: 20,
                },
              },
            },
          ],
        };
      }

      // 没有山贼的普通场景
      // 🆕 添加外表描述
      const appearanceDesc = newNpc.meetCount && newNpc.meetCount > 1
        ? describeAppearanceChange(newNpc)
        : describeAppearance(newNpc);

      const lines: StoryLine[] = [
        { text: scenario.text, type: 'narrative' },
      ];
      if (appearanceDesc) {
        lines.push({ text: appearanceDesc, type: 'narrative' });
      }
      lines.push({ text: scenario.dialogue, type: 'dialogue', speaker: wandererName });

      return {
        lines,
        choices: [
          {
            text: '同意结伴',
            result: {
              lines: [
                { text: '\'好，那我们就一起走吧。\'你点了点头。', type: 'dialogue', speaker: '你' },
                { text: `【${wandererName}】露出了笑容，你们一起踏上了旅程。`, type: 'narrative' },
              ],
              addNpc: newNpc,
              addRelation: {
                targetId: newNpc.id,
                type: scenario.relation,
                value: scenario.value,
              },
              setCompanion: newNpc.id,
            },
          },
          {
            text: '婉言拒绝',
            result: {
              lines: [
                { text: '\'抱歉，我还有要事在身。\'你礼貌地拒绝了。', type: 'dialogue', speaker: '你' },
                { text: `【${wandererName}】也不强求，你们就此别过。`, type: 'narrative' },
              ],
              addNpc: newNpc,
              addRelation: {
                targetId: newNpc.id,
                type: 'acquaintance',
                value: 10,
              },
            },
          },
        ],
      };
    },
  },

  // 与敌人再次相遇
  {
    id: 'meet_enemy_again',
    tags: ['city_daily', 'wild_daily'],
    weight: 30,
    stageMin: StoryStage.RISING,
    req: (hero) => {
      const hasEnemy = hero.relations.some((r) => r.type === 'enemy');
      return hasEnemy;
    },
    run: (hero, world) => {
      const enemyRel = hero.relations.find((r) => r.type === 'enemy');
      if (!enemyRel) return { lines: [{ text: '无事发生', type: 'narrative' }] };
      const enemy = world.npcs.find((n: Person) => n.id === enemyRel.targetId);
      if (!enemy) return { lines: [{ text: '无事发生', type: 'narrative' }] };

      return {
        lines: [
          { text: `冤家路窄！你竟然又遇到了【${enemy.name}】！`, type: 'action' },
          { text: '\'又是你！上次让你跑了，这次可没那么容易！\'', type: 'dialogue', speaker: enemy.name },
        ],
        choices: [
          {
            text: '拔剑相向',
            result: {
              lines: [
                { text: '你们再次交手，这次你更加谨慎。', type: 'action' },
                { text: '几个回合后，对方见占不到便宜，冷哼一声离开了。', type: 'narrative' },
              ],
              addRelation: {
                targetId: enemy.id,
                type: 'enemy',
                value: enemyRel.value - 10,
              },
            },
          },
          {
            text: '暂时退避',
            result: {
              lines: [{ text: '你选择暂时退避，君子报仇十年不晚。', type: 'narrative' }],
            },
          },
        ],
      };
    },
  },

  // ===================================
  // 🚶 移动中的遭遇
  // ===================================

  // 在路上遇到山贼
  {
    id: 'travel_bandits',
    tags: ['wild_daily'],
    weight: 30,
    req: (hero) => hero.locationId.startsWith('wild_'),
    run: (hero, world) => {
      // 🆕 山贼有名字和性别
      const banditGender = Math.random() > 0.7 ? 'female' : 'male'; // 30%概率是女山贼
      const banditName = genName(banditGender);
      const banditNpc: Person = {
        id: `npc_bandit_${Date.now()}`,
        name: banditName,
        sectId: 'none',
        role: 'bandit',
        gender: banditGender,
        age: 25,
        status: 'alive',
        relations: [],
        locationId: hero.locationId,
        inventory: [],
        flags: {},
        arts: [],
        knowledge: [],
      };

      // 🆕 选择最厉害的武功用于战斗
      const sectName = world.sects.find((s: Sect) => s.id === hero.sectId)?.name || 'default';
      const sectArts = getSectArts(sectName);
      const learnedSectArts = sectArts.filter((a) => hero.arts.includes(a.name));
      let bestArt: MartialArt;
      if (learnedSectArts.length > 0) {
        const outerArts = learnedSectArts.filter((a) => a.type === 'outer');
        bestArt = outerArts.length > 0 ? outerArts[0] : learnedSectArts[0];
      } else if (hero.arts.length > 0) {
        bestArt = getArtByName(hero.arts[0]);
      } else {
        bestArt = getArtByName('太祖长拳');
      }
      const move = rand(bestArt.moves);

      return {
        lines: [
          { text: '你正在赶路，突然从树林中跳出几个山贼！', type: 'action' },
          { text: `'此路是我开，此树是我栽！要想从此过，留下买路财！'为首的【${banditName}】大声喝道。`, type: 'dialogue', speaker: banditName },
        ],
        choices: [
          {
            text: `使出【${bestArt.name}】迎战`,
            result: {
              lines: generateBattle(hero, banditNpc, bestArt, null, 3),
              addItem: '银两',
              addNpc: banditNpc,
            },
          },
          {
            text: '智取',
            result: {
              lines: [
                { text: '你灵机一动，假装是某个大门派的弟子。', type: 'action' },
              ],
              choices: [
                {
                  text: '继续',
                  result: (() => {
                    const success = Math.random() > 0.3; // 70%成功率
                    if (success) {
                      return {
                        lines: [
                          { text: '山贼们被你的气势吓到，不敢动手，让你通过了。', type: 'narrative' },
                        ],
                        addNpc: banditNpc,
                      };
                    }
                    // 失败的情况，需要战斗或逃跑
                    return {
                      lines: [
                        { text: `但山贼头目【${banditName}】见多识广，识破了你的伎俩。`, type: 'narrative' },
                        { text: `'敢骗我？找死！'【${banditName}】大怒，拔刀就上。`, type: 'dialogue', speaker: banditName },
                      ],
                      addNpc: banditNpc,
                      choices: [
                        {
                          text: `使出【${bestArt.name}】迎战`,
                          result: {
                            lines: [
                              { text: `你使出【${bestArt.name}】中的"${move}"，与山贼激战。`, type: 'action' },
                              { text: '一番激战后，你击退了山贼，但自己也受了些轻伤。', type: 'narrative' },
                            ],
                            addItem: '银两',
                          },
                        },
                        {
                          text: '逃跑',
                          result: {
                            lines: [
                              { text: '你见势不妙，转身就逃。', type: 'action' },
                              { text: '山贼紧追不舍，你拼尽全力才逃脱。', type: 'narrative' },
                            ],
                          },
                        },
                      ],
                    };
                  })(),
                },
              ],
            },
          },
          {
            text: '给钱消灾',
            result: {
              lines: [
                { text: '你不想节外生枝，给了山贼一些银两。', type: 'action' },
                { text: `'算你识相！'【${banditName}】满意地离开了。`, type: 'dialogue', speaker: banditName },
              ],
              addNpc: banditNpc,
            },
          },
        ],
      };
    },
  },

  // 在路上发现秘籍
  {
    id: 'travel_find_manual',
    tags: ['wild_daily'],
    weight: 15,
    req: (hero) => hero.locationId.startsWith('wild_') && !hero.flags.found_manual,
    run: (hero) => {
      const manualNames = ['无名剑谱', '残破心法', '古旧拳经', '内功要诀'];
      const manualName = rand(manualNames);

      return {
        lines: [
          { text: '你在赶路时，无意中发现了一个隐蔽的山洞。', type: 'narrative' },
          { text: '你好奇地走进去，发现里面有一具枯骨，旁边放着一本秘籍。', type: 'action' },
          { text: `你拿起一看，竟然是【${manualName}】！`, type: 'action' },
        ],
        choices: [
          {
            text: '学习这本秘籍',
            result: {
              lines: [
                { text: '你仔细研读这本秘籍，虽然有些残缺，但仍有不少收获。', type: 'action' },
                { text: '你感觉自己的武功有所提升。', type: 'inner' },
              ],
              addFlag: 'found_manual',
              addArt: manualName,
            },
          },
          {
            text: '收起来以后再看',
            result: {
              lines: [{ text: '你将秘籍收好，准备找个安全的地方再仔细研读。', type: 'action' }],
              addItem: manualName,
              addFlag: 'found_manual',
            },
          },
        ],
      };
    },
  },

  // 在路上遇到前辈高人
  {
    id: 'travel_meet_master',
    tags: ['wild_daily'],
    weight: 10,
    req: (hero) => hero.locationId.startsWith('wild_') && !hero.flags.met_wandering_master,
    run: (hero, world) => {
      const masterName = genName(Math.random() > 0.5 ? 'male' : 'female');
      const newNpc: Person = {
        id: `npc_master_${Date.now()}`,
        name: masterName,
        sectId: 'none',
        role: 'mystery',
        gender: Math.random() > 0.5 ? 'male' : 'female',
        age: 60,
        status: 'alive',
        relations: [],
        locationId: hero.locationId,
        inventory: [],
        flags: {},
        arts: [],
        knowledge: [],
      };

      // 🆕 修复：排除已学会的武功，优先选择门派武功或高级武功
      const allArts: MartialArt[] = [];
      Object.values(SECT_ARTS).forEach((sectArts) => {
        sectArts.forEach((art) => {
          if (!allArts.find((a) => a.name === art.name)) {
            allArts.push(art);
          }
        });
      });
      const unlearnedArts = allArts.filter((a) => !hero.arts.includes(a.name));

      if (unlearnedArts.length === 0) {
        // 如果所有武功都学会了，就不触发这个事件
        return {
          lines: [{ text: '无事发生', type: 'narrative' }],
        };
      }

      // 优先选择门派武功，如果没有则随机
      const sectName = world.sects.find((s: Sect) => s.id === hero.sectId)?.name || 'default';
      const sectArts = getSectArts(sectName);
      const unlearnedSectArts = sectArts.filter((a) => !hero.arts.includes(a.name));
      const randomArt = unlearnedSectArts.length > 0
        ? rand(unlearnedSectArts)
        : rand(unlearnedArts);

      return {
        lines: [
          { text: '你在山间小路上遇到一位仙风道骨的老者，正在演练武功。', type: 'narrative' },
          { text: '你被他的招式吸引，忍不住驻足观看。', type: 'action' },
          { text: '老者察觉到你，停下动作，微笑道：\'年轻人，我看你骨骼清奇，是个练武的好苗子。\'', type: 'dialogue', speaker: masterName },
          { text: `'你刚才看的这招【${randomArt.name}】，想学吗？'`, type: 'dialogue', speaker: masterName },
        ],
        choices: [
          {
            text: '恭敬地接受',
            result: {
              lines: [
                { text: '你恭敬地行礼，表示愿意学习。', type: 'action' },
                { text: `老者点了点头，开始详细讲解【${randomArt.name}】的要诀。`, type: 'narrative' },
                { text: `${randomArt.desc}，你听得如痴如醉。`, type: 'inner' },
                { text: '\'好孩子，记住，武功虽重要，但更重要的是武德。\'', type: 'dialogue', speaker: masterName },
                { text: '老者说完，飘然而去，你连他的身影都看不清。', type: 'narrative' },
              ],
              addArt: randomArt.name,
              addNpc: newNpc,
              addRelation: {
                targetId: newNpc.id,
                type: 'master',
                value: 80,
              },
              addFlag: 'met_wandering_master',
            },
          },
          {
            text: '谦虚地推辞',
            result: {
              lines: [
                { text: '你谦虚地表示自己资质不够，不敢接受。', type: 'action' },
                { text: '\'好，好，不骄不躁，是个好苗子。\'老者满意地点点头。', type: 'dialogue', speaker: masterName },
                { text: `'不过，我看你确实有天赋，这本【${randomArt.name}】的秘籍，就留给你吧。'`, type: 'dialogue', speaker: masterName },
                { text: '老者将秘籍放在你面前，然后飘然而去。', type: 'narrative' },
              ],
              addArt: randomArt.name,
              addNpc: newNpc,
              addRelation: {
                targetId: newNpc.id,
                type: 'master',
                value: 90,
              },
              addFlag: 'met_wandering_master',
            },
          },
        ],
      };
    },
  },

  // ===================================
  // 📚 学习/提升武功系列
  // ===================================

  // 在门派中学习新武功
  {
    id: 'sect_learn_new_art',
    tags: ['sect_daily'],
    weight: 25,
    stageMax: StoryStage.CRISIS,
    req: (hero, world) => {
      const master = world.npcs.find((n: Person) => n.relations.some((r) => r.targetId === hero.id && r.type === 'apprentice'));
      if (!master) return false;
      const sectName = world.sects.find((s: Sect) => s.id === hero.sectId)?.name || 'default';
      const arts = getSectArts(sectName);
      const unlearnedArts = arts.filter((a) => !hero.arts.includes(a.name));
      // 🆕 修复：必须有未学会的武功才触发
      return unlearnedArts.length > 0 && hero.locationId.startsWith('sect_');
    },
    run: (hero, world) => {
      const master = world.npcs.find((n: Person) => n.relations.some((r) => r.targetId === hero.id && r.type === 'apprentice')) || { name: '掌门' };
      const sectName = world.sects.find((s: Sect) => s.id === hero.sectId)?.name || 'default';
      const arts = getSectArts(sectName);
      const unlearnedArts = arts.filter((a) => !hero.arts.includes(a.name));

      if (unlearnedArts.length === 0) {
        return {
          lines: [
            { text: `你向${master.name}请求学习新的武功。`, type: 'action' },
            { text: `'徒儿，本门的武功你已经学得差不多了。'${master.name}欣慰地说道。`, type: 'dialogue', speaker: master.name },
            { text: '\'剩下的，就要靠你自己在江湖中历练了。\'', type: 'dialogue', speaker: master.name },
          ],
        };
      }

      const newArt = rand(unlearnedArts);
      const artType = newArt.type === 'inner' ? '内功' : '外功';

      return {
        lines: [
          { text: `你向${master.name}请求学习新的武功。`, type: 'action' },
          { text: `'好！'${master.name}点了点头，'你最近表现不错，今日为师就传你本门${artType}【${newArt.name}】。'`, type: 'dialogue', speaker: master.name },
          { text: `${master.name}开始详细讲解${newArt.desc}的要诀。`, type: 'narrative' },
          { text: '你认真聆听，将每一句话都牢记在心。', type: 'inner' },
          { text: `'记住，${newArt.desc}，你要勤加练习，不可懈怠。'`, type: 'dialogue', speaker: master.name },
          { text: '你深深一拜，表示定不负师恩。', type: 'action' },
        ],
        addArt: newArt.name,
        addRelation: {
          targetId: master.id,
          type: 'master',
          value: (hero.relations.find((r) => r.targetId === master.id)?.value || 50) + 10,
        },
      };
    },
  },

  // 在野外独自修炼
  {
    id: 'wild_solo_training',
    tags: ['wild_daily'],
    weight: 20,
    req: (hero) => hero.locationId.startsWith('wild_') && hero.arts.length > 0,
    run: (hero) => {
      const artName = hero.arts[0];
      const art = getArtByName(artName);
      const move = rand(art.moves);

      return {
        lines: [
          { text: '你在野外找到一处僻静之地，开始独自修炼。', type: 'narrative' },
          { text: `你一遍遍地演练【${art.name}】中的“${move}”。`, type: 'action' },
          { text: '日复一日的苦练，让你对这门武功的理解更加深刻。', type: 'inner' },
        ],
      };
    },
  },

  // 与朋友切磋提升
  {
    id: 'spar_with_friend',
    tags: ['city_daily', 'wild_daily'],
    weight: 20,
    req: (hero) => {
      const friends = hero.relations.filter((r) => r.type === 'friend' && r.value > 30);
      return friends.length > 0;
    },
    run: (hero, world) => {
      const friends = hero.relations.filter((r) => r.type === 'friend' && r.value > 30);
      const friendRel = rand(friends);
      const friend = world.npcs.find((n: Person) => n.id === friendRel.targetId);
      if (!friend) return { lines: [{ text: '无事发生', type: 'narrative' }] };

      const artName = hero.arts.length > 0 ? hero.arts[0] : '太祖长拳';
      const art = getArtByName(artName);
      const move = rand(art.moves);

      return {
        lines: [
          { text: `你与好友【${friend.name}】相约切磋。`, type: 'action' },
          { text: `'看招！'你使出一招'${move}'，${friend.name}也认真应对。`, type: 'action' },
          { text: '你们互相切磋，都有所收获。', type: 'narrative' },
        ],
        addRelation: {
          targetId: friend.id,
          type: 'friend',
          value: friendRel.value + 5,
        },
      };
    },
  },

  // 在城中遇到武馆
  {
    id: 'city_martial_school',
    tags: ['city_daily'],
    weight: 15,
    req: (hero) => hero.locationId.startsWith('city_') && !hero.flags.visited_martial_school,
    run: (hero) => {
      const basicArts = SECT_ARTS.default;
      const unlearnedArts = basicArts.filter((a) => !hero.arts.includes(a.name));

      if (unlearnedArts.length === 0) {
        // 如果基础武功都学会了，就不触发
        return {
          lines: [{ text: '无事发生', type: 'narrative' }],
        };
      }

      const newArt = rand(unlearnedArts);

      return {
        lines: [
          { text: '你在城中发现了一家武馆，里面传来练武的呼喝声。', type: 'narrative' },
          { text: '你好奇地走进去，武馆师傅见你是个练武之人，主动迎了上来。', type: 'action' },
          { text: `'少侠，我看你步履稳健，应该也是练家子。'武馆师傅打量着你，'我这里有一套【${newArt.name}】，虽然不算高深，但胜在实用，要不要学？'`, type: 'dialogue', speaker: '武馆师傅' },
        ],
        choices: [
          {
            text: '学习这套武功',
            result: {
              lines: [
                { text: '你交了学费，在武馆学习了一段时间。', type: 'action' },
                { text: `武馆师傅手把手教你【${newArt.name}】的招式，你学得很认真。`, type: 'narrative' },
                { text: '虽然这套武功不算高深，但你也算是多了一门技艺。', type: 'inner' },
              ],
              addArt: newArt.name,
              addFlag: 'visited_martial_school',
            },
          },
          {
            text: '礼貌地离开',
            result: {
              lines: [{ text: '你礼貌地谢绝了，离开了武馆。', type: 'narrative' }],
            },
          },
        ],
      };
    },
  },

  // ===================================
  // 👥 同行事件系统
  // ===================================

  // 同行：露营
  {
    id: 'companion_camp',
    tags: ['wild_daily'],
    weight: 20,
    req: (hero, world) => !!world.companionId && hero.locationId.startsWith('wild_'),
    run: (hero, world) => {
      const companion = world.npcs.find((n: Person) => n.id === world.companionId);
      if (!companion) return { lines: [{ text: '无事发生', type: 'narrative' }] };

      const lines = generateCompanionCampEvent(companion);
      return {
        lines,
        addTurn: 1,
      };
    },
  },

  // 同行：吃饭
  {
    id: 'companion_meal',
    tags: ['city_daily'],
    weight: 20,
    req: (hero, world) => !!world.companionId && hero.locationId.startsWith('city_'),
    run: (hero, world) => {
      const companion = world.npcs.find((n: Person) => n.id === world.companionId);
      if (!companion) return { lines: [{ text: '无事发生', type: 'narrative' }] };

      const lines = generateCompanionMealEvent(companion);
      return {
        lines,
        addTurn: 1,
        addRelation: {
          targetId: companion.id,
          type: hero.relations.find((r) => r.targetId === companion.id)?.type || 'friend',
          value: (hero.relations.find((r) => r.targetId === companion.id)?.value || 0) + 5,
        },
      };
    },
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
        addRelation: {
          targetId: companion.id,
          type: hero.relations.find((r) => r.targetId === companion.id)?.type || 'friend',
          value: (hero.relations.find((r) => r.targetId === companion.id)?.value || 0) + 3,
        },
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
              addRelation: {
                targetId: companion.id,
                type: hero.relations.find((r) => r.targetId === companion.id)?.type || 'friend',
                value: (hero.relations.find((r) => r.targetId === companion.id)?.value || 0) + 8,
              },
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
              addRelation: {
                targetId: companion.id,
                type: 'crush',
                value: (relation?.value || 0) + 15,
              },
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
    req: (hero, world) => !!world.companionId && hero.locationId.startsWith('sect_'),
    run: (hero, world) => {
      const companion = world.npcs.find((n: Person) => n.id === world.companionId);
      if (!companion) return { lines: [{ text: '无事发生', type: 'narrative' }] };

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
        removeCompanion: true,
      };
    },
  },

  // ===================================
  // 🌲 通用日常（续）
  // ===================================
];
