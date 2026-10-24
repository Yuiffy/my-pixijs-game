// Ordinary camera turns use multiple relative mouse samples. Keep large
// screen-sized single events reserved for the anomalous-input regression.
exports.mouseLook = (page, x, y = 0) => page.evaluate(({ x, y }) => {
  // Aiming helpers request the same angle regardless of the player's setting.
  const sensitivity = JSON.parse(window.render_game_to_text()).controls.sensitivity ?? 1;
  x /= sensitivity; y /= sensitivity;
  const count = Math.max(1, Math.ceil(Math.max(Math.abs(x), Math.abs(y)) / 80));
  for (let i = 0; i < count; i++) {
    document.dispatchEvent(new MouseEvent('mousemove', {
      movementX: Math.round(x * (i + 1) / count) - Math.round(x * i / count),
      movementY: Math.round(y * (i + 1) / count) - Math.round(y * i / count),
    }));
  }
}, { x, y });
