import { FLOOR, HEIGHT, WIDTH } from "./engine";
import type { Fighter, Game } from "./engine";
import { FIGHTERS, getFighter } from "./roster";

type Frame = readonly [number, number, number, number];

interface CharacterAssets {
  volley: HTMLImageElement;
  combat: HTMLImageElement | null;
  combatFrames: Frame[];
  referenceHeight: number;
  volleyFrames: Frame[];
}

export interface Assets {
  beach: HTMLImageElement;
  characters: Record<string, CharacterAssets>;
  suiVictory: HTMLImageElement | null;
}

// The existing sports sprites have irregular alpha bounds, especially on jumps.
// Their individual crops also avoid fragments of the neighbouring atlas frame.
const VOLLEY_FRAMES: Record<string, Frame[]> = {
  sui: [
    [90, 2, 214, 540], [461, 5, 253, 521], [836, 5, 240, 523],
    [1183, 79, 303, 457], [50, 521, 292, 467], [438, 550, 325, 397],
    [846, 533, 246, 491], [1264, 590, 206, 427],
  ],
  shiori: [
    [87, 7, 196, 502], [472, 8, 234, 496], [838, 10, 234, 481],
    [1187, 74, 326, 433], [34, 492, 286, 522], [419, 546, 356, 407],
    [859, 514, 247, 510], [1253, 591, 214, 431],
  ],
};

const clamp = (n: number, a: number, b: number) => Math.max(a, Math.min(b, n));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const ease = (n: number) => { const t = clamp(n, 0, 1); return t * t * (3 - 2 * t); };
const TAU = Math.PI * 2;
const FONT = '"Microsoft YaHei", "PingFang SC", sans-serif';

function loadImage(path: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`无法加载游戏素材：${path}`));
    image.src = path;
  });
}

function readFrames(value: unknown): Frame[] | null {
  if (!Array.isArray(value) || value.length < 8) return null;
  if (!value.every(frame => Array.isArray(frame) && frame.length >= 4 && frame.slice(0, 4).every(Number.isFinite))) return null;
  return value.map(frame => [frame[0], frame[1], frame[2], frame[3]] as Frame);
}

function uniformFrames(image: HTMLImageElement): Frame[] {
  const w = image.naturalWidth / 4;
  const h = image.naturalHeight / 2;
  return Array.from({ length: 8 }, (_, i) => [(i % 4) * w, Math.floor(i / 4) * h, w, h] as Frame);
}

export async function loadAssets(): Promise<Assets> {
  const metadata: Record<string, unknown> = await fetch("/games/tidal-duel/frames.json")
    .then(response => (response.ok ? response.json() as Promise<Record<string, unknown>> : {}))
    .catch(() => ({} as Record<string, unknown>));
  const [beach, suiVictory, characters] = await Promise.all([
    loadImage("/games/beach-volley/beach.webp"),
    loadImage("/games/beach-volley/sui-victory.webp").catch(() => null),
    Promise.all(FIGHTERS.map(async character => {
      const volley = await loadImage(character.atlas);
      const combat = character.combatAtlas ? await loadImage(character.combatAtlas).catch(() => null) : null;
      const entry = metadata[character.id];
      const bounds = readFrames(entry) ?? readFrames((entry as { frames?: unknown } | undefined)?.frames);
      const referenceHeight = (entry as { referenceHeight?: number } | undefined)?.referenceHeight;
      return [character.id, {
        volley,
        combat,
        combatFrames: bounds ?? readFrames(character.combatFrames) ?? (combat ? uniformFrames(combat) : []),
        referenceHeight: referenceHeight ?? character.combatReferenceHeight ?? bounds?.[0][3] ?? 520,
        volleyFrames: readFrames(character.frames) ?? VOLLEY_FRAMES[character.id] ?? uniformFrames(volley),
      }] as const;
    })).then(entries => Object.fromEntries(entries)),
  ]);
  return { beach, suiVictory, characters };
}

function ellipse(ctx: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number, color: string | CanvasGradient) {
  ctx.beginPath();
  ctx.ellipse(x, y, Math.max(0.1, rx), Math.max(0.1, ry), 0, 0, TAU);
  ctx.fillStyle = color;
  ctx.fill();
}

function polygon(ctx: CanvasRenderingContext2D, points: number[][], color: string | CanvasGradient) {
  ctx.beginPath();
  points.forEach(([x, y], index) => { if (index) ctx.lineTo(x, y); else ctx.moveTo(x, y); });
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
}

function text(ctx: CanvasRenderingContext2D, value: string, x: number, y: number, size: number, color = "#fff9e9", align: CanvasTextAlign = "left", weight = 700) {
  ctx.font = `${weight} ${size}px ${FONT}`;
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.textBaseline = "alphabetic";
  ctx.fillText(value, x, y);
}

interface Camera { center: number; zoom: number; shakeX: number; shakeY: number }
interface Projected { x: number; y: number; scale: number }

function project(x: number, z: number, y: number, camera: Camera): Projected {
  const perspective = 1 + z * 0.05;
  return {
    x: WIDTH / 2 + (x - camera.center) * camera.zoom * perspective,
    y: FLOOR + z * 30 - (FLOOR - y) * camera.zoom,
    scale: perspective * camera.zoom,
  };
}

function drawBeach(ctx: CanvasRenderingContext2D, assets: Assets, time: number, camera: Camera, reduced: boolean) {
  const t = reduced ? 0 : time;
  // Background parallax is intentionally smaller than foreground camera travel.
  const shift = (camera.center - WIDTH / 2) * -0.055;
  const drift = reduced ? 0 : Math.sin(t * 0.17) * 2.5;
  ctx.drawImage(assets.beach, -18 + shift, -12 + drift, WIDTH + 36, HEIGHT + 24);
  const warmth = ctx.createLinearGradient(0, 0, WIDTH, HEIGHT);
  warmth.addColorStop(0, "rgba(255,226,178,.06)");
  warmth.addColorStop(0.66, "rgba(0,67,89,.02)");
  warmth.addColorStop(1, "rgba(217,154,82,.09)");
  ctx.fillStyle = warmth;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  ctx.save();
  // Foam advances on a separate, slow rhythm from the sparkling sea surface.
  for (let layer = 0; layer < 4; layer++) {
    ctx.beginPath();
    ctx.lineWidth = 0.9 + layer * 0.65;
    ctx.strokeStyle = `rgba(255,253,233,${0.15 + layer * 0.035})`;
    for (let x = -10; x <= WIDTH + 10; x += 9) {
      const y = 391 + layer * 6 + Math.sin(x * 0.014 + t * 0.55 + layer) * 3 + Math.sin(t * 0.65 + layer * 0.8) * 5;
      if (x === -10) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  for (let i = 0; i < 64; i++) {
    const x = (i * 117.37 + shift * 0.4) % WIDTH;
    const y = 292 + ((i * 31.3) % 100);
    const alpha = (Math.sin(t * 1.7 + i * 2.71) + 1) * 0.14;
    ctx.fillStyle = `rgba(255,255,232,${alpha})`;
    ctx.fillRect(x, y, 2 + (i % 5), 1);
  }
  ctx.strokeStyle = "rgba(33,77,92,.45)";
  ctx.lineWidth = 1.2;
  for (let i = 0; i < 3; i++) {
    const x = 871 + i * 39 + Math.sin(t * 0.08 + i) * 48;
    const y = 175 + i * 11;
    const flap = Math.sin(t * 2.2 + i) * 2;
    ctx.beginPath();
    ctx.moveTo(x - 5, y);
    ctx.quadraticCurveTo(x - 2.5, y - 3 + flap, x, y);
    ctx.quadraticCurveTo(x + 2.5, y - 3 + flap, x + 5, y);
    ctx.stroke();
  }
  const topShade = ctx.createLinearGradient(0, 0, 0, 180);
  topShade.addColorStop(0, "rgba(7,29,43,.61)");
  topShade.addColorStop(0.72, "rgba(9,40,48,.13)");
  topShade.addColorStop(1, "rgba(9,40,48,0)");
  ctx.fillStyle = topShade;
  ctx.fillRect(0, 0, WIDTH, 180);
  const bottomShade = ctx.createLinearGradient(0, HEIGHT - 115, 0, HEIGHT);
  bottomShade.addColorStop(0, "rgba(20,40,44,0)");
  bottomShade.addColorStop(1, "rgba(12,29,34,.52)");
  ctx.fillStyle = bottomShade;
  ctx.fillRect(0, HEIGHT - 115, WIDTH, 115);
  ctx.restore();
}

function drawArena(ctx: CanvasRenderingContext2D, camera: Camera, time: number, reduced: boolean) {
  const corners = [[75, -1.3], [1205, -1.3], [1205, 1.3], [75, 1.3]].map(([x, z]) => project(x, z, FLOOR, camera));
  ctx.save();
  ctx.beginPath();
  corners.forEach((point, index) => { if (index) ctx.lineTo(point.x, point.y); else ctx.moveTo(point.x, point.y); });
  ctx.closePath();
  const sand = ctx.createLinearGradient(0, 548, 0, 660);
  sand.addColorStop(0, "rgba(255,227,178,.1)");
  sand.addColorStop(1, "rgba(245,212,158,.17)");
  ctx.fillStyle = sand;
  ctx.fill();
  ctx.strokeStyle = "rgba(97,94,69,.17)";
  ctx.lineWidth = 6;
  ctx.stroke();
  ctx.strokeStyle = "rgba(255,247,219,.62)";
  ctx.lineWidth = 1.9;
  ctx.stroke();
  // An unobtrusive center marking gives depth movement a visual reference.
  const center = project(WIDTH / 2, 0, FLOOR, camera);
  ctx.strokeStyle = "rgba(255,247,217,.32)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.ellipse(center.x, center.y, 103 * camera.zoom, 26, 0, 0, TAU);
  ctx.stroke();
  const t = reduced ? 0 : time;
  for (let i = 0; i < 22; i++) {
    const x = (i * 93 + 51) % WIDTH;
    const y = 633 + ((i * 23) % 67);
    ctx.strokeStyle = `rgba(252,231,190,${0.07 + Math.sin(t * 0.18 + i) * 0.025})`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo(x + 8, y - 1, x + 20, y + 1);
    ctx.stroke();
  }
  ctx.restore();
}

interface Pose {
  index: number;
  sports: boolean;
  blend: number;
  lean: number;
  stretchX: number;
  stretchY: number;
  offsetX: number;
  offsetY: number;
}

function fighterPose(fighter: Fighter, time: number, reduced: boolean): Pose {
  const info = getFighter(fighter.character);
  const move = fighter.move ? info.moves[fighter.move] : null;
  const t = reduced ? 0 : time;
  const pose: Pose = { index: 0, sports: false, blend: 1, lean: 0, stretchX: 1, stretchY: 1, offsetX: 0, offsetY: 0 };
  if (fighter.state === "walk") {
    const step = Math.sin(t * 13);
    pose.index = step > 0 ? 1 : 2;
    pose.sports = true;
    pose.offsetY = -Math.abs(step) * 3;
    pose.lean = Math.sign(fighter.vx) * fighter.facing * 0.035;
  } else if (fighter.state === "jump") {
    pose.index = 4;
    pose.sports = true;
    pose.lean = -0.035;
  } else if (fighter.state === "crouch") {
    pose.index = 3;
    pose.stretchY = 0.86;
    pose.lean = 0.045;
  } else if (fighter.state === "guard") {
    pose.index = 4;
    pose.stretchX = 0.98;
    pose.stretchY = fighter.previous.crouch ? 0.84 : 1;
    pose.offsetY = 1;
    pose.lean = -0.025;
  } else if (fighter.state === "hold") {
    pose.index = 5;
    pose.lean = -0.035 + Math.sin(fighter.stateTime * 17) * 0.02;
    pose.blend = ease(fighter.stateTime / 0.05);
    pose.stretchY = fighter.holdHeight === "low" ? 0.83 : 1;
  } else if (fighter.state === "sidestep") {
    pose.index = 0;
    pose.offsetY = -Math.sin(clamp(fighter.stateTime / 0.24, 0, 1) * Math.PI) * 10;
    pose.lean = Math.sin(fighter.stateTime * 19) * 0.1;
    pose.stretchX = 0.9;
  } else if (fighter.state === "attack" && move) {
    const windup = ease(fighter.moveTime / Math.max(0.05, move.startup));
    const recover = fighter.moveTime > move.startup + move.active
      ? 1 - ease((fighter.moveTime - move.startup - move.active) / move.recovery)
      : 1;
    const impact = windup * recover;
    const kick = fighter.move?.toLowerCase().includes("kick") || fighter.move === "launcher";
    pose.index = move.height === "low" ? 3 : kick ? 2 : move.kind === "throw" ? 5 : 1;
    if (move.kind === "super") pose.index = fighter.character === "shiori" ? 2 : 5;
    pose.blend = impact;
    pose.offsetX = (kick ? 15 : 11) * impact - 3 * Math.sin(windup * Math.PI);
    pose.offsetY = move.height === "low" ? 2 : -Math.sin(windup * Math.PI) * 4;
    pose.lean = impact * (kick ? -0.022 : 0.065);
    pose.stretchX = 1 + impact * 0.025;
    pose.stretchY = 1 - Math.sin(windup * Math.PI) * 0.035;
  } else if (["hit", "critical", "launch"].includes(fighter.state)) {
    pose.index = 6;
    pose.lean = -(fighter.state === "launch" ? 0.34 : 0.07) - Math.sin(fighter.stateTime * 30) * 0.024;
    pose.offsetX = -4;
    pose.stretchY = 0.98;
    pose.blend = ease(fighter.stateTime / 0.025);
  } else if (["down", "defeat"].includes(fighter.state)) {
    pose.index = 7;
    pose.lean = 0;
  } else if (fighter.state === "wake") {
    pose.index = 7;
    pose.blend = 1 - ease(fighter.stateTime / 0.27);
  } else if (fighter.state === "victory") {
    pose.index = 6;
    pose.sports = true;
    pose.offsetY = reduced ? 0 : -Math.abs(Math.sin(t * 3.2)) * 5;
  } else {
    pose.offsetY = Math.sin(t * 2.7 + fighter.side * 1.8) * 1.2;
    pose.stretchY = 1 + Math.sin(t * 2.7 + fighter.side * 1.8) * 0.0035;
    pose.lean = Math.sin(t * 1.9 + fighter.side * 2.3) * 0.006;
  }
  return pose;
}

function drawSprite(
  ctx: CanvasRenderingContext2D,
  assets: Assets,
  fighter: Fighter,
  pose: number,
  sports: boolean,
  height: number,
  time: number,
  reduced: boolean,
) {
  const images = assets.characters[fighter.character] ?? assets.characters[FIGHTERS[0].id];
  const useCombat = !sports && images.combat !== null;
  const sportsMap = [0, 5, 5, 3, 3, 3, 7, 7];
  const index = useCombat ? pose : sports ? pose : sportsMap[pose];
  const dedicatedVictory = sports && pose === 6 && fighter.character === "sui" && assets.suiVictory;
  const frame = dedicatedVictory ? [170, 9, 676, 1495] : (useCombat ? images.combatFrames : images.volleyFrames)[index] ?? images.volleyFrames[0];
  const image = dedicatedVictory || (useCombat ? images.combat : images.volley);
  if (!image) return;
  const reference = dedicatedVictory ? frame[3] : useCombat ? images.referenceHeight : images.volleyFrames[0][3];
  const scale = height / reference;
  const w = frame[2] * scale;
  const h = frame[3] * scale;
  const kickAnchor = fighter.character === "sui" ? 0.30 : 0.39;
  const anchor = useCombat ? [0.5, 0.41, kickAnchor, 0.42, 0.5, 0.43, 0.5, 0.5][index] : 0.5;
  ctx.save();
  if (useCombat && index === 7) ctx.translate(0, h * 0.14);
  // The ready pose touches the top of the guard pose in this packed sheet.
  // A notch in an empty gap between the feet excludes only that neighbouring cap.
  if (useCombat && index === 0 && fighter.character === "sui") {
    ctx.beginPath();
    ctx.moveTo(-w * anchor, -h);
    ctx.lineTo(w * (1 - anchor), -h);
    ctx.lineTo(w * (1 - anchor), 0);
    ctx.lineTo(w * 0.10, 0);
    ctx.lineTo(w * 0.10, -h * 0.028);
    ctx.lineTo(-w * 0.10, -h * 0.028);
    ctx.lineTo(-w * 0.10, 0);
    ctx.lineTo(-w * anchor, 0);
    ctx.closePath();
    ctx.clip();
  }
  if (!useCombat && index === 4) {
    const margin = 24 * scale;
    const raisedHandEdge = fighter.character === "shiori" ? 0.38 : 0.29;
    ctx.beginPath();
    ctx.moveTo(-w / 2, -h + margin);
    ctx.lineTo(w * raisedHandEdge, -h + margin);
    ctx.lineTo(w * raisedHandEdge, -h);
    ctx.lineTo(w / 2, -h);
    ctx.lineTo(w / 2, 0);
    ctx.lineTo(-w / 2, 0);
    ctx.closePath();
    ctx.clip();
  }
  // Upper-body strips give loose hair and cloth a slight breeze without moving feet.
  const strips = reduced || [1, 2, 3, 7].includes(index) ? 1 : 12;
  for (let i = 0; i < strips; i++) {
    const sy = frame[1] + (frame[3] * i) / strips;
    const sh = frame[3] / strips;
    const sway = strips === 1 ? 0 : Math.sin(time * 2.1 + i * 0.21 + fighter.side) * 0.55 * (1 - i / strips);
    ctx.drawImage(image, frame[0], sy, frame[2], sh, -w * anchor + sway, -h + (h * i) / strips, w, h / strips + 0.4);
  }
  ctx.restore();
}

function drawFighter(
  ctx: CanvasRenderingContext2D,
  assets: Assets,
  fighter: Fighter,
  camera: Camera,
  time: number,
  reduced: boolean,
  menu = false,
) {
  const ground = project(fighter.x, fighter.z, menu ? fighter.y : FLOOR, camera);
  const p = project(fighter.x, fighter.z, fighter.y, camera);
  const info = getFighter(fighter.character);
  const lift = Math.max(0, FLOOR - fighter.y);
  const pose = fighterPose(fighter, time, reduced);
  const height = (menu ? 376 : 306) * p.scale;
  ctx.save();
  ellipse(ctx, ground.x + 24 * p.scale, ground.y + 6, 53 * p.scale, 9 * p.scale, `rgba(75,57,38,${clamp(0.22 - lift * 0.0005, 0.08, 0.22)})`);
  ellipse(ctx, ground.x, ground.y + 1, 26 * p.scale, 3.9 * p.scale, `rgba(50,41,32,${clamp(0.29 - lift * 0.001, 0.02, 0.29)})`);
  if (!menu && (fighter.state === "sidestep" || fighter.invincible > 0)) {
    ctx.strokeStyle = `${info.color}80`;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.ellipse(ground.x, ground.y, 46 * p.scale, 10 * p.scale, 0, 0, TAU);
    ctx.stroke();
  }
  // Directional sand flecks follow actual horizontal velocity.
  if (!reduced && !menu && (Math.abs(fighter.vx) > 45 || fighter.state === "sidestep")) {
    for (let i = 0; i < 6; i++) {
      const phase = (time * 3 + i * 0.19) % 1;
      const direction = fighter.vx ? Math.sign(fighter.vx) : fighter.facing;
      ellipse(ctx, ground.x - direction * (14 + phase * 39) * p.scale, ground.y - Math.sin(phase * Math.PI) * 9, 1.4 + phase, 0.7, `rgba(244,222,176,${(1 - phase) * 0.4})`);
    }
  }
  // A restrained afterimage makes the sidestep legible in the depth plane.
  if (!reduced && !menu && fighter.state === "sidestep") {
    for (let trail = 2; trail > 0; trail--) {
      ctx.save();
      ctx.globalAlpha = (3 - trail) * 0.055;
      ctx.translate(p.x - fighter.facing * trail * 18, p.y + trail * 3);
      ctx.scale(fighter.facing, 1);
      drawSprite(ctx, assets, fighter, 0, false, height, time, true);
      ctx.restore();
    }
  }
  ctx.translate(p.x + pose.offsetX * p.scale * fighter.facing, p.y + pose.offsetY * p.scale);
  ctx.scale(fighter.facing * pose.stretchX, pose.stretchY);
  ctx.rotate(pose.lean);
  if (fighter.state === "down" && !(assets.characters[fighter.character]?.combat)) {
    ctx.translate(0, -30);
    ctx.rotate(-Math.PI * 0.46);
  }
  if (fighter.state === "launch") ctx.rotate(-clamp(lift / 360, 0, 0.32));
  if (pose.blend < 0.98 && pose.index !== 0 && !pose.sports) {
    ctx.globalAlpha = 1 - pose.blend;
    drawSprite(ctx, assets, fighter, 0, false, height, time, reduced);
    ctx.globalAlpha = pose.blend;
  }
  drawSprite(ctx, assets, fighter, pose.index, pose.sports, height, time, reduced);
  ctx.restore();
}

function drawAttackTrails(ctx: CanvasRenderingContext2D, fighter: Fighter, camera: Camera, reduced: boolean) {
  if (reduced || fighter.state !== "attack" || !fighter.move) return;
  const info = getFighter(fighter.character);
  const move = info.moves[fighter.move];
  if (!move || fighter.moveTime < move.startup * 0.55 || fighter.moveTime > move.startup + move.active + 0.13) return;
  const p = project(fighter.x, fighter.z, fighter.y, camera);
  const kick = fighter.move.toLowerCase().includes("kick") || fighter.move === "launcher";
  const low = move.height === "low";
  const alpha = Math.sin(clamp((fighter.moveTime - move.startup * 0.55) / (move.active + move.startup * 0.45 + 0.13), 0, 1) * Math.PI);
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.scale(fighter.facing * p.scale, p.scale);
  ctx.globalCompositeOperation = "screen";
  if (kick) {
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.strokeStyle = i === 0 ? `rgba(255,250,229,${alpha * 0.7})` : `${info.color}${Math.round(alpha * 80).toString(16).padStart(2, "0")}`;
      ctx.lineWidth = 3.5 - i;
      ctx.ellipse(31, low ? -48 : -167, 99 + i * 4, low ? 26 : 72, -0.3, -1.18, 0.86);
      ctx.stroke();
    }
  } else {
    const y = low ? -98 : -194;
    const beam = ctx.createLinearGradient(35, y, 175, y);
    beam.addColorStop(0, `${info.color}00`);
    beam.addColorStop(0.65, `${info.color}55`);
    beam.addColorStop(1, "rgba(255,251,225,.68)");
    ctx.globalAlpha = alpha;
    polygon(ctx, [[21, y + 9], [164, y - 2], [183, y - 1], [38, y + 15]], beam);
    ctx.strokeStyle = "rgba(255,252,235,.48)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(32, y + 3);
    ctx.lineTo(169, y - 5);
    ctx.stroke();
  }
  ctx.restore();
}

function drawEvents(ctx: CanvasRenderingContext2D, game: Game, camera: Camera, reduced: boolean) {
  game.events.forEach(event => {
    if (!["hit", "block", "hold", "throw", "critical", "launch", "super", "sidestep"].includes(event.type)) return;
    const info = getFighter(game.fighters[event.side].character);
    const point = project(event.x, event.z, event.y, camera);
    const age = clamp((0.82 - event.ttl) / 0.43, 0, 1);
    if (age >= 1) return;
    const blocked = event.type === "block";
    const held = event.type === "hold";
    const power = clamp(event.strength || 1, 0.7, 2.5);
    const alpha = 1 - ease(age);
    ctx.save();
    ctx.translate(point.x, point.y);
    ctx.globalAlpha = alpha;
    ctx.globalCompositeOperation = "screen";
    if (blocked || held) {
      const radius = (22 + age * 35) * point.scale;
      ctx.strokeStyle = held ? info.color : "#c0f5ff";
      ctx.lineWidth = 2 + (1 - age) * 2;
      ctx.beginPath();
      ctx.arc(0, 0, radius, -2.1, 1.1);
      ctx.stroke();
      ctx.strokeStyle = "rgba(255,255,250,.7)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(0, 0, radius * 0.72, -1.9, 1.45);
      ctx.stroke();
    } else if (event.type !== "sidestep") {
      const radius = (17 + age * 47) * power * point.scale;
      const light = ctx.createRadialGradient(0, 0, 1, 0, 0, radius);
      light.addColorStop(0, "rgba(255,255,249,.85)");
      light.addColorStop(0.14, "rgba(255,228,155,.57)");
      light.addColorStop(0.43, `${info.secondary}55`);
      light.addColorStop(1, `${info.color}00`);
      ellipse(ctx, 0, 0, radius, radius, light);
      const count = reduced ? 4 : 10;
      for (let ray = 0; ray < count; ray++) {
        const angle = (ray / count) * TAU + event.id * 0.7;
        const radiusA = 7 + age * 16;
        const radiusB = (21 + age * (ray % 2 ? 61 : 42)) * power;
        ctx.strokeStyle = ray % 3 ? "#fff3cf" : info.color;
        ctx.lineWidth = ray % 3 ? 1.7 : 3;
        ctx.beginPath();
        ctx.moveTo(Math.cos(angle) * radiusA, Math.sin(angle) * radiusA);
        ctx.lineTo(Math.cos(angle) * radiusB, Math.sin(angle) * radiusB);
        ctx.stroke();
      }
      if (event.type === "critical" || event.type === "super") {
        ctx.lineWidth = 1;
        ctx.strokeStyle = "rgba(255,251,232,.55)";
        ctx.beginPath();
        ctx.ellipse(0, 0, radius * 1.4, radius * 0.65, -0.3, 0, TAU);
        ctx.stroke();
      }
    }
    ctx.restore();
  });
}

function drawPortrait(ctx: CanvasRenderingContext2D, assets: Assets, fighter: Fighter, x: number, y: number, right: boolean) {
  const info = getFighter(fighter.character);
  const images = assets.characters[fighter.character] ?? assets.characters[FIGHTERS[0].id];
  const frame = images.combat ? images.combatFrames[0] : images.volleyFrames[0];
  const image = images.combat ?? images.volley;
  ctx.save();
  ctx.translate(x, y);
  if (right) ctx.scale(-1, 1);
  polygon(ctx, [[0, 0], [50, 0], [63, 58], [7, 58]], "rgba(13,39,48,.7)");
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(50, 0);
  ctx.lineTo(63, 58);
  ctx.lineTo(7, 58);
  ctx.closePath();
  ctx.clip();
  const portraitHeight = frame[3] * 0.29;
  const portraitWidth = portraitHeight * 0.89;
  const faceX = frame[0] + frame[2] * (fighter.character === "sui" ? 0.53 : 0.52);
  ctx.drawImage(image, faceX - portraitWidth / 2, frame[1], portraitWidth, portraitHeight, 0, -7, 65, 73);
  ctx.restore();
  ctx.strokeStyle = `${info.color}b0`;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x + (right ? -63 : 63), y + 58);
  ctx.lineTo(x + (right ? -7 : 7), y + 58);
  ctx.stroke();
}

function drawHealth(ctx: CanvasRenderingContext2D, game: Game, fighter: Fighter, x: number, y: number, width: number, right: boolean) {
  const info = getFighter(fighter.character);
  const ratio = clamp(fighter.hp / fighter.maxHp, 0, 1);
  const recent = Math.max(0, ...game.events.filter(event => event.target === fighter.side && ["hit", "throw", "hold"].includes(event.type)).map(event => event.ttl));
  const ghost = clamp((fighter.hp + fighter.lastDamage * clamp(recent * 1.5, 0, 1)) / fighter.maxHp, 0, 1);
  ctx.save();
  ctx.translate(x, y);
  if (right) ctx.scale(-1, 1);
  polygon(ctx, [[0, 0], [width, 0], [width - 7, 18], [0, 18]], "rgba(5,29,38,.65)");
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(2, 2);
  ctx.lineTo(width - 3, 2);
  ctx.lineTo(width - 9, 15);
  ctx.lineTo(2, 15);
  ctx.closePath();
  ctx.clip();
  ctx.fillStyle = "rgba(247,142,112,.83)";
  ctx.fillRect(2, 2, width * ghost - 3, 13);
  const health = ctx.createLinearGradient(0, 0, width, 0);
  health.addColorStop(0, ratio < 0.25 ? "#d69b80" : "#f4e7c8");
  health.addColorStop(0.7, ratio < 0.25 ? "#ffbd92" : "#fff7db");
  health.addColorStop(1, ratio < 0.25 ? "#fff0bd" : info.secondary);
  ctx.fillStyle = health;
  ctx.fillRect(2, 2, Math.max(0, width * ratio - 3), 13);
  ctx.fillStyle = "rgba(255,255,255,.4)";
  ctx.fillRect(2, 2, Math.max(0, width * ratio - 3), 2);
  for (let i = 1; i < 10; i++) {
    ctx.fillStyle = "rgba(9,40,49,.09)";
    ctx.fillRect((i * width) / 10, 2, 1, 13);
  }
  ctx.restore();
  ctx.strokeStyle = "rgba(255,249,227,.37)";
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(width, 0);
  ctx.lineTo(width - 7, 18);
  ctx.lineTo(0, 18);
  ctx.stroke();
  ctx.restore();
}

function drawMeter(ctx: CanvasRenderingContext2D, fighter: Fighter, x: number, right: boolean, time: number, reduced: boolean) {
  const info = getFighter(fighter.character);
  const width = 245;
  const full = fighter.meter >= 99.99;
  ctx.save();
  ctx.translate(x, 676);
  if (right) ctx.scale(-1, 1);
  polygon(ctx, [[0, 0], [width, 0], [width - 5, 7], [0, 7]], "rgba(5,28,34,.63)");
  const meter = ctx.createLinearGradient(0, 0, width, 0);
  meter.addColorStop(0, info.color);
  meter.addColorStop(1, "#fff3d4");
  ctx.fillStyle = meter;
  ctx.fillRect(1, 1, ((width - 3) * fighter.meter) / 100, 5);
  if (full) {
    ctx.strokeStyle = `rgba(255,249,216,${reduced ? 0.8 : 0.65 + Math.sin(time * 4.1) * 0.22})`;
    ctx.lineWidth = 1;
    ctx.strokeRect(-2, -2, width + 4, 10);
  }
  ctx.restore();
  text(ctx, full ? "必杀就绪" : "潮汐能量", x, 666, 10, full ? "#fff4c7" : "rgba(255,248,226,.74)", right ? "right" : "left", 500);
  text(ctx, `${Math.floor(fighter.meter)}%`, x + (right ? -width : width), 666, 10, "rgba(255,248,226,.65)", right ? "left" : "right", 500);
}

function drawHud(ctx: CanvasRenderingContext2D, assets: Assets, game: Game, time: number, reduced: boolean) {
  ctx.save();
  game.fighters.forEach((fighter, side) => {
    const right = side === 1;
    const info = getFighter(fighter.character);
    const x = right ? WIDTH - 119 : 119;
    const nameX = right ? WIDTH - 124 : 124;
    const align = right ? "right" : "left";
    const label = side === 0 ? "1P" : game.options.mode === "local" ? "2P" : game.options.mode === "training" ? "练习对手" : "CPU";
    drawPortrait(ctx, assets, fighter, right ? WIDTH - 41 : 41, 30, right);
    text(ctx, info.name, nameX, 50, 22, "#fff7e2", align, 700);
    text(ctx, label, nameX + (right ? -63 : 63), 49, 10, info.color, align, 600);
    drawHealth(ctx, game, fighter, x, 62, 421, right);
    text(ctx, info.subtitle, nameX, 98, 11, "rgba(255,249,232,.64)", align, 400);
    const winX = right ? 858 : 422;
    for (let round = 0; round < 2; round++) {
      const dotX = winX + (right ? -round * 22 : round * 22);
      polygon(ctx, [[dotX, 90], [dotX + 4, 94], [dotX, 98], [dotX - 4, 94]], game.wins[side] > round ? "#fff1bd" : "rgba(255,247,220,.2)");
    }
    if (game.options.mode === "training") {
      text(ctx, `${fighter.hp} / ${fighter.maxHp}`, nameX + (right ? -155 : 155), 98, 10, "rgba(255,249,232,.65)", align, 400);
    }
    drawMeter(ctx, fighter, right ? WIDTH - 57 : 57, right, time, reduced);
    if (fighter.combo > 1 && fighter.comboTime > 0) {
      const comboX = right ? WIDTH - 62 : 62;
      text(ctx, `${fighter.combo}`, comboX, 224, 44, "#fff7df", align, 800);
      text(ctx, "HITS", comboX + (right ? -45 : 45), 221, 12, info.color, align, 700);
      text(ctx, `${fighter.comboDamage} DAMAGE`, comboX, 247, 10, "rgba(255,247,222,.85)", align, 500);
    }
  });
  text(ctx, "TIDAL DUEL", WIDTH / 2, 29, 10, "rgba(255,249,229,.68)", "center", 600);
  text(ctx, game.options.mode === "training" ? "∞" : String(Math.ceil(game.roundTimer)).padStart(2, "0"), WIDTH / 2, 78, 46, "#fff7dd", "center", 500);
  text(ctx, game.options.mode === "training" ? "TRAINING" : `ROUND ${String(game.round).padStart(2, "0")}`, WIDTH / 2, 100, 10, "rgba(255,249,229,.69)", "center", 500);
  const newest = [...game.events].reverse().find(event => event.ttl > 0.24 && !["round", "ko", "whiff", "hit", "sidestep"].includes(event.type));
  if (newest && game.phase === "fight") {
    const fighter = game.fighters[newest.side];
    const info = getFighter(fighter.character);
    ctx.globalAlpha = clamp(newest.ttl * 4, 0, 1);
    text(ctx, newest.type === "block" ? "GUARD" : newest.text, newest.side === 0 ? 61 : WIDTH - 61, 167, newest.type === "block" ? 13 : 17, newest.type === "block" ? "#d9f5f4" : info.secondary, newest.side === 0 ? "left" : "right", 700);
  }
  ctx.globalAlpha = 1;
  text(ctx, "打击  ›  摔技  ›  反击  ›  打击", WIDTH / 2, 682, 11, "rgba(255,247,224,.72)", "center", 400);
  ctx.restore();
}

function drawSuper(ctx: CanvasRenderingContext2D, assets: Assets, game: Game, time: number, reduced: boolean) {
  const special = game.super;
  if (!special || special.timer < 0.15) return;
  const fighter = game.fighters[special.side];
  const info = getFighter(fighter.character);
  const elapsed = 1.05 - special.timer;
  const enter = reduced ? 1 : ease(elapsed / 0.13);
  const leave = ease(special.timer / 0.22);
  const images = assets.characters[fighter.character] ?? assets.characters[FIGHTERS[0].id];
  const frame = images.combat ? images.combatFrames[0] : images.volleyFrames[0];
  const image = images.combat ?? images.volley;
  ctx.save();
  ctx.globalAlpha = enter * leave;
  ctx.fillStyle = "rgba(6,24,38,.53)";
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  const slide = reduced ? 0 : (1 - enter) * -170;
  ctx.translate(slide, 0);
  const band = ctx.createLinearGradient(0, 0, WIDTH, 0);
  band.addColorStop(0, "#193647");
  band.addColorStop(0.42, "#244457");
  band.addColorStop(1, info.color);
  polygon(ctx, [[0, 264], [WIDTH, 210], [WIDTH, 468], [0, 531]], band);
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(0, 264); ctx.lineTo(WIDTH, 210); ctx.lineTo(WIDTH, 468); ctx.lineTo(0, 531);
  ctx.closePath();
  ctx.clip();
  const portraitH = 606;
  const portraitW = (frame[2] / frame[3]) * portraitH;
  const travel = reduced ? 0 : elapsed * 23;
  ctx.drawImage(image, frame[0], frame[1], frame[2], frame[3], 330 - portraitW / 2 + travel, 254, portraitW, portraitH);
  for (let i = 0; i < 15; i++) {
    const x = (i * 131 - (reduced ? 0 : time * 620)) % (WIDTH + 120);
    ctx.strokeStyle = `rgba(255,248,224,${0.035 + (i % 3) * 0.03})`;
    ctx.lineWidth = 1 + (i % 2);
    ctx.beginPath();
    ctx.moveTo(x, 284 + (i * 12));
    ctx.lineTo(x + 158, 277 + (i * 12));
    ctx.stroke();
  }
  ctx.restore();
  text(ctx, "TIDAL BREAK", 624, 310, 13, info.secondary, "left", 600);
  text(ctx, special.name, 618, 380, 54, "#fff8e6", "left", 700);
  text(ctx, info.name, 624, 416, 18, "rgba(255,248,231,.82)", "left", 500);
  ctx.strokeStyle = "rgba(255,250,230,.45)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(622, 436); ctx.lineTo(968, 419);
  ctx.stroke();
  ctx.restore();
}

function drawRoundTransition(ctx: CanvasRenderingContext2D, game: Game, reduced: boolean) {
  if (game.phase !== "intro" && game.phase !== "roundEnd") return;
  const intro = game.phase === "intro";
  const t = game.phaseTime;
  const enter = reduced ? 1 : ease(t / 0.15);
  const fade = intro ? clamp((1.45 - t) * 5, 0, 1) : 1;
  ctx.save();
  ctx.globalAlpha = enter * fade;
  const band = ctx.createLinearGradient(0, 278, 0, 420);
  band.addColorStop(0, "rgba(7,38,49,0)");
  band.addColorStop(0.5, "rgba(7,38,49,.4)");
  band.addColorStop(1, "rgba(7,38,49,0)");
  ctx.fillStyle = band;
  ctx.fillRect(0, 278, WIDTH, 142);
  const scale = reduced ? 1 : lerp(1.1, 1, enter);
  ctx.translate(WIDTH / 2, 348);
  ctx.scale(scale, scale);
  const value = intro ? t < 0.85 ? `ROUND ${game.round}` : "FIGHT" : game.roundTimer <= 0 ? "TIME UP" : "K.O.";
  text(ctx, value, 0, 0, intro ? 51 : 67, "#fff8de", "center", 700);
  if (!intro) {
    const winner = game.winner === null ? null : getFighter(game.fighters[game.winner].character);
    text(ctx, winner ? `${winner.name} · 本回合胜利` : "平局", 0, 40, 15, "rgba(255,248,223,.85)", "center", 500);
  }
  ctx.restore();
}

function drawMenu(ctx: CanvasRenderingContext2D, assets: Assets, game: Game, time: number, reduced: boolean) {
  const camera: Camera = { center: WIDTH / 2, zoom: 1, shakeX: 0, shakeY: 0 };
  drawBeach(ctx, assets, time, camera, reduced);
  const shade = ctx.createLinearGradient(0, 0, WIDTH, 0);
  shade.addColorStop(0, "rgba(6,31,42,.83)");
  shade.addColorStop(0.39, "rgba(8,42,49,.67)");
  shade.addColorStop(0.62, "rgba(8,42,49,.15)");
  shade.addColorStop(1, "rgba(8,42,49,0)");
  ctx.fillStyle = shade;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  const back: Fighter = { ...game.fighters[1], x: 1095, y: 630, z: -0.65, facing: -1, state: "idle" };
  const front: Fighter = { ...game.fighters[0], x: 828, y: 670, z: 0.7, facing: 1, state: "idle" };
  drawFighter(ctx, assets, back, camera, time + 1.1, reduced, true);
  drawFighter(ctx, assets, front, { ...camera, zoom: 1.04 }, time, reduced, true);
  const vignette = ctx.createRadialGradient(858, 430, 170, 858, 430, 630);
  vignette.addColorStop(0, "rgba(7,34,45,0)");
  vignette.addColorStop(1, "rgba(7,34,45,.22)");
  ctx.fillStyle = vignette;
  ctx.fillRect(565, 0, WIDTH - 565, HEIGHT);
}

export function renderGame(ctx: CanvasRenderingContext2D, assets: Assets, game: Game, reduced = false, compact = false) {
  const time = reduced ? 0 : game.time;
  ctx.clearRect(0, 0, WIDTH, HEIGHT);
  if (game.phase === "menu") {
    drawMenu(ctx, assets, game, time, reduced);
    return;
  }
  const [first, second] = game.fighters;
  const distance = Math.abs(first.x - second.x);
  const zoom = clamp(1.17 - distance / 5200, 0.99, 1.15) * game.camera.zoom;
  const halfVisible = WIDTH / (2 * zoom) - 100;
  const center = clamp((first.x + second.x) / 2, halfVisible, WIDTH - halfVisible);
  const shake = reduced ? 0 : game.camera.shake;
  const camera: Camera = {
    center,
    zoom,
    shakeX: Math.sin(time * 143) * shake * 0.5,
    shakeY: Math.cos(time * 173) * shake * 0.25,
  };
  drawBeach(ctx, assets, time, camera, reduced);
  ctx.save();
  ctx.translate(camera.shakeX, camera.shakeY);
  drawArena(ctx, camera, time, reduced);
  const ordered = [...game.fighters].sort((a, b) => a.z - b.z);
  ordered.forEach(fighter => {
    drawFighter(ctx, assets, fighter, camera, game.freeze > 0 ? game.time - game.freeze : time, reduced);
    drawAttackTrails(ctx, fighter, camera, reduced);
  });
  drawEvents(ctx, game, camera, reduced);
  ctx.restore();
  if (!reduced && game.freeze > 0.055 && game.camera.shake > 5) {
    ctx.fillStyle = `rgba(255,246,216,${Math.min(0.055, game.freeze * 0.17)})`;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
  }
  if (!compact) drawHud(ctx, assets, game, time, reduced);
  drawRoundTransition(ctx, game, reduced);
  drawSuper(ctx, assets, game, time, reduced);
  if (game.phase === "result") {
    const shade = ctx.createLinearGradient(0, 0, WIDTH, 0);
    shade.addColorStop(0, "rgba(5,31,41,.78)");
    shade.addColorStop(0.5, "rgba(5,31,41,.5)");
    shade.addColorStop(1, "rgba(5,31,41,.02)");
    ctx.fillStyle = shade;
    ctx.fillRect(0, 110, WIDTH, HEIGHT - 110);
  }
}
