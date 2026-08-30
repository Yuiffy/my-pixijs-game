"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  chooseNovelAction,
  continueNovelAction,
  createNovelState,
  sanitizeSetup,
  type NovelSetup,
  type NovelState,
} from "./novelEngine";

const STORAGE_KEY = "wuxia-novel-save-v1";

const isNovelState = (value: unknown): value is NovelState => {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<NovelState>;
  return candidate.version === 1
    && typeof candidate.turn === "number"
    && typeof candidate.maxTurns === "number"
    && !!candidate.hero
    && Array.isArray(candidate.log)
    && Array.isArray(candidate.locations);
};

const readSavedGame = (): NovelState | null => {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return isNovelState(parsed) ? parsed : null;
  } catch {
    return null;
  }
};

const persistGame = (next: NovelState | null) => {
  try {
    if (next) window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    else window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Storage can be disabled in private browsing; the game still works in memory.
  }
};

export function useWuxiaGame() {
  const [game, setGame] = useState<NovelState | null>(null);
  const [hasSavedGame, setHasSavedGame] = useState(false);

  useEffect(() => {
    const saved = readSavedGame();
    setHasSavedGame(Boolean(saved));
  }, []);

  const startGame = useCallback((input: Partial<NovelSetup> = {}) => {
    const next = createNovelState(sanitizeSetup(input));
    setGame(next);
    persistGame(next);
    setHasSavedGame(true);
  }, []);

  const continueGame = useCallback(() => {
    const saved = readSavedGame();
    if (saved) setGame(saved);
  }, []);

  const chooseAction = useCallback((choiceId: string) => {
    setGame((current) => {
      if (!current) return current;
      const next = chooseNovelAction(current, choiceId);
      persistGame(next);
      return next;
    });
  }, []);

  const continueAction = useCallback(() => {
    setGame((current) => {
      if (!current) return current;
      const next = continueNovelAction(current);
      persistGame(next);
      return next;
    });
  }, []);

  const abandonGame = useCallback(() => {
    setGame(null);
    persistGame(null);
    setHasSavedGame(false);
  }, []);

  const newRun = useCallback((input: Partial<NovelSetup> = {}) => {
    const next = createNovelState(sanitizeSetup(input));
    setGame(next);
    persistGame(next);
    setHasSavedGame(true);
  }, []);

  const currentLocation = useMemo(
    () => game?.locations.find((location) => location.id === game.currentLocationId) || game?.locations[0] || null,
    [game],
  );

  return {
    game,
    currentLocation,
    isStarted: Boolean(game),
    isEnded: Boolean(game?.ending),
    hasSavedGame,
    startGame,
    generateWorld: startGame,
    continueGame,
    chooseAction,
    continueAction,
    abandonGame,
    newRun,
  };
}

export { STORAGE_KEY };
