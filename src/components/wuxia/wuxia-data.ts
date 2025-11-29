// ==========================================
// 基础数据结构
// ==========================================

export type RelationType = 'master' | 'apprentice' | 'friend' | 'enemy' | 'acquaintance';

export interface Relation {
  targetId: string;
  type: RelationType;
  value?: number; // 好感度
}

export interface Person {
  id: string;
  name: string;
  sectId: string;
  role: 'leader' | 'disciple' | 'hero' | 'villager' | 'merchant';
  gender: 'male' | 'female';
  age: number;
  status: 'alive' | 'dead';
  relations: Relation[];
  locationId: string;
  inventory: string[];
  flags: Record<string, boolean>; // 🧠 核心修复：剧情标记系统
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

// ==========================================
// 剧情片段系统
// ==========================================

export type SnippetTag = 'sect_daily' | 'city_daily' | 'wild_daily' | 'quest';

export interface StoryLine {
  text: string;
  type: 'narrative' | 'dialogue' | 'action' | 'inner' | 'time-pass';
  speaker?: string;
}

export interface SnippetResult {
  lines: StoryLine[];
  // 状态变更指令
  addItem?: string;
  removeItem?: string;
  newLocationId?: string;
  addNpc?: Person;
  addRelation?: Relation;
  addFlag?: string; // 🚩 新增：添加剧情标记
  addTurn?: number;
}

export interface StorySnippet {
  id: string;
  tags: SnippetTag[];
  weight?: number;
  req?: (hero: Person, world: any) => boolean;
  run: (hero: Person, world: any) => SnippetResult;
}

// ==========================================
// 静态数据库
// ==========================================

export const FIRST_NAMES = ['风', '云', '雪', '冲', '无忌', '不败', '寻欢', '留香', '过', '靖', '康', '灵珊', '盈盈', '语嫣', '松', '竹', '梅', '兰', '虎', '龙', '天', '峰', '逍', '遥', '破天', '翠山', '素素', '莫愁'];
export const LAST_NAMES = ['李', '张', '独孤', '令狐', '东方', '西门', '慕容', '郭', '杨', '陆', '花', '叶', '林', '岳', '萧', '沈', '燕', '楚', '袁', '胡', '苗', '范'];
export const SECT_NAMES = ['青云门', '血刀堂', '听雨阁', '万兽山庄', '丐帮', '少林', '峨眉', '武当', '华山', '昆仑'];

export const LOCATIONS: Location[] = [
  { id: 'loc_sect_main', name: '门派驻地', type: 'sect' },
  { id: 'loc_city_xiangyang', name: '襄阳城', type: 'city' },
  { id: 'loc_wild_forest', name: '迷雾林', type: 'wild' },
];

export const rand = <T>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];
export const genName = () => `${rand(LAST_NAMES)}${rand(FIRST_NAMES)}`;

// ==========================================
// 🎭 预设剧情库
// ==========================================

export const SNIPPETS: StorySnippet[] = [
  // --- 任务链 1：送信 (Quest: Letter) ---

  // 1. 接任务
  {
    id: 'quest_letter_start',
    tags: ['sect_daily'],
    weight: 100,
    // 条件：没做过这个任务 (!flags.quest_letter_done) 且 没在做 (!inventory.has)
    req: (hero, world) => hero.locationId === 'loc_sect_main'
      && !hero.flags.quest_letter_done
      && !hero.inventory.includes('密信')
      && !hero.inventory.includes('回信')
      && Math.random() < 0.3,
    run: (hero, world) => {
      const master = world.npcs.find((n: Person) => n.relations.some((r) => r.targetId === hero.id && r.type === 'apprentice')) || { name: '掌门' };
      return {
        lines: [
          { text: '忽然有小童来报，掌门唤你去大殿一叙。', type: 'time-pass' },
          { text: `“徒儿，如今江湖动荡，为师有一件要事。”${master.name}神色凝重。`, type: 'dialogue', speaker: master.name },
          { text: '“我要你去襄阳城，送一封密信给当地的大侠。”', type: 'dialogue', speaker: master.name },
          { text: '“弟子定不辱使命！”你接过密信，即刻启程。', type: 'dialogue', speaker: '你' },
        ],
        addItem: '密信',
        newLocationId: 'loc_city_xiangyang', // 自动出发
        addTurn: 3,
      };
    },
  },

  // 2. 送信 (动态复用角色)
  {
    id: 'quest_letter_deliver',
    tags: ['city_daily'],
    weight: 200,
    req: (hero) => hero.inventory.includes('密信') && hero.locationId === 'loc_city_xiangyang',
    run: (hero, world) => {
      // 优先找熟人，其次找现成大侠，最后生成新的
      const knownHeroId = hero.relations.find((r) => r.type === 'acquaintance')?.targetId;
      let targetNpc = knownHeroId ? world.npcs.find((n:Person) => n.id === knownHeroId) : null;

      if (!targetNpc) {
        targetNpc = world.npcs.find((n: Person) => n.locationId === 'loc_city_xiangyang' && n.role === 'hero');
      }

      let isNewNpc = false;
      const isAcquaintance = !!knownHeroId && (targetNpc?.id === knownHeroId);

      if (!targetNpc) {
        isNewNpc = true;
        targetNpc = {
          id: `npc_hero_${Date.now()}`,
          name: genName(),
          sectId: 'none',
          role: 'hero',
          gender: Math.random() > 0.5 ? 'male' : 'female',
          age: 30 + Math.floor(Math.random() * 20),
          status: 'alive',
          relations: [],
          locationId: 'loc_city_xiangyang',
          inventory: [],
          flags: {},
        };
      }

      const lines: StoryLine[] = [
        { text: '你怀揣密信，在襄阳城中打听接头人的下落。', type: 'narrative' },
      ];

      if (isAcquaintance) {
        lines.push({ text: `你轻车熟路地来到了【${targetNpc.name}】府上。`, type: 'narrative' });
        lines.push({ text: '“又是你这小家伙，这回又带了什么消息？”', type: 'dialogue', speaker: targetNpc.name });
      } else {
        lines.push({ text: `几经周折，你终于见到了一位威风凛凛的${targetNpc.gender === 'male' ? '大侠' : '女侠'}，正是江湖闻名的【${targetNpc.name}】。`, type: 'narrative' });
        lines.push({ text: '“原来是贵派高足，久仰久仰。”', type: 'dialogue', speaker: targetNpc.name });
      }

      lines.push(
        { text: `你呈上密信，${targetNpc.name}展信细读。`, type: 'action' },
        { text: '“此事我已知晓，这是给贵派掌门的回信。”', type: 'dialogue', speaker: targetNpc.name },
        { text: '你收好了回信，准备返程。', type: 'inner' },
      );

      return {
        lines,
        removeItem: '密信',
        addItem: '回信',
        addNpc: isNewNpc ? targetNpc : undefined,
        addRelation: { targetId: targetNpc.id, type: 'acquaintance', value: 10 },
        addTurn: 1,
      };
    },
  },

  // 3. 回门派
  {
    id: 'quest_letter_return',
    tags: ['city_daily'],
    weight: 100,
    req: (hero) => hero.inventory.includes('回信') && hero.locationId === 'loc_city_xiangyang',
    run: () => ({
      lines: [
        { text: '任务已了，归心似箭，你连夜赶路返回师门。', type: 'action' },
      ],
      newLocationId: 'loc_sect_main',
      addTurn: 5,
    }),
  },

  // 4. 完成任务 (关键：打标记)
  {
    id: 'quest_letter_complete',
    tags: ['sect_daily'],
    weight: 100,
    req: (hero) => hero.inventory.includes('回信') && hero.locationId === 'loc_sect_main',
    run: (hero, world) => {
      const master = world.npcs.find((n: Person) => n.relations.some((r) => r.targetId === hero.id && r.type === 'apprentice')) || { name: '掌门' };
      return {
        lines: [
          { text: '你风尘仆仆地赶回门派，第一时间求见师父。', type: 'action' },
          { text: `${master.name}看完回信，满意地点了点头。`, type: 'narrative' },
          { text: '“好！这次历练你做得很好，为师传你一招保命绝学。”', type: 'dialogue', speaker: master.name },
          { text: '你感觉自己的武学修为精进了一层。', type: 'inner' },
        ],
        removeItem: '回信',
        addFlag: 'quest_letter_done', // 🚩 打上标记，防止再次触发
        addTurn: 1,
      };
    },
  },

  // --- 任务链 2：下山历练 (送信完成后触发) ---
  {
    id: 'quest_explore_start',
    tags: ['sect_daily'],
    weight: 80,
    req: (hero) => hero.locationId === 'loc_sect_main' && hero.flags.quest_letter_done && !hero.flags.quest_explore_start,
    run: (hero, world) => {
      const master = world.npcs.find((n: Person) => n.relations.some((r) => r.targetId === hero.id && r.type === 'apprentice')) || { name: '掌门' };
      return {
        lines: [
          { text: '数日后，师父再次把你叫到身前。', type: 'time-pass' },
          { text: '“你如今武功已成，不应再困守山门。去江湖上闯荡一番吧。”', type: 'dialogue', speaker: master.name },
          { text: '“听说迷雾林最近有异兽出没，你可以去看看。”', type: 'dialogue', speaker: master.name },
          { text: '你拜别恩师，下山而去。', type: 'action' },
        ],
        addFlag: 'quest_explore_start',
        newLocationId: 'loc_wild_forest',
        addTurn: 1,
      };
    },
  },

  // ===================================
  // 日常库
  // ===================================

  {
    id: 'sect_train_waterfall',
    tags: ['sect_daily'],
    run: () => ({ lines: [{ text: '你在瀑布下冲刷筋骨，感悟水流之势，感觉内力有所精进。', type: 'narrative' }] }),
  },
  {
    id: 'sect_train_night',
    tags: ['sect_daily'],
    run: () => ({ lines: [{ text: '夜深人静，你挑灯研读拳谱，忽有所悟。', type: 'narrative' }] }),
  },
  {
    id: 'sect_chat_brother',
    tags: ['sect_daily'],
    weight: 2,
    run: (hero, world) => {
      const brothers = world.npcs.filter((n: Person) => n.sectId === hero.sectId && n.id !== hero.id);
      const brother = rand(brothers) || { name: '扫地僧' };
      return {
        lines: [
          { text: `你在演武场碰到了【${brother.name}】。`, type: 'narrative' },
          { text: `${brother.name}正坐在台阶上发呆，手里拿着一封未寄出的信。`, type: 'narrative' },
        ],
      };
    },
  },
  {
    id: 'city_tea',
    tags: ['city_daily'],
    run: () => ({ lines: [{ text: '襄阳城内热闹非凡，你在茶馆听了一下午的说书。', type: 'narrative' }] }),
  },
  {
    id: 'wild_explore',
    tags: ['wild_daily'],
    run: () => ({ lines: [{ text: '你在迷雾林中小心翼翼地前行，四周静得可怕。', type: 'narrative' }] }),
  },
];
