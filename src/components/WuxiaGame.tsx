'use client';

import React, {
 useState, useEffect, useRef, useCallback 
} from 'react';

// ==========================================
// 1. 世界架构 (World Architecture)
// ==========================================

type RelationType = 'master' | 'apprentice' | 'parent' | 'child' | 'friend' | 'enemy' | 'crush';

interface Person {
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

interface Sect {
  id: string;
  name: string;
  type: 'good' | 'evil' | 'neutral';
  locationId: string;
}

interface Location {
  id: string;
  name: string;
  region: string;
}

// 剧情片段类型
type StoryBlock = {
  id: string;
  text: string;
  type: 'narrative' | 'dialogue' | 'action' | 'time-pass';
  speaker?: string; // 如果是对话
};

// 选项类型
type Choice = {
  text: string;
  action: () => void;
};

// ==========================================
// 2. 随机生成库 (Generators)
// ==========================================

const FIRST_NAMES = ['风', '云', '雪', '冲', '无忌', '不败', '寻欢', '留香', '过', '靖', '康', '灵珊', '盈盈', '语嫣', '松', '竹', '梅'];
const LAST_NAMES = ['李', '张', '独孤', '令狐', '东方', '西门', '慕容', '郭', '杨', '陆', '花', '叶', '林', '岳'];
const SECT_NAMES = ['青云门', '血刀堂', '听雨阁', '万兽山庄', '丐帮', '少林', '峨眉', '武当', '唐门'];
const LOCATIONS = [
  { id: 'loc_1', name: '藏经阁', region: '少林' },
  { id: 'loc_2', name: '聚义厅', region: '丐帮' },
  { id: 'loc_3', name: '思过崖', region: '华山' },
  { id: 'loc_4', name: '悦来客栈', region: '襄阳' },
  { id: 'loc_5', name: '无名荒野', region: '野外' },
];

const rand = <T>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];
const genName = () => `${rand(LAST_NAMES)}${rand(FIRST_NAMES)}`;

// ==========================================
// 3. 核心组件
// ==========================================

export default function WuxiaGame() {
  // --- 游戏状态 ---
  const [isStarted, setIsStarted] = useState(false);
  const [world, setWorld] = useState<{
    npcs: Person[];
    sects: Sect[];
    locations: Location[];
    heroId: string;
  } | null>(null);

  const [storyLog, setStoryLog] = useState<StoryBlock[]>([]);
  const [choices, setChoices] = useState<Choice[]>([]);
  const [isAutoPlaying, setIsAutoPlaying] = useState(true); // 自动播放模式
  const [turnCount, setTurnCount] = useState(0); // 🚀 关键修复：回合计数器

  // 记录上一次的事件类型，防止复读机
  const lastEventType = useRef<string>('');

  // 滚动锚点
  const bottomRef = useRef<HTMLDivElement>(null);

  // --- 辅助函数：添加剧情 ---
  const addStory = useCallback((text: string, type: StoryBlock['type'] = 'narrative', speaker?: string) => {
    setStoryLog((prev) => [...prev, {
 id: Date.now().toString() + Math.random(), text, type, speaker 
}]);
  }, []);

  // 自动滚动
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [storyLog, choices]);

  // --- 阶段 1: 世界生成 (World Gen) ---
  const generateWorld = () => {
    const newSects: Sect[] = SECT_NAMES.map((name, idx) => ({
      id: `sect_${idx}`,
      name,
      type: Math.random() > 0.7 ? 'evil' : 'good',
      locationId: rand(LOCATIONS).id,
    }));

    const newNpcs: Person[] = [];

    // 生成掌门和弟子
    newSects.forEach((sect) => {
      // 掌门
      const leader: Person = {
        id: `npc_${newNpcs.length}`,
name: genName(),
sectId: sect.id,
        role: 'leader',
gender: 'male',
age: 40 + Math.floor(Math.random() * 40),
        status: 'alive',
relations: [],
locationId: sect.locationId,
      };
      newNpcs.push(leader);

      // 弟子
      for (let i = 0; i < 3; i++) {
        const disciple: Person = {
          id: `npc_${newNpcs.length}`,
name: genName(),
sectId: sect.id,
          role: 'disciple',
gender: Math.random() > 0.5 ? 'male' : 'female',
          age: 16 + Math.floor(Math.random() * 10),
          status: 'alive',
relations: [{ targetId: leader.id, type: 'master' }],
locationId: sect.locationId,
        };
        // 掌门收徒
        leader.relations.push({ targetId: disciple.id, type: 'apprentice' });
        newNpcs.push(disciple);
      }
    });

    // 生成主角
    const mySect = rand(newSects);
    const myMaster = newNpcs.find((n) => n.sectId === mySect.id && n.role === 'leader');
    const hero: Person = {
      id: 'hero',
name: '你',
sectId: mySect.id,
      role: 'disciple',
gender: 'male',
age: 16,
      status: 'alive',
relations: myMaster ? [{ targetId: myMaster.id, type: 'master' }] : [],
      locationId: mySect.locationId,
    };

    if (myMaster) myMaster.relations.push({ targetId: 'hero', type: 'apprentice' });

    setWorld({
 npcs: [...newNpcs, hero], sects: newSects, locations: LOCATIONS, heroId: 'hero' 
});
    setIsStarted(true);
    setTurnCount(0);
    lastEventType.current = '';

    // 开篇叙事
    setStoryLog([]);
    addStory(`【世界生成完毕】 共 ${newSects.length} 个门派，${newNpcs.length + 1} 位侠客。`, 'action');
    addStory(`你出生在 ${mySect.name}，师承掌门【${myMaster?.name}】。`, 'narrative');
    addStory('十六岁那年，春暖花开，你在门派后山练剑...', 'narrative');

    // 启动剧情引擎
    setTimeout(() => setTurnCount(1), 1000);
  };

  // --- 阶段 2: 剧情驱动引擎 (Narrative Engine) ---

  // 模拟一段时间流逝，并决定发生什么
  const nextTurn = useCallback(() => {
    setWorld((currentWorld) => {
      if (!currentWorld) return null;
      const { heroId, npcs } = currentWorld;
      const hero = npcs.find((n) => n.id === heroId);
      if (!hero) return currentWorld;

      const roll = Math.random();
      let eventType = '';

      // --- 事件 A: 师父召唤 (关键节点) ---
      // 只有之前没发生过，且在门派内时触发
      if (roll < 0.05 && lastEventType.current !== 'master_call' && hero.locationId === currentWorld.sects.find((s) => s.id === hero.sectId)?.locationId) {
        const master = npcs.find((n) => n.relations.some((r) => r.targetId === heroId && r.type === 'apprentice'));
        if (master) {
          setIsAutoPlaying(false); // 暂停自动播放
          eventType = 'master_call';
          addStory('这一日，忽然有小童来报。', 'time-pass');
          addStory(`“${hero.name}，掌门唤你去大殿一叙。”`, 'dialogue', '小童');

          setChoices([
            {
              text: '立刻前往大殿',
              action: () => {
                setChoices([]);
                addStory('你不敢怠慢，整理衣冠，快步前往大殿。', 'action');
                addStory(`大殿之上，${master.name}负手而立，神色凝重。`, 'narrative');
                addStory('“徒儿，如今江湖动荡，为师有一件要事需你去办。”', 'dialogue', master.name);

                // 嵌套选择：接受任务
                setChoices([
                  {
                    text: '弟子义不容辞',
                    action: () => {
                      setChoices([]);
                      addStory('“弟子愿为门派分忧！”你朗声应道。', 'dialogue', '你');
                      addStory('师父满意地点了点头，“好！我要你去襄阳城送一封密信。”', 'dialogue', master.name);
                      setTimeout(() => {
                        addStory('辞别师父后，你背起行囊，踏上了前往襄阳的道路。', 'narrative');
                        setIsAutoPlaying(true); // 恢复自动
                        setTurnCount((c) => c + 1);
                      }, 1000);
                    },
                  },
                  {
                    text: '面露难色',
                    action: () => {
                      setChoices([]);
                      addStory('你犹豫了一下，“师父，弟子武功低微，恐怕...”', 'dialogue', '你');
                      addStory('师父叹了口气，“罢了，也是为师操之过急。你且退下吧。”', 'dialogue', master.name);
                      setIsAutoPlaying(true);
                      setTurnCount((c) => c + 1);
                    },
                  },
                ]);
              },
            },
            {
              text: '假装没听见，继续睡觉',
              action: () => {
                setChoices([]);
                addStory('你翻了个身，心想：“天大的事也等我睡醒再说。”', 'inner');
                addStory('结果下午就被师父罚站了两个时辰。', 'narrative');
                setIsAutoPlaying(true);
                setTurnCount((c) => c + 1);
              },
            },
          ]);
          lastEventType.current = eventType;
          return currentWorld;
        }
      }

      // --- 事件 B: 同门互动 ---
      // 防止连续遇到同门
      if (roll < 0.4 && lastEventType.current !== 'brother_event') {
        const brothers = npcs.filter((n) => n.sectId === hero.sectId && n.id !== heroId && n.role === 'disciple');
        const brother = rand(brothers);
        if (brother) {
          eventType = 'brother_event';
          addStory(`你在演武场碰到了同门【${brother.name}】。`, 'narrative');

          const interactions = [
            () => {
              addStory(`你们切磋了三十回合，${brother.name}剑法精妙，你略逊一筹。`, 'action');
              addStory(`“${hero.name}，承让了！”${brother.name}收剑笑道。`, 'dialogue', brother.name);
            },
            () => {
              addStory(`${brother.name}偷偷塞给你半只烧鸡，“刚从厨房顺的，快吃。”`, 'dialogue', brother.name);
              addStory('这烧鸡真香。', 'inner');
            },
            () => {
              addStory(`${brother.name}正坐在台阶上发呆，似乎在想念山下的某位姑娘。`, 'narrative');
            },
            () => {
              addStory(`“听说掌门最近心情不好，你可别去触霉头。”${brother.name}小声提醒你。`, 'dialogue', brother.name);
            },
          ];
          rand(interactions)();
        }
      }

      // --- 事件 C: 独自修炼 (默认) ---
      // 只有当没触发别的事件时触发
      if (!eventType) {
        eventType = 'training';
        // 如果上次也是修炼，这就尴尬了，尝试换个文案
        const trainingTxts = [
          '你在瀑布下冲刷筋骨，感悟水流之势。',
          '夜深人静，你挑灯研读拳谱，忽有所悟。',
          '今日无事，你在后山打坐，内力运行了一个周天。',
          '你对着木桩练习了一下午的基本剑招，汗如雨下。',
          '山中岁月无甲子，转眼又是半月过去。',
          '你下山采办物资，顺便在茶馆听了一下午的说书。',
        ];
        // 尽量不重复上一句 (简单去重)
        let text = rand(trainingTxts);
        // 如果重复了就再随一次
        if (storyLog.length > 0 && storyLog[storyLog.length - 1].text === text) {
          text = rand(trainingTxts);
        }
        addStory(text, 'narrative');
      }

      lastEventType.current = eventType;
      return currentWorld;
    });

    // 🚀 关键修复：在逻辑执行完后，更新回合数，触发 useEffect
    setTurnCount((prev) => prev + 1);
  }, [addStory, storyLog]);

  // --- 游戏循环 (Game Loop) ---
  // 🚀 依赖列表加入了 turnCount
  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (isStarted && isAutoPlaying && choices.length === 0) {
      timer = setTimeout(() => {
        nextTurn();
      }, 2500); // 每2.5秒推进一次剧情
    }
    return () => clearTimeout(timer);
  }, [isStarted, isAutoPlaying, choices, turnCount, nextTurn]);

  // --- 渲染 ---
  if (!isStarted) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-stone-950 text-stone-200 font-serif">
        <h1 className="text-6xl font-bold mb-8 text-amber-600 tracking-widest" style={{ writingMode: 'vertical-rl' }}>
          江湖演义
        </h1>
        <button
          onClick={generateWorld}
          className="px-8 py-3 text-xl border border-stone-600 hover:border-amber-500 hover:text-amber-500 transition rounded"
        >
          {world ? '重新生成世界' : '开始新的轮回'}
        </button>
      </div>
    );
  }

  return (
    <div className="flex justify-center min-h-screen bg-stone-950 font-serif text-lg leading-loose selection:bg-amber-900">
      <div className="w-full max-w-3xl flex flex-col h-screen">

        {/* 顶部：当前状态简报 (类似小说章节名) */}
        <div className="p-4 border-b border-stone-800 text-center text-stone-500 text-sm">
          第一回 初入江湖 | 
{' '}
{world?.sects.find(s => s.id === world.npcs.find(n => n.id === 'hero')?.sectId)?.name}弟子 | 回合: 
{' '}
{turnCount}
        </div>

        {/* 中间：小说正文流 */}
        <div className="flex-1 overflow-y-auto p-6 md:p-12 space-y-6 scrollbar-hide">
          {storyLog.map((block) => (
            <div key={block.id} className={`animate-fade-in ${block.type === 'inner' ? 'text-stone-500 italic' : 'text-stone-300'}`}>
              {block.type === 'time-pass' && (
                <div className="text-center text-stone-600 my-8">—— · ——</div>
              )}

              {block.type === 'action' && (
                <div className="text-amber-700/80 mb-1 text-base">⚔️</div>
              )}

              {block.speaker && (
                <span className="font-bold text-amber-600 mr-2">
                  {block.speaker}
：
</span>
              )}

              <span>{block.text}</span>
            </div>
          ))}

          {/* 选项区域 (嵌入在文末) */}
          {choices.length > 0 && (
            <div className="mt-8 space-y-3 pl-4 border-l-2 border-amber-800/50 animate-slide-up">
              {choices.map((choice, idx) => (
                <button
                  key={idx}
                  onClick={choice.action}
                  className="block w-full text-left p-4 bg-stone-900 border border-stone-800 hover:border-amber-600 hover:bg-stone-800 transition rounded group"
                >
                  <span className="text-amber-700 font-bold mr-3 group-hover:text-amber-500">
                    {['甲', '乙', '丙', '丁'][idx]}
{' '}
.
</span>
                  <span className="text-stone-300 group-hover:text-stone-100">{choice.text}</span>
                </button>
              ))}
            </div>
          )}

          {/* 正在输入的加载符 */}
          {choices.length === 0 && (
            <div className="h-8 flex items-center text-stone-700 text-sm animate-pulse">
              <span className="mr-2">✍️</span>
{' '}
剧情推演中...
</div>
          )}

          <div ref={bottomRef} />
        </div>

      </div>
    </div>
  );
}
