# Repository Instructions

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
- Run the required shared web-game client when the applicable skill requires it,
  but do not use a black/transparent canvas result as final visual evidence.
- For reliable visual evidence, prefer the project flow in
  `verify-autochess.cjs`: launch the installed Chrome channel and capture with
  `page.screenshot()`. If headless capture is suspect, rerun in headed Chrome.
- Do not rely on `canvas.toDataURL()` or `canvas.screenshot()` as the only
  evidence for this WebGL game. Do not enable `preserveDrawingBuffer` merely to
  make tests pass; it adds runtime cost to the game.
- Add or perform a screenshot sanity check. Reject a capture that is uniform,
  fully transparent, or overwhelmingly near-black, then retry with system
  Chrome and a full-page screenshot.
- Always cross-check screenshots against `window.render_game_to_text()`, canvas
  dimensions, page DOM, and console/page errors. If state advances normally but
  the image is uniformly black, classify it as a capture-path failure first.
- Confirm the target dev-server URL responds before launching Playwright. Old
  listening Node processes may be stale even though their port still appears
  open.
- Open and visually inspect every screenshot used as test evidence.
