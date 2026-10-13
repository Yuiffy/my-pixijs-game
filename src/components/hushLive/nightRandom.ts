/** Independent streams prevent meal, arrival and chores from being coupled to seed parity. */
export function nightRoll(seed: number, stream: number) {
  /* eslint-disable no-bitwise -- Explicit uint32 avalanche for reproducible independent streams. */
  let x = (seed ^ Math.imul(stream, 0x9e3779b9)) >>> 0;
  x = Math.imul(x ^ (x >>> 16), 0x21f0aaad);
  x = Math.imul(x ^ (x >>> 15), 0x735a2d97);
  return ((x ^ (x >>> 15)) >>> 0) / 4294967296;
  /* eslint-enable no-bitwise */
}
