// ==========================================
// 基础数据结构
// ==========================================

export type RelationType = 'master' | 'apprentice' | 'friend' | 'enemy' | 'acquaintance' | 'crush' | 'spouse';

export interface Relation {
  targetId: string;
  type: RelationType;
  value: number; // 好感度 (-100 ~ 100)
}

export interface Person {
  id: string;
  name: string;
  sectId: string;
  role: 'leader' | 'disciple' | 'hero' | 'villager' | 'merchant' | 'bandit' | 'mystery';
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

// ==========================================
// 剧情片段系统
// ==========================================

export type SnippetTag = 'sect_daily' | 'city_daily' | 'wild_daily' | 'quest' | 'relationship';

export interface StoryLine {
  text: string;
  type: 'narrative' | 'dialogue' | 'action' | 'inner' | 'time-pass';
  speaker?: string;
}

export interface SnippetResult {
  lines: StoryLine[];
  addItem?: string;
  removeItem?: string;
  newLocationId?: string;
  addNpc?: Person;
  addRelation?: Relation;
  addFlag?: string;
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
// 🎲 随机生成库
// ==========================================

export const FIRST_NAMES = ['风', '云', '雪', '冲', '无忌', '不败', '寻欢', '留香', '过', '靖', '康', '灵珊', '盈盈', '语嫣', '松', '竹', '梅', '兰', '虎', '龙', '天', '峰', '逍', '遥', '破天', '翠山', '素素', '莫愁', '芷若', '敏', '嫣然'];
export const LAST_NAMES = ['李', '张', '独孤', '令狐', '东方', '西门', '慕容', '郭', '杨', '陆', '花', '叶', '林', '岳', '萧', '沈', '燕', '楚', '袁', '胡', '苗', '范', '欧阳', '上官'];
export const SECT_NAMES = ['青云门', '血刀堂', '听雨阁', '万兽山庄', '丐帮', '少林', '峨眉', '武当', '华山', '昆仑'];

// 地名生成库
const CITY_PREFIXES = ['襄', '洛', '长', '扬', '苏', '杭', '汴', '京', '成', '渝', '金', '姑'];
const CITY_SUFFIXES = ['阳', '州', '安', '陵', '京', '都'];
const WILD_PREFIXES = ['迷雾', '断肠', '绝情', '黑风', '落日', '万劫', '无量', '缥缈', '恶人', '神农'];
const WILD_SUFFIXES = ['林', '谷', '崖', '山', '窟', '岭', '沼', '漠'];

export const rand = <T>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];
export const genName = () => `${rand(LAST_NAMES)}${rand(FIRST_NAMES)}`;
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
  // 🌲 野外核心：奇遇与离开 (Wild Core)
  // ===================================

  // 1. 离开险地 (防止困死)
  {
    id: 'wild_leave_tired',
    tags: ['wild_daily'],
    weight: 20, // 权重较低，保证先探索一会
    run: (hero, world) => {
      const city = world.locations.find((l:Location) => l.id === 'loc_city');
      return {
        lines: [
          { text: '在野外盘桓数日，随身干粮已尽，衣衫也被荆棘划破。', type: 'narrative' },
          { text: '“此地不宜久留，还是先回城修整一番吧。”', type: 'inner' },
          { text: '你辨认了一下方向，离开了这片险地。', type: 'action' },
        ],
        newLocationId: 'loc_city',
        addTurn: 2,
      };
    },
  },

  // 2. 英雄救美/救人 (结识新角色)
  {
    id: 'wild_rescue_event',
    tags: ['wild_daily'],
    weight: 10,
    // 只有没满背包时触发
    req: (hero) => hero.inventory.length < 5,
    run: (hero, world) => {
      // 生成异性角色作为救助对象 (增加恋爱可能)
      const targetGender = hero.gender === 'male' ? 'female' : 'male';
      const newNpc: Person = {
        id: `npc_${Date.now()}`,
        name: genName(),
        sectId: 'none',
        role: 'hero',
        gender: targetGender,
        age: 18 + Math.floor(Math.random() * 5),
        status: 'alive',
        relations: [],
        locationId: hero.locationId,
        inventory: [],
        flags: {},
      };

      return {
        lines: [
          { text: '忽听前方传来兵刃相交之声，你悄悄潜行过去。', type: 'action' },
          { text: `只见几名黑衣人正在围攻一位${targetGender === 'male' ? '白衣少侠' : '妙龄少女'}。`, type: 'narrative' },
          { text: `${targetGender === 'male' ? '他' : '她'}身上已多处挂彩，眼看就要支撑不住。`, type: 'narrative' },
          { text: '你大喝一声“恶贼休走”，拔剑杀入战团！', type: 'action' },
          { text: '黑衣人见有人相助，不敢恋战，丢下几句狠话便逃走了。', type: 'narrative' },
          { text: `“多谢恩公搭救...”那人面色苍白，向你行了一礼，“在下【${newNpc.name}】。”`, type: 'dialogue', speaker: newNpc.name },
          { text: '你为对方包扎伤口，言谈间甚是投机。', type: 'narrative' },
        ],
        addNpc: newNpc,
        addRelation: { targetId: newNpc.id, type: 'friend', value: 30 }, // 初始好感 30
        addTurn: 1,
      };
    },
  },

  // 3. 遭遇恶人 (结仇)
  {
    id: 'wild_meet_villain',
    tags: ['wild_daily'],
    weight: 8,
    run: (hero, world) => {
      const villainName = genName(); // 暂不生成持久化NPC，仅作为过客，或者后续可以做成追杀者
      return {
        lines: [
          { text: '一阵阴风吹过，路边窜出一个满脸横肉的大汉。', type: 'narrative' },
          { text: `“此山是我开，此树是我栽！”自称【${villainName}】的强盗拦住了去路。`, type: 'dialogue', speaker: villainName },
          { text: '你冷笑一声，长剑出鞘。', type: 'action' },
          { text: '十招之后，强盗捂着手臂狼狈逃窜。', type: 'action' },
          { text: '“小子，你给我等着，血刀堂不会放过你的！”', type: 'dialogue', speaker: villainName },
        ],
        // 这里可以加一个 'hunted_by_blood_sect' 的 flag，后续在城市里触发追杀
        addFlag: 'provoked_villain',
        addTurn: 1,
      };
    },
  },

  // 4. 发现前人遗府 (奇遇)
  {
    id: 'wild_secret_cave',
    tags: ['wild_daily'],
    weight: 5,
    req: (hero) => !hero.inventory.includes('古剑'),
    run: () => ({
      lines: [
        { text: '追逐一只野兔时，你意外跌落进一个隐蔽的山洞。', type: 'action' },
        { text: '洞内有一具枯骨，身旁放着一把寒光凛凛的古剑。', type: 'narrative' },
        { text: '石壁上刻着遗言：“余纵横江湖三十载，未尝一败...”', type: 'narrative' },
        { text: '你恭敬地拜了三拜，收起了古剑。', type: 'action' },
      ],
      addItem: '古剑',
      addTurn: 1,
    }),
  },

  // ===================================
  // 🏙️ 城市社交与追杀
  // ===================================

  // 1. 偶遇朋友 (社交)
  {
    id: 'city_meet_friend',
    tags: ['city_daily'],
    weight: 50,
    // 条件：在城市里有朋友
    req: (hero, world) => {
      const friendRel = hero.relations.find((r) => r.type === 'friend' || r.type === 'acquaintance');
      if (!friendRel) return false;
      const friend = world.npcs.find((n:Person) => n.id === friendRel.targetId);
      // 朋友不一定非要在同一个城市(简化逻辑：朋友云游到了这里)
      return !!friend;
    },
    run: (hero, world) => {
      const friendRel = hero.relations.find((r) => r.type === 'friend' || r.type === 'acquaintance')!;
      const friend = world.npcs.find((n:Person) => n.id === friendRel.targetId)!;

      return {
        lines: [
          { text: '你在酒楼临窗独酌，忽听楼下有人唤你名字。', type: 'narrative' },
          { text: `回头一看，竟是旧识【${friend.name}】。`, type: 'action' },
          { text: '“人生何处不相逢！快来，满上！”', type: 'dialogue', speaker: friend.name },
          { text: '你们推杯换盏，畅谈江湖近况，直至深夜。', type: 'narrative' },
        ],
        addRelation: { targetId: friend.id, type: 'friend', value: (friendRel.value || 0) + 10 }, // 增进感情
        addTurn: 1,
      };
    },
  },

  // 2. 仇家寻仇 (冲突)
  {
    id: 'city_revenge_attack',
    tags: ['city_daily'],
    weight: 30,
    req: (hero) => hero.flags.provoked_villain === true, // 只有惹了祸才触发
    run: (hero) => ({
      lines: [
        { text: '走在小巷深处，你突然感到背脊发凉。', type: 'inner' },
        { text: '嗖！一支冷箭擦着你的耳边飞过，钉在墙上。', type: 'action' },
        { text: '几名蒙面刀客从阴影中杀出，“上次让你跑了，这次没那么好运！”', type: 'dialogue', speaker: '蒙面人' },
        { text: '你奋力反击，虽然击退了刺客，但也受了些轻伤。', type: 'action' },
        { text: '看来上次在野外结下的梁子，还没完。', type: 'inner' },
      ],
      // 可以在这里移除 flag 代表解决了一波，或者保留代表持续追杀
      // 这里先暂时不移除，模拟持续压力
      addTurn: 1,
    }),
  },

  // ===================================
  // ⚔️ 任务链逻辑 (Quest Logic)
  // ===================================

  // 1. 接任务
  {
    id: 'quest_start_letter',
    tags: ['sect_daily'],
    weight: 60,
    req: (hero, world) => hero.locationId === 'loc_sect_main'
      && !hero.flags.quest_letter_done
      && !hero.inventory.includes('密信')
      && !hero.inventory.includes('回信')
      && Math.random() < 0.4,
    run: (hero, world) => {
      const master = world.npcs.find((n: Person) => n.relations.some((r) => r.targetId === hero.id && r.type === 'apprentice')) || { name: '掌门' };
      const city = world.locations.find((l: Location) => l.id === 'loc_city');
      return {
        lines: [
          { text: '忽然有小童来报，掌门唤你去大殿一叙。', type: 'time-pass' },
          { text: `“徒儿，如今江湖动荡，为师有一件要事。”${master.name}神色凝重。`, type: 'dialogue', speaker: master.name },
          { text: `“我要你去【${city.name}】，送一封密信给当地的大侠。”`, type: 'dialogue', speaker: master.name },
          { text: '“弟子定不辱使命！”你接过密信，即刻启程。', type: 'dialogue', speaker: '你' },
        ],
        addItem: '密信',
        newLocationId: 'loc_city',
        addTurn: 3,
      };
    },
  },

  // 2. 送信 (动态复用角色)
  {
    id: 'quest_deliver_dynamic',
    tags: ['city_daily'],
    weight: 200,
    req: (hero) => hero.inventory.includes('密信') && hero.locationId === 'loc_city',
    run: (hero, world) => {
      const knownHeroId = hero.relations.find((r) => r.type === 'acquaintance' || r.type === 'friend')?.targetId;
      let targetNpc = knownHeroId ? world.npcs.find((n:Person) => n.id === knownHeroId) : null;

      if (!targetNpc) {
        targetNpc = world.npcs.find((n: Person) => n.locationId === 'loc_city' && n.role === 'hero');
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
          locationId: 'loc_city',
          inventory: [],
          flags: {},
        };
      }

      const cityName = world.locations.find((l: Location) => l.id === 'loc_city').name;
      const lines: StoryLine[] = [
        { text: `你怀揣密信，在${cityName}中打听接头人的下落。`, type: 'narrative' },
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
        addRelation: { targetId: targetNpc.id, type: 'acquaintance', value: 15 },
        addTurn: 1,
      };
    },
  },

  // 3. 回禀
  {
    id: 'quest_return_sect',
    tags: ['city_daily'],
    weight: 100,
    req: (hero) => hero.inventory.includes('回信') && hero.locationId === 'loc_city',
    run: () => ({
      lines: [
        { text: '任务已了，归心似箭，你连夜赶路返回师门。', type: 'action' },
      ],
      newLocationId: 'loc_sect_main',
      addTurn: 5,
    }),
  },

  // 4. 完成任务
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
        addFlag: 'quest_letter_done',
        addTurn: 1,
      };
    },
  },

  // --- 任务链：下山历练 ---
  {
    id: 'quest_explore_start',
    tags: ['sect_daily'],
    weight: 80,
    req: (hero) => hero.locationId === 'loc_sect_main' && hero.flags.quest_letter_done && !hero.flags.quest_explore_start,
    run: (hero, world) => {
      const master = world.npcs.find((n: Person) => n.relations.some((r) => r.targetId === hero.id && r.type === 'apprentice')) || { name: '掌门' };
      const wildName = world.locations.find((l: Location) => l.id === 'loc_wild').name;
      return {
        lines: [
          { text: '数日后，师父再次把你叫到身前。', type: 'time-pass' },
          { text: '“你如今武功已成，不应再困守山门。去江湖上闯荡一番吧。”', type: 'dialogue', speaker: master.name },
          { text: `“听说【${wildName}】最近有异兽出没，你可以去看看。”`, type: 'dialogue', speaker: master.name },
          { text: '你拜别恩师，下山而去。', type: 'action' },
        ],
        addFlag: 'quest_explore_start',
        newLocationId: 'loc_wild',
        addTurn: 1,
      };
    },
  },

  // ===================================
  // 日常库 (日常剧情)
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
    run: (hero, world) => {
      const cityName = world.locations.find((l:Location) => l.id === hero.locationId).name;
      return { lines: [{ text: `${cityName}内热闹非凡，你在茶馆听了一下午的说书。`, type: 'narrative' }] };
    },
  },
  {
    id: 'city_market',
    tags: ['city_daily'],
    run: () => ({ lines: [{ text: '集市上人来人往，你买了一些干粮备用。', type: 'narrative' }] }),
  },
];
