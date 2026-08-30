'use client';

import React from 'react';
import { useWuxiaGame } from './wuxia/legacy/game/useWuxiaGame';

const stageNames = ['初出茅庐', '江湖扬名', '阴谋浮现', '决战巅峰', '大结局'];

export default function LegacyWuxiaGame() {
  const {
    isStarted,
    isEnded,
    world,
    storyLog,
    choices,
    autoScroll,
    bottomRef,
    scrollContainerRef,
    generateWorld,
    handleScroll,
    scrollToBottom,
  } = useWuxiaGame();

  React.useEffect(() => {
    window.advanceTime = () => {
      // The original prototype advances through its own short prose timers.
    };
    const renderState = () => {
      const hero = world?.npcs.find((npc) => npc.id === world.heroId);
      const location = world?.locations.find((entry) => entry.id === hero?.locationId);
      return JSON.stringify({
        edition: 'legacy',
        screen: !isStarted ? 'setup' : isEnded ? 'ending' : choices.length > 0 ? 'choice' : 'story',
        stage: world?.stage ?? null,
        stageName: world ? stageNames[world.stage] : null,
        turnInStage: world?.turnInStage ?? 0,
        hero: hero
          ? {
            id: hero.id,
            name: hero.name,
            sectId: hero.sectId,
            locationId: hero.locationId,
            arts: hero.arts,
            inventory: hero.inventory,
          }
          : null,
        location: location ? { id: location.id, name: location.name, type: location.type } : null,
        companions: (world?.party || []).map((memberId) => {
          const member = world?.npcs.find((npc) => npc.id === memberId);
          return { id: memberId, name: member?.name || memberId };
        }),
        choices: choices.map((choice) => ({ id: choice.id, text: choice.text, desc: choice.desc })),
        latestStory: storyLog.slice(-16).map((block) => ({
          type: block.type,
          speaker: block.speaker,
          text: block.text,
        })),
      });
    };
    window.render_game_to_text = renderState;
    return () => {
      if (window.render_game_to_text === renderState) delete window.render_game_to_text;
      delete window.advanceTime;
    };
  }, [choices, isEnded, isStarted, storyLog, world]);

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
                  className="block w-full text-left p-4 bg-stone-900 border border-stone-800 text-stone-300 hover:border-amber-600 transition rounded group"
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
