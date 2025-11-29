'use client';

import React, { useState, useEffect, useRef } from 'react';

// ==========================================
// 1. 核心数据结构定义 (Data Structures)
// ==========================================

// --- 基础属性 ---
type Stats = {
  strength: number; // 武力 (决定战斗伤害)
  agility: number; // 身法 (决定逃跑/闪避)
  insight: number; // 悟性 (决定习武速度)
  charm: number; // 魅力 (决定NPC交互)
  health: number; // 当前气血
  maxHealth: number;// 最大气血
  money: number; // 银两
};

// --- 物品与武学 ---
type Item = {
  id: string;
  name: string;
  desc: string;
  type: 'weapon' | 'consumable' | 'quest';
  effect?: (hero: Hero) => Partial<Stats>; // 使用效果
};

type Skill = {
  id: string;
  name: string;
  desc: string;
  level: number; // 层数 (1-10)
  proficiency: number;// 当前熟练度 (0-100)
};

// --- 人际关系 ---
type Relation = {
  npcId: string;
  name: string;
  affinity: number; // 好感度 (-100 ~ 100)
  knownInfo: string[]; // 已知情报
};

// --- 世界地图节点 ---
type LocationId = 'village' | 'forest' | 'city' | 'sect_gate' | 'sect_hall' | 'cliff';

type Location = {
  id: LocationId;
  name: string;
  desc: string; // 环境描写
  connections: { target: LocationId; travelTime: number; desc: string }[]; // 连接点
  npcs: string[]; // 该地点可能出现的NPC
};

// --- 玩家主角 ---
type Hero = {
  name: string;
  origin: string;
  age: number; // 岁
  time: number; // 游戏经过的总天数
  location: LocationId;
  stats: Stats;
  inventory: Item[];
  skills: Skill[];
  relations: Relation[];
};

// --- 日志系统 ---
type LogType = 'travel' | 'event' | 'battle' | 'inner' | 'dialogue' | 'system';
type LogEntry = {
  id: number;
  type: LogType;
  text: string;
  timeDisplay: string; // "16岁 三月"
};

// --- 事件系统 ---
type Choice = {
  text: string;
  action: (game: GameEngine) => void;
  condition?: (hero: Hero) => boolean;
};

type GameEvent = {
  id: string;
  title?: string;
  text: string; // 事件描述
  choices: Choice[];
};

// ==========================================
// 2. 静态数据配置 (Content Assets)
// ==========================================

const WORLD_MAP: Record<LocationId, Location> = {
  village: {
    id: 'village',
    name: '稻香村',
    desc: '充满泥土芬芳的小村落，村口的大黄狗懒洋洋地趴着。远处炊烟袅袅，一片祥和。',
    connections: [
      { target: 'forest', travelTime: 2, desc: '沿着蜿蜒的小路向后山进发' },
      { target: 'city', travelTime: 5, desc: '搭乘牛车前往繁华的襄阳城' },
    ],
    npcs: ['village_chief', 'beggar'],
  },
  forest: {
    id: 'forest',
    name: '迷雾林',
    desc: '树木参天，遮云蔽日。林深处偶尔传来野兽的嘶吼声，令人不寒而栗。',
    connections: [
      { target: 'village', travelTime: 2, desc: '退回稻香村' },
      { target: 'cliff', travelTime: 3, desc: '攀爬至后山悬崖' },
    ],
    npcs: ['bandit'],
  },
  city: {
    id: 'city',
    name: '襄阳城',
    desc: '车水马龙，人声鼎沸。叫卖声、马蹄声交织在一起。',
    connections: [
      { target: 'village', travelTime: 5, desc: '返回乡下' },
      { target: 'sect_gate', travelTime: 3, desc: '前往城外的门派驻地' },
    ],
    npcs: ['merchant', 'bully'],
  },
  cliff: {
    id: 'cliff',
    name: '断肠崖',
    desc: '寒风呼啸，深不见底。常有轻生者在此了断，亦有高人在此埋藏秘籍。',
    connections: [
      { target: 'forest', travelTime: 3, desc: '小心翼翼地下山' },
    ],
    npcs: [],
  },
  sect_gate: {
    id: 'sect_gate',
    name: '青云门山门',
    desc: '气势恢宏的石牌坊，两名身着青衣的弟子正在守卫。',
    connections: [
      { target: 'city', travelTime: 3, desc: '下山回城' },
      { target: 'sect_hall', travelTime: 1, desc: '进入内门广场' },
    ],
    npcs: ['guard'],
  },
  sect_hall: {
    id: 'sect_hall',
    name: '大雄宝殿',
    desc: '庄严肃穆，香火缭绕。',
    connections: [
      { target: 'sect_gate', travelTime: 1, desc: '离开大殿' },
    ],
    npcs: ['master'],
  },
};

// ==========================================
// 3. 游戏引擎逻辑 (Game Logic)
// ==========================================

// 为了在回调中修改状态，我们定义一个接口
interface GameEngine {
  setHero: React.Dispatch<React.SetStateAction<Hero>>;
  addLog: (type: LogType, text: string) => void;
  setCurrentEvent: React.Dispatch<React.SetStateAction<GameEvent | null>>;
  passTime: (days: number) => void;
  hero: Hero; // 当前快照
}

export default function WuxiaGame() {
  // --- State ---
  const [hero, setHero] = useState<Hero | null>(null);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [currentEvent, setCurrentEvent] = useState<GameEvent | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // 自动滚动
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [logs, currentEvent]);

  // --- Helpers ---
  const formatTime = (totalDays: number) => {
    const year = Math.floor(totalDays / 360) + 16; // 16岁开始
    const month = Math.floor((totalDays % 360) / 30) + 1;
    const day = (totalDays % 30) + 1;
    return `${year}岁 ${month}月${day}日`;
  };

  const addLog = (type: LogType, text: string) => {
    setLogs((prev) => [...prev, {
      id: Date.now(),
      type,
      text,
      timeDisplay: hero ? formatTime(hero.time) : '序章',
    }]);
  };

  // 模拟的时间流逝
  const passTime = (days: number) => {
    setHero((prev) => {
      if (!prev) return null;
      return { ...prev, time: prev.time + days };
    });
  };

  // 封装引擎对象传给事件回调
  const engine: GameEngine = {
    setHero,
    addLog,
    setCurrentEvent,
    passTime,
    hero: hero as Hero, // 注意：在事件回调中这里可能不是最新的，但够用了
  };

  // --- 核心动作 ---

  // 1. 初始化游戏
  const initGame = (roleType: number) => {
    const baseHero: Hero = {
      name: roleType === 1 ? '萧峰' : '韦小宝',
      origin: roleType === 1 ? '名门之后' : '市井无赖',
      age: 16,
      time: 0,
      location: 'village',
      stats: roleType === 1
        ? {
          strength: 80, agility: 40, insight: 50, charm: 60, health: 100, maxHealth: 100, money: 50,
        }
        : {
          strength: 20, agility: 80, insight: 90, charm: 90, health: 80, maxHealth: 80, money: 0,
        },
      inventory: [{
        id: 'bread', name: '干粮', desc: '普通的干粮', type: 'consumable',
      }],
      skills: [{
        id: 'basic_fist', name: '太祖长拳', desc: '武林流传最广的入门拳法', level: 1, proficiency: 0,
      }],
      relations: [],
    };

    setHero(baseHero);
    setLogs([]);
    addLog('system', `你出生于${baseHero.origin}，取名${baseHero.name}。`);
    addLog('inner', '(深吸一口气) 这江湖的风，甚是喧嚣。');
    addLog('travel', `你现在身处【${WORLD_MAP.village.name}】。${WORLD_MAP.village.desc}`);
  };

  // 2. 移动逻辑
  const handleTravel = (targetId: LocationId, days: number, travelDesc: string) => {
    if (!hero) return;

    addLog('travel', `决定前往${WORLD_MAP[targetId].name}。(${travelDesc})`);
    passTime(days);

    // 随机事件判定
    if (Math.random() > 0.7) {
      triggerRandomEvent(targetId);
    } else {
      completeTravel(targetId);
    }
  };

  const completeTravel = (targetId: LocationId) => {
    setHero((prev) => (prev ? { ...prev, location: targetId } : null));
    addLog('travel', `经过跋涉，抵达了【${WORLD_MAP[targetId].name}】。`);
    addLog('event', WORLD_MAP[targetId].desc);
  };

  // 3. 随机事件触发器
  const triggerRandomEvent = (targetLocationId: LocationId) => {
    const events: GameEvent[] = [
      {
        id: 'meet_beggar',
        text: '路边草丛突然钻出一个衣衫褴褛的老乞丐，拦住了你的去路：“少年人，我看你骨骼惊奇，想不想买本秘籍？”',
        choices: [
          {
            text: '花费10两银子购买',
            condition: (h) => h.stats.money >= 10,
            action: (g) => {
              g.setHero((h) => ({
                ...h,
                stats: { ...h.stats, money: h.stats.money - 10 },
                inventory: [...h.inventory, {
                  id: 'fake_book', name: '无名秘籍', desc: '画风潦草的小人书', type: 'consumable',
                }],
              }));
              g.addLog('dialogue', '你掏出银两递给老乞丐。老乞丐嘿嘿一笑，塞给你一本破书就跑了。');
              g.setCurrentEvent(null);
              completeTravel(targetLocationId);
            },
          },
          {
            text: '大声呵斥骗子',
            action: (g) => {
              g.addLog('dialogue', '你怒目圆睁：“光天化日朗朗乾坤，竟敢行骗！” 老乞丐被你的气势吓跑了。');
              g.setHero((h) => ({ ...h, stats: { ...h.stats, charm: h.stats.charm + 1 } })); // 魅力+1
              g.addLog('system', '正气凛然，【魅力】提升了。');
              g.setCurrentEvent(null);
              completeTravel(targetLocationId);
            },
          },
          {
            text: '无视离开',
            action: (g) => {
              g.addLog('inner', '（还是不要多管闲事为妙，赶路要紧。）');
              g.setCurrentEvent(null);
              completeTravel(targetLocationId);
            },
          },
        ],
      },
      {
        id: 'cliff_fall',
        text: '脚下的山路突然崩塌！你失去了平衡，向深渊滑落！',
        choices: [
          {
            text: '施展轻功跳跃 (需身法>30)',
            condition: (h) => h.stats.agility > 30,
            action: (g) => {
              g.addLog('battle', '千钧一发之际，你提气轻身，脚踩落石借力腾空，稳稳落在安全处。');
              g.addLog('system', '危机时刻激发了潜能，【身法】提升了。');
              g.setHero((h) => ({ ...h, stats: { ...h.stats, agility: h.stats.agility + 2 } }));
              g.setCurrentEvent(null);
              completeTravel(targetLocationId);
            },
          },
          {
            text: '抓住路边的树枝',
            action: (g) => {
              g.addLog('event', '你死死抓住了悬崖边的枯树枝，手掌被划得鲜血淋漓，好不容易爬了上来。');
              g.setHero((h) => ({ ...h, stats: { ...h.stats, health: h.stats.health - 20 } }));
              g.addLog('system', '受了皮外伤，气血 -20。');
              g.setCurrentEvent(null);
              completeTravel(targetLocationId);
            },
          },
        ],
      },
    ];

    const randomEvent = events[Math.floor(Math.random() * events.length)];
    setCurrentEvent(randomEvent);
  };

  // 4. 修炼逻辑
  const handleTrain = () => {
    if (!hero) return;
    addLog('event', `你在${WORLD_MAP[hero.location].name}找了一处僻静之地，开始打坐修炼。`);
    passTime(5); // 修炼耗时5天

    // 简单的熟练度增加逻辑
    const skill = hero.skills[0]; // 默认练第一个技能
    const expGain = 10 + Math.floor(hero.stats.insight / 10);

    let newProficiency = skill.proficiency + expGain;
    let newLevel = skill.level;
    let levelUp = false;

    if (newProficiency >= 100) {
      newLevel += 1;
      newProficiency -= 100;
      levelUp = true;
    }

    setHero((prev) => {
      if (!prev) return null;
      const newSkills = [...prev.skills];
      newSkills[0] = { ...skill, level: newLevel, proficiency: newProficiency };
      return { ...prev, skills: newSkills };
    });

    addLog('system', `修炼了5天，${skill.name}熟练度 +${expGain}。`);
    if (levelUp) {
      addLog('inner', `突然间福至心灵，你感觉丹田内力涌动，${skill.name}竟然突破到了第 ${newLevel} 层！`);
    }
  };

  // 5. 休息逻辑
  const handleRest = () => {
    if (!hero) return;
    addLog('event', '感觉有些疲惫，你决定休息几天。');
    passTime(1);
    setHero((prev) => (prev ? { ...prev, stats: { ...prev.stats, health: Math.min(prev.stats.health + 20, prev.stats.maxHealth) } } : null));
    addLog('system', '体力恢复了，气血 +20。');
  };

  // --- 界面渲染 ---

  if (!hero) {
    return (
      <div className="min-h-screen bg-stone-900 text-stone-300 flex flex-col items-center justify-center font-serif">
        <h1 className="text-5xl text-amber-600 mb-12 font-bold tracking-widest border-4 border-stone-700 p-6">侠客风云录</h1>
        <div className="flex gap-8">
          <button onClick={() => initGame(1)} className="hover:scale-105 transition bg-stone-800 p-8 rounded border border-stone-600 hover:border-amber-500 w-64">
            <h3 className="text-2xl text-amber-500 mb-2">名门之后</h3>
            <p className="text-sm text-stone-500">属性均衡，其实不凡。</p>
          </button>
          <button onClick={() => initGame(2)} className="hover:scale-105 transition bg-stone-800 p-8 rounded border border-stone-600 hover:border-amber-500 w-64">
            <h3 className="text-2xl text-amber-500 mb-2">市井无赖</h3>
            <p className="text-sm text-stone-500">机灵过人，福源深厚。</p>
          </button>
        </div>
      </div>
    );
  }

  const currentLocation = WORLD_MAP[hero.location];

  return (
    <div className="min-h-screen bg-stone-950 text-stone-300 font-serif flex">
      {/* 左侧：世界与行动 */}
      <div className="w-1/3 border-r border-stone-800 p-6 flex flex-col bg-stone-900">

        {/* 地点信息 */}
        <div className="mb-8 text-center border-b border-stone-800 pb-6">
          <div className="text-xs text-stone-500 mb-2">{formatTime(hero.time)}</div>
          <h2 className="text-3xl text-amber-500 font-bold mb-4">{currentLocation.name}</h2>
          <p className="text-sm text-stone-400 leading-loose italic">{currentLocation.desc}</p>
        </div>

        {/* 交互区域 */}
        {currentEvent ? (
          <div className="flex-1 bg-stone-800 rounded p-6 shadow-inner animate-pulse border border-amber-900/50">
            <h3 className="text-xl text-amber-400 mb-4 font-bold">⚠ 突发事件</h3>
            <p className="mb-6 leading-relaxed">{currentEvent.text}</p>
            <div className="space-y-3">
              {currentEvent.choices.map((choice, idx) => {
                const canChoose = choice.condition ? choice.condition(hero) : true;
                return (
                  <button
                    key={idx}
                    disabled={!canChoose}
                    onClick={() => choice.action(engine)}
                    className={`w-full p-3 text-left border rounded transition ${canChoose
                      ? 'border-stone-600 hover:bg-stone-700 hover:border-amber-500 text-stone-300'
                      : 'border-stone-800 text-stone-600 cursor-not-allowed'
                    }`}
                  >
                    {idx + 1}
                    .
                    {choice.text}
                    {!canChoose && <span className="float-right text-xs text-red-900">(条件不足)</span>}
                  </button>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            <div>
              <h4 className="text-stone-500 text-xs uppercase mb-3 tracking-widest">前往 Travel</h4>
              <div className="space-y-2">
                {currentLocation.connections.map((conn) => (
                  <button
                    key={conn.target}
                    onClick={() => handleTravel(conn.target, conn.travelTime, conn.desc)}
                    className="w-full p-3 bg-stone-800 hover:bg-stone-700 border border-stone-700 rounded text-left flex justify-between group"
                  >
                    <span className="group-hover:text-amber-400 transition">{WORLD_MAP[conn.target].name}</span>
                    <span className="text-xs text-stone-600">
                      {conn.travelTime}
                      天
                    </span>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <h4 className="text-stone-500 text-xs uppercase mb-3 tracking-widest">行动 Actions</h4>
              <div className="grid grid-cols-2 gap-2">
                <button onClick={handleTrain} className="p-3 bg-stone-800 border border-stone-700 hover:border-amber-600">修炼武功</button>
                <button onClick={handleRest} className="p-3 bg-stone-800 border border-stone-700 hover:border-green-600">原地休息</button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 中间：叙事流 (Log) */}
      <div className="flex-1 p-8 overflow-y-auto scrollbar-thin scrollbar-thumb-stone-700" ref={scrollRef}>
        <div className="max-w-2xl mx-auto space-y-6">
          {logs.map((log) => (
            <div key={log.id} className="animate-fade-in group">
              <div className="flex items-baseline mb-1">
                <span className="text-xs text-stone-600 font-mono w-24 shrink-0">{log.timeDisplay}</span>
                {log.type === 'inner' && <span className="text-xs text-purple-400 bg-purple-900/20 px-1 rounded">心理</span>}
                {log.type === 'battle' && <span className="text-xs text-red-400 bg-red-900/20 px-1 rounded">战斗</span>}
                {log.type === 'event' && <span className="text-xs text-yellow-400 bg-yellow-900/20 px-1 rounded">遭遇</span>}
              </div>
              <p className={`text-lg leading-loose ${log.type === 'inner' ? 'text-stone-400 italic'
                : log.type === 'battle' ? 'text-red-200'
                  : log.type === 'system' ? 'text-stone-500 text-sm'
                    : 'text-stone-200'
              }`}
              >
                {log.text}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* 右侧：人物面板 */}
      <div className="w-64 bg-stone-900 border-l border-stone-800 p-6 text-sm">
        <h3 className="text-amber-600 font-bold text-xl mb-6">{hero.name}</h3>

        <div className="mb-6">
          <h4 className="text-stone-500 mb-2 border-b border-stone-800 pb-1">基础属性</h4>
          <div className="grid grid-cols-2 gap-y-2 text-stone-300">
            <div>
              气血:
              <span className={hero.stats.health < 30 ? 'text-red-500' : 'text-green-500'}>
                {hero.stats.health}
                /
                {hero.stats.maxHealth}
              </span>
            </div>
            <div>
              银两:
              <span className="text-yellow-500">{hero.stats.money}</span>
            </div>
            <div>
              武力:
              {hero.stats.strength}
            </div>
            <div>
              身法:
              {hero.stats.agility}
            </div>
            <div>
              悟性:
              {hero.stats.insight}
            </div>
            <div>
              魅力:
              {hero.stats.charm}
            </div>
          </div>
        </div>

        <div className="mb-6">
          <h4 className="text-stone-500 mb-2 border-b border-stone-800 pb-1">武学造诣</h4>
          <ul className="space-y-3">
            {hero.skills.map((skill) => (
              <li key={skill.id}>
                <div className="flex justify-between text-amber-200">
                  <span>{skill.name}</span>
                  <span>
                    Lv.
                    {skill.level}
                  </span>
                </div>
                <div className="w-full bg-stone-800 h-1 mt-1 rounded-full overflow-hidden">
                  <div className="bg-amber-700 h-full transition-all duration-500" style={{ width: `${skill.proficiency}%` }} />
                </div>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <h4 className="text-stone-500 mb-2 border-b border-stone-800 pb-1">行囊</h4>
          <div className="flex flex-wrap gap-2">
            {hero.inventory.map((item, idx) => (
              <span key={idx} className="bg-stone-800 border border-stone-700 px-2 py-1 text-xs rounded text-stone-400" title={item.desc}>
                {item.name}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
