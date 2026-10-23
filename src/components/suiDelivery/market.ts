import { overlaps } from "../suiPlatformer/engine";
import { deliveryLevel } from "./levels";
import { feedback } from "./feedback";
import type { DeliveryGame, Surface } from "./types";

export const servingStage = (s: DeliveryGame) => deliveryLevel(s).gates.filter((g) => s.switches.includes(g.id)).length;
export const beltSpeed = (s: DeliveryGame) => [-75, 95, -125][Math.min(2, servingStage(s))];

export function resetCart(s: DeliveryGame) {
  const level = deliveryLevel(s);
  const { cart } = level;
  const stop = cart?.rail && s.checkpoint === "freight-middle" ? 1 : 0;
  const node = cart?.rail?.[stop];
  s.cart = {
    x: node?.x ?? cart?.start ?? 0,
    y: node?.y ?? cart?.y ?? 0,
    previous: node?.x ?? cart?.start ?? 0,
    previousY: node?.y ?? cart?.y ?? 0,
    station: stop,
    active: false,
    docked: false,
  };
}

export function advanceCart(s: DeliveryGame, dt: number, tell: (text: string) => void) {
  const { cart } = deliveryLevel(s);
  if (!cart) return;
  const c = s.cart;
  const p = s.player;
  c.previous = c.x;
  c.previousY = c.y;
  const aboard = p.grounded && Math.abs(p.y + p.h - c.y) < 3 && p.x + p.w > c.x && p.x < c.x + 160;
  if (cart.rail) {
    const stop = cart.rail[c.station];
    const next = cart.rail[c.station + 1];
    const blocked = stop.gate && !s.switches.includes(stop.gate);
    const wasActive = c.active;
    c.active = !!next && !blocked && (c.active || aboard);
    if (c.active && !wasActive) feedback(s, "cart-start", c.x + 80, c.y - 18);
    if (c.active && next) {
      const dx = next.x - c.x;
      const dy = next.y - c.y;
      const distance = Math.hypot(dx, dy);
      const travel = Math.min(distance, cart.speed * dt);
      if (distance > 0) {
        c.x += (dx / distance) * travel;
        c.y += (dy / distance) * travel;
      }
      if (distance <= travel + 0.01) {
        c.x = next.x;
        c.y = next.y;
        c.station++;
        c.active = false;
        c.docked = c.station === cart.rail.length - 1;
        feedback(s, "cart-stop", c.x + 80, c.y - 18);
        tell(c.docked ? "货运餐车到站了。前面的人已经铺好了卸货台。" : "中途站到了。先上站台，把金圈热弹反回铃铛，餐车才能继续。");
      }
    }
  } else {
    if (p.x > cart.trigger && !c.active && !c.docked) {
      c.active = true;
      feedback(s, "cart-start", c.x + 80, c.y - 18);
      tell(deliveryLevel(s).theme === "market" ? "叮铃！摊车沿着轨道前移。站稳车顶，看清低梁再跳。" : "叮铃！餐车慢慢开了。跳上车顶，或走下面的石墩。");
    }
    if (c.active) {
      c.x = Math.min(cart.end, c.x + cart.speed * dt);
      if (c.x === cart.end) {
        feedback(s, "cart-stop", c.x + 80, c.y - 18);
        c.docked = true;
        c.active = false;
      }
    }
  }
  if (aboard) {
    p.x += c.x - c.previous;
    p.y += c.y - c.previousY;
  }
}

export function servingSurfaces(s: DeliveryGame): Surface[] {
  if (!s.machine) return [];
  const stage = servingStage(s);
  const belt = (id: string, x: number, y: number, w: number): Surface => ({ id, x, y, w, h: 20, kind: "belt" });
  const surfaces = [belt("sorter-lower-belt", 900, 680, 720)];
  if (stage >= 1) {
    surfaces.push(belt("sorter-middle-belt", 1080, 560, 510));
    surfaces.push({ id: "sorter-first-step", x: 900, y: 610, w: 145, h: 18, kind: "pan" });
  }
  if (stage >= 2) {
    surfaces.push(belt("sorter-upper-belt", 1140, 440, 450));
    surfaces.push({ id: "sorter-second-step", x: 950, y: 495, w: 145, h: 18, kind: "pan" });
  }
  if (stage >= 3) surfaces.push({ id: "sorter-table-bridge", x: 1600, y: 560, w: 470, h: 20, kind: "ladder" });
  return surfaces;
}

export function advanceServing(s: DeliveryGame, dt: number, hurt: (x: number) => void, tell: (text: string) => void) {
  const m = s.machine;
  if (!m) return;
  const stage = servingStage(s);
  if (stage >= 3) {
    if (m.phase !== "off") {
      m.phase = "off";
      feedback(s, "mechanism", 1450, 400);
      tell("三条分餐带都停稳了！机械手把餐盘连成一条路。最后一盒饭，亲手递过去吧。");
    }
    return;
  }
  const p = s.player;
  if (m.phase === "sleep") {
    if (p.x < 630) return;
    m.phase = "warning";
    feedback(s, "warning", 1030, 650 - stage * 120);
    m.timer = 1.2;
    tell("分餐臂先缩回，再扫过传送带。高处观察台是安全的，金圈热弹可以反回开关。");
  }
  m.timer -= dt;
  if (m.timer <= 0) {
    if (m.phase === "warning") { m.phase = "sweep"; m.timer = 0.65; feedback(s, "sweep", 1030, 650 - stage * 120); } else if (m.phase === "sweep") { m.phase = "feed"; m.timer = 5; feedback(s, "steam", 1480, 635 - stage * 120); } else { m.phase = "warning"; m.timer = 1.2; feedback(s, "warning", 1030, 650 - stage * 120); }
  }
  const y = 680 - stage * 120;
  if (m.phase === "sweep") {
    const x = 1030 + (1 - m.timer / 0.65) * 510;
    if (overlaps(p, { x: x - 35, y: y - 42, w: 70, h: 42 })) hurt(x);
  }
  if (p.grounded && Math.abs(p.y + p.h - y) < 3 && p.x > (stage ? 1080 : 900) && p.x < 1590) {
    p.x += beltSpeed(s) * dt;
  }
}
