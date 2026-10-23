import type { DeliveryGame } from "./types";

export const PLAYER_SPRITE_FRAME = 104;
export const PLAYER_SPRITE_SIZE = 71;

export function deliveryPlayerHurt(s: DeliveryGame) {
  return s.feedback.some(cue => cue.kind === "hurt" && cue.age < 0.24);
}

/** Match the existing 0.06s startup / 0.18s contact / 0.10s recovery. */
export function deliveryAttackFrame(remaining: number) {
  if (remaining > 0.28) return 0;
  if (remaining >= 0.19) return 1;
  if (remaining >= 0.1) return 2;
  return 3;
}

/** Hand and tray offsets from the player's bottom-center, mirrored by facing. */
export function deliveryTrayPose(s: DeliveryGame) {
  const frame = s.player.attack > 0 ? deliveryAttackFrame(s.player.attack) : -1;
  const hand = [{ x: 10, y: 33 }, { x: 22, y: 13 }, { x: 19, y: 4 }, { x: 7, y: 31 }][frame] || { x: 12, y: 27 };
  const active = s.player.attack >= 0.1 && s.player.attack <= 0.28;
  return { hand, x: hand.x + (active ? 19 : 13), y: hand.y - 3, active };
}

/** Select art from simulation facts; presentation never delays or changes an input. */
export function deliveryPlayerFrame(s: DeliveryGame) {
  const p = s.player;
  const drawn = (group: string, frame: number, state: string) => ({ texture: `delivery-${group}`, frame, state, drawn: true });
  if (s.theater.seated) return drawn("reaction", 3, "sit");
  if (s.phase === "delivered" || p.pose === "deliver") return drawn("reaction", 2, "deliver");
  if (deliveryPlayerHurt(s)) return drawn("reaction", 1, "hurt");
  if (p.attack > 0) {
    const frame = deliveryAttackFrame(p.attack);
    return drawn("tray", frame, ["tray-windup", "tray-contact", "tray-extend", "tray-recover"][frame]);
  }
  const lift = s.feedback.some(cue => (cue.kind === "jump" || cue.kind === "stomp" || cue.kind === "spring") && cue.age < 0.08);
  if (!p.grounded) {
    if (p.dash > 0) return drawn("air", 1, "dash");
    if (p.vy >= 0) return drawn("air", 2, "fall");
    return drawn("air", lift ? 0 : 1, lift ? "takeoff" : "rise");
  }
  if (p.land > 0) return drawn("air", 3, "land");
  if (p.pose === "brake") return drawn("reaction", 0, "brake");
  if (p.pose === "start") return drawn("gait", 1, "start");
  if (p.pose === "run") return drawn("gait", Math.floor(s.clock * (Math.abs(p.vx) > 270 ? 13 : 9)) % 4, "run");
  return { texture: "delivery-sui", frame: 0, state: "idle", drawn: false };
}
