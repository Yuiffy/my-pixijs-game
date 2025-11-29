'use client';

import React, {
  useState, useEffect, useRef, useCallback,
} from 'react';
import {
  Person, Sect, Location,
  FIRST_NAMES, LAST_NAMES, SECT_NAMES, LOCATION_TEMPLATES, SNIPPETS,
  rand, genName, genCityName, genWildName, SnippetResult,
} from './wuxia/wuxia-data';

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
    // 1. 动态生成地名
    const finalLocations = LOCATION_TEMPLATES.map((loc) => {
      if (loc.type === 'city') return { ...loc, name: genCityName() };
      if (loc.type === 'wild') return { ...loc, name: genWildName() };
      return loc;
    });

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
      flags: {},
    };

    if (myMaster) myMaster.relations.push({ targetId: 'hero', type: 'apprentice' });

    setWorld({
      npcs: [...newNpcs, hero], sects: newSects, locations: finalLocations, heroId: 'hero',
    });
    setIsStarted(true);
    setStoryLog([]);
    setChoices([]);
    lastSnippetId.current = '';

    addStory(`【世界生成完毕】 你出生在 ${mySect.name}，师承掌门【${myMaster?.name}】。`, 'action');
  };

  // --- 逻辑处理 ---
  const applySnippetResult = (result: SnippetResult) => {
    result.lines.forEach((line) => addStory(line.text, line.type, line.speaker));

    if (result.newLocationId) {
      // 注意：这里需要去当前的 world 状态里找名字，不能再用 data.ts 里的静态 LOCATIONS 了
      // 但 applySnippetResult 拿不到 world 状态（闭包陷阱），所以我们推迟到 setWorld 内部做？
      // 或者简化：在 setWorld 里处理。
      // 这里先简单处理，只显示“前往新地点”，具体名字在 setWorld 渲染后顶部状态栏会更新。
      // 或者更好的方式：在 run 函数里就把地名拼进去（已在 wuxia-data.ts 做了优化）。
      addStory('... 经过跋涉，你抵达了目的地。', 'time-pass');
    }

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
    if (!world) return;
    const hero = world.npcs.find((n) => n.id === world.heroId);
    if (!hero) return;

    const location = world.locations.find((l) => l.id === hero.locationId);

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
      // 🧠 核心修复：如果没有可选剧情（说明都被去重过滤了），则重置去重记录
      // 这样下一回合就可以重复播放了，避免无限发呆
      lastSnippetId.current = '';
      addStory('一时无事，你看着天空发呆。', 'narrative');
    }
  }, [world, addStory]);

  useEffect(() => {
    if (isStarted && isAutoPlaying && choices.length === 0) {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        nextTurn();
      }, 2500);
    }
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [isStarted, isAutoPlaying, choices, world]);
  // 注意：这里依赖 world 而不是 nextTurn，因为 nextTurn 也是依赖 world 的。
  // 只要 world 变了，effect 就会重置定时器，这是对的。

  if (!isStarted) return <div className="flex flex-col items-center justify-center min-h-screen bg-stone-950 text-amber-600 font-serif"><button onClick={generateWorld} className="text-4xl border p-4 hover:bg-stone-900">开始江湖演义</button></div>;

  const currentLocName = world?.locations.find((l) => l.id === world?.npcs.find((n) => n.id === 'hero')?.locationId)?.name;
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
