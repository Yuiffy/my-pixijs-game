'use client';

import React, {
  useState, useEffect, useRef, useCallback,
} from 'react';
import {
  Person, Sect, Location,
  FIRST_NAMES, LAST_NAMES, SECT_NAMES, LOCATIONS, SNIPPETS,
  rand, genName, SnippetResult,
} from './wuxia-data';

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

export default function WuxiaGame() {
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
  // 使用 ref 来追踪定时器，防止严格模式下的双重触发
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const lastSnippetId = useRef<string>('');
  const bottomRef = useRef<HTMLDivElement>(null);

  const addStory = useCallback((text: string, type: StoryBlock['type'] = 'narrative', speaker?: string) => {
    setStoryLog((prev) => [...prev, {
      id: Date.now().toString() + Math.random(), text, type, speaker,
    }]);
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [storyLog, choices]);

  // --- 世界生成 ---
  const generateWorld = () => {
    const newSects: Sect[] = SECT_NAMES.map((name, idx) => ({
      id: `sect_${idx}`, name, type: Math.random() > 0.7 ? 'evil' : 'good', locationId: 'loc_sect_main',
    }));

    const newNpcs: Person[] = [];
    newSects.forEach((sect) => {
      const leader: Person = {
        id: `npc_${newNpcs.length}`,
        name: genName(),
        sectId: sect.id,
        role: 'leader',
        gender: 'male',
        age: 50,
        status: 'alive',
        relations: [],
        locationId: sect.locationId,
        inventory: [],
        flags: {},
      };
      newNpcs.push(leader);
      for (let i = 0; i < 2; i++) {
        const disciple: Person = {
          id: `npc_${newNpcs.length}`,
          name: genName(),
          sectId: sect.id,
          role: 'disciple',
          gender: Math.random() > 0.5 ? 'male' : 'female',
          age: 18,
          status: 'alive',
          relations: [],
          locationId: sect.locationId,
          inventory: [],
          flags: {},
        };
        newNpcs.push(disciple);
      }
    });

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
      inventory: [],
      flags: {}, // 🚩 初始化 Flags
    };

    if (myMaster) myMaster.relations.push({ targetId: 'hero', type: 'apprentice' });

    setWorld({
      npcs: [...newNpcs, hero], sects: newSects, locations: LOCATIONS, heroId: 'hero',
    });
    setIsStarted(true);
    setStoryLog([]);
    setChoices([]);
    lastSnippetId.current = '';

    addStory(`【世界生成完毕】 你出生在 ${mySect.name}，师承掌门【${myMaster?.name}】。`, 'action');
  };

  // --- 逻辑处理 ---
  const applySnippetResult = (result: SnippetResult) => {
    // 1. 输出文本
    result.lines.forEach((line) => addStory(line.text, line.type, line.speaker));

    // 2. 如果有移动，追加一条文本（不再使用 setTimeout，防止竞态）
    if (result.newLocationId) {
      const locName = LOCATIONS.find((l) => l.id === result.newLocationId)?.name;
      addStory(`... 经过跋涉，你来到了${locName}。`, 'time-pass');
    }

    // 3. 处理副作用
    setWorld((w) => {
      if (!w) return null;
      let newNpcs = [...w.npcs];

      if (result.addNpc) {
        newNpcs.push(result.addNpc);
      }

      newNpcs = newNpcs.map((n) => {
        if (n.id === 'hero') {
          const newInv = [...n.inventory];
          const newRelations = [...n.relations];
          const newFlags = { ...n.flags };

          if (result.addItem) newInv.push(result.addItem);
          if (result.removeItem) {
            const idx = newInv.indexOf(result.removeItem);
            if (idx > -1) newInv.splice(idx, 1);
          }
          if (result.addRelation) {
            const existingIdx = newRelations.findIndex((r) => r.targetId === result.addRelation!.targetId);
            if (existingIdx > -1) {
              newRelations[existingIdx] = result.addRelation;
            } else {
              newRelations.push(result.addRelation);
            }
          }
          // 🚩 处理标记添加
          if (result.addFlag) {
            newFlags[result.addFlag] = true;
          }

          return {
            ...n,
            inventory: newInv,
            relations: newRelations,
            flags: newFlags,
            locationId: result.newLocationId || n.locationId,
          };
        }
        return n;
      });

      return { ...w, npcs: newNpcs };
    });
  };

  // --- 核心循环 ---
  const nextTurn = useCallback(() => {
    // 这里我们不能直接读取最新的 world，因为 useCallback 闭包问题
    // 所以我们使用 setWorld 的回调函数形式来获取最新状态，
    // 但因为我们需要基于状态来决定逻辑，所以这招行不通。
    // 正确做法：将 world 作为 dependency，或者使用 ref 存储 world。
    // 在本例中，因为 world 变化会触发 useEffect 重新设置定时器，所以直接用 world 即可。

    if (!world) return;
    const hero = world.npcs.find((n) => n.id === world.heroId);
    if (!hero) return;

    const location = LOCATIONS.find((l) => l.id === hero.locationId);

    const possibleTags: string[] = [];
    if (location?.type === 'sect') possibleTags.push('sect_daily');
    if (location?.type === 'city') possibleTags.push('city_daily');
    if (location?.type === 'wild') possibleTags.push('wild_daily');

    const candidates = SNIPPETS.filter((s) => {
      const hasTag = s.tags.some((t) => possibleTags.includes(t));
      const meetReq = s.req ? s.req(hero, world) : true;
      const isPriority = (s.weight || 0) >= 50;
      const notRepeated = s.id !== lastSnippetId.current;
      return hasTag && meetReq && (notRepeated || isPriority);
    });

    if (candidates.length > 0) {
      let totalWeight = 0;
      candidates.forEach((s) => totalWeight += (s.weight || 1));
      let randomVal = Math.random() * totalWeight;

      let selectedSnippet = candidates[0];
      for (const s of candidates) {
        randomVal -= (s.weight || 1);
        if (randomVal <= 0) {
          selectedSnippet = s;
          break;
        }
      }

      lastSnippetId.current = selectedSnippet.id;
      const result = selectedSnippet.run(hero, world);
      applySnippetResult(result);
    } else {
      addStory('一时无事，你看着天空发呆。', 'narrative');
    }
  }, [world, addStory]);

  // 游戏循环控制
  useEffect(() => {
    if (isStarted && isAutoPlaying && choices.length === 0) {
      // 清除上一个
      if (timerRef.current) clearTimeout(timerRef.current);

      // 设置下一个
      timerRef.current = setTimeout(() => {
        nextTurn();
      }, 2500);
    }

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [isStarted, isAutoPlaying, choices, nextTurn]); // nextTurn 变了（即world变了）就会重置定时器

  // 渲染
  if (!isStarted) return <div className="flex flex-col items-center justify-center min-h-screen bg-stone-950 text-amber-600 font-serif"><button onClick={generateWorld} className="text-4xl border p-4 hover:bg-stone-900">开始江湖演义</button></div>;

  const currentLocName = LOCATIONS.find((l) => l.id === world?.npcs.find((n) => n.id === 'hero')?.locationId)?.name;
  const hero = world?.npcs.find((n) => n.id === 'hero');

  return (
    <div className="flex justify-center min-h-screen bg-stone-950 font-serif text-lg leading-loose selection:bg-amber-900">
      <div className="w-full max-w-3xl flex flex-col h-screen">
        <div className="p-4 border-b border-stone-800 text-stone-500 text-sm flex justify-between px-8 bg-stone-900 z-10">
          <span>
            {world?.sects.find((s) => s.id === hero?.sectId)?.name}
            弟子
            {' '}
            {hero?.name}
          </span>
          <span className="text-amber-500 font-bold">
            📍
            {currentLocName}
          </span>
          <span className="text-xs" title="背包">
            🎒
            {hero?.inventory.join(', ') || '空'}
          </span>
        </div>

        <div className="flex-1 overflow-y-auto p-6 md:p-12 space-y-6 scrollbar-hide">
          {storyLog.map((block) => (
            <div key={block.id} className={`animate-fade-in ${block.type === 'inner' ? 'text-stone-500 italic' : block.type === 'action' ? 'text-amber-100' : 'text-stone-300'}`}>
              {block.type === 'time-pass' && <div className="text-center text-stone-600 my-8">—— · ——</div>}
              {block.speaker && (
              <span className="font-bold text-amber-600 mr-2">
                {block.speaker}
                ：
              </span>
              )}
              <span>{block.text}</span>
            </div>
          ))}
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
