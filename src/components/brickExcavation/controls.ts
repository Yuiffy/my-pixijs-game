/** Choose a nearby legal brick after the focused group has been removed. */
export function nearestPlayable(sizes: readonly number[], cols: number, origin: number): number | null {
  let best: number | null = null;
  let distance = Infinity;
  sizes.forEach((size, index) => {
    if (size < 2) return;
    const next = Math.abs((index % cols) - (origin % cols))
      + Math.abs(Math.floor(index / cols) - Math.floor(origin / cols));
    if (next < distance) { best = index; distance = next; }
  });
  return best;
}

export function navigatePlayable(sizes: readonly number[], cols: number, origin: number, key: string): number | null {
  const legal = sizes.flatMap((size, index) => (size >= 2 ? [index] : []));
  if (!legal.length) return null;
  if (key === "Home") return legal[0];
  if (key === "End") return legal[legal.length - 1];
  if (key === "ArrowRight") return legal.find(index => index > origin) ?? legal[0];
  if (key === "ArrowLeft") return [...legal].reverse().find(index => index < origin) ?? legal[legal.length - 1];
  if (key !== "ArrowUp" && key !== "ArrowDown") return null;
  const row = Math.floor(origin / cols);
  const direction = key === "ArrowUp" ? -1 : 1;
  // Preserve the nearest column in the next playable row, skipping empty rows.
  for (let nextRow = row + direction; nextRow >= 0 && nextRow < Math.ceil(sizes.length / cols); nextRow += direction) {
    const candidates = legal.filter(index => Math.floor(index / cols) === nextRow);
    if (candidates.length) return candidates.reduce((best, index) => {
      const distance = Math.abs((index % cols) - (origin % cols));
      const bestDistance = Math.abs((best % cols) - (origin % cols));
      return distance < bestDistance ? index : best;
    });
  }
  return origin;
}
