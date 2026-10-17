// JSON-lines environment for the offline MuZero learner. No browser or audio.
import { createInterface } from "node:readline";
import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { loadTypescriptModule } from "./tests/helpers/load-typescript-module.mjs";
import { computeAutoChessRolloutSourceFingerprint } from "./lib/autochess-rollout-cache.mjs";
import { MUZERO_ACTIONS, applyRoundDecision } from "./lib/autochess-muzero-actions.mjs";

const { EngineBridge } = await loadTypescriptModule("src/components/autoChessGame/phaser/EngineBridge.ts");
const { AutoChessAutopilot } = await loadTypescriptModule("src/components/autoChessGame/ai/AutoChessAutopilot.ts");
const { SHOP_UNIT_IDS, UNIT_DEFS, STARTERS, AUGMENTS } = await loadTypescriptModule("src/components/autoChessGame/core/gameData.ts");
const behaviorHash = createHash("sha256");
behaviorHash.update((await computeAutoChessRolloutSourceFingerprint()).hash);
for (const file of (await readdir("src/components/autoChessGame/ai")).sort()) {
  if (/\.(ts|json)$/.test(file)) behaviorHash.update(await readFile(`src/components/autoChessGame/ai/${file}`));
}
for (const file of ["src/components/autoChessGame/phaser/EngineBridge.ts",
  "scripts/autochess-muzero-environment.mjs", "scripts/lib/autochess-muzero-actions.mjs"]) {
  behaviorHash.update(await readFile(file));
}
const fingerprint = behaviorHash.digest("hex");
const levels = ["novice", "veteran", "deep", "oracle"];
let bridge, pilot, basePolicy, now, level, limit, wins, steps, seed, cleared;

const observation = () => {
  const s = bridge.engine.state;
  const roster = [...s.board, ...s.bench].filter(Boolean);
  const wave = bridge.engine.currentWave;
  const scalars = [s.round / 32, s.hp / 20, s.gold / 100, s.playerLevel / 10,
    s.upgradeRemaining / 40, bridge.engine.boardCap / 10,
    s.board.filter(Boolean).length / 10, s.bench.filter(Boolean).length / 8,
    roster.filter(u => u.star === 2).length / 10,
    roster.filter(u => u.star === 3).length / 10,
    roster.filter(u => UNIT_DEFS[u.id].attackType === "melee").length / 10,
    (wave.modifier || 1), ...levels.map(l => Number(l === level))];
  // Only current, visible units/shop/enemy. No random state, seed or forecasts.
  return [...scalars, ...STARTERS.map(t => Number(s.starter === t.id)),
    ...AUGMENTS.map(t => Number(s.augments.includes(t.id))), ...SHOP_UNIT_IDS.flatMap(id => [
    roster.filter(u => u.id === id).reduce((n, u) => n + (u.star === 3 ? 9 : u.star === 2 ? 3 : 1), 0) / 9,
    s.shop.filter(u => (typeof u === "string" ? u : u?.id) === id).length / 5,
    wave.units.filter(u => u.id === id).reduce((n, u) => n + (u.star || 1), 0) / 9,
  ])].map(v => Math.max(-5, Math.min(5, v)));
};

const reset = (request) => {
  seed = request.seed;
  level = request.level || "novice";
  limit = request.battles || 32;
  if (!Number.isInteger(seed) || !levels.includes(level)) throw new Error("Invalid reset");
  bridge = new EngineBridge(seed, 1, { simulation: true, battleStepHz: 60 });
  bridge.setConsoleLogging(false);
  pilot = new AutoChessAutopilot(bridge, "evolution", {}, "balanced", "normal", 20,
    undefined, true, level, true);
  basePolicy = { ...pilot.policy };
  now = 1000; wins = 0; steps = 0; cleared = false;
  if (!pilot.startFromTitle()) throw new Error("Could not start game");
  return { observation: observation(), actions: MUZERO_ACTIONS.map(a => a.name),
    fingerprint, level, seed, done: false };
};

const step = ({ action }) => {
  if (!bridge || bridge.engine.state.phase !== "preparation") throw new Error("Not at round boundary");
  applyRoundDecision(pilot, basePolicy, action);
  const s = bridge.engine.state;
  const beforeHp = s.hp;
  const round = s.round;
  let ticks = 0;
  while (s.phase !== "battle" && s.phase !== "gameover" && ticks < 600) {
    now += 2400; pilot.tick(now); ticks += 1;
  }
  if (s.phase !== "battle") throw new Error(`Preparation did not reach battle: ${s.phase}`);
  bridge.skipBattle();
  const won = Boolean(s.result?.won);
  if (round === 16 && won) cleared = true;
  wins += Number(won); steps += 1;
  const hpLost = beforeHp - s.hp;
  const failed = bridge.engine.resultEndsRun || s.hp <= 0;
  const done = failed || round >= limit || s.phase === "gameover";
  const reward = (won ? 0.1 : 0) - hpLost * 0.025 + (done ? failed ? -0.2 : 0.2 : 0);
  if (!done) {
    // Let the same autopilot handle result/augment choices before the next action.
    for (let tick = 0; s.phase !== "preparation" && tick < 100; tick += 1) {
      now += 2400; pilot.tick(now);
    }
    if (s.phase !== "preparation") throw new Error(`Result stuck: ${s.phase}`);
  }
  return { observation: observation(), reward, done,
    info: { seed, level, round, hp: s.hp, gold: s.gold, wins, steps, ticks, won, cleared } };
};

for await (const line of createInterface({ input: process.stdin, crlfDelay: Infinity })) {
  try {
    const request = JSON.parse(line);
    if (request.command === "close") break;
    const reply = request.command === "reset" ? reset(request) : step(request);
    process.stdout.write(`${JSON.stringify(reply)}\n`);
  } catch (error) {
    process.stdout.write(`${JSON.stringify({ error: error.stack })}\n`);
  }
}
process.stdin.destroy();
