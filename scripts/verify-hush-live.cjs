// Compatibility entry point for the first-person 3D game verifier.
require('./verify-hush-3d.cjs').run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
