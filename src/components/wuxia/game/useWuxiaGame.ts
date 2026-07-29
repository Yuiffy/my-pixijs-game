"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { SnippetResult } from "../logic/types";
import {
  applySnippetWorldResult,
  mergeSnippetNpcs,
} from "./applySnippetResult";
import { idleSnippet, selectSnippetForTurn } from "./turn";
import { createWuxiaWorld, type WuxiaWorld } from "./world";

export type StoryBlock = {
  id: string;
  text: string;
  type: "narrative" | "dialogue" | "action" | "time-pass" | "inner";
  speaker?: string;
};

export type UIChoice = {
  id: string;
  text: string;
  desc?: string;
  action: () => void;
};

export function useWuxiaGame() {
  const [isStarted, setIsStarted] = useState(false);
  const [isEnded, setIsEnded] = useState(false);

  const [world, setWorld] = useState<WuxiaWorld | null>(null);

  const [storyLog, setStoryLog] = useState<StoryBlock[]>([]);
  const [choices, setChoices] = useState<UIChoice[]>([]);
  const [isAutoPlaying, setIsAutoPlaying] = useState(true);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const snippetCooldowns = useRef<Map<string, number>>(new Map());

  const [autoScroll, setAutoScroll] = useState(true);
  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const addStory = useCallback(
    (
      text: string,
      type: StoryBlock["type"] = "narrative",
      speaker?: string,
    ) => {
      setStoryLog((prev) => [
        ...prev,
        {
          id: Date.now().toString() + Math.random(),
          text,
          type,
          speaker,
        },
      ]);
    },
    [],
  );

  useEffect(() => {
    if (autoScroll) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [storyLog, choices, autoScroll]);

  const handleScroll = () => {
    if (scrollContainerRef.current) {
      const { scrollTop, scrollHeight, clientHeight } =
        scrollContainerRef.current;
      const isAtBottom = scrollHeight - scrollTop - clientHeight < 50;
      setAutoScroll(isAtBottom);
    }
  };

  const scrollToBottom = () => {
    setAutoScroll(true);
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  const generateWorld = () => {
    try {
      const created = createWuxiaWorld();
      setWorld(created.world);

      setIsStarted(true);
      setIsEnded(false);
      setIsAutoPlaying(true);
      setStoryLog([]);
      setChoices([]);
      snippetCooldowns.current.clear();

      addStory(created.introduction, "action");
    } catch (e) {
      console.error(e);
      alert("世界生成失败，请检查控制台。");
    }
  };

  const applySnippetResult = useCallback(
    (result: SnippetResult) => {
      if (result.endGame) {
        setIsEnded(true);
        setIsAutoPlaying(false);
        return;
      }

      if (result.addNpc) {
        setWorld((current) => (current ? mergeSnippetNpcs(current, result) : null),);
      }

      result.lines.forEach((line) => {
        addStory(line.text, line.type, line.speaker);
      });

      if (result.choices) {
        if (result.choices.length === 0) {
          setIsAutoPlaying(true);
          return;
        }
        setIsAutoPlaying(false);
        setChoices(
          result.choices.map((choice, index) => ({
            id: `choice-${Date.now()}-${index}-${choice.text.slice(0, 20)}`,
            text: choice.text,
            desc: choice.desc,
            action: () => {
              setChoices([]);
              applySnippetResult(choice.result);
              if (!choice.result.endGame && !choice.result.choices) {
                setIsAutoPlaying(true);
              }
            },
          })),
        );
        return;
      }

      if (result.newLocationId) {
        addStory("... 经过跋涉，你来到了新的地点。", "time-pass");
      }

      setWorld((current) => {
        if (!current) return null;
        const applied = applySnippetWorldResult(current, result);
        if (applied.advancedStage !== null) {
          const { advancedStage } = applied;
          const stageNames = [
            "初出茅庐",
            "江湖扬名",
            "阴谋浮现",
            "决战巅峰",
            "大结局",
          ];
          setTimeout(() => {
            addStory(
              `【 第${advancedStage + 1}章：${stageNames[advancedStage]} 】`,
              "time-pass",
            );
          }, 100);
        }
        return applied.world;
      });
    },
    [addStory],
  );

  const nextTurn = useCallback(() => {
    if (!world || isEnded) return;
    const hero = world.npcs.find((npc) => npc.id === world.heroId);
    if (!hero) return;

    const snippet = selectSnippetForTurn(hero, world, snippetCooldowns.current);
    if (snippet) {
      applySnippetResult(snippet.run(hero, world));
      return;
    }

    setIsAutoPlaying(false);
    addStory("一时无事，你决定做点什么：", "time-pass");
    const fallback = idleSnippet();
    if (fallback) {
      applySnippetResult(fallback.run(hero, world));
      return;
    }

    setChoices([
      {
        id: `choice-idle-${Date.now()}`,
        text: "冥想",
        action: () => {
          setChoices([]);
          setIsAutoPlaying(true);
        },
      },
    ]);
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

  return {
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
  };
}
