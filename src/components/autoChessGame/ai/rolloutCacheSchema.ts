// Bump this only when combat rollout placement, branching, or scoring semantics change.
export const AUTOPILOT_ROLLOUT_CACHE_SCHEMA = "combat-v1";

// Go uses canonical placements and public common-random-number branches.
// v4 restores the public combat seed after AutoChessEngine construction, whose
// title-screen starter offer consumes three RNG samples.
export const GO_ROLLOUT_CACHE_SCHEMA = "combat-go-v4";
