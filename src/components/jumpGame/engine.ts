export const WIDTH = 800;
export const HEIGHT = 600;
export const START_Y = 550;
export const GRAVITY = 1000;
export const JUMP_SPEED = 600;
export const MOVE_SPEED = 300;
export const RECORD_KEY = "sui-jump.records.v1";
export type Phase = "ready" | "playing" | "paused" | "over";
export interface Platform {
  id: number;
  x: number;
  y: number;
  width: number;
}
export interface Input {
  left: boolean;
  right: boolean;
  jump: boolean;
  dash: boolean;
}
export const emptyInput = (): Input => ({
  left: false,
  right: false,
  jump: false,
  dash: false,
});
export interface JumpState {
  seed: number;
  random: number;
  phase: Phase;
  elapsed: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  facing: number;
  grounded: boolean;
  coyote: number;
  jumpBuffer: number;
  jumpHeld: boolean;
  dashHeld: boolean;
  dashTime: number;
  cooldown: number;
  camera: number;
  highest: number;
  floor: number;
  platforms: Platform[];
}
const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));
function random(state: JumpState) {
  state.random = (state.random * 1664525 + 1013904223) % 4294967296;
  return state.random / 4294967296;
}
export function appendPlatform(state: JumpState) {
  const previous = state.platforms[state.platforms.length - 1];
  const difficulty = Math.min(1, previous.id / 80);
  // Every next centre is reachable by an ordinary jump; dash is optional.
  const width = 150 - difficulty * 44 + random(state) * 20;
  const gap = 100 + difficulty * 20 + random(state) * 25;
  const x = clamp(
    previous.x + (random(state) * 2 - 1) * (130 + difficulty * 35),
    80,
    WIDTH - 80,
  );
  state.platforms.push({ id: previous.id + 1, x, y: previous.y - gap, width });
}
export function createJump(seed = 1): JumpState {
  const state: JumpState = {
    seed,
    random: seed,
    phase: "ready",
    elapsed: 0,
    x: 400,
    y: START_Y,
    vx: 0,
    vy: 0,
    facing: 1,
    grounded: true,
    coyote: 0.1,
    jumpBuffer: 0,
    jumpHeld: false,
    dashHeld: false,
    dashTime: 0,
    cooldown: 0,
    camera: 0,
    highest: START_Y,
    floor: 0,
    platforms: [{ id: 0, x: 400, y: START_Y, width: 360 }],
  };
  while (state.platforms[state.platforms.length - 1].y > -240) appendPlatform(state);
  return state;
}
export const heightScore = (state: JumpState) => Math.max(0, Math.floor((START_Y - state.highest) / 10));
export function pauseJump(state: JumpState) {
  if (state.phase !== "playing") return;
  state.phase = "paused";
  state.jumpHeld = false;
  state.dashHeld = false;
  state.jumpBuffer = 0;
}
// Fixed 120 Hz integration, including swept one-way landing tests.
export function stepJump(state: JumpState, input: Input, dt: number) {
  if (state.phase !== "playing" || !Number.isFinite(dt) || dt <= 0) return;
  const delta = Math.min(dt, 1 / 120);
  state.elapsed += delta;
  state.cooldown = Math.max(0, state.cooldown - delta);
  state.jumpBuffer = Math.max(0, state.jumpBuffer - delta);
  state.coyote = state.grounded ? 0.1 : Math.max(0, state.coyote - delta);
  if (input.jump && !state.jumpHeld) state.jumpBuffer = 0.12;
  const dashPressed = input.dash && !state.dashHeld;
  state.jumpHeld = input.jump;
  state.dashHeld = input.dash;
  const direction = Number(input.right) - Number(input.left);
  if (direction && state.dashTime <= 0) state.facing = direction;
  if (state.jumpBuffer > 0 && state.coyote > 0) {
    state.vy = -JUMP_SPEED;
    state.grounded = false;
    state.coyote = 0;
    state.jumpBuffer = 0;
  }
  if (dashPressed && state.cooldown <= 0) {
    state.dashTime = 0.18;
    state.cooldown = 1;
    state.vy = Math.min(state.vy, -120);
    state.grounded = false;
    state.coyote = 0;
  }
  const oldX = state.x;
  const oldY = state.y;
  state.vx = state.dashTime > 0 ? state.facing * 1000 : direction * MOVE_SPEED;
  if (state.dashTime > 0) state.dashTime = Math.max(0, state.dashTime - delta);
  else state.vy += GRAVITY * delta;
  state.x = clamp(state.x + state.vx * delta, 22, WIDTH - 22);
  if (state.x === 22 || state.x === WIDTH - 22) state.vx = 0;
  state.y += state.vy * delta;
  state.grounded = false;
  if (state.vy >= 0) {
    const crossed = state.platforms
      .filter((platform) => oldY <= platform.y + 0.01 && state.y >= platform.y)
      .sort((a, b) => a.y - b.y);
    for (const platform of crossed) {
      const time =
        state.y === oldY ? 1 : (platform.y - oldY) / (state.y - oldY);
      const landingX = oldX + (state.x - oldX) * time;
      if (Math.abs(landingX - platform.x) < platform.width / 2 + 20) {
        state.y = platform.y;
        state.vy = 0;
        state.grounded = true;
        state.floor = Math.max(state.floor, platform.id);
        break;
      }
    }
  }
  state.highest = Math.min(state.highest, state.y);
  state.camera = Math.min(state.camera, state.y - 260);
  while (state.platforms[state.platforms.length - 1].y > state.camera - 240) appendPlatform(state);
  state.platforms = state.platforms.filter(
    (platform) => platform.y <= state.camera + HEIGHT + 140,
  );
  if (state.y > state.camera + HEIGHT + 80) state.phase = "over";
}
export interface JumpRecord {
  height: number;
  floor: number;
  runs: number;
}
export function readRecord(raw: string | null): JumpRecord {
  try {
    const value = JSON.parse(raw || "null");
    if (
      value &&
      ["height", "floor", "runs"].every(
        (key) => Number.isSafeInteger(value[key]) && value[key] >= 0,
      )
    ) {
      return { height: value.height, floor: value.floor, runs: value.runs };
    }
  } catch {
    /* A damaged record should not prevent play. */
  }
  return { height: 0, floor: 0, runs: 0 };
}
