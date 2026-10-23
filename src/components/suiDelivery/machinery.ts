import { overlaps } from "../suiPlatformer/engine";
import { deliveryLevel } from "./levels";
import { feedback } from "./feedback";
import type { DeliveryGame, OvenCrab, Surface } from "./types";
import { advanceServing, servingStage, servingSurfaces } from "./market";

type Box = { x: number; y: number; w: number; h: number };
export const insulatedTray = (s: DeliveryGame) => s.save.delivered.includes("oven-crab");
export const crabValve = (b: OvenCrab) => ({
  x: b.x + 65 + [0, 2, 1][b.stage] * 60,
  y: 511,
});
export function createCrab(done: boolean): OvenCrab {
  return {
    stage: 0,
    phase: done ? "off" : "sleep",
    timer: 0,
    x: 1160,
    facing: -1,
    hits: done ? 3 : 0,
  };
}
export function resetMachinery(s: DeliveryGame) {
  const level = deliveryLevel(s);
  s.pans = Object.fromEntries(
    level.pans.map((v) => [v.id, { y: v.y, previous: v.y, timer: 0 }]),
  );
  s.projectiles = [];
  // Opening a route remains true through a retry within the order.
  s.boss = level.boss === "oven-crab" ? createCrab(s.boss?.phase === "off") : null;
  s.machine = level.boss === "serving-machine" ? { phase: servingStage(s) >= 3 ? "off" : "sleep", timer: 0 } : null;
}
export function machinerySurfaces(s: DeliveryGame): Surface[] {
  const level = deliveryLevel(s);
  const blocks: Surface[] = level.pans.map((v) => ({
    id: v.id,
    x: v.x,
    y: s.pans[v.id]?.y ?? v.y,
    w: v.w,
    h: 15,
    kind: "pan",
  }));
  for (const gate of level.gates) {
    if (gate.barrier !== false && !s.switches.includes(gate.id)) blocks.push({ ...gate, kind: "brick", solid: true });
  }
  const b = s.boss;
  if (b) {
    // Two pans flank the oven. Each stage changes the approach and landing space.
    const raised = b.phase === "vent";
    const progress = raised ? Math.min(1, (5.8 - b.timer) * 1.8) : 0;
    for (const side of [-1, 1]) blocks.push({
        id: `crab-pan-${side}`,
        x: b.x + (side < 0 ? -155 : 280),
        y: 610 - progress * (b.stage === 2 && side > 0 ? 145 : 110),
        w: b.stage === 2 ? 115 : 145,
        h: 15,
        kind: "pan",
      });
    if (raised || b.phase === "rest" || b.phase === "off") blocks.push({
        id: "crab-back",
        x: b.x + 15,
        y: 535,
        w: 220,
        h: 18,
        kind: "oven-back",
      });
  }
  return [...blocks, ...servingSurfaces(s)];
}
export function attackMachinery(
  s: DeliveryGame,
  box: Box,
  tell: (text: string) => void,
  sparks: (x: number, y: number) => void,
) {
  const level = deliveryLevel(s);
  const p = s.player;
  for (const pan of level.pans) {
    const state = s.pans[pan.id];
    if (
      !state ||
      p.hit.includes(pan.id) ||
      !overlaps(box, { x: pan.x, y: state.y - 15, w: pan.w, h: 36 })
    ) continue;
    p.hit.push(pan.id);
    state.timer = 6;
    feedback(s, "metal", pan.x + pan.w / 2, state.y);
    tell("烤盘正在升高！落在卷边上，随它到上一层。松开后还会慢慢落回。");
    sparks(pan.x + pan.w / 2, state.y);
  }
  const b = s.boss;
  if (b && b.phase === "vent") {
    const valve = crabValve(b);
    if (
      p.y + p.h <= 562 &&
      overlaps(box, { x: valve.x - 20, y: valve.y - 22, w: 40, h: 48 })
    ) {
      b.hits++;
      feedback(s, "mechanism", valve.x, valve.y);
      sparks(valve.x, valve.y);
      p.vy = -450;
      p.grounded = false;
      p.invincible = Math.max(p.invincible, 1.2);
      if (b.hits >= 3) {
        b.phase = "off";
        tell("三个阀门都关好了。大烤炉安静下来，去把面包递给栞栞吧。");
      } else {
        b.phase = "rest";
        b.timer = 1.3;
        tell(
          b.hits === 1
            ? "关好一个！烤炉转身了，下一次烤盘从另一侧升起。"
            : "只剩最后一个。两侧烤盘高低不同，先看清落点。",
        );
      }
    }
  }
  if (!insulatedTray(s)) return;
  for (const shot of s.projectiles) {
    if (
      shot.reflected ||
      !overlaps(box, { x: shot.x - 12, y: shot.y - 12, w: 24, h: 24 })
    ) continue;
    shot.reflected = true;
    shot.vx = p.facing * 430;
    shot.life = 5;
    feedback(s, "reflect", shot.x, shot.y);
    sparks(shot.x, shot.y);
    tell("叮！热弹反回去了，把它送进带金圈的铃铛。");
  }
}
export function advanceMachinery(
  s: DeliveryGame,
  dt: number,
  hurt: (x: number) => void,
  tell: (text: string) => void,
) {
  const level = deliveryLevel(s);
  const p = s.player;
  advanceServing(s, dt, hurt, tell);
  for (const pan of level.pans) {
    const v = s.pans[pan.id];
    v.previous = v.y;
    v.timer = Math.max(0, v.timer - dt);
    const target = v.timer > 0 ? pan.high : pan.y;
    const delta = Math.max(-92 * dt, Math.min(60 * dt, target - v.y));
    v.y += delta;
    if (
      p.grounded &&
      Math.abs(p.y + p.h - v.previous) < 2 &&
      p.x + p.w > pan.x &&
      p.x < pan.x + pan.w
    ) p.y += delta;
  }
  const b = s.boss;
  if (b && b.phase !== "off") {
    if (b.phase === "sleep" && p.x > 530) {
      b.phase = "claw-warning";
      feedback(s, "warning", b.x + 125, 600);
      b.timer = 1.1;
      tell("钳子缩回去蓄力了——跳过低扫，或留在高台观察。");
    } else if (b.phase !== "sleep") {
      const oldPans = machinerySurfaces(s).filter((v) => v.id.startsWith("crab-pan"),);
      b.timer -= dt;
      if (b.timer <= 0) {
        if (b.phase === "claw-warning") {
          b.phase = "claw";
          b.timer = 0.75;
          feedback(s, "sweep", b.x + 125, 644);
        } else if (b.phase === "claw") {
          b.phase = "vent-warning";
          feedback(s, "warning", b.x + 125, 535);
          b.timer = 0.8;
          tell("炉口鼓起来了。接下来排气会把两边烤盘抬高！");
        } else if (b.phase === "vent-warning") {
          b.phase = "vent";
          b.timer = 5.8;
          feedback(s, "steam", b.x + 125, 535);
          tell("排气！烤盘升起了。跳上去，登背挑开亮着的阀门。");
        } else if (b.phase === "rest") {
          b.stage = b.hits;
          b.x = b.stage === 1 ? 950 : 1280;
          b.facing *= -1;
          // Give the player time to leave the back as the oven turns.
          p.invincible = Math.max(p.invincible, 0.85);
          b.phase = "claw-warning";
          feedback(s, "warning", b.x + 125, 600);
          b.timer = 1.1;
        } else {
          b.phase = "claw-warning";
          feedback(s, "warning", b.x + 125, 600);
          b.timer = 1.1;
        }
      }
      const newPans = machinerySurfaces(s);
      for (const pan of oldPans) {
        const now = newPans.find((v) => v.id === pan.id);
        if (
          now &&
          p.grounded &&
          Math.abs(p.y + p.h - pan.y) < 4 &&
          p.x + p.w > pan.x &&
          p.x < pan.x + pan.w
        ) p.y += now.y - pan.y;
      }
      if (b.phase === "claw") {
        const reach = 170 + Math.sin(((0.75 - b.timer) / 0.75) * Math.PI) * 140;
        const x = b.facing < 0 ? b.x - reach : b.x + 250;
        if (overlaps(p, { x, y: 630, w: reach, h: 50 })) hurt(x + reach / 2);
      }
      // Hot oven sides leave the back and lifted pans safe during the opening.
      if (overlaps(p, { x: b.x + 25, y: 568, w: 200, h: 108 })) hurt(b.x + 125);
    }
  }
  for (const emitter of level.emitters) {
    if (level.cart?.rail && s.cart.station < 1) continue;
    if (Math.abs(p.x - emitter.x) > 650) continue;
    if (level.gates.every((v) => s.switches.includes(v.id))) continue;
    if (emitter.stage !== undefined && (emitter.stage !== servingStage(s) || s.machine?.phase !== "feed")) continue;
    const before = Math.floor((s.clock - dt) / emitter.period);
    if (Math.floor(s.clock / emitter.period) > before) {
      s.projectiles.push({
        id: s.projectileId++,
        x: emitter.x,
        y: emitter.y,
        vx: emitter.direction * 220,
        reflected: false,
        life: 8,
      });
      feedback(s, "shot", emitter.x, emitter.y);
    }
  }
  s.projectiles = s.projectiles.filter((shot) => {
    shot.life -= dt;
    shot.x += shot.vx * dt;
    if (shot.reflected) for (let index = 0; index < level.gates.length; index++) {
        const gate = level.gates[index];
        if (
          s.switches.includes(gate.id) ||
          Math.abs(shot.x - gate.targetX) > 25 ||
          Math.abs(shot.y - gate.targetY) > 28
        ) continue;
        if (s.machine && (index !== servingStage(s) || s.machine.phase !== "feed")) continue;
        s.switches.push(gate.id);
        feedback(s, "mechanism", gate.targetX, gate.targetY);
        if (s.machine) {
          s.machine.phase = "warning";
          s.machine.timer = 1.5;
          tell(s.switches.length < 3 ? "一条带停稳了，踏板放下！下一层传送带换了方向，先看清分餐臂。" : "三条带都停稳了。分餐臂托起通往出口的长桌。");
        } else if (gate.id === "banquet-heat") tell("热铃停稳，吊台开始升降。上去挑停侧面的绞盘吧。");
        else if (level.id === "scenery-lifts") tell("铃响了！布景桥放下，通往后台的路打开了。重试也会保留这条路。");
        else tell("铃响了！遮棚闸门升起，新的路打开了。重试也会保留这条路。");
        return false;
      }
    if (
      !shot.reflected &&
      overlaps(p, { x: shot.x - 10, y: shot.y - 10, w: 20, h: 20 })
    ) {
      hurt(shot.x);
      return false;
    }
    return shot.life > 0 && shot.x > -30 && shot.x < level.world.w + 30;
  });
}
