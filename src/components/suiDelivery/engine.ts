import { PHYSICS, overlaps } from "../suiPlatformer/engine";
import { ORDER, VIEW } from "./content";
import { advanceFeedback, feedback, landingKind } from "./feedback";
import { deliveryPlayerFrame, deliveryPlayerHurt, deliveryTrayPose } from "./playerAnimation";
import {
  deliveryLevel,
  levelSwitches,
  levelUnlocked,
  nextOrder,
} from "./levels";
import {
  advanceMachinery,
  machinerySurfaces,
  attackMachinery,
  createCrab,
  resetMachinery,
} from "./machinery";
import { freshDeliverySave } from "./save";
import { homeKeepsakes, homeNeighbors } from "./home";
import { advanceCart, resetCart, servingStage } from "./market";
import { advanceTheater, attackTheater, banquetReady, crownPhase, liftPhase, resetTheater, theaterInteraction, theaterSurfaces } from "./theater";
import {
  advanceRain,
  attackRain,
  bounceBird,
  canopyPhase,
  nestInteraction,
  rainSurfaces,
  resetRain,
  steamBox,
} from "./rain";
import type {
  Body,
  DeliveryGame,
  DeliveryInput,
  DeliveryLevel,
  Dough,
  Surface,
} from "./types";

export const FIXED_DT = 1 / 120;
export const deliveryInput = (): DeliveryInput => ({
  left: false,
  right: false,
  jump: false,
  run: false,
  attack: false,
  interact: false,
  dash: false,
});
function playerAt(x: number, y: number): DeliveryGame["player"] {
  return {
    x,
    y,
    w: 26,
    h: 44,
    vx: 0,
    vy: 0,
    grounded: true,
    facing: 1,
    health: 3,
    invincible: 0,
    coyote: PHYSICS.coyote,
    buffer: 0,
    jumpHeld: false,
    attackHeld: false,
    interactHeld: false,
    attack: 0,
    cooldown: 0,
    hit: [],
    pose: "idle",
    land: 0,
    dash: 0,
    dashReady: true,
    dashHeld: false,
    dashFacing: 1,
  };
}
const doughAt = (level: DeliveryLevel): Dough[] => level.dough.map((d) => ({
    ...d,
    homeX: d.x,
    homeY: d.y,
    w: 38,
    h: 38,
    vx: 0,
    vy: 0,
    state: "hop",
    timer: 1.2,
    grace: 0,
    face: -1,
  }));
export function createDelivery(
  save = freshDeliverySave(),
  levelId = ORDER,
): DeliveryGame {
  const level = deliveryLevel({ levelId });
  const cp = level.checkpoints[0];
  return {
    levelId: level.id,
    phase: "title",
    mode: "story",
    player: playerAt(cp.x, cp.y),
    save,
    carrying: false,
    checkpoint: cp.id,
    dough: doughAt(level),
    collected: [...save.found],
    bread: false,
    time: 0,
    clock: 0,
    deaths: 0,
    deathTimer: 0,
    camera: { x: 0, y: 220 },
    viewport: { ...VIEW },
    cart: {
      x: level.cart?.start || 0,
      y: level.cart?.y || 0,
      previous: level.cart?.start || 0,
      previousY: level.cart?.y || 0,
      station: 0,
      active: false,
      docked: false,
    },
    awnings: {},
    toast: "",
    toastTimer: 0,
    events: [],
    feedback: [],
    particles: [],
    deliveryTime: 0,
    prompt: "",
    lifts: 0,
    bounces: 0,
    pans: Object.fromEntries(
      level.pans.map((v) => [v.id, { y: v.y, previous: v.y, timer: 0 }]),
    ),
    projectiles: [],
    projectileId: 0,
    switches: [],
    boss:
      level.boss === "oven-crab"
        ? createCrab(save.delivered.includes(level.id))
        : null,
    machine:
      level.boss === "serving-machine" ? { phase: "sleep", timer: 0 } : null,
    rain: { liftY: level.rain?.lift?.y || 0, bird: null },
    theater: { time: 0, lifts: {}, seated: false },
  };
}
export function tell(s: DeliveryGame, text: string, duration = 4) {
  s.toast = text;
  s.toastTimer = duration;
}
export function startDelivery(
  s: DeliveryGame,
  mode: DeliveryGame["mode"] = "story",
  checkpoint?: string,
  levelId?: string,
) {
  const resumed = mode === "story" && !levelId ? s.save.resume : null;
  const level = deliveryLevel({
    levelId:
      levelId ||
      (mode === "story"
        ? resumed?.level || (resumed ? ORDER : nextOrder(s.save).id)
        : s.levelId),
  });
  if (!levelUnlocked(s.save, level.id)) return;
  if (mode !== "story" && !s.save.delivered.includes(level.id)) return;
  const cp =
    level.checkpoints.find(
      (c) => c.id ===
        (checkpoint ||
          (resumed?.level === level.id ||
          (!resumed?.level && level.id === ORDER)
            ? resumed?.checkpoint
            : undefined)),
    ) || level.checkpoints[0];
  if (checkpoint && !s.save.delivered.includes(level.id)) return;
  const { viewport } = s;
  Object.assign(s, createDelivery(s.save, level.id), {
    viewport,
    phase: "playing",
    mode,
    checkpoint: cp.id,
    player: playerAt(cp.x, cp.y),
    carrying: checkpoint ? true : !levelId && resumed?.carrying === true,
    switches:
      !levelId && resumed?.level === level.id
        ? [...(resumed.switches || [])]
        : mode === "story" && s.save.delivered.includes(level.id)
          ? levelSwitches(level)
          : [],
    boss:
      level.boss === "oven-crab"
        ? createCrab(
            !levelId && resumed?.level === level.id && resumed.bossOff === true,
          )
        : null,
    camera: { x: Math.max(0, cp.x - 250), y: Math.max(0, cp.y - 320) },
  });
  resetCart(s);
  if (mode === "practice" && level.id === "last-table" && ["table-curtain", "table-last"].includes(cp.id)) s.switches = ["table-rope", "table-served"];
  if (mode === "practice" && level.theater?.banquet) {
    if (cp.id === "banquet-loading" || cp.id === "banquet-crank") s.switches = ["banquet-heat"];
    if (cp.id === "banquet-seat") s.switches = ["banquet-heat", "banquet-crank", "banquet-crown"];
  }
  resetRain(s);
  resetTheater(s);
  if (cp.id === "attic" && level.cart) {
    s.cart.x = 2790;
    s.cart.docked = true;
  }
  if (mode === "hot") tell(
      s,
      `趁热送达 · 取餐后开始计时，${level.hotLimit} 秒内有纪念章。超时也能送完。`,
      6,
    );
  else if (mode === "practice") tell(s, `${cp.name} · 自由练习，不计订单报酬。`);
  else tell(
      s,
      s.carrying
        ? `${level.meal}还在餐箱里。从这个歇脚点继续吧。`
        : level.intro,
      6,
    );
  persistCheckpoint(s);
}
function persistCheckpoint(s: DeliveryGame) {
  if (s.mode !== "story" || s.phase === "delivered") return;
  if (s.levelId === "banquet-machine" && s.save.delivered.includes(s.levelId) && !s.carrying) {
    s.save.resume = null;
    return;
  }
  s.save.resume = {
    checkpoint: s.checkpoint,
    carrying: s.carrying,
    level: s.levelId,
    switches: [...s.switches],
    bossOff: s.boss?.phase === "off",
  };
}
export function deliverySurfaces(s: DeliveryGame): Surface[] {
  const level = deliveryLevel(s);
  const blocks = [
    ...level.surfaces,
    ...machinerySurfaces(s),
    ...rainSurfaces(s),
    ...theaterSurfaces(s),
  ];
  if (level.cart) blocks.push({
      id: "food-cart",
      x: s.cart.x,
      y: s.cart.y,
      w: 160,
      h: 18,
      kind: "cart",
    });
  if (level.id === ORDER && s.save.delivered.includes(ORDER)) {
    blocks.push({
      id: "flower-shortcut-1",
      x: 3370,
      y: 590,
      w: 90,
      h: 16,
      kind: "ladder",
    });
    blocks.push({
      id: "flower-shortcut-2",
      x: 3425,
      y: 500,
      w: 90,
      h: 16,
      kind: "ladder",
    });
  }
  if (level.id === "bakery-backdoor" && s.save.delivered.includes(level.id)) blocks.push({
      id: "bakery-open-bridge",
      x: 2770,
      y: 465,
      w: 340,
      h: 18,
      kind: "ladder",
    });
  if (level.theme === "market" && s.save.delivered.includes(level.id)) blocks.push({
      id: "market-open-bridge",
      x: 2950,
      y: 500,
      w: 450,
      h: 18,
      kind: "ladder",
    });
  if (
    level.theme === "freight" &&
    s.mode !== "hot" &&
    s.save.delivered.includes(level.id)
  ) blocks.push({
      id: "freight-neighbor-walkway",
      x: 790,
      y: 680,
      w: 1950,
      h: 20,
      kind: "ladder",
    });
  return blocks;
}
/** Swept vertical collision, with solid walls/ceilings and one-way shelves. */
function move(body: Body, blocks: Surface[], dt: number): string | null {
  const oldX = body.x;
  const oldY = body.y;
  body.x += body.vx * dt;
  for (const b of blocks) {
    if (!b.solid || !overlaps(body, b)) continue;
    if (oldX + body.w <= b.x + 0.1) {
      body.x = b.x - body.w;
      body.vx = 0;
    } else if (oldX >= b.x + b.w - 0.1) {
      body.x = b.x + b.w;
      body.vx = 0;
    }
  }
  body.y += body.vy * dt;
  let land: Surface | null = null;
  for (const b of blocks) {
    if (body.x + body.w <= b.x + 1 || body.x >= b.x + b.w - 1) continue;
    if (
      body.vy >= 0 &&
      oldY + body.h <= b.y + 2 &&
      body.y + body.h >= b.y &&
      (!land || b.y < land.y)
    ) land = b;
    if (body.vy < 0 && b.solid && oldY >= b.y + b.h - 1 && body.y < b.y + b.h) {
      body.y = b.y + b.h;
      body.vy = 0;
    }
  }
  if (land) {
    body.y = land.y - body.h;
    body.vy = 0;
  }
  return land?.id || null;
}
function sparks(s: DeliveryGame, x: number, y: number, color = 0xeab958) {
  for (let i = 0; i < 12; i++) {
    const a = i * 2.4;
    s.particles.push({
      x,
      y,
      vx: Math.cos(a) * (25 + i * 5),
      vy: Math.sin(a) * 60 - 50,
      life: 0.6,
      color,
    });
  }
}
function die(s: DeliveryGame) {
  if (s.phase !== "playing") return;
  s.phase = "dead";
  s.deaths++;
  s.deathTimer = 0.6;
  if (!s.events.some(e => e.kind === "hurt" && e.time === s.clock)) feedback(s, "hurt");
}
export function retryDelivery(s: DeliveryGame) {
  const level = deliveryLevel(s);
  const cp =
    level.checkpoints.find((c) => c.id === s.checkpoint) ||
    level.checkpoints[0];
  s.player = playerAt(cp.x, cp.y);
  s.player.invincible = 1.8;
  s.dough = doughAt(level);
  resetMachinery(s);
  resetRain(s);
  resetTheater(s);
  s.awnings = {};
  s.feedback = [];
  s.events = [];
  s.phase = "playing";
  // The cart returns to a reachable boarding position when the canal segment resets.
  if (cp.id !== "attic" && level.cart) resetCart(s);
  s.camera = {
    x: Math.max(0, Math.min(level.world.w - s.viewport.w, cp.x - 250)),
    y: Math.max(0, cp.y - 320),
  };
  tell(s, "餐箱包装完好。歇一口气，再试一次。", 2.5);
}
function hurt(s: DeliveryGame, x: number) {
  const p = s.player;
  if (p.invincible > 0) return;
  p.health--;
  p.invincible = s.save.settings.assist ? 2.8 : 1.6;
  p.vx = p.x < x ? -160 : 160;
  p.vy = -260;
  p.grounded = false;
  feedback(s, "hurt");
  sparks(s, p.x, p.y + 20, 0xd97660);
  if (p.health <= 0) die(s);
}
function advanceDough(s: DeliveryGame, blocks: Surface[], dt: number) {
  const p = s.player;
  for (const e of s.dough) {
    e.timer -= dt;
    e.grace = Math.max(0, e.grace - dt);
    if (e.state === "gone") {
      if (e.timer <= 0 && Math.abs(p.x - e.homeX) > 65) Object.assign(e, {
          x: e.homeX,
          y: e.homeY,
          vx: 0,
          vy: 0,
          state: "hop",
          timer: 1.1,
          grace: 0.45,
        });
      continue;
    }
    if (e.state === "hop" && e.timer <= 0 && e.y >= e.homeY - 2) {
      e.face = p.x < e.x ? -1 : 1;
      e.vx = e.face * 55;
      e.vy = -180;
      e.timer = 1.9;
    }
    if (Math.abs(e.x - e.homeX) > 70 && e.state === "hop") e.vx = Math.sign(e.homeX - e.x) * 45;
    const oldY = e.y;
    e.vy += (e.state === "loft" ? 780 : PHYSICS.gravity) * dt;
    const landed = move(e, blocks, dt);
    if (landed) e.vx = 0;
    if (e.y > deliveryLevel(s).world.h) {
      e.state = "gone";
      e.timer = 3;
      continue;
    }
    if (e.state === "loft" && e.timer <= 0) {
      e.state = "hop";
      e.timer = 1.2;
    }
    if (!overlaps(p, e)) continue;
    const stomp = p.vy > 0 && p.y + p.h - p.vy * dt <= oldY + 15;
    if (stomp) {
      p.y = e.y - p.h;
      p.vy =
        e.state === "loft"
          ? p.jumpHeld
            ? -850
            : -650
          : p.jumpHeld
            ? -560
            : -390;
      if (e.state === "loft") {
        s.bounces++;
        tell(s, "借力！保持方向，就能落上高处的雨棚。", 3);
      }
      p.grounded = false;
      p.coyote = 0;
      p.land = 0.16;
      e.state = "gone";
      e.timer = 4;
      feedback(s, "stomp", e.x + 19, e.y);
      sparks(s, e.x + 19, e.y);
    } else if (e.state === "hop" && e.grace === 0) hurt(s, e.x);
  }
}
function attack(s: DeliveryGame) {
  const p = s.player;
  if (p.attack > 0.28 || p.attack < 0.1) return;
  const reach = s.save.tray === "wide" ? 92 : 68;
  const box = {
    x: p.facing > 0 ? p.x + 12 : p.x + 14 - reach,
    y: p.y - 12,
    w: reach,
    h: 66,
  };
  attackMachinery(
    s,
    box,
    (text) => tell(s, text),
    (x, y) => sparks(s, x, y),
  );
  attackRain(s, box, (text) => tell(s, text, 5));
  attackTheater(s, box, (text) => tell(s, text, 5));
  for (const e of s.dough) {
    if (e.state === "gone" || p.hit.includes(e.id) || !overlaps(e, box)) continue;
    p.hit.push(e.id);
    if (e.state === "loft") {
      e.state = "gone";
      e.timer = 4;
      tell(s, "清出一条路。面团过一会儿会重新鼓起来。", 3);
    } else {
      e.state = "loft";
      e.vy = -270;
      e.vx = p.facing * 25;
      e.timer = 2.5;
      e.grace = 0.15;
      s.lifts++;
      tell(s, "面团变蓬松了！跳到它上方，按住跳跃踩下去。", 4);
    }
    feedback(s, "dough", e.x + 19, e.y + 15);
    sparks(s, e.x + 19, e.y + 15, 0x7aa497);
  }
}
function near(s: DeliveryGame, x: number, y: number, range = 75) {
  return (
    Math.abs(s.player.x + 13 - x) < range && Math.abs(s.player.y + 44 - y) < 58
  );
}
function interact(s: DeliveryGame, pressed: boolean) {
  const level = deliveryLevel(s);
  s.prompt = "";
  if (level.theater?.banquet && near(s, level.destination.x, level.destination.y) && !s.carrying && s.save.delivered.includes(level.id)) {
    s.prompt = "E · 回到红椅子，和大家一起吃饭";
    if (pressed) {
      s.theater.seated = true;
      s.player.x = level.destination.x - 13;
      s.player.y = level.destination.y - 44;
      s.player.vx = 0;
      s.player.vy = 0;
      s.player.pose = "sit";
      s.player.facing = 1;
    }
    return;
  }
  if (theaterInteraction(s, pressed, (text) => tell(s, text, 7))) return;
  if (nestInteraction(s, pressed, (text) => tell(s, text, 7))) return;
  if (near(s, level.origin.x, level.origin.y) && !s.carrying) {
    s.prompt = `E · 取走${level.meal}`;
    if (pressed) {
      s.carrying = true;
      s.time = 0;
      persistCheckpoint(s);
      feedback(s, "order", level.origin.x, level.origin.y - 20);
      tell(s, `${level.customer}在前面等你。${level.title}，慢慢来。`, 5);
    }
  } else if (near(s, level.destination.x, level.destination.y) && s.carrying) {
    s.prompt =
      s.boss && s.boss.phase !== "off"
        ? "先关闭烤炉背部的三个阀门"
        : s.machine && servingStage(s) < 3
          ? "先把三条分餐带停稳"
          : level.rain?.bird && !s.switches.includes("bird-ribbon")
            ? "先到鸟巢旁取回香草系带"
            : level.theater?.banquet
              ? !banquetReady(s) ? "先停稳热铃、绞盘和冠轮" : !s.switches.includes("banquet-served") ? "先把合菜摆上左边的长桌" : "E · 放下餐箱，在红椅子坐下"
              : level.id === "last-table" && !s.switches.includes("table-served") ? "先把第一篮饭放上后台的桌子"
            : `E · 把${level.meal}递给${level.customer}`;
    if (
      (s.boss && s.boss.phase !== "off") ||
      (s.machine && servingStage(s) < 3) ||
      (level.rain?.bird && !s.switches.includes("bird-ribbon")) ||
      (level.id === "last-table" && !s.switches.includes("table-served")) ||
      (level.theater?.banquet && (!banquetReady(s) || !s.switches.includes("banquet-served")))
    ) return;
    if (pressed) {
      s.carrying = false;
      s.prompt = "";
      s.deliveryTime = s.time;
      s.phase = "delivered";
      s.player.pose = "deliver";
      s.player.facing = level.destination.x + 40 >= s.player.x + 13 ? 1 : -1;
      if (level.theater?.banquet) {
        s.theater.seated = true;
        s.player.x = level.destination.x - 13;
        s.player.y = level.destination.y - 44;
        s.player.vx = 0;
        s.player.vy = 0;
        s.player.pose = "sit";
        s.player.facing = 1;
      }
      if (s.mode !== "practice") {
        if (!s.save.delivered.includes(level.id)) {
          s.save.delivered.push(level.id);
          s.save.money += level.reward;
        }
        if (s.mode === "hot") {
          const old = s.save.records[level.id]?.best || 0;
          const best = !old || s.time < old ? s.time : old;
          s.save.records[level.id] = { best, medal: best <= level.hotLimit };
          if (level.id === ORDER) {
            s.save.hotBest = best;
            s.save.hotMedal = best <= level.hotLimit;
          }
        }
        s.save.resume = null;
      }
      feedback(s, "clear", level.destination.x, level.destination.y - 35);
      sparks(s, level.destination.x, level.destination.y - 45);
      tell(s, level.aftermath, 8);
    }
  } else if (level.id === ORDER && near(s, 1650, 680)) {
    s.prompt = s.save.kindness
      ? "E · 看看修理师的面包"
      : s.bread
        ? "E · 把多出来的面包留给栞栞"
        : "E · 和修理师栞栞说话";
    if (pressed) {
      if (s.bread && !s.save.kindness) {
        s.save.kindness = true;
        s.save.money += 8;
        s.bread = false;
        feedback(s, "kindness", 1684, 624);
        tell(s, "栞栞掰下一半面包，悄悄放到猫咪面前。“它好像比我更饿。”", 6);
      } else tell(
          s,
          s.save.kindness
            ? "小猫安心吃着面包。栞栞的那一半，还放在修理台上。"
            : "“我不饿。” 可他的修理台上，只有一杯凉掉的水。",
          5,
        );
    }
  }
}
export function stepDelivery(
  s: DeliveryGame,
  input: DeliveryInput,
  dt = FIXED_DT,
) {
  if (s.phase === "paused" || s.phase === "title") return;
  advanceFeedback(s, dt);
  if (s.phase === "delivered") return;
  s.clock += dt;
  s.toastTimer = Math.max(0, s.toastTimer - dt);
  s.particles = s.particles.filter((v) => {
    v.life -= dt;
    v.x += v.vx * dt;
    v.y += v.vy * dt;
    v.vy += 180 * dt;
    return v.life > 0;
  });
  if (s.phase === "dead") {
    if (s.mode === "hot" && s.carrying) s.time += dt;
    s.deathTimer -= dt;
    if (s.deathTimer <= 0) retryDelivery(s);
    return;
  }
  if (s.carrying) s.time += dt;
  const level = deliveryLevel(s);
  const p = s.player;
  if (s.theater.seated) {
    s.prompt = "E · 起身，和大家再待一会";
    if (input.interact && !p.interactHeld) {
      s.theater.seated = false;
      p.interactHeld = true;
      tell(s, "碗里还留着热饭。可以在长桌边走走，或随时再坐下。", 5);
    } else {
      p.interactHeld = input.interact;
      p.pose = "sit";
      return;
    }
  }
  const wasAirborne = !p.grounded;
  p.invincible = Math.max(0, p.invincible - dt);
  p.land = Math.max(0, p.land - dt);
  p.attack = Math.max(0, p.attack - dt);
  p.cooldown = Math.max(0, p.cooldown - dt);
  p.dash = Math.max(0, p.dash - dt);
  if (input.attack && !p.attackHeld && p.cooldown === 0) {
    p.attack = 0.34;
    p.cooldown = s.save.tray === "wide" ? 0.64 : 0.43;
    p.hit = [];
    feedback(s, "swing");
  }
  p.attackHeld = input.attack;
  const pressed = input.interact && !p.interactHeld;
  p.interactHeld = input.interact;
  if (input.jump && !p.jumpHeld) p.buffer = s.save.settings.assist ? 0.18 : PHYSICS.buffer;
  else p.buffer = Math.max(0, p.buffer - dt);
  if (!input.jump && p.jumpHeld && p.vy < -210) p.vy = -210;
  p.jumpHeld = input.jump;
  p.coyote = p.grounded
    ? s.save.settings.assist
      ? 0.16
      : PHYSICS.coyote
    : Math.max(0, p.coyote - dt);
  if (p.buffer > 0 && p.coyote > 0) {
    p.vy = -PHYSICS.jump;
    p.buffer = 0;
    p.coyote = 0;
    p.grounded = false;
    feedback(s, "jump", p.x + 13, p.y + p.h);
  }
  const direction = Number(input.right) - Number(input.left);
  const speed = input.run ? PHYSICS.run : PHYSICS.walk;
  const acceleration = p.grounded
    ? PHYSICS.acceleration
    : PHYSICS.airAcceleration;
  const target = direction * speed;
  const delta =
    (direction ? acceleration : p.grounded ? PHYSICS.friction : 110) * dt;
  p.vx += Math.max(-delta, Math.min(delta, target - p.vx));
  if (direction) p.facing = direction;
  if (input.dash && !p.dashHeld && wasAirborne && p.dashReady && steamBox(s)) {
    p.dash = 0.18;
    p.dashReady = false;
    p.dashFacing = p.facing;
    feedback(s, "dash", p.x + 13 - p.facing * 20, p.y + 24);
  }
  p.dashHeld = !!input.dash;
  if (p.dash > 0) {
    p.vx = p.dashFacing * 620;
    p.vy = 0;
  } else p.vy += PHYSICS.gravity * (p.vy < 0 && input.jump ? 0.7 : 1) * dt;
  advanceMachinery(
    s,
    dt,
    (x) => hurt(s, x),
    (text) => tell(s, text),
  );
  if (
    s.save.resume?.switches?.length !== s.switches.length ||
    s.save.resume?.bossOff !== (s.boss?.phase === "off")
  ) persistCheckpoint(s);
  advanceCart(s, dt, (text) => tell(s, text, 5));
  advanceRain(
    s,
    dt,
    (x) => hurt(s, x),
    (text) => tell(s, text, 5),
  );
  advanceTheater(s, dt);
  const blocks = deliverySurfaces(s);
  const previousY = p.y;
  const previousVy = p.vy;
  const landed = move(p, blocks, dt);
  if (landed && !p.grounded && previousVy > 120) {
    p.land = 0.13;
    feedback(s, landingKind(blocks.find(b => b.id === landed)?.kind), p.x + 13, p.y + p.h, Math.min(1, previousVy / 650));
  }
  p.grounded = landed !== null;
  if (p.grounded) {
    p.dashReady = true;
    p.dash = 0;
  }
  bounceBird(s, previousY);
  p.x = Math.max(0, Math.min(level.world.w - p.w, p.x));
  const rainSprings =
    level.rain?.canopies.filter((canopy) => ["open", "warning"].includes(canopyPhase(s, canopy)),) || [];
  for (const spring of [...level.springs, ...rainSprings]) {
    if (landed === spring.id) {
      if (!s.awnings[spring.id]) feedback(s, "cloth-tight", p.x + 13, p.y + p.h);
      s.awnings[spring.id] = (s.awnings[spring.id] || 0) + dt;
      if (s.awnings[spring.id] >= 0.3) {
        p.vy = -spring.power;
        p.grounded = false;
        p.coyote = 0;
        s.awnings[spring.id] = -0.4;
        feedback(s, "spring", p.x + 13, p.y + p.h);
        tell(s, "棚布绷紧了——借它的弹力上阳台！", 3);
      }
    } else if ((s.awnings[spring.id] || 0) > 0) s.awnings[spring.id] = 0;
    if ((s.awnings[spring.id] || 0) < 0) s.awnings[spring.id] = Math.min(0, s.awnings[spring.id] + dt);
  }
  attack(s);
  if (s.save.resume?.switches?.length !== s.switches.length) persistCheckpoint(s);
  advanceDough(s, blocks, dt);
  for (const item of level.pickups) {
    if (
      s.collected.includes(item.id) ||
      !overlaps(p, { x: item.x - 14, y: item.y - 18, w: 28, h: 34 })
    ) continue;
    s.collected.push(item.id);
    sparks(s, item.x, item.y);
    if (item.kind === "bread") {
      if (!s.save.kindness) s.bread = true;
      tell(s, "多出来的面包。栞栞的修理台就在前面。", 4);
    } else {
      if (!s.save.found.includes(item.id)) {
        s.save.found.push(item.id);
        if (item.kind === "coin") s.save.money++;
      }
      if (item.kind === "sign") {
        tell(s, "找回小馆的旧招牌！在整备里可换宽托盘：挑得远，收招稍慢。", 6);
        feedback(s, "star", item.x, item.y);
      } else feedback(s, "coin", item.x, item.y);
    }
  }
  for (const cp of level.checkpoints) {
    const current = level.checkpoints.findIndex((c) => c.id === s.checkpoint);
    if (
      p.x + p.w >= cp.x - 40 &&
      p.x < cp.x + 250 &&
      p.y <= cp.y + 6 &&
      level.checkpoints.indexOf(cp) > current &&
      p.grounded
    ) {
      s.checkpoint = cp.id;
      p.health = 3;
      persistCheckpoint(s);
      feedback(s, "checkpoint", cp.x, cp.y + 22);
      tell(s, `${cp.name} · 歇脚点已记住，餐箱也会一起保存。`, 3);
    }
  }
  if (p.y > level.world.h - 40) die(s);
  if (s.phase === "playing") interact(s, pressed);
  if (s.save.resume?.switches?.length !== s.switches.length) persistCheckpoint(s);
  p.pose = s.theater.seated ? "sit" : deliveryFinished(s)
    ? "deliver"
    : deliveryPlayerHurt(s)
      ? "hurt"
      : p.attack > 0
        ? "tray"
        : !p.grounded
          ? p.vy < 0
            ? "rise"
            : "fall"
          : p.land > 0
            ? "land"
            : Math.abs(p.vx) > 25 && (!direction || Math.sign(p.vx) !== direction)
              ? "brake"
              : Math.abs(p.vx) > 25
                ? Math.abs(p.vx) < 130
                  ? "start"
                  : "run"
                : "idle";
  followDeliveryCamera(s, dt);
}

/** Resizing must reframe even while physics is paused or an order receipt is open. */
export function resizeDeliveryViewport(s: DeliveryGame, w: number, h: number) {
  s.viewport = { w, h };
  followDeliveryCamera(s, 0, true);
}

function followDeliveryCamera(s: DeliveryGame, dt: number, snap = false) {
  const p = s.player;
  const level = deliveryLevel(s);
  const look = p.facing * Math.min(115, Math.abs(p.vx) * 0.24);
  let tx = Math.max(
    0,
    Math.min(level.world.w - s.viewport.w, p.x - s.viewport.w * 0.344 + look),
  );
  let ty = Math.max(
    0,
    Math.min(level.world.h - s.viewport.h, p.y - s.viewport.h * 0.593),
  );
  if (s.boss && p.x > 530 && p.x < 1920 && s.boss.phase !== "off") {
    const bossFrame = s.boss.x + 125 - s.viewport.w / 2;
    const playerLeft = p.x - s.viewport.w * 0.18;
    const playerRight = p.x + p.w - s.viewport.w * 0.82;
    tx = Math.max(
      0,
      Math.min(
        level.world.w - s.viewport.w,
        Math.max(playerRight, Math.min(bossFrame, playerLeft)),
      ),
    );
    ty = Math.max(
      0,
      Math.min(
        level.world.h - s.viewport.h,
        level.world.floor - s.viewport.h * 0.82,
      ),
    );
  }
  s.camera.x += (tx - s.camera.x) * (snap ? 1 : Math.min(1, dt * 5.5));
  s.camera.y += (ty - s.camera.y) * (snap ? 1 : Math.min(1, dt * 4));
}
export function deliveryPublicState(s: DeliveryGame) {
  const c = s.camera;
  const level = deliveryLevel(s);
  return {
    title: "春日第一单",
    coordinate: "world pixels; origin top-left; +x right, +y down",
    phase: s.phase,
    mode: s.mode,
    player: { ...s.player, hit: undefined },
    playerAnimation: deliveryPlayerFrame(s),
    trayPose: deliveryTrayPose(s),
    carrying: s.carrying,
    order: level.id,
    level: level.title,
    destination: { ...level.destination, customer: level.customer },
    checkpoint: s.checkpoint,
    camera: c,
    viewport: s.viewport,
    time: Math.round(s.time * 100) / 100,
    deaths: s.deaths,
    dough: s.dough
      .filter((e) => e.x > c.x - 80 && e.x < c.x + s.viewport.w + 80)
      .map((e) => ({ ...e })),
    surfaces: deliverySurfaces(s).filter(
      (b) => b.x + b.w > c.x && b.x < c.x + s.viewport.w,
    ),
    pickups: level.pickups.filter(
      (p) => !s.collected.includes(p.id) && p.x > c.x && p.x < c.x + s.viewport.w,
    ),
    cart: s.cart,
    awnings: s.awnings,
    prompt: s.prompt,
    toast: s.toastTimer > 0 ? s.toast : "",
    lifts: s.lifts,
    bounces: s.bounces,
    feedback: s.feedback.map(cue => ({ ...cue, age: Math.round(cue.age * 1000) / 1000 })),
    pans: s.pans,
    boss: s.boss,
    machine: s.machine ? { ...s.machine, stage: servingStage(s) } : null,
    projectiles: s.projectiles,
    switches: s.switches,
    insulatedTray: s.save.delivered.includes("oven-crab"),
    steamBox: steamBox(s),
    rain: s.rain,
    theater: { ...s.theater, crownPhase: crownPhase(s), lifts: Object.fromEntries((level.theater?.lifts || []).map(lift => [lift.id, { y: s.theater.lifts[lift.id], phase: liftPhase(s, lift.hook) }])) },
    bread: s.bread,
    save: s.save,
    restaurant: { displayed: s.save.home.displayed, keepsakes: homeKeepsakes(s.save).map(v => v.id), neighbors: homeNeighbors(s.save).map(v => ({ name: v.name, line: v.line })) },
    shortcutOpen: s.save.delivered.includes(level.id),
  };
}

export function visitBanquet(s: DeliveryGame) {
  if (!s.save.delivered.includes("banquet-machine")) return;
  startDelivery(s, "story", "banquet-seat", "banquet-machine");
  const level = deliveryLevel(s);
  s.player.x = level.destination.x - 13;
  s.player.y = level.destination.y - 44;
  s.player.pose = "sit";
  s.theater.seated = true;
  s.carrying = false;
  s.save.resume = null;
  s.camera.x = Math.max(0, Math.min(level.world.w - s.viewport.w, s.player.x - s.viewport.w * 0.6));
  s.camera.y = Math.max(0, 500 - s.viewport.h * 0.7);
  tell(s, "大家还在长桌旁。给岁己留的位置一直都在。", 6);
}

function deliveryFinished(s: DeliveryGame) {
  return s.phase === "delivered";
}
