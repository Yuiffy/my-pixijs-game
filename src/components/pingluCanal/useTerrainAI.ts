'use client';

import { useEffect, useRef, useState } from 'react';
import { currentPlayer } from './terrainEngine';
import type { HaulPlan, TerrainGame } from './terrainEngine';
import type { AIRequest, AIResponse } from './terrainAIProtocol';

type Applied = Extract<AIResponse, { kind: 'applied' }>;
export default function useTerrainAI(game: TerrainGame, enabled: boolean, managed: number[], commit: (result: Applied) => void) {
  const worker = useRef<Worker | null>(null);
  const requestId = useRef(0);
  const commitRef = useRef(commit);
  commitRef.current = commit;
  const [attempt, setAttempt] = useState(0);
  const [error, setError] = useState('');
  const [ready, setReady] = useState<number[]>([]);
  const [lastResult, setLastResult] = useState<{ reused: boolean; elapsed: number } | null>(null);
  const [haulPreview, setHaulPreview] = useState<{ game: TerrainGame; plan: HaulPlan } | null>(null);
  const [busy, setBusy] = useState(false);
  const snapshot = useRef(game);
  const sentSnapshot = useRef(game);
  const policy = useRef({ enabled, managed });
  policy.current = { enabled, managed };
  const sentMode = useRef<AIRequest['mode']>('pause');
  snapshot.current = game;
  useEffect(() => {
    const sequence = requestId;
    let instance: Worker;
    try {
      instance = new Worker(new URL('./terrainAI.worker.ts', import.meta.url), { type: 'module' });
      worker.current = instance;
    } catch {
      setError('后台调度未能启动，请重试。'); return undefined;
    }
    instance.onmessage = (event: MessageEvent<AIResponse>) => {
      const result = event.data;
      if (result.id !== requestId.current || sentSnapshot.current !== snapshot.current) return;
      if (result.kind === 'prepared') setReady(result.players);
      else if (result.kind === 'haul-preview') setHaulPreview({ game: snapshot.current, plan: result.plan });
      else if (result.kind === 'error') { setError(result.message); setBusy(false); } else {
        const actor = currentPlayer(snapshot.current);
        if (!policy.current.enabled || (sentMode.current === 'execute' && !actor.ai && !policy.current.managed.includes(actor.id))) return;
        setBusy(false);
        setLastResult({ reused: result.reused, elapsed: result.elapsed });
        commitRef.current(result);
      }
    };
    instance.onerror = event => { event.preventDefault(); setError('后台调度中断，请重试。'); setBusy(false); instance.terminate(); worker.current = null; };
    return () => { sequence.current++; instance.terminate(); worker.current = null; };
  }, [attempt]);
  useEffect(() => {
    const instance = worker.current;
    const sequence = requestId;
    const id = ++requestId.current;
    if (!instance) return undefined;
    setReady([]);
    setBusy(false);
    const active = currentPlayer(game);
    const mode = !enabled || game.finished ? 'pause' : active.ai || managed.includes(active.id) ? 'execute' : 'prepare';
    // Let consecutive actions remain legible; the first AI action has no artificial wait.
    const last = game.events[game.events.length - 1];
    const delay = mode === 'execute' && last && (game.players[last.player].ai || managed.includes(last.player)) ? 280 : 0;
    const send = () => {
      if (id !== requestId.current) return;
      sentSnapshot.current = game;
      sentMode.current = mode;
      const request: AIRequest = { id, mode, managed, ...(mode === 'pause' ? {} : { game }) }; instance.postMessage(request);
    };
    const timer = window.setTimeout(send, delay);
    return () => {
      window.clearTimeout(timer);
      instance.postMessage({ id: ++sequence.current, mode: 'pause' } satisfies AIRequest);
    };
  }, [game, enabled, managed, attempt]);
  const haulPlan = haulPreview?.game === game ? haulPreview.plan : null;
  const haul = () => {
    if (!enabled || busy || !worker.current || !haulPlan?.action) return;
    setBusy(true);
    sentSnapshot.current = game;
    sentMode.current = 'haul';
    worker.current.postMessage({ id: ++requestId.current, mode: 'haul', game, action: haulPlan.action } satisfies AIRequest);
  };
  return { ready, lastResult, error, haulPlan, haul, busy, retry: () => { setError(''); setAttempt(value => value + 1); } };
}
