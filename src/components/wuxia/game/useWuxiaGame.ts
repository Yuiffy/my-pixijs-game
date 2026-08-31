"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  chooseNovelAction,
  choosePlayerActivity,
  closeNovelYearAction,
  concludeNovelAction,
  continueNovelAction,
  createNovelState,
  pausePlayerLead,
  resumeNovelAfterEndingAction,
  sanitizeSetup,
  selectPlayerAgenda,
  setPlayerLeadIntent,
  type NovelSetup,
  type NovelState,
} from "./novelEngine";
import type { PlayerIntent } from "./wuxiaCampaign";
import {
  WUXIA_STORAGE_KEY_V6,
  WUXIA_STORAGE_KEY_V7,
  createSaveRoot,
  parseWuxiaSaveRoot,
  removeWorld,
  selectWorld,
  serializeWuxiaSaveRoot,
  upsertWorldGame,
  type WuxiaSaveRootV7,
} from "./wuxiaSave";
import { createSuccessorState } from "./wuxiaSuccession";

export type WuxiaGameScreen = "loading" | "library" | "setup" | "game";

const readSaveRoot = (): WuxiaSaveRootV7 | null => {
  try {
    return parseWuxiaSaveRoot(
      window.localStorage.getItem(WUXIA_STORAGE_KEY_V7),
      window.localStorage.getItem(WUXIA_STORAGE_KEY_V6),
    );
  } catch {
    return null;
  }
};

const persistSaveRoot = (next: WuxiaSaveRootV7 | null): string | null => {
  try {
    if (next?.worlds.length) {
      window.localStorage.setItem(WUXIA_STORAGE_KEY_V7, serializeWuxiaSaveRoot(next));
      window.localStorage.removeItem(WUXIA_STORAGE_KEY_V6);
    } else {
      window.localStorage.removeItem(WUXIA_STORAGE_KEY_V7);
      window.localStorage.removeItem(WUXIA_STORAGE_KEY_V6);
    }
    return null;
  } catch {
    return "浏览器未能写入江湖册。本次进度仍在当前页面中，请先不要刷新，并清理浏览器存储空间。";
  }
};

const withUniqueWorldId = (game: NovelState, root: WuxiaSaveRootV7 | null) => {
  if (!root?.worlds.some((world) => world.id === game.chronicle.worldId)) return game;
  const baseId = game.chronicle.worldId;
  const worldIds = new Set(root.worlds.map((world) => world.id));
  let copy = 2;
  while (worldIds.has(`${baseId}-${copy}`)) copy += 1;
  return {
    ...game,
    chronicle: {
      ...game.chronicle,
      worldId: `${baseId}-${copy}`,
      label: `${game.chronicle.label} · 其${copy}`,
    },
  };
};

export function useWuxiaGame() {
  const [game, setGame] = useState<NovelState | null>(null);
  const [saveRoot, setSaveRoot] = useState<WuxiaSaveRootV7 | null>(null);
  const [screen, setScreen] = useState<WuxiaGameScreen>("loading");
  const [saveError, setSaveError] = useState<string | null>(null);
  const gameRef = useRef<NovelState | null>(null);
  const saveRootRef = useRef<WuxiaSaveRootV7 | null>(null);

  const storeRoot = useCallback((next: WuxiaSaveRootV7 | null) => {
    saveRootRef.current = next;
    setSaveRoot(next);
    setSaveError(persistSaveRoot(next));
  }, []);

  const storeGame = useCallback((next: NovelState) => {
    const root = saveRootRef.current
      ? upsertWorldGame(saveRootRef.current, next)
      : createSaveRoot(next);
    gameRef.current = next;
    setGame(next);
    storeRoot(root);
    setScreen("game");
  }, [storeRoot]);

  const transitionGame = useCallback((transition: (current: NovelState) => NovelState) => {
    const { current } = gameRef;
    if (!current) return;
    storeGame(transition(current));
  }, [storeGame]);

  useEffect(() => {
    const saved = readSaveRoot();
    saveRootRef.current = saved;
    setSaveRoot(saved);
    if (saved) setSaveError(persistSaveRoot(saved));
    setScreen(saved?.worlds.length ? "library" : "setup");
  }, []);

  const startGame = useCallback((input: Partial<NovelSetup> = {}) => {
    const created = createNovelState(sanitizeSetup(input));
    storeGame(withUniqueWorldId(created, saveRootRef.current));
  }, [storeGame]);

  const continueGame = useCallback(() => {
    const root = saveRootRef.current;
    if (!root?.worlds.length) {
      setScreen("setup");
      return;
    }
    const world = root.worlds.find((entry) => entry.id === root.activeWorldId) || root.worlds[0];
    const selected = selectWorld(root, world.id);
    storeRoot(selected);
    gameRef.current = world.game;
    setGame(world.game);
    setScreen("game");
  }, [storeRoot]);

  const selectWorldGame = useCallback((worldId: string) => {
    const root = saveRootRef.current;
    const world = root?.worlds.find((entry) => entry.id === worldId);
    if (!root || !world) return;
    storeRoot(selectWorld(root, worldId));
    gameRef.current = world.game;
    setGame(world.game);
    setScreen("game");
  }, [storeRoot]);

  const openWorldLibrary = useCallback(() => {
    gameRef.current = null;
    setGame(null);
    setScreen(saveRootRef.current?.worlds.length ? "library" : "setup");
  }, []);

  const openNewWorldSetup = useCallback(() => {
    gameRef.current = null;
    setGame(null);
    setScreen("setup");
  }, []);

  const chooseAction = useCallback((choiceId: string) => {
    transitionGame((current) => chooseNovelAction(current, choiceId));
  }, [transitionGame]);

  const chooseAgenda = useCallback((agendaId: string) => {
    transitionGame((current) => selectPlayerAgenda(current, agendaId));
  }, [transitionGame]);

  const chooseActivity = useCallback((activityId: string) => {
    transitionGame((current) => choosePlayerActivity(current, activityId));
  }, [transitionGame]);

  const setLeadIntent = useCallback((leadId: string, intent: PlayerIntent) => {
    transitionGame((current) => setPlayerLeadIntent(current, leadId, intent));
  }, [transitionGame]);

  const pauseLead = useCallback((leadId: string) => {
    transitionGame((current) => pausePlayerLead(current, leadId));
  }, [transitionGame]);

  const continueAction = useCallback(() => {
    transitionGame(continueNovelAction);
  }, [transitionGame]);

  const closeYear = useCallback(() => {
    transitionGame(closeNovelYearAction);
  }, [transitionGame]);

  const concludeGame = useCallback((endingId = "wandering_volume") => {
    transitionGame((current) => concludeNovelAction(current, endingId));
  }, [transitionGame]);

  const resumeAfterEnding = useCallback(() => {
    transitionGame(resumeNovelAfterEndingAction);
  }, [transitionGame]);

  const startSuccessor = useCallback((input: Partial<NovelSetup> = {}) => {
    const { current } = gameRef;
    if (!current?.ending) return;
    storeGame(createSuccessorState(current, input));
  }, [storeGame]);

  const deleteWorld = useCallback((worldId: string) => {
    const root = saveRootRef.current;
    if (!root) return;
    const next = removeWorld(root, worldId);
    const deletingCurrent = gameRef.current?.chronicle.worldId === worldId;
    storeRoot(next.worlds.length ? next : null);
    if (deletingCurrent) {
      gameRef.current = null;
      setGame(null);
    }
    setScreen(next.worlds.length ? "library" : "setup");
  }, [storeRoot]);

  const abandonGame = useCallback(() => {
    const worldId = gameRef.current?.chronicle.worldId || saveRootRef.current?.activeWorldId;
    if (worldId) deleteWorld(worldId);
    else {
      storeRoot(null);
      gameRef.current = null;
      setGame(null);
      setScreen("setup");
    }
  }, [deleteWorld, storeRoot]);

  const currentLocation = useMemo(
    () => game?.locations.find((location) => location.id === game.currentLocationId) || game?.locations[0] || null,
    [game],
  );

  return {
    game,
    saveRoot,
    worlds: saveRoot?.worlds || [],
    screen,
    currentLocation,
    isReady: screen !== "loading",
    isStarted: Boolean(game),
    isEnded: Boolean(game?.ending),
    hasSavedGame: Boolean(saveRoot?.worlds.length),
    saveError,
    startGame,
    generateWorld: startGame,
    continueGame,
    selectWorld: selectWorldGame,
    openWorldLibrary,
    openNewWorldSetup,
    chooseAgenda,
    chooseActivity,
    setLeadIntent,
    pauseLead,
    chooseAction,
    continueAction,
    closeYear,
    concludeGame,
    resumeAfterEnding,
    startSuccessor,
    deleteWorld,
    abandonGame,
    newRun: startGame,
  };
}

export const STORAGE_KEY = WUXIA_STORAGE_KEY_V7;
export { WUXIA_STORAGE_KEY_V6, WUXIA_STORAGE_KEY_V7 };
