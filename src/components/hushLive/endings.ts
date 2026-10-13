import type { Game } from "./engine";

export type EndingId = "lamp" | "rice-share" | "kitchen-care" | "warm-water" | "dry-hair" | "supper-table" | "night-walk";
export type EndingActor = { x: number; z: number; stand: number; yaw: number; arms: [number, number]; lean: number };
const actor = (x: number, stand = 0, yaw = 0, arms: [number, number] = [-0.3, -0.3], lean = 0): EndingActor => ({ x, z: 12, stand, yaw, arms, lean });
const SCENES: Record<EndingId, { title: string; player: EndingActor; partner: EndingActor; mood: string }> = {
  lamp: { title: "留给你的灯，还亮着。", player: actor(-0.3), partner: actor(0.3, 0, -0.15, [-0.35, -0.3], 0.14), mood: "#c6c2ac" },
  "rice-share": { title: "一碗热饭，两把勺子。", player: actor(-0.5, 0, 0.15, [-0.3, -1]), partner: actor(0.5, 0, -0.15, [-1, -0.3]), mood: "#c6bd9e" },
  "kitchen-care": { title: "锅铲给我，你先歇着。", player: actor(-0.38, 1, -0.2, [-0.3, -1.1]), partner: { ...actor(0.12, 1, -0.2, [-1.25, -1.25], 0.12), z: 11.65 }, mood: "#bcc2ac" },
  "warm-water": { title: "喝口温水，再慢慢说晚安。", player: actor(-0.32, 0, 0.2, [-0.3, -1.15]), partner: actor(0.24, 0, -0.1, [-1, -0.3], 0.16), mood: "#aebcc2" },
  "dry-hair": { title: "头发擦干了，再抱着你睡。", player: actor(-0.36, 1, 0.65, [-1.65, -1.85]), partner: actor(0.34, 0, -0.1, [-0.3, -0.3], 0.08), mood: "#c0b3b4" },
  "supper-table": { title: "今晚轮到我照顾你。", player: actor(-0.52, 0, 0.15, [-0.3, -0.9]), partner: actor(0.52, 0, -0.2, [-1.05, -0.3]), mood: "#273e47" },
  "night-walk": { title: "不用小声了，牵着手回家。", player: actor(-0.29, 1, 0.08, [-0.2, -0.15]), partner: actor(0.29, 1, -0.08, [-0.15, -0.2], 0.08), mood: "#263f4b" },
};
/** The scene follows the chosen story, never seed parity or the selected costume. */
export function endingScene(s: Game) {
  if (!s.won) return null;
  const d = s.daily;
  const care = d?.endingChoice === "care";
  const id: EndingId = !d ? "lamp" : d.after === "rice" ? care ? "kitchen-care" : "rice-share"
    : d.after === "shower" ? care ? "dry-hair" : "warm-water"
      : care ? "night-walk" : "supper-table";
  return { id, ...SCENES[id] };
}

export function endingCamera(s: Game, portrait: boolean) {
  const scene = endingScene(s);
  const standing = scene && ["kitchen-care", "dry-hair", "night-walk"].includes(scene.id);
  return {
    position: (portrait ? [0, standing ? 2.3 : 2.1, 16] : [1.7, standing ? 2.05 : 1.8, 15.7]) as [number, number, number],
    target: (portrait ? [0, standing ? -0.15 : -0.45, 12] : [-0.85, standing ? 1.15 : 0.9, 12]) as [number, number, number],
  };
}
