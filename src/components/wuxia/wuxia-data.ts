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
  addArt?: string;
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
export const SECT_NAMES = ['青云门', '血刀堂', '听雨阁', '万兽山庄', '丐帮', '少林', '峨眉', '武当', '华山', '昆仑'];

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

// 商人可售物品列表
export const MERCHANT_ITEMS = [
  '匕首', '短剑', '护腕', '玉佩', '银两', '草药', '酒葫芦', '暗器', '绳索', '火折子',
  '地图', '指南针', '解毒丹', '金疮药', '干粮', '水袋', '夜明珠', '丝绸', '香料', '茶叶',
];

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
    weight: 0.1,
    run: (hero, world) => {
      const choices: StoryChoice[] = [];

      // 根据位置添加不同的选项
      if (hero.locationId === 'loc_city') {
        // 在城中：可以四处打听、去茶馆等
        const gossipEvents = [
          {
            text: '你听到茶馆里有人在谈论最近江湖上的传闻。',
            detail: '据说某个门派最近发生了大事，但具体是什么，没人说得清楚。',
            effect: () => ({ addItem: '江湖传闻' }),
          },
          {
            text: '你在集市上遇到一个说书人，正在讲江湖故事。',
            detail: '你听了一会儿，虽然都是些老故事，但也算解闷。',
            effect: () => ({}),
          },
          {
            text: '你向几个江湖人士打听消息。',
            detail: '他们告诉你最近城外似乎有些不太平，建议你小心。',
            effect: () => ({ addFlag: 'heard_rumors' }),
          },
          {
            text: '你在酒馆里遇到一个醉汉，他告诉你一些有趣的信息。',
            detail: '虽然大部分都是胡言乱语，但你也听到了一些有用的线索。',
            effect: () => {
              const items = ['地图', '指南针', '火折子'];
              return { addItem: rand(items) };
            },
          },
        ];
        const gossipEvent = rand(gossipEvents);
        const eventEffect = gossipEvent.effect();

        choices.push({
          text: '四处打听 (寻找机缘)',
          result: {
            lines: [
              { text: '你四处打听最近江湖上有没有什么新鲜事。', type: 'action' },
              { text: gossipEvent.text, type: 'narrative' },
              { text: gossipEvent.detail, type: 'inner' },
            ],
            addTurn: 1,
            ...eventEffect,
          },
        });

        // 在城中可以去茶馆
        choices.push({
          text: '去茶馆坐坐',
          result: {
            lines: [
              { text: '你走进一家茶馆，找了个位置坐下。', type: 'action' },
              { text: '你点了一壶茶，慢慢品味，听着周围人的谈话。', type: 'narrative' },
              { text: '你感觉心情平静了不少。', type: 'inner' },
            ],
            addTurn: 1,
          },
        });
      } else if (hero.locationId === 'loc_wild') {
        // 在野外：可以探索、寻找资源、闭关修炼
        const exploreEvents = [
          {
            text: '你在野外四处探索，希望能找到一些有用的东西。',
            detail: '你发现了一些草药，小心地收集起来。',
            effect: () => ({ addItem: '草药' }),
          },
          {
            text: '你仔细观察周围的环境，寻找可能的线索。',
            detail: '你发现了一些奇怪的痕迹，但无法确定是什么留下的。',
            effect: () => ({ addFlag: 'found_strange_tracks' }),
          },
          {
            text: '你向路过的旅人打听消息。',
            detail: '他们告诉你前面可能有危险，建议你绕路。',
            effect: () => ({}),
          },
          {
            text: '你在一个隐蔽的地方发现了一个小包裹。',
            detail: '打开一看，里面有一些银两和一张地图。',
            effect: () => ({ addItem: rand(['银两', '地图']) }),
          },
        ];
        const exploreEvent = rand(exploreEvents);
        const eventEffect = exploreEvent.effect();

        choices.push({
          text: '四处探索 (寻找机缘)',
          result: {
            lines: [
              { text: exploreEvent.text, type: 'action' },
              { text: exploreEvent.detail, type: 'narrative' },
            ],
            addTurn: 1,
            ...eventEffect,
          },
        });

        // 在野外可以闭关修炼
        choices.push({
          text: '闭关修炼 (跳过时间)',
          result: {
            lines: [
              { text: '你在野外找到一处僻静之地，开始闭关修炼。', type: 'action' },
              { text: '山中无甲子，寒尽不知年。你专心修炼，不问世事。', type: 'time-pass' },
            ],
            addTurn: 3,
          },
        });
      } else if (hero.locationId === 'loc_sect_main') {
        // 在门派：可以找师兄弟聊天、闭关修炼、向师父请教
        const disciples = world.npcs.filter((n: Person) => n.sectId === hero.sectId && n.role === 'disciple' && n.id !== hero.id);
        if (disciples.length > 0) {
          const randomDisciple = rand(disciples) as Person;
          const discipleRel = hero.relations.find((r) => r.targetId === randomDisciple.id);
          choices.push({
            text: '找师兄弟闲聊',
            result: {
              lines: [
                { text: `你找到师兄弟【${randomDisciple.name}】，一起闲聊江湖趣事。`, type: 'action' },
                { text: '你们聊得很开心，感觉师门情谊更加深厚了。', type: 'narrative' },
              ],
              addTurn: 1,
              addRelation: {
                targetId: randomDisciple.id,
                type: 'friend',
                value: (discipleRel?.value || 0) + 10,
              },
            },
          });
        }

        // 在门派可以闭关修炼
        choices.push({
          text: '闭关修炼 (跳过时间)',
          result: {
            lines: [
              { text: '你回到自己的房间，开始闭关修炼。', type: 'action' },
              { text: '山中无甲子，寒尽不知年。你专心修炼，不问世事。', type: 'time-pass' },
            ],
            addTurn: 3,
          },
        });
      }

      // 移动选项
      if (hero.locationId !== 'loc_sect_main') {
        choices.push({
          text: '返回师门',
          result: {
            lines: [
              { text: '外面的世界虽然精彩，但师门才是家。', type: 'action' },
              { text: '你收拾行装，踏上了回师门的路。', type: 'narrative' },
            ],
            newLocationId: 'loc_sect_main',
            addTurn: 2,
          },
        });
      }

      if (hero.locationId === 'loc_sect_main') {
        const city = world.locations.find((l: Location) => l.id === 'loc_city');
        choices.push({
          text: `下山前往【${city.name}】`,
          result: {
            lines: [
              { text: '静极思动，你决定下山看看。', type: 'action' },
              { text: '你告别师门，踏上了前往城中的路。', type: 'narrative' },
            ],
            newLocationId: 'loc_city',
            addTurn: 1,
          },
        });
      }

      // 如果只有一个选项，直接执行，不显示选择
      if (choices.length === 1) {
        return choices[0].result;
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
          id: `npc_hero_${Date.now()}`, name: genName(gender), sectId: 'none', role: 'hero', gender, age: 30, status: 'alive', relations: [], locationId: 'loc_city', inventory: [], flags: {}, arts: [],
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
    req: (hero) => hero.inventory.includes('回信') && hero.locationId === 'loc_sect_main',
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
        newLocationId: 'loc_wild',
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
              newLocationId: 'loc_city',
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

      // 🆕 核心修复：使用主角武功 & 动态武器描述
      const artName = hero.arts.length > 0 ? hero.arts[0] : '太祖长拳';
      const art = getArtByName(artName);
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
                { text: `你大喝一声，使出【${art.name}】中的绝杀“${ultMove}”！`, type: 'action' },
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
      return !!master && hero.locationId === 'loc_sect_main';
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
      if (hero.locationId !== 'loc_city') return false;
      // 检查是否已经有商人，如果有，检查冷却时间
      const merchant = world.npcs.find((n: Person) => n.role === 'merchant' && n.locationId === 'loc_city');
      if (merchant) {
        const merchantRel = hero.relations.find((r) => r.targetId === merchant.id);
        const meetCount = merchantRel ? Math.floor((merchantRel.value || 0) / 10) : 0;
        // 如果刚见过（value < 10），需要冷却
        if (meetCount === 0 && merchantRel && merchantRel.value > 0) return false;
      }
      return true;
    },
    run: (hero, world) => {
      const merchant = world.npcs.find((n: Person) => n.role === 'merchant' && n.locationId === 'loc_city');
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
          locationId: 'loc_city',
          inventory: [],
          flags: {},
          arts: [],
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
    req: (hero) => hero.locationId === 'loc_wild',
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
        locationId: 'loc_wild',
        inventory: [],
        flags: {},
        arts: [],
      };

      const scenarios = [
        {
          text: `你在山路上遇到了一位独行的${gender === 'female' ? '女' : '男'}侠【${wandererName}】。`,
          dialogue: '\'少侠也是独行江湖？不如结伴而行？\'',
          relation: 'friend' as RelationType,
          value: 30,
        },
        {
          text: `你看到一位${gender === 'female' ? '女子' : '男子'}【${wandererName}】正在与山贼对峙。`,
          dialogue: '\'少侠来得正好，助我一臂之力！\'',
          relation: 'friend' as RelationType,
          value: 40,
        },
        {
          text: `你与一位路过的${gender === 'female' ? '女' : '男'}侠【${wandererName}】在茶摊相遇。`,
          dialogue: '\'江湖路远，能在此相遇也是缘分。\'',
          relation: 'acquaintance' as RelationType,
          value: 20,
        },
      ];

      const scenario = rand(scenarios);

      return {
        lines: [
          { text: scenario.text, type: 'narrative' },
          { text: scenario.dialogue, type: 'dialogue', speaker: wandererName },
        ],
        addNpc: newNpc,
        addRelation: {
          targetId: newNpc.id,
          type: scenario.relation,
          value: scenario.value,
        },
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
    req: (hero) => hero.locationId === 'loc_wild',
    run: (hero) => {
      const banditName = genName('male');
      return {
        lines: [
          { text: '你正在赶路，突然从树林中跳出几个山贼！', type: 'action' },
          { text: `'此路是我开，此树是我栽！要想从此过，留下买路财！'为首的【${banditName}】大声喝道。`, type: 'dialogue', speaker: banditName },
        ],
        choices: [
          {
            text: '拔剑迎战',
            result: {
              lines: [
                { text: '你二话不说，拔剑就上。', type: 'action' },
                { text: '山贼们见你武功不弱，不敢硬拼，丢下几句狠话就跑了。', type: 'narrative' },
                { text: '你在山贼身上搜到了一些银两。', type: 'action' },
              ],
              addItem: '银两',
            },
          },
          {
            text: '智取',
            result: {
              lines: [
                { text: '你灵机一动，假装是某个大门派的弟子。', type: 'action' },
                { text: '山贼们被你的气势吓到，不敢动手，让你通过了。', type: 'narrative' },
              ],
            },
          },
          {
            text: '给钱消灾',
            result: {
              lines: [
                { text: '你不想节外生枝，给了山贼一些银两。', type: 'action' },
                { text: '山贼们满意地离开了。', type: 'narrative' },
              ],
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
    req: (hero) => hero.locationId === 'loc_wild' && !hero.flags.found_manual,
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
    req: (hero) => hero.locationId === 'loc_wild' && !hero.flags.met_wandering_master,
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
        locationId: 'loc_wild',
        inventory: [],
        flags: {},
        arts: [],
      };

      const arts = SECT_ARTS.default;
      const randomArt = rand(arts);

      return {
        lines: [
          { text: '你在山间小路上遇到一位仙风道骨的老者。', type: 'narrative' },
          { text: `'年轻人，我看你骨骼清奇，是个练武的好苗子。'老者【${masterName}】微笑道。`, type: 'dialogue', speaker: masterName },
          { text: `'我这里有本【${randomArt.name}】，就传给你吧。'`, type: 'dialogue', speaker: masterName },
        ],
        choices: [
          {
            text: '恭敬地接受',
            result: {
              lines: [
                { text: '你恭敬地接过秘籍，向老者深深一拜。', type: 'action' },
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
                { text: '老者还是将秘籍留给了你，然后飘然而去。', type: 'narrative' },
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
      const learnedArts = arts.filter((a) => hero.arts.includes(a.name));
      return learnedArts.length < arts.length && hero.locationId === 'loc_sect_main';
    },
    run: (hero, world) => {
      const master = world.npcs.find((n: Person) => n.relations.some((r) => r.targetId === hero.id && r.type === 'apprentice')) || { name: '掌门' };
      const sectName = world.sects.find((s: Sect) => s.id === hero.sectId)?.name || 'default';
      const arts = getSectArts(sectName);
      const unlearnedArts = arts.filter((a) => !hero.arts.includes(a.name));
      const newArt = rand(unlearnedArts);

      return {
        lines: [
          { text: `你向${master.name}请求学习新的武功。`, type: 'action' },
          { text: `'好，今日为师就传你【${newArt.name}】。'`, type: 'dialogue', speaker: master.name },
          { text: `${master.name}详细讲解了${newArt.desc}的要诀。`, type: 'narrative' },
          { text: '你认真聆听，感觉受益匪浅。', type: 'inner' },
        ],
        addArt: newArt.name,
        addRelation: {
          targetId: master.id,
          type: 'master',
          value: hero.relations.find((r) => r.targetId === master.id)?.value || 50 + 10,
        },
      };
    },
  },

  // 在野外独自修炼
  {
    id: 'wild_solo_training',
    tags: ['wild_daily'],
    weight: 20,
    req: (hero) => hero.locationId === 'loc_wild' && hero.arts.length > 0,
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
    req: (hero) => hero.locationId === 'loc_city' && !hero.flags.visited_martial_school,
    run: (hero) => {
      const basicArts = SECT_ARTS.default;
      const newArt = rand(basicArts);

      return {
        lines: [
          { text: '你在城中发现了一家武馆。', type: 'narrative' },
          { text: '武馆师傅见你是个练武之人，主动邀请你进去看看。', type: 'action' },
          { text: `'少侠，我这里有一套【${newArt.name}】，虽然不算高深，但胜在实用。'`, type: 'dialogue', speaker: '武馆师傅' },
        ],
        choices: [
          {
            text: '学习这套武功',
            result: {
              lines: [
                { text: '你交了学费，在武馆学习了一段时间。', type: 'action' },
                { text: `你学会了【${newArt.name}】，虽然不算高深，但聊胜于无。`, type: 'narrative' },
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
  // 🌲 通用日常（续）
  // ===================================
];
