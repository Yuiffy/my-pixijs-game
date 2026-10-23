import { overlaps } from "../suiPlatformer/engine";
import { deliveryLevel } from "./levels";
import { feedback } from "./feedback";
import type { DeliveryGame, Surface } from "./types";

type Box = { x: number; y: number; w: number; h: number };
export const steamBox = (s: DeliveryGame) => s.save.delivered.includes("serving-machine");

export function resetRain(s: DeliveryGame) {
  const { rain } = deliveryLevel(s);
  s.rain = {
    liftY:
      rain?.lift &&
      s.switches.includes(rain.lift.hook) &&
      s.checkpoint !== "green-door" &&
      s.checkpoint !== "green-entry"
        ? rain.lift.high
        : rain?.lift?.y || 0,
    bird: rain?.bird
      ? {
          x: rain.bird.x,
          y: rain.bird.y,
          phase: s.switches.includes("bird-ribbon") ? "home" : "perch",
          timer: 0,
          targetX: 0,
          targetY: 0,
          fromX: 0,
          fromY: 0,
        }
      : null,
  };
}

/** A one-second flutter warns before a canopy retracts; the first canopy stays open. */
export function canopyPhase(
  s: DeliveryGame,
  canopy: NonNullable<
    ReturnType<typeof deliveryLevel>["rain"]
  >["canopies"][number],
) {
  if (!s.switches.includes(canopy.hook)) return "closed";
  if (!canopy.cycle) return "open";
  const clock = s.clock % canopy.cycle;
  return clock < canopy.cycle - 2.2
    ? "open"
    : clock < canopy.cycle - 1.2
      ? "warning"
      : "folded";
}

export function rainSurfaces(s: DeliveryGame): Surface[] {
  const level = deliveryLevel(s);
  const { rain } = level;
  if (!rain) return [];
  const surfaces: Surface[] = rain.canopies
    .filter((canopy) => ["open", "warning"].includes(canopyPhase(s, canopy)))
    .map((canopy) => ({
      id: canopy.id,
      x: canopy.x,
      y: canopy.y,
      w: canopy.w,
      h: 16,
      kind: "awning",
    }));
  if (rain.lift) surfaces.push({
      id: rain.lift.id,
      x: rain.lift.x,
      y: s.rain.liftY,
      w: rain.lift.w,
      h: 20,
      kind: "pan",
    });
  if (s.switches.includes("green-outlet")) {
    surfaces.push({
      id: "green-flower-bed-1",
      x: 1650,
      y: 490,
      w: 165,
      h: 20,
      kind: "ladder",
    });
    surfaces.push({
      id: "green-flower-bed-2",
      x: 1860,
      y: 480,
      w: 150,
      h: 20,
      kind: "ladder",
    });
  }
  if (
    s.mode === "story" &&
    s.save.delivered.includes("rain-relay") &&
    level.id === "rain-relay"
  ) surfaces.push({
      id: "rain-neighbor-walkway",
      x: 2180,
      y: 530,
      w: 390,
      h: 18,
      kind: "ladder",
    });
  return surfaces;
}

export function attackRain(
  s: DeliveryGame,
  box: Box,
  tell: (text: string) => void,
) {
  const { rain } = deliveryLevel(s);
  if (!rain) return;
  for (const hook of rain.hooks) {
    if (
      s.switches.includes(hook.id) ||
      !overlaps(box, { x: hook.x - 15, y: hook.y - 22, w: 30, h: 44 })
    ) continue;
    s.switches.push(hook.id);
    feedback(s, hook.id.startsWith("green-") ? "water" : "rope", hook.x, hook.y);
    tell(
      hook.id === "green-inlet"
        ? "雨槽转向了！水位慢慢抬升，浮台会带你到高处。"
        : hook.id === "green-outlet"
          ? "积水流向花床，漂浮的花架连成路了。这条路会记住。"
          : "棚钩松开了，雨棚撑起来了！落在卷边棚布上，先下陷，再借力。",
    );
  }
  const b = s.rain.bird;
  if (
    b &&
    (b.phase === "swoop" || b.phase === "warning") &&
    overlaps(box, { x: b.x - 22, y: b.y - 18, w: 44, h: 36 })
  ) {
    b.phase = "rest";
    b.timer = 4;
    feedback(s, "bird", b.x, b.y);
    tell(
      "托盘轻轻一挡，小鸟停在空中喘口气。可以从它上方借一下力。它没有受伤。",
    );
  }
}

export function advanceRain(
  s: DeliveryGame,
  dt: number,
  hurt: (x: number) => void,
  tell: (text: string) => void,
) {
  const { rain } = deliveryLevel(s);
  if (!rain) return;
  const p = s.player;
  for (const canopy of rain.canopies) {
    if (!canopy.cycle || !s.switches.includes(canopy.hook)) continue;
    const before = Math.floor((s.clock - dt - (canopy.cycle - 2.2)) / canopy.cycle);
    const now = Math.floor((s.clock - (canopy.cycle - 2.2)) / canopy.cycle);
    if (now > before) feedback(s, "warning", canopy.x + canopy.w / 2, canopy.y - 15);
  }
  const { lift } = rain;
  if (lift) {
    const previous = s.rain.liftY;
    const target = s.switches.includes(lift.hook) ? lift.high : lift.y;
    s.rain.liftY += Math.max(-55 * dt, Math.min(55 * dt, target - previous));
    if (previous !== target && s.rain.liftY === target) feedback(s, "water", lift.x + lift.w / 2, target);
    if (
      p.grounded &&
      Math.abs(p.y + p.h - previous) < 3 &&
      p.x + p.w > lift.x &&
      p.x < lift.x + lift.w
    ) p.y += s.rain.liftY - previous;
  }
  const { bird } = s.rain;
  const config = rain.bird;
  if (!bird || !config) return;
  if (s.switches.includes("bird-ribbon") || p.x > config.end - 170) {
    bird.phase = "home";
    bird.x = config.nestX;
    bird.y = config.nestY - 30;
    return;
  }
  bird.timer -= dt;
  if (bird.phase === "perch" && p.x > 600 && Math.abs(p.x - bird.x) < 430) {
    bird.phase = "warning";
    feedback(s, "bird", bird.x, bird.y);
    bird.timer = 1.25;
    bird.targetX = p.x - 100;
    bird.targetY = p.y + 22;
    bird.fromX = bird.x;
    bird.fromY = bird.y;
    tell(
      "小鸟压低翅膀了，虚线是它接下来的掠行方向。等它过去，或在接近时上挑。 ",
    );
  } else if (bird.phase === "warning" && bird.timer <= 0) {
    bird.phase = "swoop";
    bird.timer = 0.75;
    feedback(s, "sweep", bird.x, bird.y);
  } else if (bird.phase === "swoop") {
    const t = Math.min(1, 1 - bird.timer / 0.75);
    bird.x = bird.fromX + (bird.targetX - bird.fromX) * t;
    bird.y = bird.fromY + (bird.targetY - bird.fromY) * t;
    if (overlaps(p, { x: bird.x - 17, y: bird.y - 12, w: 34, h: 24 })) hurt(bird.x);
    if (bird.timer <= 0) {
      bird.phase = "rest";
      bird.timer = 2.6;
    }
  } else if (bird.phase === "rest" && bird.timer <= 0) {
    bird.x = Math.min(config.end, Math.max(config.x, p.x + 370));
    bird.y = p.x < 1400 ? 350 : 315;
    bird.phase = "perch";
  }
}

export function bounceBird(s: DeliveryGame, previousY: number) {
  const { bird } = s.rain;
  const p = s.player;
  if (
    !bird ||
    bird.phase !== "rest" ||
    p.vy <= 0 ||
    previousY + p.h > bird.y + 6
  ) return;
  if (overlaps(p, { x: bird.x - 22, y: bird.y - 14, w: 44, h: 28 })) {
    p.y = bird.y - 14 - p.h;
    p.vy = p.jumpHeld ? -710 : -540;
    p.grounded = false;
    p.coyote = 0;
    bird.timer = 0.3;
    s.bounces++;
    feedback(s, "stomp", bird.x, bird.y - 14);
  }
}

export function nestInteraction(
  s: DeliveryGame,
  pressed: boolean,
  tell: (text: string) => void,
): boolean {
  const nest = deliveryLevel(s).rain?.bird;
  if (
    !nest ||
    Math.abs(s.player.x + 13 - nest.nestX) > 85 ||
    Math.abs(s.player.y + 44 - nest.nestY) > 55
  ) return false;
  s.prompt = s.switches.includes("bird-ribbon")
    ? "小鸟和幼鸟都吃上了面包"
    : "E · 留下面包，换回香草系带";
  if (pressed && !s.switches.includes("bird-ribbon")) {
    s.switches.push("bird-ribbon");
    feedback(s, "kindness", nest.nestX, nest.nestY - 20);
    tell(
      "岁己把备用面包掰成小块。小鸟松开系带，叼起面包送回巢里。香草可以带去餐会了。",
    );
  }
  return true;
}
