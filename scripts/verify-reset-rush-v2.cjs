// Compatibility entry point: the current gameplay and save-migration checks live in v3.
process.env.RESET_SKIP_SEASON ??= '1';
require('./verify-reset-rush-v3.cjs');
