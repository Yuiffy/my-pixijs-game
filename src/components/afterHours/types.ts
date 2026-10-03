export type Stage =
  | "visit"
  | "tea"
  | "photo"
  | "home"
  | "unease"
  | "power"
  | "memories"
  | "corridor"
  | "chase"
  | "choice"
  | "dawn";
export type Mode = "title" | "playing" | "paused" | "dead" | "ending";
export type Panel =
  | "none"
  | "journal"
  | "fuse"
  | "code"
  | "choice"
  | "dialogue"
  | "tea"
  | "photo"
  | "photograph";
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
  version: 2;
  mode: Mode;
  stage: Stage;
  panel: Panel;
  player: Point & { yaw: number; pitch: number; stamina: number };
  echo: Echo;
  sui: Point & { yaw: number; path: Point[]; repath: number };
  evening: {
    greeted: boolean;
    tea: number;
    blend: "honey" | "lemon" | null;
    carrying: boolean;
    served: boolean;
    photo: boolean;
    promise: "tomorrow" | "extra" | null;
    anomaly: number;
    dialogue: "greeting" | "serve" | "promise" | "anomaly" | null;
    gesture: "idle" | "wave" | "offer" | "heart" | "shy" | "worried";
    gestureUntil: number;
  };
  photoRequest: number;
  photoImage: string;
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
