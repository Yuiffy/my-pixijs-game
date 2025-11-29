// ==========================================
// 基础数据结构
// ==========================================

export type RelationType = 'master' | 'apprentice' | 'friend' | 'enemy' | 'acquaintance' | 'crush' | 'spouse' | 'rival';

export interface Relation {
  targetId: string;
  type: RelationType;
  value: number;
}

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
}

export interface Sect {
  id: string;
  name: string;
  type: 'good' | 'evil';
  locationId: string;
}

export interface Location {
  id: string;
  name: string;
  type: 'sect' | 'city' | 'wild';
}

export enum StoryStage {
  BEGINNING = 0, // 初出茅庐
  RISING = 1, // 江湖扬名 (结识侠客/恋人/宿敌)
  CRISIS = 2, // 阴谋浮现 (门派大变)
  CLIMAX = 3, // 决战巅峰 (苦练/复仇)
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
  addNpc?: Person;
  addRelation?: Relation;
  addFlag?: string;
  advanceStage?: boolean;
  endGame?: boolean;
  choices?: StoryChoice[];
}

export interface StorySnippet {
  id: string;
  tags: SnippetTag[];
  weight?: number;
  stageMin?: StoryStage;
  stageMax?: StoryStage;
  req?: (hero: Person, world: any) => boolean;
  run: (hero: Person, world: any) => SnippetResult;
}

// ==========================================
// 🎲 随机生成库
// ==========================================

export const MALE_FIRST_NAMES = ['风', '云', '雪', '冲', '无忌', '不败', '寻欢', '留香', '过', '靖', '康', '松', '竹', '虎', '龙', '天', '峰', '逍', '遥', '破天', '翠山', '平之', '复', '延庆', '不群', '沧海'];
export const FEMALE_FIRST_NAMES = ['灵珊', '盈盈', '语嫣', '素素', '莫愁', '芷若', '敏', '嫣然', '婉清', '弄玉', '铁心', '凤凰', '蓉', '念慈', '如是', '小玩', '双', '弗之', '龙儿'];
export const LAST_NAMES = ['李', '张', '独孤', '令狐', '东方', '西门', '慕容', '郭', '杨', '陆', '花', '叶', '林', '岳', '萧', '沈', '燕', '楚', '袁', '胡', '苗', '范', '欧阳', '上官'];
export const SECT_NAMES = ['青云门', '血刀堂', '听雨阁', '万兽山庄', '丐帮', '少林', '峨眉', '武当', '华山', '昆仑'];

const CITY_PREFIXES = ['襄', '洛', '长', '扬', '苏', '杭', '汴', '京', '成', '渝', '金', '姑'];
const CITY_SUFFIXES = ['阳', '州', '安', '陵', '京', '都'];
const WILD_PREFIXES = ['迷雾', '断肠', '绝情', '黑风', '落日', '万劫', '无量', '缥缈', '恶人', '神农'];
const WILD_SUFFIXES = ['林', '谷', '崖', '山', '窟', '岭', '沼', '漠'];

export const rand = <T>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];

export const genName = (gender: 'male' | 'female') => {
  const firstNames = gender === 'male' ? MALE_FIRST_NAMES : FEMALE_FIRST_NAMES;
  return `${rand(LAST_NAMES)}${rand(firstNames)}`;
};

export const genCityName = () => `${rand(CITY_PREFIXES)}${rand(CITY_SUFFIXES)}城`;
export const genWildName = () => `${rand(WILD_PREFIXES)}${rand(WILD_SUFFIXES)}`;

export const LOCATION_TEMPLATES: Location[] = [
  { id: 'loc_sect_main', name: '门派驻地', type: 'sect' },
  { id: 'loc_city', name: '随机城市', type: 'city' },
  { id: 'loc_wild', name: '随机险地', type: 'wild' },
];

// ==========================================
// 🎭 预设剧情库 (全流程保底版)
// ==========================================

export const SNIPPETS: StorySnippet[] = [

  // ===================================
  // Phase 0: 初出茅庐 (任务引导)
  // ===================================
  {
    id: 'quest_start_letter',
    tags: ['sect_daily'],
    weight: 200, // 极高权重，确保开局触发
    stageMax: StoryStage.BEGINNING,
    req: (hero, world) => hero.locationId === 'loc_sect_main'
      && !hero.flags.quest_letter_done
      && !hero.inventory.includes('密信')
      && !hero.inventory.includes('回信'),
    run: (hero, world) => {
      const master = world.npcs.find((n: Person) => n.relations.some((r) => r.targetId === hero.id && r.type === 'apprentice')) || { name: '掌门' };
      const city = world.locations.find((l: Location) => l.id === 'loc_city');
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
              newLocationId: 'loc_city',
            },
          },
        ],
      };
    },
  },
  // ... 送信和回禀的逻辑保持不变，但增加 stage check ...
  {
    id: 'quest_deliver_dynamic',
    tags: ['city_daily'],
    weight: 200,
    stageMax: StoryStage.RISING,
    req: (hero) => hero.inventory.includes('密信') && hero.locationId === 'loc_city',
    run: (hero, world) => {
      let targetNpc = world.npcs.find((n: Person) => n.locationId === 'loc_city' && n.role === 'hero');
      let isNewNpc = false;
      if (!targetNpc) {
        isNewNpc = true;
        const gender = Math.random() > 0.5 ? 'male' : 'female';
        targetNpc = {
          id: `npc_hero_${Date.now()}`, name: genName(gender), sectId: 'none', role: 'hero', gender, age: 30, status: 'alive', relations: [], locationId: 'loc_city', inventory: [], flags: {},
        };
      }
      return {
        lines: [
          { text: `你见到了大侠【${targetNpc.name}】，呈上书信。`, type: 'action' },
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
    id: 'quest_return_sect',
    tags: ['city_daily'],
    weight: 100,
    stageMax: StoryStage.RISING,
    req: (hero) => hero.inventory.includes('回信') && hero.locationId === 'loc_city',
    run: () => ({
      lines: [{ text: '任务已了，你连夜赶路返回师门。', type: 'action' }],
      newLocationId: 'loc_sect_main',
      addTurn: 3,
    }),
  },
  {
    id: 'quest_letter_complete',
    tags: ['sect_daily'],
    weight: 200,
    stageMax: StoryStage.RISING,
    req: (hero) => hero.inventory.includes('回信') && hero.locationId === 'loc_sect_main',
    run: (hero, world) => {
      const master = world.npcs.find((n: Person) => n.relations.some((r) => r.targetId === hero.id && r.type === 'apprentice')) || { name: '掌门' };
      return {
        lines: [
          { text: `${master.name}看完回信，满意地点了点头。`, type: 'narrative' },
          { text: '“好！这次历练你做得很好。”', type: 'dialogue', speaker: master.name },
          { text: '你在江湖上也有了些许名声。', type: 'inner' },
        ],
        removeItem: '回信',
        addFlag: 'quest_letter_done',
        advanceStage: true, // -> 进入 RISING
        addTurn: 1,
      };
    },
  },

  // ===================================
  // Phase 1: 江湖扬名 (RISING) - 强制推进
  // ===================================

  // 1. 强制结识宿敌 (如果还没有)
  {
    id: 'force_meet_villain',
    tags: ['sect_daily', 'city_daily', 'wild_daily'], // 任何地方都能触发
    weight: 50,
    stageMin: StoryStage.RISING,
    stageMax: StoryStage.RISING,
    req: (hero) => !hero.flags.has_villain, // 还没宿敌就触发
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
      };
      return {
        lines: [
          { text: '你路见不平，出手教训了一个恶霸。', type: 'action' },
          { text: '没想引来了背后的靠山。', type: 'narrative' },
          { text: `“我是【${villainName}】，小子，你活到头了！”`, type: 'dialogue', speaker: villainName },
          { text: '你与其对拼一掌，勉强逃脱，但梁子算是结下了。', type: 'narrative' },
        ],
        addNpc: newNpc,
        addFlag: 'has_villain',
        addRelation: { targetId: newNpc.id, type: 'enemy', value: -100 },
      };
    },
  },

  // 2. 强制推进到下一章 (如果已经有宿敌)
  {
    id: 'time_flies_rising',
    tags: ['sect_daily', 'city_daily', 'wild_daily'],
    weight: 20, // 较低权重，允许先玩一会日常
    stageMin: StoryStage.RISING,
    stageMax: StoryStage.RISING,
    req: (hero) => !!hero.flags.has_villain, // 必须有宿敌了
    run: () => ({
      lines: [
        { text: '时光飞逝，转眼又是一年。', type: 'time-pass' },
        { text: '江湖表面平静，实则暗流涌动。', type: 'narrative' },
      ],
      advanceStage: true, // -> 强制进 CRISIS
    }),
  },

  // ===================================
  // Phase 2: 阴谋浮现 (CRISIS) - 灭门惨案
  // ===================================
  {
    id: 'sect_crisis_event',
    tags: ['sect_daily', 'city_daily', 'wild_daily'],
    weight: 200, // 只要进这个阶段，必定尽快触发
    stageMin: StoryStage.CRISIS,
    stageMax: StoryStage.CRISIS,
    run: (hero, world) => {
      const enemyRel = hero.relations.find((r) => r.type === 'enemy');
      const enemyName = enemyRel ? world.npcs.find((n:Person) => n.id === enemyRel.targetId)?.name : '神秘人';
      const master = world.npcs.find((n: Person) => n.relations.some((r) => r.targetId === hero.id && r.type === 'apprentice')) || { name: '掌门' };

      return {
        lines: [
          { text: '这日，惊天噩耗传来！', type: 'action' },
          { text: `【${enemyName}】率领大批高手攻打你的师门！`, type: 'narrative' },
          { text: '你赶回救援时，只看到漫天火光。', type: 'narrative' },
          { text: `“${hero.name}，快走！留得青山在！”${master.name}拼死为你挡下致命一击。`, type: 'dialogue', speaker: master.name },
          { text: '你含泪逃入深山，发誓定要报此血海深仇。', type: 'inner' },
        ],
        newLocationId: 'loc_wild',
        advanceStage: true, // -> 进 CLIMAX
      };
    },
  },

  // ===================================
  // Phase 3: 决战巅峰 (CLIMAX) - 苦练与复仇
  // ===================================
  {
    id: 'climax_training',
    tags: ['wild_daily'],
    weight: 200,
    stageMin: StoryStage.CLIMAX,
    stageMax: StoryStage.CLIMAX,
    req: (hero) => !hero.flags.ready_for_final,
    run: () => ({
      lines: [
        { text: '身负血仇，你在深山中日夜苦练。', type: 'narrative' },
        { text: '寒来暑往，你的剑法终于大成。', type: 'action' },
        { text: '“是时候了。”你望向仇人所在的方向。', type: 'inner' },
      ],
      addFlag: 'ready_for_final',
      newLocationId: 'loc_city', // 杀回城市
    }),
  },
  {
    id: 'final_battle_start',
    tags: ['city_daily'],
    weight: 200,
    stageMin: StoryStage.CLIMAX,
    req: (hero) => !!hero.flags.ready_for_final,
    run: (hero, world) => {
      const enemyRel = hero.relations.find((r) => r.type === 'enemy');
      const enemyName = enemyRel ? world.npcs.find((n:Person) => n.id === enemyRel.targetId)?.name : '魔教教主';

      return {
        lines: [
          { text: '月圆之夜，紫禁之巅。', type: 'narrative' },
          { text: `你与仇人【${enemyName}】相对而立，杀气弥漫。`, type: 'narrative' },
          { text: '“天堂有路你不走！”对手狞笑着扑来。', type: 'dialogue', speaker: enemyName },
        ],
        choices: [
          {
            text: '使出绝学一击必杀',
            result: {
              lines: [
                { text: '三百回合后，你使出了师门绝学，一剑刺穿了对方的咽喉。', type: 'action' },
                { text: '一切都结束了。', type: 'inner' },
                { text: '你收剑入鞘，看着天边的朝阳，转身没入人海。', type: 'narrative' },
                { text: '江湖上从此多了一个传说。', type: 'narrative' },
              ],
              endGame: true,
              advanceStage: true,
            },
          },
          {
            text: '同归于尽',
            result: {
              lines: [
                { text: '你深知对方武功高强，只有这一条路。', type: 'inner' },
                { text: '你放弃防守，任由对方一掌打在胸口，同时长剑刺入对方心脏。', type: 'action' },
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
  // 🌲 普通日常 (填充空隙)
  // ===================================
  {
    id: 'daily_sect_1', tags: ['sect_daily'], weight: 5, run: () => ({ lines: [{ text: '你在瀑布下冲刷筋骨。', type: 'narrative' }] }),
  },
  {
    id: 'daily_city_1', tags: ['city_daily'], weight: 5, run: () => ({ lines: [{ text: '你在茶馆听了一下午书。', type: 'narrative' }] }),
  },
  {
    id: 'daily_wild_1', tags: ['wild_daily'], weight: 5, run: () => ({ lines: [{ text: '野外静悄悄的。', type: 'narrative' }] }),
  },

  // 恋爱线 (Rising阶段触发)
  {
    id: 'meet_crush',
    tags: ['city_daily', 'wild_daily'],
    weight: 20,
    stageMin: StoryStage.RISING,
    stageMax: StoryStage.RISING,
    req: (hero) => !hero.relations.some((r) => r.type === 'crush'),
    run: (hero) => {
      const gender = hero.gender === 'male' ? 'female' : 'male';
      const name = genName(gender);
      const newNpc: Person = {
        id: `npc_${Date.now()}`, name, sectId: 'none', role: 'hero', gender, age: 20, status: 'alive', relations: [], locationId: hero.locationId, inventory: [], flags: {},
      };
      return {
        lines: [
          { text: '你偶遇一位佳人，帮其解了围。', type: 'narrative' },
          { text: `“多谢少侠，在下【${name}】。”`, type: 'dialogue', speaker: name },
        ],
        addNpc: newNpc,
        addRelation: { targetId: newNpc.id, type: 'crush', value: 50 },
      };
    },
  },
];
