# Repository Instructions

## Build and lint gate

- Keep Next.js ESLint checks enabled during `next build`; do not use
  `eslint.ignoreDuringBuilds` to bypass errors.
- While editing, run `pnpm exec eslint <changed-files>` for fast feedback.
- Before committing source changes, run `pnpm run check` and then `pnpm run build`
  sequentially. `pnpm run check` runs the full lint and TypeScript checks.
- Do not run `tsc` in parallel with `next build`: both read and write
  `.next/types`, which can produce false missing-file errors.

## Autochess visual testing

- Read `progress.md` before changing or debugging the autochess game.
- The game uses Phaser with `Phaser.AUTO`, which normally selects WebGL. The shared
  `web_game_playwright_client.js` launches bundled headless Chromium with forced
  ANGLE/SwiftShader and can intermittently capture a completely black WebGL
  surface even while the game is running correctly.
- A known failed capture was exactly 1280x678 and every pixel was opaque
  `#000000`. Its height matched the default 720px Playwright viewport minus the
  game's 42px toolbar, proving that Playwright selected the correct canvas but
  failed to capture its GPU surface. Do not interpret this artifact as a blank
  game or as a screenshot of the Codex UI.
- For autochess visual testing, do not run the shared
  `web_game_playwright_client.js`, even when a generic skill normally requires
  it. The repository owner explicitly overrides that generic step because it
  predictably wastes time on known black WebGL captures.
- Start with the project flow in `verify-autochess.cjs` on the first browser
  attempt: launch the installed Chrome channel and capture with
  `page.screenshot()`. If headless capture is suspect, rerun in headed Chrome.
- When a focused interaction is not covered by `verify-autochess.cjs`, extend or
  create a repository-local script that still uses the installed Chrome channel,
  or use the available Browser/Chrome control tool. Do not fall back to the
  shared headless SwiftShader client.
- Do not rely on `canvas.toDataURL()` or `canvas.screenshot()` as the only
  evidence for this WebGL game. Do not enable `preserveDrawingBuffer` merely to
  make tests pass; it adds runtime cost to the game.
- Add or perform a screenshot sanity check. Reject a capture that is uniform,
  fully transparent, or overwhelmingly near-black, then retry with system
  Chrome and a full-page screenshot.
- Do not deliberately generate a known black screenshot merely to confirm this
  documented capture bug.
- Always cross-check screenshots against `window.render_game_to_text()`, canvas
  dimensions, page DOM, and console/page errors. If state advances normally but
  the image is uniformly black, classify it as a capture-path failure first.
- Confirm the target dev-server URL responds before launching Playwright. Old
  listening Node processes may be stale even though their port still appears
  open.
- Open and visually inspect every screenshot used as test evidence.
