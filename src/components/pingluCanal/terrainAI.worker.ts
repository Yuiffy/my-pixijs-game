/* eslint-disable no-await-in-loop -- Sequential slices deliberately release CPU time; parallel work would defeat throttling. */
import { aiTerrainActionSteps, applyTerrainActionSteps, currentPlayer, findRouteSteps, pileSize, planAutoHaulSteps, quoteTerrainSteps, turnOrder, waterMask } from './terrainEngine';
import type { TerrainAction, TerrainGame } from './terrainEngine';
import type { AIRequest, AIResponse } from './terrainAIProtocol';

const scope = globalThis as unknown as {
  onmessage: ((event: MessageEvent<AIRequest>) => void) | null;
  postMessage: (message: AIResponse) => void;
};
interface Prepared { action: TerrainAction; heights: number[]; locks: (number | null)[]; moves: number; haulTarget?: number }
const prepared = new Map<number, Prepared>();
let revision = 0;
let seed: number | undefined;
const cancelled = new Error('Superseded AI snapshot');
const rest = (ms: number) => new Promise<void>(resolve => { setTimeout(resolve, ms); });

/** One worker, ~4 ms work / 16 ms rest in advance; more responsive at its own turn. */
async function runSteps<T>(steps: Generator<void, T>, token: number, background: boolean): Promise<T> {
  for (;;) {
    if (revision !== token) throw cancelled;
    const until = performance.now() + 4;
    do {
      const step = steps.next();
      if (step.done) return step.value;
    } while (performance.now() < until);
    await rest(background ? 16 : 4);
  }
}
async function usable(game: TerrainGame, candidate: Prepared | undefined, token: number, background: boolean): Promise<boolean> {
  if (!candidate) return false;
  const { action } = candidate;
  const player = currentPlayer(game);
  if (candidate.haulTarget !== player.haulTarget) return false;
  if (action.tool === 'pass') return candidate.moves === game.moves;
  if (action.tool === 'fund' && player.cash >= 24) return false;
  if (action.tool === 'dispose' && pileSize(player) <= 100) return false;
  if (candidate.locks.some((owner, index) => owner !== game.locks[index])) return false;
  if (action.cells.some((id, index) => game.plots[id].height !== candidate.heights[index])) return false;
  return !(await runSteps(quoteTerrainSteps(game, action), token, background)).error;
}
async function processRequest(request: AIRequest, token: number) {
  const { game } = request;
  if (!game || game.finished || request.mode === 'pause') return;
  if (seed !== game.seed) { prepared.clear(); seed = game.seed; }
  try {
    if (request.mode === 'execute' || request.mode === 'haul') {
      const started = performance.now();
      const player = currentPlayer(game);
      if (request.mode === 'execute' && !player.ai && !request.managed?.includes(player.id)) return;
      const candidate = prepared.get(player.id);
      const reused = request.mode === 'execute' && await usable(game, candidate, token, false);
      const action = request.mode === 'haul' ? request.action ?? (await runSteps(planAutoHaulSteps(game), token, false)).action : reused ? candidate!.action : await runSteps(aiTerrainActionSteps(game), token, false);
      if (!action) throw new Error('当前没有可执行的运土方案');
      prepared.delete(player.id);
      const next = await runSteps(applyTerrainActionSteps(game, action), token, false);
      if (next === game) throw new Error('AI 行动已失效');
      const route = await runSteps(findRouteSteps(next), token, false);
      const proposal = route ?? await runSteps(findRouteSteps(next, true), token, false);
      if (!proposal) throw new Error('无法测绘施工航线');
      if (token !== revision) return;
      scope.postMessage({ id: request.id, kind: 'applied', game: next, action, reused, elapsed: performance.now() - started, survey: { route, proposal, wet: waterMask(next.plots) } });
      return;
    }
    // Coalesce rapid player actions. Never queue obsolete map snapshots.
    await rest(250);
    if (token !== revision) return;
    if (!currentPlayer(game).ai && !request.managed?.includes(currentPlayer(game).id)) {
      const plan = await runSteps(planAutoHaulSteps(game), token, true);
      if (token !== revision) return;
      scope.postMessage({ id: request.id, kind: 'haul-preview', plan });
    }
    const upcoming = Array.from(new Set([...turnOrder(game).slice(game.turn), ...game.players.map(p => p.id)])).filter(id => game.players[id].ai || request.managed?.includes(id));
    const ready: number[] = [];
    for (const id of upcoming) {
      const view = { ...game, turn: 0, order: [id] };
      if (!await usable(view, prepared.get(id), token, true)) {
        const action = await runSteps(aiTerrainActionSteps(view), token, true);
        prepared.set(id, { action, heights: action.cells.map(cell => game.plots[cell].height), locks: [...game.locks], moves: game.moves, haulTarget: game.players[id].haulTarget });
      }
      if (token !== revision) return;
      ready.push(id);
      scope.postMessage({ id: request.id, kind: 'prepared', players: [...ready] });
      await rest(32);
    }
  } catch (error) {
    if (error === cancelled || token !== revision) return;
    scope.postMessage({ id: request.id, kind: 'error', message: error instanceof Error ? error.message : '后台调度失败' });
  }
}
scope.onmessage = event => { revision++; processRequest(event.data, revision).catch(() => {}); };
