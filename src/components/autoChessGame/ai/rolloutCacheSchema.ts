// Bump this only when combat rollout placement, branching, or scoring semantics change.
export const AUTOPILOT_ROLLOUT_CACHE_SCHEMA = "combat-v2";

// Go uses canonical placements and public common-random-number branches.
// v5 keeps the full candidate in the key while all candidates in a context
// share a random panel derived only from the enemy, wave, version, and branch.
export const GO_ROLLOUT_CACHE_SCHEMA = "combat-go-v5";
