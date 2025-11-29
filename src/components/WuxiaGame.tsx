'use client';

import React, {
  useState, useEffect, useRef, useCallback,
} from 'react';
import { SECT_NAMES } from './wuxia/logic/constants';
import { Person, Sect, StoryStage, SnippetResult, LocationInfo, Relation } from './wuxia/logic/types';
import { generateWorldMap, initSectRelations, genName, generateHiddenMaster, rand } from './wuxia/logic/utils';
import { SNIPPETS } from './wuxia/snippets';

type StoryBlock = {
  id: string;
  text: string;
  type: 'narrative' | 'dialogue' | 'action' | 'time-pass' | 'inner';
  speaker?: string;
};

type UIChoice = {
  id: string;
  text: string;
  desc?: string; // 支持描述
  action: () => void;
};

export default function WuxiaGame() {
  const [isStarted, setIsStarted] = useState(false);
  const [isEnded, setIsEnded] = useState(false);

  const [world, setWorld] = useState<{
    npcs: Person[];
    sects: Sect[];
    locations: LocationInfo[];
    heroId: string;
    stage: StoryStage;
    turnInStage: number;
    party: string[];
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
      const finalLocations = generateWorldMap();
      const newSects: Sect[] = SECT_NAMES.map((name, idx) => {
        const sectLocation = finalLocations.find((l) => l.id === `sect_${idx}`);
        return {
          id: `sect_${idx}`,
          name,
          type: Math.random() > 0.7 ? 'evil' : 'good',
          locationId: sectLocation?.id || finalLocations[0].id,
          relations: {}
        };
      });

      initSectRelations(newSects);

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
        Array.from({ length: 2 }, () => {
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
          return null;
        });
      });

      const hiddenMasterCount = 1 + Math.floor(Math.random() * 3);
      for (let i = 0; i < hiddenMasterCount; i++) {
        const master = generateHiddenMaster(newNpcs, newSects, finalLocations);
        newNpcs.push(master);
      }

      const mySect = rand(newSects);
      const myMaster = newNpcs.find((n) => n.sectId === mySect.id && n.role === 'leader');
      const mySectLocation = finalLocations.find((l) => l.id === `sect_${newSects.indexOf(mySect)}`) || finalLocations.find((l) => l.type === 'sect');
      const hero: Person = {
        id: 'hero',
        name: '你',
        sectId: mySect.id,
        role: 'disciple',
        gender: 'male',
        age: 16,
        birthYear: new Date().getFullYear() - 16,
        status: 'alive',
        relations: myMaster ? [{ targetId: myMaster.id, type: 'apprentice', value: 50 }] : [],
        locationId: mySectLocation?.id || finalLocations[0].id,
        inventory: [],
        flags: {},
        arts: [],
        knowledge: ['rumor_duel'],
      };

      if (myMaster) myMaster.relations.push({ targetId: 'hero', type: 'apprentice', value: 50 });

      setWorld({
        npcs: [...newNpcs, hero],
        sects: newSects,
        locations: finalLocations,
        heroId: 'hero',
        stage: StoryStage.BEGINNING,
        turnInStage: 0,
        party: [],
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

  const applySnippetResult = useCallback((result: SnippetResult) => {
    console.log('applySnippetResult', result);

    // 处理 addNpc 逻辑，确保在任何提前返回前执行
    if (result.addNpc) {
      setWorld((w) => {
        if (!w) return null;
        const newNpcs = [...w.npcs];
        const npcsToAdd = Array.isArray(result.addNpc) ? result.addNpc : [result.addNpc];

        npcsToAdd.forEach((npc) => {
          if (!npc) return;
          const existingIndex = newNpcs.findIndex(n => n.id === npc.id);
          if (existingIndex >= 0) {
            newNpcs[existingIndex] = {
              ...newNpcs[existingIndex],
              ...npc,
              relations: npc.relations || newNpcs[existingIndex].relations,
              inventory: npc.inventory || newNpcs[existingIndex].inventory,
              flags: npc.flags || newNpcs[existingIndex].flags,
              arts: npc.arts || newNpcs[existingIndex].arts,
              knowledge: npc.knowledge || newNpcs[existingIndex].knowledge,
            };
          } else {
            newNpcs.push(npc);
          }
        });

        return { ...w, npcs: newNpcs };
      });
    }

    // 渲染文本行
    result.lines.forEach((line) => addStory(line.text, line.type, line.speaker));

    if (result.choices) {
      if (result.choices.length > 0) {
        setIsAutoPlaying(false);
        setChoices(result.choices.map((c, idx) => ({
          id: `choice-${Date.now()}-${idx}-${c.text.slice(0, 20)}`,
          text: c.text,
          desc: c.desc,
          action: () => {
            setChoices([]);
            applySnippetResult(c.result);
            if (!c.result.endGame && !c.result.choices) setIsAutoPlaying(true);
          },
        })));
      } else {
        // 当 choices 为空数组时，自动继续游戏
        console.log('No choices available, auto-continuing...');
        setIsAutoPlaying(true);
      }
      return;
    }

    if (result.newLocationId) {
      setStoryLog((prev) => [...prev, {
        id: Date.now().toString() + Math.random(),
        text: `... 经过跋涉，你来到了新的地点。`,
        type: 'time-pass'
      }]);
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

      // addNpc 逻辑已移动到函数开始处，确保在任何提前返回前执行

      console.log('=== 开始处理主角状态更新 ===');
      newNpcs = newNpcs.map((n) => {
        if (n.id === 'hero') {
          console.log('当前主角状态:', {
            位置: n.locationId,
            物品: n.inventory,
            武学: n.arts,
            知识: n.knowledge,
            关系: n.relations,
            标记: n.flags
          });

          const newInv = [...n.inventory];
          const newArts = [...n.arts];
          const newKnowledge = [...n.knowledge];
          const newRelations = [...n.relations];
          const newFlags = { ...n.flags };

          if (result.addItem) {
            console.log(`添加物品: ${result.addItem}`);
            newInv.push(result.addItem);
          }
          if (result.removeItem) {
            console.log(`尝试移除物品: ${result.removeItem}`);
            const idx = newInv.indexOf(result.removeItem);
            if (idx > -1) {
              newInv.splice(idx, 1);
              console.log('物品移除成功');
            } else {
              console.warn(`物品未找到: ${result.removeItem}`);
            }
          }

          // 🆕 支持批量更新关系
          const updateRelation = (rel: Relation) => {
            const existingIdx = newRelations.findIndex(
              (r) => r.targetId === rel.targetId,
            );
            if (existingIdx > -1) {
              console.log(`更新与 ${rel.targetId} 的关系:`, rel);
              newRelations[existingIdx] = rel;
            } else {
              console.log(`添加新关系:`, rel);
              newRelations.push(rel);
            }
          };

          if (result.addRelations) {
            console.log('批量添加关系:', result.addRelations);
            result.addRelations.forEach(updateRelation);
          }

          // 处理添加标记
          if (result.addFlags) {
            console.log('添加标记:', result.addFlags);
            Object.entries(result.addFlags).forEach(([key, value]) => {
              console.log(`设置标记 ${key} =`, value);
              newFlags[key] = value !== undefined ? value : true;
            });
          }

          // 处理移除标记
          if (result.removeFlags) {
            console.log('移除标记:', result.removeFlags);
            result.removeFlags.forEach(flag => {
              console.log(`移除标记 ${flag}, 存在: ${flag in newFlags ? '是' : '否'}`);
              delete newFlags[flag];
            });
          }

          if (result.addArt) {
            console.log(`添加武学: ${result.addArt}`);
            newArts.push(result.addArt);
          }

          if (result.addKnowledge) {
            console.log(`添加知识: ${result.addKnowledge}`);
            newKnowledge.push(result.addKnowledge);
          }

          const updatedHero = {
            ...n,
            inventory: newInv,
            relations: newRelations,
            flags: newFlags,
            arts: newArts,
            knowledge: newKnowledge,
            locationId: result.newLocationId || n.locationId,
          };

          console.log('更新后的主角状态:', {
            位置: updatedHero.locationId,
            物品: updatedHero.inventory,
            武学: updatedHero.arts,
            知识: updatedHero.knowledge,
            关系: updatedHero.relations,
            标记: updatedHero.flags
          });

          return updatedHero;
        }
        console.log(`处理非主角 NPC: ${n.name} (${n.id})`);
        return n;
      });
      console.log('=== 主角状态更新完成 ===');

      // 🆕 核心修改：处理队伍变更
      let newParty = [...w.party];

      // 加入队伍 (支持单个或批量添加)
      if (result.addToParty) {
        const membersToAdd = Array.isArray(result.addToParty) ? result.addToParty : [result.addToParty];
        membersToAdd.forEach(memberId => {
          if (!newParty.includes(memberId)) {
            newParty.push(memberId);
          }
        });
      }

      // 离开队伍 (支持单个或批量移除)
      if (result.removeFromParty) {
        const membersToRemove = Array.isArray(result.removeFromParty) ? result.removeFromParty : [result.removeFromParty];
        newParty = newParty.filter(id => !membersToRemove.includes(id));
      }

      // 兼容旧代码 (如果还有 setCompanion 的遗留代码)
      if ((result as any).setCompanion) {
        const id = (result as any).setCompanion;
        if (!newParty.includes(id)) newParty.push(id);
      }

      return {
        ...w,
        npcs: newNpcs,
        stage: newStage,
        turnInStage: newTurnInStage + 1,
        party: newParty,
      };
    });
  }, [addStory]);

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
      timerRef.current = setTimeout(() => {
        nextTurn();
      }, 100);
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
                  <div className="flex items-center">
                    <span className="text-amber-700 font-bold mr-3">
                      {idx + 1}
                      .
                    </span>
                    <span>{choice.text}</span>
                  </div>
                  {choice.desc && (
                    <div className="text-stone-500 text-sm ml-6 mt-1">
                      {choice.desc}
                    </div>
                  )}
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
