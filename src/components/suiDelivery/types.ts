import type { DeliveryFeedback } from "./feedback";

export type DeliveryInput = {
  left: boolean;
  right: boolean;
  jump: boolean;
  run: boolean;
  attack: boolean;
  interact: boolean;
  dash: boolean;
};
export type Body = {
  x: number;
  y: number;
  w: number;
  h: number;
  vx: number;
  vy: number;
};
export type Surface = {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  kind:
    | "ground"
    | "brick"
    | "wood"
    | "awning"
    | "cart"
    | "ladder"
    | "pan"
    | "oven-back"
    | "belt";
  solid?: boolean;
};
export type Checkpoint = { id: string; x: number; y: number; name: string };
export type Pickup = {
  id: string;
  x: number;
  y: number;
  kind: "coin" | "sign" | "bread";
};
export type DeliveryLevel = {
  id: string;
  district: string;
  title: string;
  meal: string;
  customer: string;
  theme:
    | "street"
    | "bakery"
    | "oven"
    | "market"
    | "freight"
    | "sorter"
    | "rain"
    | "greenhouse"
    | "bird"
    | "scenery"
    | "last-table"
    | "banquet";
  world: { w: number; h: number; floor: number };
  origin: { x: number; y: number };
  destination: { x: number; y: number };
  intro: string;
  quote: string;
  aftermath: string;
  reward: number;
  hotLimit: number;
  surfaces: Surface[];
  checkpoints: Checkpoint[];
  pickups: Pickup[];
  dough: { id: string; x: number; y: number }[];
  signs: { x: number; y: number; title: string; text: string }[];
  springs: { id: string; power: number }[];
  pans: { id: string; x: number; y: number; high: number; w: number }[];
  cart?: {
    start: number;
    end: number;
    y: number;
    trigger: number;
    speed: number;
    rail?: { x: number; y: number; gate?: string }[];
  };
  emitters: {
    id: string;
    x: number;
    y: number;
    direction: number;
    period: number;
    stage?: number;
  }[];
  gates: {
    id: string;
    x: number;
    y: number;
    w: number;
    h: number;
    targetX: number;
    targetY: number;
    barrier?: boolean;
  }[];
  boss?: "oven-crab" | "serving-machine";
  theater?: {
    lifts: { id: string; x: number; y: number; high: number; w: number; hook: string }[];
    hooks: { id: string; x: number; y: number; label: string; requires?: string }[];
    table?: { x: number; y: number };
    banquet?: boolean;
  };
  rain?: {
    hooks: { id: string; x: number; y: number; label: string }[];
    canopies: {
      id: string;
      x: number;
      y: number;
      w: number;
      hook: string;
      power: number;
      cycle?: number;
    }[];
    lift?: {
      id: string;
      x: number;
      y: number;
      high: number;
      w: number;
      hook: string;
    };
    bird?: { x: number; y: number; end: number; nestX: number; nestY: number };
  };
};
export type ServingMachine = {
  phase: "sleep" | "warning" | "sweep" | "feed" | "off";
  timer: number;
};
export type OvenCrab = {
  stage: number;
  phase:
    | "sleep"
    | "claw-warning"
    | "claw"
    | "vent-warning"
    | "vent"
    | "rest"
    | "off";
  timer: number;
  x: number;
  facing: number;
  hits: number;
};
export type Dough = Body & {
  id: string;
  homeX: number;
  homeY: number;
  state: "hop" | "loft" | "gone";
  timer: number;
  grace: number;
  face: number;
};
export type DeliverySave = {
  version: 2;
  found: string[];
  delivered: string[];
  kindness: boolean;
  money: number;
  home: { owned: string[]; displayed: string[] };
  tray: "quick" | "wide";
  hotBest: number;
  hotMedal: boolean;
  records: Record<string, { best: number; medal: boolean }>;
  resume: {
    checkpoint: string;
    carrying: boolean;
    level?: string;
    switches?: string[];
    bossOff?: boolean;
  } | null;
  settings: { sound: boolean; assist: boolean; reducedMotion: boolean };
};
export type DeliveryGame = {
  levelId: string;
  phase: "title" | "playing" | "paused" | "dead" | "delivered";
  mode: "story" | "hot" | "practice";
  player: Body & {
    grounded: boolean;
    facing: number;
    health: number;
    invincible: number;
    coyote: number;
    buffer: number;
    jumpHeld: boolean;
    attackHeld: boolean;
    interactHeld: boolean;
    attack: number;
    cooldown: number;
    hit: string[];
    pose: string;
    land: number;
    dash: number;
    dashReady: boolean;
    dashHeld: boolean;
    dashFacing: number;
  };
  save: DeliverySave;
  carrying: boolean;
  checkpoint: string;
  dough: Dough[];
  collected: string[];
  bread: boolean;
  time: number;
  clock: number;
  deaths: number;
  deathTimer: number;
  camera: { x: number; y: number };
  viewport: { w: number; h: number };
  cart: {
    x: number;
    y: number;
    previous: number;
    previousY: number;
    station: number;
    active: boolean;
    docked: boolean;
  };
  awnings: Record<string, number>;
  toast: string;
  toastTimer: number;
  events: DeliveryFeedback[];
  feedback: DeliveryFeedback[];
  particles: {
    x: number;
    y: number;
    vx: number;
    vy: number;
    life: number;
    color: number;
  }[];
  deliveryTime: number;
  prompt: string;
  lifts: number;
  bounces: number;
  pans: Record<string, { y: number; previous: number; timer: number }>;
  projectiles: {
    id: number;
    x: number;
    y: number;
    vx: number;
    reflected: boolean;
    life: number;
  }[];
  projectileId: number;
  switches: string[];
  boss: OvenCrab | null;
  machine: ServingMachine | null;
  theater: { time: number; lifts: Record<string, number>; seated: boolean };
  rain: {
    liftY: number;
    bird: {
      x: number;
      y: number;
      phase: "perch" | "warning" | "swoop" | "rest" | "home";
      timer: number;
      targetX: number;
      targetY: number;
      fromX: number;
      fromY: number;
    } | null;
  };
};
