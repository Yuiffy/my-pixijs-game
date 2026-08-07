export interface RandomSource {
  next: () => number;
  pick: <T>(items: T[]) => T;
  snapshot: () => number;
  restore: (state: number) => void;
}

export const createSeededRandom = (seed: number): RandomSource => {
  let value = Math.abs(Math.trunc(seed)) % 4294967296 || 1831565813;
  const next = () => {
    value = (value * 1664525 + 1013904223) % 4294967296;
    return value / 4294967296;
  };
  return {
    next,
    pick: <T>(items: T[]) => items[Math.floor(next() * items.length)],
    snapshot: () => value,
    restore: (state: number) => {
      value = Math.abs(Math.trunc(state)) % 4294967296;
    },
  };
};

export const freshSeed = () => Math.floor((Date.now() + Math.random() * 2147483647) % 4294967296);
