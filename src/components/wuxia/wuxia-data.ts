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
  req?: (hero: Person, world: any, turnInStage: number) => boolean;
  run: (hero: Person, world: any) => SnippetResult;
}

// ==========================================
// 🎲 随机生成库
// ==========================================

export const MALE_FIRST_NAMES = ['风', '云', '雪', '冲', '无忌', '不败', '寻欢', '留香', '过', '靖', '康', '松', '竹', '虎', '龙', '天', '峰', '逍', '遥', '破天', '翠山', '平之', '复', '延庆', '不群', '沧海', '伯光', '问天'];
export const FEMALE_FIRST_NAMES = ['灵珊', '盈盈', '语嫣', '素素', '莫愁', '芷若', '敏', '嫣然', '婉清', '弄玉', '铁心', '凤凰', '蓉', '念慈', '如是', '小玩', '双', '弗之', '龙儿', '语花', '木兰'];
export const LAST_NAMES = ['李', '张', '独孤', '令狐', '东方', '西门', '慕容', '郭', '杨', '陆', '花', '叶', '林', '岳', '萧', '沈', '燕', '楚', '袁', '胡', '苗', '范', '欧阳', '上官', '段', '乔'];
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
// 🎭 预设剧情库
// ==========================================

export const SNIPPETS: StorySnippet[] = [

  // ===================================
  // 🌟 通用保底逻辑 (Idle Action)
  // 当没有其他剧情可触发时，这个片段提供行动菜单
  // ===================================
  {
    id: 'idle_action_menu',
    // 加上所有tag，确保哪里都能触发
    tags: ['sect_daily', 'city_daily', 'wild_daily'],
    weight: 0.1, // 极低权重，只有其他剧情都CD或条件不符时才轮到它
    run: (hero, world) => {
      // 动态生成选项
      const choices: StoryChoice[] = [
        {
          text: '闭关修炼 (跳过时间)',
          result: {
            lines: [
              { text: '山中无甲子，寒尽不知年。你专心修炼，不问世事。', type: 'time-pass' },
              { text: '（时间流逝，这可能触发新的事件）', type: 'inner' },
            ],
            addTurn: 3, // 增加回合数，有助于触发保底剧情
          },
        },
        {
          text: '四处打听 (寻找机缘)',
          result: {
            lines: [
              { text: '你四处打听最近江湖上有没有什么新鲜事。', type: 'action' },
              { text: '（你试图寻找推进剧情的线索...）', type: 'inner' },
            ],
            addTurn: 1, // 只是刷新一下CD
          },
        },
      ];

      // 如果不在门派，加一个回城选项
      if (hero.locationId !== 'loc_sect_main') {
        choices.push({
          text: '返回师门',
          result: {
            lines: [{ text: '外面的世界虽然精彩，但师门才是家。', type: 'action' }],
            newLocationId: 'loc_sect_main',
            addTurn: 2,
          },
        });
      }

      // 如果在门派，加一个下山选项
      if (hero.locationId === 'loc_sect_main') {
        const city = world.locations.find((l: Location) => l.id === 'loc_city');
        choices.push({
          text: `下山前往【${city.name}】`,
          result: {
            lines: [{ text: '静极思动，你决定下山看看。', type: 'action' }],
            newLocationId: 'loc_city',
            addTurn: 1,
          },
        });
      }

      return {
        lines: [{ text: '一时无事，你决定做点什么：', type: 'narrative' }],
        choices,
      };
    },
  },

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

  // 送信
  {
    id: 'intro_quest_deliver',
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
          { text: `你几经打听，终于见到了大侠【${targetNpc.name}】。`, type: 'action' },
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

  // 回门派
  {
    id: 'intro_quest_complete',
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
        advanceStage: true,
        addTurn: 1,
      };
    },
  },

  // ===================================
  // Phase 1: 江湖扬名 (RISING)
  // ===================================

  // 1. 强制结识宿敌 (阈值调低到 2 回合)
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
      };
      return {
        lines: [
          { text: '你路见不平，出手教训了一个恶霸。', type: 'action' },
          { text: '没想打了小的来了老的，恶霸背后的靠山现身了。', type: 'narrative' },
          { text: `“我是【${villainName}】，小子，你活到头了！”`, type: 'dialogue', speaker: villainName },
          { text: '你与其对拼一掌，勉强逃脱，但梁子算是结下了。', type: 'narrative' },
        ],
        addNpc: newNpc,
        addFlag: 'has_villain',
        addRelation: { targetId: newNpc.id, type: 'enemy', value: -100 },
      };
    },
  },

  // 2. 邂逅恋人
  {
    id: 'meet_crush',
    tags: ['city_daily', 'wild_daily'],
    weight: 50,
    stageMin: StoryStage.RISING,
    stageMax: StoryStage.RISING,
    req: (hero) => !hero.relations.some((r) => r.type === 'crush' || r.type === 'spouse'),
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
                { text: `“多谢少侠相助，在下【${newName}】。”`, type: 'dialogue', speaker: newName },
                { text: '你们互换了姓名，一种异样的情愫在心中蔓延。', type: 'inner' },
              ],
              addNpc: newNpc,
              addRelation: { targetId: newNpc.id, type: 'crush', value: 50 },
              addFlag: 'met_crush',
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

  // 3. 强制推进到 CRISIS (阈值调低到 5 回合)
  {
    id: 'force_advance_to_crisis',
    tags: ['sect_daily', 'city_daily', 'wild_daily'],
    weight: 200,
    stageMin: StoryStage.RISING,
    stageMax: StoryStage.RISING,
    req: (hero, world, turn) => turn > 5,
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
        newLocationId: 'loc_wild',
        advanceStage: true, // -> 进 CLIMAX
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
    run: () => ({
      lines: [
        { text: '身负血仇，你在深山中日夜苦练。', type: 'narrative' },
        { text: '寒来暑往，你的剑法终于大成。', type: 'action' },
        { text: '“是时候了。”你望向仇人所在的方向。', type: 'inner' },
      ],
      choices: [
        {
          text: '杀回城市，找仇人算账！',
          result: {
            lines: [{ text: '你提剑下山，杀气腾腾。', type: 'action' }],
            addFlag: 'ready_for_final',
            newLocationId: 'loc_city',
          },
        },
      ],
    }),
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
  // 🌲 通用日常 (低权重，作为填充)
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
    run: (hero, world) =>
      // 简单对话，不依赖特定同门，防止找不到人报错
      ({ lines: [{ text: '你与几位师兄弟闲聊了一会江湖趣闻。', type: 'narrative' }] }),

  },
];
