export const clamp = (value: number, min = 0, max = 100) => Math.max(min, Math.min(max, value));
export const round = (value: number) => (Math.round(value * 10) / 10) + 0;
export function random(seed: number): [number, number] {
  const next = (seed * 1664525 + 1013904223) % 4294967296;
  return [next, next / 4294967296];
}
export type Ending = { title: string; text: string; won: boolean };
export type Log = { turn: number; text: string };
export function log(state: { turn: number; logs: Log[] }, text: string) {
  state.logs = [{ turn: state.turn, text }, ...state.logs].slice(0, 16);
}
export const money = (value: number) => `${round(value).toLocaleString("zh-CN")} M`;
export function seedValue(value: string) {
  return Math.max(1, Math.min(999999, Math.floor(Number(value) || 2026)));
}
