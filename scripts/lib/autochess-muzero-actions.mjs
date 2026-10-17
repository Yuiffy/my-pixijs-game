// Round-sized actions: the normal autopilot still buys, positions and fights.
// These change economic tradeoffs only, never the thinking/information budgets.
export const MUZERO_ACTIONS = [
  { name: "normal", policy: {} },
  { name: "level", policy: { targetLevelRoundDivisor: 2, targetLevelRoundOffset: 3 } },
  { name: "bank", policy: { reserveCap: 20, reserveFloor: 8, reserveRoundScale: 1.3,
    healthyStabilizeRerollInterestTiersAtRisk: 0, levelInterestTiersAtRisk: 0 } },
  { name: "focused", policy: { maximumDryPaidRerolls: 3,
    healthyStabilizeMaximumDryPaidRerolls: 3, upgradeProjectLimit: 1 } },
  { name: "stabilize", policy: { reserveCap: 6, reserveFloor: 0, woundedReserve: 0,
    criticalReserve: 0, reserveRoundScale: 0.3 } },
];

export const roundPolicy = (base, action) => {
  if (!Number.isInteger(action) || !MUZERO_ACTIONS[action]) throw new Error("Invalid MuZero action");
  return { ...base, ...MUZERO_ACTIONS[action].policy };
};

const reserveFunctions = new WeakMap();
export const applyRoundDecision = (pilot, base, action) => {
  pilot.policy = roundPolicy(base, action);
  if (!reserveFunctions.has(pilot)) reserveFunctions.set(pilot, pilot.goldReserve.bind(pilot));
  const reserve = reserveFunctions.get(pilot);
  pilot.goldReserve = (population = false, risk = 0) => reserve(population,
    action === 4 ? Math.max(risk, 4) : action === 2 ? 0 : risk);
};
