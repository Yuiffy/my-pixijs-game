import { dailyModal } from "./daily";
import {
  action,
  CHARGER_TRAY,
  partnerPose,
  partnerBehavior,
  createGame,
  emptyInput,
  Game,
  Save,
  SPOTS,
  Spot,
  step,
  togglePause,
  travel,
} from "./engine";
import { SCALE, worldPoint } from "./navigation";

export const AIM_POINTS: Record<
  Spot,
  { x: number; y: number; height: number }
> = {
  charging: CHARGER_TRAY,
  kitchen: { x: 420, y: 155, height: 1.0 },
  bed: { x: 710, y: 425, height: 0.7 },
  sofa: { x: 220, y: 325, height: 0.66 },
  shelf: { x: 826, y: 477, height: 0.66 },
  entry: { x: 97, y: 465, height: 0.82 },
  partner: { x: 744, y: 287, height: 1.31 },
  table: { x: 665, y: 235, height: 0.85 },
  desk: { x: 230, y: 150, height: 1.05 },
  door: { x: 520, y: 410, height: 1.27 },
};
export type Runtime3D = {
  tracking: { yaw: number; pitch: number; roll: number; mouth: number; blink: number; stand: number; chairYaw: number; avatarYaw: number; avatarMouth: number; avatarBlink: number; avatarUpdates: number };
  game: Game;
  save: Save;
  yaw: number;
  pitch: number;
  focus: Spot | null;
  keys: Set<string>;
  stick: { x: number; y: number };
  held: boolean;
  pressed: boolean;
  pointerLocked: boolean;
  manual: boolean;
  assist: Spot | null;
  autoLook: boolean;
  webglReady: boolean;
  probe?: () => void;
  elapsedFrame: number;
  fps: number;
  renderer: {
    type: string;
    calls: number;
    triangles: number;
    width: number;
    height: number;
  };
};
export const createRuntime = (save: Save): Runtime3D => ({
  tracking: { yaw: Math.PI, pitch: 0, roll: 0, mouth: 0, blink: 1, stand: 0, chairYaw: Math.PI, avatarYaw: 0, avatarMouth: 0, avatarBlink: 1, avatarUpdates: 0 },
  game: createGame(),
  save,
  yaw: -1.25,
  pitch: -0.04,
  focus: null,
  keys: new Set(),
  stick: { x: 0, y: 0 },
  held: false,
  pressed: false,
  pointerLocked: false,
  manual: false,
  assist: null,
  autoLook: false,
  webglReady: false,
  elapsedFrame: 0,
  fps: 60,
  renderer: { type: "loading", calls: 0, triangles: 0, width: 0, height: 0 },
});
export function lookPoint(r: Runtime3D, spot: Spot) {
  const point =
    spot === "partner"
      ? {
          ...partnerPose(r.game),
          height: 1.31 + partnerPose(r.game).stand * 0.22,
        }
      : spot === "door" && !r.game.doorClosed
        ? { x: 555, y: 371, height: 1.27 }
        : AIM_POINTS[spot];
  const [x, z] = worldPoint(point);
  return { x, y: point.height, z };
}
export function clearControls(r: Runtime3D) {
  r.keys.clear();
  r.stick = { x: 0, y: 0 };
  r.held = false;
  r.pressed = false;
  r.assist = null;
  r.autoLook = false;
  r.game.path = [];
}
export function pause3D(r: Runtime3D) {
  if (r.game.phase === "playing") togglePause(r.game);
  clearControls(r);
}
export function go3D(r: Runtime3D, spot: Spot) {
  if (r.game.phase !== "playing" || r.game.delta?.active || dailyModal(r.game) || r.game.busy) return;
  r.held = false;
  r.pressed = false;
  r.keys.clear();
  r.stick = { x: 0, y: 0 };
  r.assist = spot;
  r.autoLook = true;
  travel(r.game, spot);
}
export function rotateView(r: Runtime3D, dx: number, dy: number) {
  if (r.game.phase !== "playing" || r.game.delta?.active || dailyModal(r.game) || r.game.busy) return;
  r.yaw -= dx * 0.0025;
  r.pitch = Math.max(-1.1, Math.min(1.05, r.pitch - dy * 0.0025));
  r.autoLook = false;
}
export function advance3D(r: Runtime3D, seconds: number) {
  if (r.game.phase !== "playing" || !Number.isFinite(seconds) || seconds < 0) return;
  for (
    let left = seconds;
    left > 0.000001 && r.game.phase === "playing";
    left -= 0.025
  ) {
    const dt = Math.min(left, 0.025);
    if (r.game.delta?.active || dailyModal(r.game)) {
      step(r.game, dt, emptyInput());
      r.elapsedFrame += dt;
      continue;
    }
    const k = r.keys;
    const forward =
      Number(k.has("w") || k.has("arrowup")) -
      Number(k.has("s") || k.has("arrowdown")) +
      r.stick.y;
    const strafe = Number(k.has("d")) - Number(k.has("a")) + r.stick.x;
    const turn = Number(k.has("arrowleft")) - Number(k.has("arrowright"));
    if (forward || strafe || turn) {
      r.autoLook = false;
      r.assist = null;
      r.game.path = [];
    }
    r.yaw += turn * dt * 1.7;
    if (r.autoLook && r.assist) {
      const [x, z] = worldPoint(r.game.player);
      const point = r.game.path.length ? r.game.path[0] : null;
      const target = point
        ? { x: (point.x - 480) / SCALE, z: (point.y - 320) / SCALE, y: 1.52 }
        : lookPoint(r, r.assist);
      const desired = Math.atan2(-(target.x - x), -(target.z - z));
      const difference = Math.atan2(
        Math.sin(desired - r.yaw),
        Math.cos(desired - r.yaw),
      );
      const blend = 1 - Math.exp(-dt * 9);
      r.yaw += difference * blend;
      const desiredPitch = Math.atan2(
        target.y - 1.55,
        Math.hypot(target.x - x, target.z - z),
      );
      r.pitch +=
        (Math.max(-1.1, Math.min(1.05, desiredPitch)) - r.pitch) * blend;
    }
    r.probe?.();
    step(r.game, dt, {
      ...emptyInput(),
      x: -Math.sin(r.yaw) * forward + Math.cos(r.yaw) * strafe,
      y: -Math.cos(r.yaw) * forward - Math.sin(r.yaw) * strafe,
      act: r.pressed || r.held || k.has("e"),
      sprint: k.has("shift"),
      focus: r.focus,
    });
    r.pressed = false;
    r.elapsedFrame += dt;
  }
  r.probe?.();
}
export function text3D(r: Runtime3D) {
  const [x, z] = worldPoint(r.game.player);
  return {
    ...r.game,
    view: "first-person-3d",
    world: { x, y: 1.55, z, units: "metres; +Y up, +X east, +Z south" },
    camera: { yaw: r.yaw, pitch: r.pitch },
    focus: r.focus,
    action: action(r.game, r.focus),
    spots: SPOTS,
    pointerLocked: r.pointerLocked,
    assistedWalk: r.assist,
    renderer: r.renderer,
    webglReady: r.webglReady,
    fps: Math.round(r.fps),
    progression: r.save,
    partner: { ...partnerPose(r.game), ...partnerBehavior(r.game) },
    tracking: { ...r.tracking },
  };
}
