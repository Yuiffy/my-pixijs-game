import {
  AutoChessEngine,
  type AutoChessEngineSnapshot,
} from "../core/engine/AutoChessEngine";
import { UNIT_DEFS } from "../core/gameData";
import { BATTLE_BOUNDS, playerFormationPosition } from "../core/battleGeometry";
import type { Fighter, OwnedUnit, UnitLocation } from "../core/gameTypes";

export type MatchMode = "coop" | "versus";
export type MatchConfig = {
  mode: MatchMode;
  seats: number;
  aiCount: number;
  prepSeconds: number;
  isPublic: boolean;
};
export type Seat = { name: string; ai: boolean; joined: boolean };
export type PrepAction =
  | { kind: "buy"; index: number }
  | { kind: "move"; from: UnitLocation; to: UnitLocation }
  | { kind: "sell"; location: UnitLocation }
  | { kind: "forge"; location?: UnitLocation }
  | { kind: "reroll" | "lock" | "level" | "arrange" };
export type Pairing = { a: number; b: number; ghost: boolean };
export type Recipe = {
  seed: number;
  round: number;
  player: Fighter[];
  enemy: Fighter[];
};
export type BattleRecord = {
  a: number;
  b: number | null;
  ghost: boolean;
  rescueFor: number | null;
  recipe: Recipe;
  won: boolean;
  remaining: number;
  elapsed: number;
};
export type RoundReport = {
  damage: number;
  income: number;
  defended: boolean;
  rescuedBy: number | null;
  helped: number | null;
};
export type MatchPlayer = Seat & {
  hp: number;
  ready: boolean;
  acknowledged: boolean;
  eliminatedRound: number | null;
  revision: number;
  snapshot: AutoChessEngineSnapshot;
  previous: (OwnedUnit | null)[];
  report: RoundReport | null;
};
export type RoundTimeline = {
  startsAt: number;
  defenseEndsAt: number;
  rescueStartsAt: number;
  combatEndsAt: number;
  endsAt: number;
  opening: { hp: number; gold: number }[];
};
export type RoundStage =
  | "preparation"
  | "starting"
  | "battle"
  | "rescue-starting"
  | "rescue"
  | "settlement"
  | "finished";
export const ROUND_START_DELAY = 0;
export const RESCUE_START_DELAY = 0;
export const SETTLEMENT_DURATION = 4500;
export function makeTimeline(
  battles: BattleRecord[],
  now: number,
  opening: RoundTimeline["opening"],
): RoundTimeline {
  const startsAt = now + ROUND_START_DELAY;
  const defenseEndsAt =
    startsAt +
    Math.ceil(
      Math.max(
        0,
        ...battles.filter((b) => b.rescueFor === null).map((b) => b.elapsed),
      ) * 1000,
    );
  const rescues = battles.filter((b) => b.rescueFor !== null);
  const rescueStartsAt =
    defenseEndsAt + (rescues.length ? RESCUE_START_DELAY : 0);
  const combatEndsAt =
    rescueStartsAt +
    Math.ceil(Math.max(0, ...rescues.map((b) => b.elapsed)) * 1000);
  return {
    startsAt,
    defenseEndsAt,
    rescueStartsAt,
    combatEndsAt,
    endsAt: combatEndsAt + SETTLEMENT_DURATION,
    opening,
  };
}
export function roundStage(
  match: Pick<Match, "phase" | "timeline">,
  now: number,
): RoundStage {
  if (match.phase === "preparation") return "preparation";
  const t = match.timeline;
  if (!t) return match.phase === "finished" ? "finished" : "settlement";
  if (now < t.startsAt) return "starting";
  if (now < t.defenseEndsAt) return "battle";
  if (now < t.rescueStartsAt) return "rescue-starting";
  if (now < t.combatEndsAt) return "rescue";
  return now >= t.endsAt && match.phase === "finished"
    ? "finished"
    : "settlement";
}
export type Match = {
  version: 1;
  mode: MatchMode;
  seed: number;
  round: number;
  phase: "preparation" | "review" | "finished";
  prepSeconds: number;
  deadline: number;
  players: MatchPlayer[];
  pairings: Pairing[];
  battles: BattleRecord[];
  winners: number[];
  timeline?: RoundTimeline;
};
export const MODE_NAMES = { coop: "合作卫戍", versus: "多人混战" };
export const COOP_ROUNDS = 16;
export const MAX_VERSUS_ROUNDS = 40;
export function validConfig(value: unknown): value is MatchConfig {
  if (!value || typeof value !== "object") return false;
  const c = value as MatchConfig;
  return (
    ["coop", "versus"].includes(c.mode) &&
    Number.isInteger(c.seats) &&
    c.seats >= (c.mode === "coop" ? 1 : 2) &&
    c.seats <= (c.mode === "coop" ? 4 : 8) &&
    Number.isInteger(c.aiCount) &&
    c.aiCount >= 0 &&
    c.aiCount < c.seats &&
    [60, 90, 120].includes(c.prepSeconds) &&
    typeof c.isPublic === "boolean"
  );
}
export function engineFor(snapshot: AutoChessEngineSnapshot) {
  const engine = new AutoChessEngine(snapshot.state.seed, {
    telemetry: false,
    visualEffects: false,
  });
  engine.restoreSimulationSnapshot(snapshot);
  return engine;
}
export function pairPlayers(alive: number[], round: number): Pairing[] {
  if (alive.length < 2) return [];
  // Circle scheduling: the bye rotates and plays a non-damaging copy of a living rival.
  const ring = [...alive];
  if (ring.length % 2) ring.push(-1);
  for (let i = 0; i < (round - 1) % (ring.length - 1); i++) ring.splice(1, 0, ring.pop()!);
  const result: Pairing[] = [];
  for (let i = 0; i < ring.length / 2; i++) {
    const a = ring[i];
    const b = ring[ring.length - 1 - i];
    if (a === -1 || b === -1) {
      const real = a === -1 ? b : a;
      const candidates = alive.filter((id) => id !== real);
      result.push({
        a: real,
        b: candidates[(round - 1) % candidates.length],
        ghost: true,
      });
    } else result.push(
        (round + i) % 2 ? { a, b, ghost: false } : { a: b, b: a, ghost: false },
      );
  }
  return result;
}
export function createMatch(
  config: MatchConfig,
  seats: Seat[],
  seed: number,
  now = Date.now(),
): Match {
  if (
    !validConfig(config) ||
    seats.length !== config.seats ||
    seats.some((p) => !p.joined)
  ) throw new Error("席位未到齐");
  const players = seats.map((seat, i): MatchPlayer => {
    const engine = new AutoChessEngine((seed + i * 7919) % 4294967296, {
      telemetry: false,
      visualEffects: false,
    });
    engine.startRun(engine.state.starterChoices[0]);
    // Equal starts. Run-specific starter/augment effects stay in the traditional challenge.
    engine.state.starter = null;
    engine.state.starterHistory = [];
    engine.state.board.fill(null);
    engine.state.board[11] = { uid: 1, id: "nori", star: 1 };
    engine.state.gold = 10;
    engine.state.hp = config.mode === "coop" ? 20 : 40;
    engine.state.maxHp = engine.state.hp;
    engine.state.freeRerollCharges = 0;
    engine.state.toast = null;
    return {
      ...seat,
      hp: engine.state.hp,
      ready: seat.ai,
      acknowledged: false,
      eliminatedRound: null,
      revision: 0,
      snapshot: engine.getSimulationSnapshot(),
      previous: [],
      report: null,
    };
  });
  const match: Match = {
    version: 1,
    mode: config.mode,
    seed,
    round: 1,
    phase: "preparation",
    prepSeconds: config.prepSeconds,
    deadline: now + config.prepSeconds * 1000,
    players,
    pairings: [],
    battles: [],
    winners: [],
  };
  prepareAi(match);
  match.pairings =
    config.mode === "versus"
      ? pairPlayers(
          players.map((_, i) => i),
          1,
        )
      : [];
  return match;
}
function validLocation(value: unknown): value is UnitLocation {
  if (!value || typeof value !== "object") return false;
  const loc = value as UnitLocation;
  return (
    ["board", "bench"].includes(loc.zone) &&
    Number.isInteger(loc.index) &&
    loc.index >= 0 &&
    loc.index < (loc.zone === "board" ? 24 : 8)
  );
}
export function act(engine: AutoChessEngine, action: PrepAction): boolean {
  const before = JSON.stringify(engine.getSimulationSnapshot());
  if (
    action.kind === "buy" &&
    Number.isInteger(action.index) &&
    action.index >= 0 &&
    action.index < 5
  ) engine.buyShopUnit(action.index);
  else if (
    action.kind === "move" &&
    validLocation(action.from) &&
    validLocation(action.to)
  ) engine.moveUnit(action.from, action.to.zone, action.to.index);
  else if (action.kind === "sell" && validLocation(action.location)) engine.sellUnit(action.location.zone, action.location.index);
  else if (
    action.kind === "forge" &&
    (action.location === undefined || validLocation(action.location))
  ) engine.useStarForge(action.location);
  else if (action.kind === "reroll") engine.rerollShop();
  else if (action.kind === "lock") engine.toggleShopLock();
  else if (action.kind === "level") engine.buyExperience();
  else if (action.kind === "arrange") engine.autoArrangeBoard();
  else return false;
  engine.state.toast = null;
  return JSON.stringify(engine.getSimulationSnapshot()) !== before;
}
function prepareAi(match: Match) {
  match.players.forEach((player) => {
    if (!player.ai || player.hp <= 0) return;
    const e = engineFor(player.snapshot);
    // Spend only earned gold; seek merges, fill population, then grow the board.
    for (let pass = 0; pass < 6; pass++) {
      if (
        e.boardCount >= e.boardCap &&
        e.upgradeCost !== null &&
        e.state.gold >= e.upgradeCost + 3
      ) e.buyExperience();
      const owned = [...e.state.board, ...e.state.bench].filter(
        (u): u is OwnedUnit => Boolean(u),
      );
      const offers = e.state.shop
        .map((id, index) => ({ id, index }))
        .filter((o) => o.id)
        .sort(
          (a, b) => owned.filter((u) => u.id === b.id && u.star === 1).length -
            owned.filter((u) => u.id === a.id && u.star === 1).length,
        );
      offers.forEach(({ id, index }) => {
        if (
          id &&
          e.state.gold >= UNIT_DEFS[id].cost &&
          (e.boardCount < e.boardCap ||
            owned.some((u) => u.id === id && u.star === 1))
        ) e.buyShopUnit(index);
      });
      if (e.state.gold < 5) break;
      e.rerollShop();
    }
    e.autoArrangeBoard();
    e.state.toast = null;
    player.snapshot = e.getSimulationSnapshot();
  });
}
function fightersFor(player: MatchPlayer): Fighter[] {
  const e = engineFor(player.snapshot);
  e.startMatchBattle();
  return e.state.battle!.player;
}
function mirror(fighters: Fighter[]): Fighter[] {
  return structuredClone(fighters).map((f, i) => ({
    ...f,
    fid: `e-${i + 1}`,
    team: "enemy" as const,
    x: BATTLE_BOUNDS.left + BATTLE_BOUNDS.right - f.x,
    facingX: -1,
    attackTargetX: BATTLE_BOUNDS.left + BATTLE_BOUNDS.right - f.x,
    jumpFromX: BATTLE_BOUNDS.left + BATTLE_BOUNDS.right - f.x,
    jumpToX: BATTLE_BOUNDS.left + BATTLE_BOUNDS.right - f.x,
  }));
}
/** Rescue preserves health, energy, shields and consumed extra lives; transient arena effects reset. */
function rescueFighters(
  survivors: Fighter[],
  originals: Fighter[],
  team: "player" | "enemy",
): Fighter[] {
  return survivors
    .filter((f) => f.alive && f.hp > 0)
    .map((f, i) => {
      const fresh = structuredClone(
        originals.find((o) => o.fid === f.fid) || f,
      );
      const pos = playerFormationPosition(i % 24);
      fresh.fid = `${team === "player" ? "p" : "e"}-${i + 1}`;
      fresh.team = team;
      fresh.x =
        team === "player"
          ? pos.x
          : BATTLE_BOUNDS.left + BATTLE_BOUNDS.right - pos.x;
      fresh.y = pos.y;
      fresh.hp = f.hp;
      fresh.maxHp = f.maxHp;
      fresh.energy = f.energy;
      fresh.shield = f.shield;
      fresh.shieldPeak = f.shieldPeak;
      fresh.abilityShield = f.abilityShield;
      fresh.abilityShieldPeak = f.abilityShieldPeak;
      fresh.abilityShieldTime = f.abilityShieldTime;
      fresh.reborn = f.reborn;
      fresh.reiRevival = f.reiRevival;
      fresh.secondWindUsed = f.secondWindUsed;
      fresh.targetFid = null;
      fresh.attackTargetX = fresh.x;
      fresh.attackTargetY = fresh.y;
      fresh.jumpFromX = fresh.x;
      fresh.jumpToX = fresh.x;
      fresh.jumpFromY = fresh.y;
      fresh.jumpToY = fresh.y;
      fresh.facingX = team === "player" ? 1 : -1;
      return fresh;
    });
}
export function replayEngine(recipe: Recipe, visuals = false): AutoChessEngine {
  const e = new AutoChessEngine(recipe.seed, {
    telemetry: visuals,
    visualEffects: visuals,
  });
  e.state.round = recipe.round;
  e.startMatchBattle(recipe.player, recipe.enemy);
  return e;
}
export function simulate(recipe: Recipe) {
  const e = replayEngine(recipe);
  for (let step = 0; e.state.phase === "battle" && step < 1800; step++) e.update(1 / 60);
  if (e.state.phase === "battle") throw new Error("战斗结算超时");
  return { won: e.state.result!.won, battle: e.state.battle! };
}
export function settleRound(input: Match, now = Date.now()): Match {
  if (input.phase !== "preparation") return input;
  const m = structuredClone(input);
  const alive = m.players.flatMap((p, i) => (p.hp > 0 ? [i] : []));
  const damage = m.players.map(() => 0);
  m.battles = [];
  m.players.forEach((p) => {
    p.revision++;
    p.report =
      p.hp > 0
        ? {
            damage: 0,
            income: 0,
            defended: false,
            rescuedBy: null,
            helped: null,
          }
        : null;
  });
  const run = (
    a: number,
    b: number | null,
    ghost: boolean,
    recipe: Recipe,
    rescueFor: number | null = null,
  ) => {
    const result = simulate(recipe);
    // Defense requires clearing every enemy, including at the combat time limit.
    if (m.mode === "coop") result.won = !result.battle.enemy.some((f) => f.alive && f.hp > 0);
    m.battles.push({
      a,
      b,
      ghost,
      recipe,
      rescueFor,
      won: result.won,
      remaining: result.battle.enemy.filter((f) => f.alive).length,
      elapsed: result.battle.elapsed,
    });
    return result;
  };
  if (m.mode === "versus") {
    m.pairings.forEach(({ a, b, ghost }, index) => {
      const recipe = {
        seed: (m.seed + m.round * 997 + index) % 4294967296,
        round: m.round,
        player: fightersFor(m.players[a]),
        enemy: mirror(fightersFor(m.players[b])),
      };
      const result = run(a, b, ghost, recipe);
      const loser = result.won ? b : a;
      const survivors = (
        result.won ? result.battle.player : result.battle.enemy
      ).filter((f) => f.alive);
      if (!(ghost && result.won)) damage[loser] =
          Math.max(
            1,
            survivors.reduce((sum, f) => sum + f.star, 0),
          ) + Math.floor((m.round - 1) / 5);
      m.players[a].report!.defended = result.won;
      if (!ghost) m.players[b].report!.defended = !result.won;
    });
  } else {
    const defenses = alive.map((seat, index) => {
      const e = engineFor(m.players[seat].snapshot);
      e.state.enemySeed = m.seed;
      e.startMatchBattle();
      const recipe: Recipe = {
        seed: (m.seed + m.round * 997 + index) % 4294967296,
        round: m.round,
        player: e.state.battle!.player,
        enemy: e.state.battle!.enemy,
      };
      const result = run(seat, null, false, recipe);
      m.players[seat].report!.defended = result.won;
      return { seat, recipe, ...result };
    });
    const helpers = defenses.filter(
      (d) => d.won && d.battle.player.some((f) => f.alive),
    );
    const leaks = defenses.filter((d) => !d.won);
    // Rotate priority so a crowded rescue round does not always favor the host.
    leaks.sort(
      (a, b) => ((a.seat + m.round) % m.players.length) -
        ((b.seat + m.round) % m.players.length),
    );
    leaks.forEach((leak) => {
      let remaining = leak.battle.enemy.filter((f) => f.alive);
      const helper = helpers.shift();
      if (helper) {
        const recipe = {
          seed: (m.seed + m.round * 1999 + leak.seat) % 4294967296,
          round: m.round,
          player: rescueFighters(
            helper.battle.player,
            helper.recipe.player,
            "player",
          ),
          enemy: rescueFighters(remaining, leak.recipe.enemy, "enemy"),
        };
        const rescue = run(helper.seat, null, false, recipe, leak.seat);
        m.players[helper.seat].report!.helped = leak.seat;
        m.players[leak.seat].report!.rescuedBy = helper.seat;
        remaining = rescue.won
          ? []
          : rescue.battle.enemy.filter((f) => f.alive);
      }
      damage[leak.seat] = remaining.reduce((sum, f) => sum + f.star, 0);
    });
  }
  alive.forEach((seat) => {
    const p = m.players[seat];
    const e = engineFor(p.snapshot);
    const income =
      7 +
      e.interestIncome +
      (p.report!.defended ? 1 : 0) +
      e.financeIncomeBonus;
    p.hp = Math.max(0, p.hp - damage[seat]);
    p.report!.damage = damage[seat];
    p.report!.income = income;
    p.previous = structuredClone(e.state.board);
    e.state.gold += income;
    e.state.hp = p.hp;
    p.snapshot = e.getSimulationSnapshot();
    p.acknowledged = p.ai || p.hp <= 0;
    if (p.hp <= 0) p.eliminatedRound = m.round;
  });
  const living = m.players.flatMap((p, i) => (p.hp > 0 ? [i] : []));
  const finished =
    m.mode === "coop"
      ? living.length === 0 || m.round >= COOP_ROUNDS
      : living.length <= 1 || m.round >= MAX_VERSUS_ROUNDS;
  m.phase = finished ? "finished" : "review";
  m.timeline = makeTimeline(
    m.battles,
    now,
    input.players.map((p) => ({ hp: p.hp, gold: p.snapshot.state.gold })),
  );
  m.deadline = m.timeline.endsAt;
  if (finished) m.winners =
      m.mode === "coop"
        ? living.length
          ? m.players.map((_, i) => i)
          : []
        : living.filter(
            (i) => m.players[i].hp === Math.max(...m.players.map((p) => p.hp)),
          );
  return m;
}
export function nextRound(input: Match, now = Date.now()): Match {
  if (input.phase !== "review") return input;
  const m = structuredClone(input);
  m.round++;
  m.phase = "preparation";
  delete m.timeline;
  m.deadline = now + m.prepSeconds * 1000;
  m.players.forEach((p) => {
    p.revision++;
    p.ready = p.ai || p.hp <= 0;
    p.acknowledged = false;
    if (p.hp <= 0) return;
    const e = engineFor(p.snapshot);
    e.prepareMatchRound();
    e.state.toast = null;
    p.snapshot = e.getSimulationSnapshot();
  });
  prepareAi(m);
  m.pairings =
    m.mode === "versus"
      ? pairPlayers(
          m.players.flatMap((p, i) => (p.hp > 0 ? [i] : [])),
          m.round,
        )
      : [];
  return m;
}
export function tickMatch(m: Match, now = Date.now()): Match {
  // Old saved rooms adopt the same automatic timeline when first resumed.
  if (m.phase !== "preparation" && !m.timeline) {
    const next = structuredClone(m);
    next.timeline = makeTimeline(
      next.battles,
      now,
      next.players.map((p) => ({
        hp: p.hp + (p.report?.damage || 0),
        gold: p.snapshot.state.gold - (p.report?.income || 0),
      })),
    );
    next.deadline = next.timeline.endsAt;
    return next;
  }
  if (
    m.phase === "preparation" &&
    (now >= m.deadline || m.players.every((p) => p.hp <= 0 || p.ready))
  ) return settleRound(m, now);
  if (m.phase === "review" && now >= m.deadline) return nextRound(m, now);
  return m;
}
