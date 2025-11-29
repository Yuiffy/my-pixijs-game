'use client';

import React, {
  useState, useEffect, useRef, useCallback,
} from 'react';
import {
  Person, Sect, Location, RelationType,
  FIRST_NAMES, LAST_NAMES, SECT_NAMES, LOCATIONS, SNIPPETS,
  rand, genName, StorySnippet,
} from './wuxia-data';

// ==========================================
// 类型定义补充
// ==========================================

type StoryBlock = {
  id: string;
  text: string;
  type: 'narrative' | 'dialogue' | 'action' | 'time-pass' | 'inner';
  speaker?: string;
};

type Choice = {
  text: string;
  action: () => void;
};

// ==========================================
// 核心组件
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
  const [isAutoPlaying, setIsAutoPlaying] = useState(true);
  const [turnCount, setTurnCount] = useState(0);

  // 记录上一次的事件ID，防止连续重复
  const lastSnippetId = useRef<string>('');
  const bottomRef = useRef<HTMLDivElement>(null);

  // --- 辅助函数 ---

  const addStory = useCallback((text: string, type: StoryBlock['type'] = 'narrative', speaker?: string) => {
    setStoryLog((prev) => [...prev, {
      id: Date.now().toString() + Math.random(), text, type, speaker,
    }]);
  }, []);

  // 自动滚动
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [storyLog, choices]);

  // --- 阶段 1: 世界生成 ---
  const generateWorld = () => {
    const newSects: Sect[] = SECT_NAMES.map((name, idx) => ({
      id: `sect_${idx}`,
      name,
      type: Math.random() > 0.7 ? 'evil' : 'good',
      locationId: 'loc_sect_main', // 简化：所有门派初始都在灵山，后续可扩展
    }));

    const newNpcs: Person[] = [];

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
        leader.relations.push({ targetId: disciple.id, type: 'apprentice' });
        newNpcs.push(disciple);
      }
    });

    // 主角
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
      npcs: [...newNpcs, hero], sects: newSects, locations: LOCATIONS, heroId: 'hero',
    });
    setIsStarted(true);
    setTurnCount(0);
    setStoryLog([]);
    setChoices([]);
    lastSnippetId.current = '';

    addStory(`【世界生成完毕】 共 ${newSects.length} 个门派，${newNpcs.length + 1} 位侠客。`, 'action');
    addStory(`你出生在 ${mySect.name}，师承掌门【${myMaster?.name}】。`, 'narrative');

    setTimeout(() => setTurnCount(1), 1000);
  };

  // --- 阶段 2: 智能剧情调度器 ---

  const nextTurn = useCallback(() => {
    setWorld((currentWorld) => {
      if (!currentWorld) return null;
      const { heroId, npcs } = currentWorld;
      // 必须深拷贝或找到引用，这里简单find
      const hero = npcs.find((n) => n.id === heroId);
      if (!hero) return currentWorld;

      // 1. 确定当前情境 Context
      const possibleTags: string[] = [];
      const location = LOCATIONS.find((l) => l.id === hero?.locationId);

      if (location?.type === 'sect') possibleTags.push('sect_daily', 'brother_interaction');
      if (location?.type === 'city') possibleTags.push('city_daily');
      if (location?.type === 'wild') possibleTags.push('wild_daily');

      // 2. 特殊事件判定 (Priority Events)
      const roll = Math.random();

      // -> 事件 A: 师父召唤 (关键剧情节点)
      // 条件：在门派且没做过任务
      if (roll < 0.1 && location?.type === 'sect' && lastSnippetId.current !== 'master_quest_start') {
        const master = npcs.find((n) => n.relations.some((r) => r.targetId === heroId && r.type === 'apprentice'));
        if (master) {
          setIsAutoPlaying(false);
          lastSnippetId.current = 'master_quest_start';

          addStory('这一日，忽然有小童来报。', 'time-pass');
          addStory(`“${hero.name}，掌门唤你去大殿一叙。”`, 'dialogue', '小童');

          setChoices([
            {
              text: '整理衣冠，立刻前往',
              action: () => {
                setChoices([]);
                addStory('你不敢怠慢，快步前往大殿。', 'action');
                addStory(`大殿之上，${master.name}神色凝重。`, 'narrative');
                addStory('“徒儿，如今江湖动荡，我要你去襄阳城送一封密信。”', 'dialogue', master.name);

                setChoices([{
                  text: '弟子领命！(前往襄阳)',
                  action: () => {
                    setChoices([]);
                    addStory('“弟子定不辱使命！”', 'dialogue', '你');

                    // 🚀 核心修复：在这里真正修改位置状态
                    setWorld((w) => {
                      if (!w) return null;
                      const newNpcs = w.npcs.map((n) => (n.id === 'hero' ? { ...n, locationId: 'loc_city_xiangyang' } : n));
                      return { ...w, npcs: newNpcs };
                    });

                    setTimeout(() => {
                      addStory('...', 'time-pass');
                      addStory('你辞别师父，背起行囊，一路跋涉。', 'narrative');
                      addStory('数日后，宏伟的襄阳城墙出现在眼前。', 'narrative');
                      setIsAutoPlaying(true);
                      setTurnCount((c) => c + 1);
                    }, 1000);
                  },
                }]);
              },
            },
            {
              text: '装病不去',
              action: () => {
                setChoices([]);
                addStory('你假装肚子疼，错过了这次扬名立万的机会。', 'narrative');
                setIsAutoPlaying(true);
                setTurnCount((c) => c + 1);
              },
            },
          ]);
          return currentWorld; // 暂停等待交互，直接返回
        }
      }

      // 3. 通用事件池筛选 (Snippet Selection)
      // 从 SNIPPETS 中筛选出 tags 符合 且 req 满足 的片段
      const validSnippets = SNIPPETS.filter((s) => {
        // 标签匹配 (只要有一个tag符合当前场景即可)
        const hasTag = s.tags.some((t) => possibleTags.includes(t));
        // 条件匹配
        const meetReq = s.req ? s.req(currentWorld, hero!) : true;
        // 去重
        const notRepeated = s.id !== lastSnippetId.current;

        return hasTag && meetReq && notRepeated;
      });

      if (validSnippets.length > 0) {
        const snippet = rand(validSnippets);
        lastSnippetId.current = snippet.id;

        // 执行片段
        const result = snippet.run(currentWorld, hero, {});

        // 渲染文本
        result.lines.forEach((line) => addStory(line.text, line.type, line.speaker));

        // 执行副作用 (如果有)
        if (result.action) {
          // 这里稍微复杂点，因为我们需要在 setWorld 内部再 update 一次
          // 简化起见，我们假设 snippet.run 返回的是通过 helper 修改后的新状态，或者我们在外部手动处理
          // 目前 demo 里主要是 log，副作用较少，先略过
          result.action();
        }
      } else {
        // 兜底文本
        addStory('今日无事，看着天边的云卷云舒，你发了一下午的呆。', 'narrative');
      }

      return currentWorld;
    });

    // 推进回合
    setTurnCount((prev) => prev + 1);
  }, [addStory]);

  // --- 游戏循环 ---
  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (isStarted && isAutoPlaying && choices.length === 0) {
      timer = setTimeout(() => {
        nextTurn();
      }, 3000);
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
        <button onClick={generateWorld} className="px-8 py-3 text-xl border border-stone-600 hover:border-amber-500 rounded">
          {world ? '重新生成世界' : '开始新的轮回'}
        </button>
      </div>
    );
  }

  const currentLocName = LOCATIONS.find((l) => l.id === world?.npcs.find((n) => n.id === 'hero')?.locationId)?.name || '未知之地';

  return (
    <div className="flex justify-center min-h-screen bg-stone-950 font-serif text-lg leading-loose selection:bg-amber-900">
      <div className="w-full max-w-3xl flex flex-col h-screen">

        {/* 顶部状态栏 */}
        <div className="p-4 border-b border-stone-800 text-center text-stone-500 text-sm flex justify-between px-8">
          <span>
            {world?.sects.find((s) => s.id === world.npcs.find((n) => n.id === 'hero')?.sectId)?.name}
            弟子
          </span>
          <span className="text-amber-500 font-bold">{currentLocName}</span>
          <span>
            回合:
            {turnCount}
          </span>
        </div>

        {/* 文本流 */}
        <div className="flex-1 overflow-y-auto p-6 md:p-12 space-y-6 scrollbar-hide">
          {storyLog.map((block) => (
            <div key={block.id} className={`animate-fade-in ${block.type === 'inner' ? 'text-stone-500 italic' : 'text-stone-300'}`}>
              {block.type === 'time-pass' && <div className="text-center text-stone-600 my-8">—— · ——</div>}
              {block.type === 'action' && <div className="text-amber-700/80 mb-1 text-base">⚔️</div>}
              {block.speaker && (
              <span className="font-bold text-amber-600 mr-2">
                {block.speaker}
                ：
              </span>
              )}
              <span>{block.text}</span>
            </div>
          ))}

          {/* 选项 */}
          {choices.length > 0 && (
            <div className="mt-8 space-y-3 pl-4 border-l-2 border-amber-800/50 animate-slide-up">
              {choices.map((choice, idx) => (
                <button key={idx} onClick={choice.action} className="block w-full text-left p-4 bg-stone-900 border border-stone-800 hover:border-amber-600 transition rounded group">
                  <span className="text-amber-700 font-bold mr-3">
                    {['甲', '乙', '丙'][idx]}
                    {' '}
                    .
                  </span>
                  <span className="text-stone-300">{choice.text}</span>
                </button>
              ))}
            </div>
          )}

          {/* 加载符 */}
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
