export type Stage =
  | "home"
  | "power"
  | "memories"
  | "corridor"
  | "chase"
  | "choice"
  | "dawn";
export type Mode = "title" | "playing" | "paused" | "dead" | "ending";
export type Panel = "none" | "journal" | "fuse" | "code" | "choice";
export type Point = { x: number; z: number };
export type Input = { forward: number; right: number; run: boolean };
export type Echo = Point & {
  yaw: number;
  alert: number;
  cooldown: number;
  path: Point[];
  repath: number;
  patrol: number;
};
export type Game = {
  version: 1;
  mode: Mode;
  stage: Stage;
  panel: Panel;
  player: Point & { yaw: number; pitch: number; stamina: number };
  echo: Echo;
  time: number;
  stageTime: number;
  tapes: string[];
  notes: string[];
  seals: number;
  sources: string[];
  fuse: number[];
  mistakes: number;
  deaths: number;
  hidden: boolean;
  flashlight: boolean;
  focus: string | null;
  subtitle: { speaker: string; text: string; until: number };
  notice: { text: string; until: number };
  ending: "dawn" | "loop" | null;
  revision: number;
};
export type Spot = Point & {
  id: string;
  label: string;
  height: number;
  reach?: number;
};
export type Rect = { id: string; x: number; z: number; w: number; d: number };
