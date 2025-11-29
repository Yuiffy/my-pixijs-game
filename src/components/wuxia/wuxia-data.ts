// ==========================================
// 基础配置与枚举
// ==========================================

export type RelationType = 'master' | 'apprentice' | 'parent' | 'child' | 'friend' | 'enemy' | 'crush';

export interface Person {
  id: string;
  name: string;
  sectId: string;
  role: 'leader' | 'elder' | 'disciple' | 'rogue';
  gender: 'male' | 'female';
  age: number;
  status: 'alive' | 'dead' | 'missing';
  relations: { targetId: string; type: RelationType }[];
  locationId: string;
}

export interface Sect {
  id: string;
  name: string;
  type: 'good' | 'evil' | 'neutral';
  locationId: string;
}

export interface Location {
  id: string;
  name: string;
  region: string;
  type: 'sect' | 'city' | 'wild';
}

export const FIRST_NAMES = ['风', '云', '雪', '冲', '无忌', '不败', '寻欢', '留香', '过', '靖', '康', '灵珊', '盈盈', '语嫣', '松', '竹', '梅', '兰', '虎', '龙'];
export const LAST_NAMES = ['李', '张', '独孤', '令狐', '东方', '西门', '慕容', '郭', '杨', '陆', '花', '叶', '林', '岳', '萧', '沈'];
export const SECT_NAMES = ['青云门', '血刀堂', '听雨阁', '万兽山庄', '丐帮', '少林', '峨眉', '武当', '唐门'];

export const LOCATIONS: Location[] = [
  {
    id: 'loc_sect_main', name: '门派驻地', region: '灵山', type: 'sect',
  },
  {
    id: 'loc_city_xiangyang', name: '襄阳城', region: '荆州', type: 'city',
  },
  {
    id: 'loc_wild_forest', name: '迷雾林', region: '野外', type: 'wild',
  },
  {
    id: 'loc_wild_cliff', name: '思过崖', region: '后山', type: 'wild',
  },
];

export const rand = <T>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];
export const genName = () => `${rand(LAST_NAMES)}${rand(FIRST_NAMES)}`;

// ==========================================
// 剧情片段系统 (Snippet System)
// ==========================================

export type SnippetTag = 'sect_daily' | 'city_daily' | 'wild_daily' | 'travel' | 'brother_interaction' | 'master_event';

export interface StorySnippet {
  id: string;
  tags: SnippetTag[];
  // 权重，越高越容易随到
  weight?: number;
  // 条件检查函数
  req?: (world: any, hero: Person) => boolean;
  // 执行内容：返回剧情文本列表，并可选地执行副作用（如修改属性）
  run: (world: any, hero: Person, utils: any) => {
    lines: { text: string; type: 'narrative' | 'dialogue' | 'action' | 'inner'; speaker?: string }[];
    action?: () => void; // 副作用，比如加属性、改位置
  };
}

// --- 预设剧情库 ---

export const SNIPPETS: StorySnippet[] = [
  // === 门派日常 ===
  {
    id: 'sect_train_waterfall',
    tags: ['sect_daily'],
    run: () => ({
      lines: [{ text: '你在瀑布下冲刷筋骨，感悟水流之势，感觉内力有所精进。', type: 'narrative' }],
    }),
  },
  {
    id: 'sect_train_night',
    tags: ['sect_daily'],
    run: () => ({
      lines: [
        { text: '夜深人静，你挑灯研读拳谱，忽有所悟。', type: 'narrative' },
        { text: '（原来这一招“亢龙有悔”要这样发力...）', type: 'inner' },
      ],
    }),
  },

  // === 同门互动 (需要有同门在场) ===
  {
    id: 'brother_roast_chicken',
    tags: ['brother_interaction'],
    req: (world, hero) =>
      // 必须在门派，且有关系好的同门
      hero.locationId === world.sects.find((s:any) => s.id === hero.sectId)?.locationId,
    run: (world, hero, utils) => {
      // 找一个同门
      const brothers = world.npcs.filter((n: Person) => n.sectId === hero.sectId && n.id !== hero.id);
      const brother = rand(brothers) || { name: '某师兄' };
      return {
        lines: [
          { text: `你在演武场角落碰到了【${brother.name}】。`, type: 'narrative' },
          { text: `${brother.name}偷偷塞给你半只烧鸡，“刚从厨房顺的，快吃。”`, type: 'dialogue', speaker: brother.name },
          { text: '这烧鸡真香，你不禁感叹世间自有真情在。', type: 'inner' },
        ],
      };
    },
  },
  {
    id: 'brother_sparring',
    tags: ['brother_interaction'],
    run: (world, hero) => {
      const brothers = world.npcs.filter((n: Person) => n.sectId === hero.sectId && n.id !== hero.id);
      const brother = rand(brothers) || { name: '某师兄' };
      const win = Math.random() > 0.5;
      return {
        lines: [
          { text: `演武场上，你与【${brother.name}】切磋技艺。`, type: 'narrative' },
          { text: win ? `你卖了个破绽，随后一招制敌，${brother.name}输的心服口服。` : `可惜你技不如人，被${brother.name}一脚踢翻在地。`, type: 'action' },
          { text: win ? '“师弟好身手！”' : '“师弟，下盘还要再练练啊。”', type: 'dialogue', speaker: brother.name },
        ],
      };
    },
  },

  // === 城市日常 ===
  {
    id: 'city_tea_house',
    tags: ['city_daily'],
    run: () => ({
      lines: [
        { text: '襄阳城内热闹非凡，你在茶馆听了一下午的说书。', type: 'narrative' },
        { text: '说书人讲的是昔日郭大侠死守襄阳的故事，听得你热血沸腾。', type: 'narrative' },
      ],
    }),
  },
  {
    id: 'city_market',
    tags: ['city_daily'],
    run: () => ({
      lines: [{ text: '集市上人来人往，你买了一些干粮和跌打酒备用。', type: 'narrative' }],
    }),
  },
];
