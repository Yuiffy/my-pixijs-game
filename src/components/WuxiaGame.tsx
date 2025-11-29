'use client';

import React, {
  useState, useEffect, useRef, useCallback,
} from 'react';
import {
  Person, Sect, Location, StoryStage,
  SECT_NAMES, LOCATION_TEMPLATES, SNIPPETS,
  rand, genName, genCityName, genWildName, SnippetResult, StoryChoice,
} from './wuxia/wuxia-data';

type StoryBlock = {
  id: string;
  text: string;
  type: 'narrative' | 'dialogue' | 'action' | 'time-pass' | 'inner';
  speaker?: string;
};

type UIChoice = {
  id: string;
  text: string;
  action: () => void;
};

export default function WuxiaGame() {
  const [isStarted, setIsStarted] = useState(false);
  const [isEnded, setIsEnded] = useState(false);

  const [world, setWorld] = useState<{
    npcs: Person[];
    sects: Sect[];
    locations: Location[];
    heroId: string;
    stage: StoryStage;
    turnInStage: number;
  } | null>(null);

  const [storyLog, setStoryLog] = useState<StoryBlock[]>([]);
  const [choices, setChoices] = useState<UIChoice[]>([]);
  const [isAutoPlaying, setIsAutoPlaying] = useState(true);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const snippetCooldowns = useRef<Map<string, number>>(new Map());

  const [autoScroll, setAutoScroll] = useState(true);
  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const addStory = useCallback((text: string, type: StoryBlock['type'] = 'narrative', speaker?: string) => {
    setStoryLog((prev) => [...prev, {
      id: Date.now().toString() + Math.random(), text, type, speaker,
    }]);
  }, []);

  useEffect(() => {
    if (autoScroll) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [storyLog, choices, autoScroll]);

  const handleScroll = () => {
    if (scrollContainerRef.current) {
      const { scrollTop, scrollHeight, clientHeight } = scrollContainerRef.current;
      const isAtBottom = scrollHeight - scrollTop - clientHeight < 50;
      setAutoScroll(isAtBottom);
    }
  };

  const scrollToBottom = () => {
    setAutoScroll(true);
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const generateWorld = () => {
    try {
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
          name: genName('male'),
          sectId: sect.id,
          role: 'leader',
          gender: 'male',
          age: 50,
          status: 'alive',
          relations: [],
          locationId: sect.locationId,
          inventory: [],
          flags: {},
          arts: [],
          knowledge: [],
        };
        newNpcs.push(leader);
        for (let i = 0; i < 2; i++) {
          const gender = Math.random() > 0.5 ? 'male' : 'female';
          const disciple: Person = {
            id: `npc_${newNpcs.length}`,
            name: genName(gender),
            sectId: sect.id,
            role: 'disciple',
            gender,
            age: 18,
            status: 'alive',
            relations: [],
            locationId: sect.locationId,
            inventory: [],
            flags: {},
            arts: [],
            knowledge: [],
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
        relations: myMaster ? [{ targetId: myMaster.id, type: 'master', value: 50 }] : [],
        locationId: mySect.locationId,
        inventory: [],
        flags: {},
        arts: [],
        knowledge: [],
      };

      if (myMaster) myMaster.relations.push({ targetId: 'hero', type: 'apprentice', value: 50 });

      setWorld({
        npcs: [...newNpcs, hero],
        sects: newSects,
        locations: finalLocations,
        heroId: 'hero',
        stage: StoryStage.BEGINNING,
        turnInStage: 0,
      });

      setIsStarted(true);
      setIsEnded(false);
      setIsAutoPlaying(true);
      setStoryLog([]);
      setChoices([]);
      snippetCooldowns.current.clear();

      addStory(`【世界生成完毕】 你出生在 ${mySect.name}，师承掌门【${myMaster?.name}】。`, 'action');
    } catch (e) {
      console.error(e);
      alert('世界生成失败，请检查控制台。');
    }
  };

  const applySnippetResult = (result: SnippetResult) => {
    result.lines.forEach((line) => addStory(line.text, line.type, line.speaker));

    if (result.choices && result.choices.length > 0) {
      setIsAutoPlaying(false);
      setChoices(result.choices.map((c) => ({
        text: c.text,
        action: () => {
          setChoices([]);
          applySnippetResult(c.result);
          if (!c.result.endGame && !c.result.choices) setIsAutoPlaying(true);
        },
      })));
      return;
    }

    if (result.newLocationId) {
      const locName = world?.locations.find((l) => l.id === result.newLocationId)?.name || '未知之地';
      addStory(`... 经过跋涉，你来到了${locName}。`, 'time-pass');
    }

    if (result.endGame) {
      setIsEnded(true);
      setIsAutoPlaying(false);
      return;
    }

    setWorld((w) => {
      if (!w) return null;
      let newNpcs = [...w.npcs];
      let newStage = w.stage;
      let newTurnInStage = w.turnInStage;

      if (result.advanceStage) {
        newStage = Math.min(newStage + 1, StoryStage.ENDING);
        newTurnInStage = 0;
        const stageNames = ['初出茅庐', '江湖扬名', '阴谋浮现', '决战巅峰', '大结局'];
        setTimeout(() => addStory(`【 第${newStage + 1}章：${stageNames[newStage]} 】`, 'time-pass'), 100);
      }

      if (result.addNpc) newNpcs.push(result.addNpc);

      newNpcs = newNpcs.map((n) => {
        if (n.id === 'hero') {
          const newInv = [...n.inventory];
          const newArts = [...n.arts];
          const newKnowledge = [...n.knowledge];
          const newRelations = [...n.relations];
          const newFlags = { ...n.flags };

          if (result.addItem) newInv.push(result.addItem);
          if (result.removeItem) {
            const idx = newInv.indexOf(result.removeItem);
            if (idx > -1) newInv.splice(idx, 1);
          }
          if (result.addRelation) {
            const existingIdx = newRelations.findIndex((r) => r.targetId === result.addRelation!.targetId);
            if (existingIdx > -1) newRelations[existingIdx] = result.addRelation;
            else newRelations.push(result.addRelation);
          }
          if (result.addFlag) newFlags[result.addFlag] = true;
          if (result.addArt) newArts.push(result.addArt);
          if (result.addKnowledge) newKnowledge.push(result.addKnowledge);

          return {
            ...n,
            inventory: newInv,
            relations: newRelations,
            flags: newFlags,
            arts: newArts,
            knowledge: newKnowledge,
            locationId: result.newLocationId || n.locationId,
          };
        }
        return n;
      });

      return {
        ...w, npcs: newNpcs, stage: newStage, turnInStage: newTurnInStage + 1,
      };
    });
  };

  const nextTurn = useCallback(() => {
    if (!world || isEnded) return;
    const hero = world.npcs.find((n) => n.id === world.heroId);
    if (!hero) return;

    const location = world.locations.find((l) => l.id === hero.locationId);

    Array.from(snippetCooldowns.current.entries()).forEach(([id, cd]) => {
      if (cd > 0) {
        snippetCooldowns.current.set(id, cd - 1);
      } else {
        snippetCooldowns.current.delete(id);
      }
    });

    const possibleTags: string[] = [];
    if (location?.type === 'sect') possibleTags.push('sect_daily');
    if (location?.type === 'city') possibleTags.push('city_daily');
    if (location?.type === 'wild') possibleTags.push('wild_daily');

    const candidates = SNIPPETS.filter((s) => {
      const hasTag = s.tags.some((t) => possibleTags.includes(t));
      const minStage = s.stageMin ?? StoryStage.BEGINNING;
      const maxStage = s.stageMax ?? StoryStage.ENDING;
      const stageMatch = world.stage >= minStage && world.stage <= maxStage;
      const inCooldown = snippetCooldowns.current.has(s.id);
      const meetReq = s.req ? s.req(hero, world, world.turnInStage) : true;
      return hasTag && stageMatch && !inCooldown && meetReq;
    });

    if (candidates.length > 0) {
      let totalWeight = 0;
      candidates.forEach((s) => {
        totalWeight += (s.weight || 1);
      });
      let randomVal = Math.random() * totalWeight;
      let selectedSnippet = candidates[0];
      let found = false;
      candidates.forEach((s) => {
        if (!found) {
          randomVal -= (s.weight || 1);
          if (randomVal <= 0) {
            selectedSnippet = s;
            found = true;
          }
        }
      });

      if ((selectedSnippet.weight || 0) < 100) {
        snippetCooldowns.current.set(selectedSnippet.id, 2);
      }

      const result = selectedSnippet.run(hero, world);
      applySnippetResult(result);
    } else {
      setIsAutoPlaying(false);
      addStory('一时无事，你决定做点什么：', 'time-pass');

      const idleSnippet = SNIPPETS.find((s) => s.id === 'idle_action_menu');
      if (idleSnippet) {
        const result = idleSnippet.run(hero, world);
        applySnippetResult(result);
      } else {
        setChoices([{
          id: `choice-idle-${Date.now()}`,
          text: '冥想',
          action: () => {
            setChoices([]);
            setIsAutoPlaying(true);
          },
        }]);
      }
    }
  }, [world, addStory, isEnded, applySnippetResult]);

  useEffect(() => {
    if (isStarted && isAutoPlaying && !isEnded && choices.length === 0) {
      if (timerRef.current) clearTimeout(timerRef.current);
      // 🚀 极速模式：50ms
      timerRef.current = setTimeout(() => {
        nextTurn();
      }, 50);
    }
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [isStarted, isAutoPlaying, choices, world, isEnded, nextTurn]);

  if (!isStarted) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-stone-950 text-amber-600 font-serif">
        <button type="button" onClick={generateWorld} className="text-4xl border p-4 hover:bg-stone-900">
          开始江湖演义
        </button>
      </div>
    );
  }

  const currentLocName = world?.locations.find((l) => l.id === world?.npcs.find((n) => n.id === 'hero')?.locationId)?.name;
  const hero = world?.npcs.find((n) => n.id === 'hero');
  const stageNames = ['初出茅庐', '江湖扬名', '阴谋浮现', '决战巅峰', '大结局'];

  return (
    <div className="flex justify-center min-h-screen bg-stone-950 font-serif text-lg leading-loose selection:bg-amber-900">
      <div className="w-full max-w-3xl flex flex-col h-screen relative">
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
          <span className="text-xs border border-stone-700 px-2 rounded">
            {stageNames[world?.stage || 0]}
            {' '}
            (第
            {world?.turnInStage}
            旬)
          </span>
        </div>

        <div
          ref={scrollContainerRef}
          onScroll={handleScroll}
          className="flex-1 overflow-y-auto p-6 md:p-12 space-y-6 scrollbar-hide relative"
        >
          {storyLog.map((block) => {
            let className = 'animate-fade-in ';
            if (block.type === 'inner') {
              className += 'text-stone-500 italic';
            } else if (block.type === 'action') {
              className += 'text-amber-100';
            } else {
              className += 'text-stone-300';
            }
            return (
              <div key={block.id} className={className}>
                {block.type === 'time-pass' && <div className="text-center text-stone-600 my-8">—— · ——</div>}
                {block.speaker && (
                <span className="font-bold text-amber-600 mr-2">
                  {block.speaker}
                  ：
                </span>
                )}
                <span>{block.text}</span>
              </div>
            );
          })}
          {choices.length === 0 && !isEnded && (
            <div className="h-4" />
          )}

          {choices.length > 0 && (
            <div className="mt-8 space-y-3 pl-4 border-l-2 border-amber-800/50 animate-slide-up pb-12">
              {choices.map((choice, idx) => (
                <button
                  key={choice.id}
                  type="button"
                  onClick={choice.action}
                  className="block w-full text-left p-4 bg-stone-900 border border-stone-800 hover:border-amber-600 transition rounded group"
                >
                  <span className="text-amber-700 font-bold mr-3">
                    {idx + 1}
                    .
                  </span>
                  {choice.text}
                </button>
              ))}
            </div>
          )}

          {isEnded && (
            <div className="text-center text-amber-500 text-xl font-bold border-t border-stone-700 mt-12 pt-8 mb-12">
              —— 全书完 ——
              <div className="mt-4">
                <button type="button" onClick={generateWorld} className="text-sm border border-stone-600 px-4 py-2 rounded hover:bg-stone-800">
                  开启下一世
                </button>
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        {!autoScroll && (
          <button
            type="button"
            onClick={scrollToBottom}
            className="absolute bottom-8 right-8 bg-amber-700 text-white p-3 rounded-full shadow-lg opacity-80 hover:opacity-100 transition animate-bounce z-50"
            title="回到最新剧情"
          >
            ⬇️
          </button>
        )}
      </div>
    </div>
  );
}
