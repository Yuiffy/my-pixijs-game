"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import {
  Component,
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  BUILDINGS,
  distance,
  LANDMARKS,
  nearestRoad,
  ROAD_SEGMENTS,
} from "./world";
import {
  CHARACTERS,
  chooseDialogue,
  createGame,
  createPhysics,
  interact,
  loadGame,
  nearestInteraction,
  notify,
  publicState,
  QUESTS,
  saveGame,
  step,
  toggleFlight,
  type Character,
  type Game,
  type Input,
  type Physics,
} from "./simulation";
import type { CameraRig } from "./Scene";
import { StreetAudio } from "./audio";
import { deliveryTarget, deliveryWarm, NEIGHBOR_ORDERS, warmSeconds } from "./life";
import { eveningFrame, eveningTarget, RECORD_SECONDS, recordingStatus, SHOW_SECONDS, SOUND_SPOTS } from "./evening";
import { citizenStatus, CITIZEN_PLANS } from "./citizens";
import { StreetControls } from "./controls";
import { DEFAULT_LOOK_SENSITIVITY, LOOK_SENSITIVITY_KEY, MAX_LOOK_SENSITIVITY, MIN_LOOK_SENSITIVITY, normalizeLookSensitivity } from "./lookSettings";
import { StreetNavigation, type Destination, type Route, type RouteRequest } from "./navigation";
import styles from "./liuzhou.module.css";
import { CITY_BOUNDS, inCore } from "./exploration";
import { CITY_ROAD_SEGMENTS } from "./city";
import { UNDERGROUND_ENTRANCES, UNDERGROUND_WALKS, undergroundLocation } from "./underground";
import { RIVER_POLYGONS } from "./terrain";
import type { StreamProgress } from "./cityStreaming";

const Scene = dynamic(() => import("./Scene"), { ssr: false });
type GameWindow = Window & {
  render_game_to_text?: () => string;
  advanceTime?: (ms: number) => void;
  liuzhouTest?: {
    game: Game;
    rig: CameraRig;
    manual: (v: boolean) => void;
    move: (input: Partial<Input>, frames: number) => void;
    visual: () => unknown;
  };
};
class RenderBoundary extends Component<
  { children: ReactNode },
  { error: boolean }
> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { error: false };
  }
  static getDerivedStateFromError() {
    return { error: true };
  }
  render() {
    const { error } = this.state;
    const { children } = this.props;
    return error ? (
      <div className={styles.failure}>
        <h2>三维场景暂时无法启动</h2>
        <p>请使用开启硬件加速的 Chrome 或 Edge，再刷新重试。</p>
        <button onClick={() => window.location.reload()}>重新载入</button>
      </div>
    ) : (
      children
    );
  }
}
function StreetMap({ game, route, full = false }: { game: Game; route: Route | null; full?: boolean }) {
  const radius = full ? 0 : 150;
  const viewBox = full
    ? `${CITY_BOUNDS.minX - 100} ${CITY_BOUNDS.minZ - 100} ${CITY_BOUNDS.maxX - CITY_BOUNDS.minX + 200} ${CITY_BOUNDS.maxZ - CITY_BOUNDS.minZ + 200}`
    : `${game.player.x - radius} ${game.player.z - radius} ${radius * 2} ${radius * 2}`;
  const q = game.exploration ? null : game.stage < 6 ? QUESTS[game.stage] : eveningTarget(game);
  const recipient = deliveryTarget(game.life, game.npcs);
  return (
    <svg
      viewBox={viewBox}
      className={full ? styles.atlas : styles.minimap}
      role="img"
      aria-label={full ? "东门街区地图，北在上方" : "附近街道小地图，北在上方"}
    >
      <rect x={CITY_BOUNDS.minX - 100} y={CITY_BOUNDS.minZ - 100} width={CITY_BOUNDS.maxX - CITY_BOUNDS.minX + 200} height={CITY_BOUNDS.maxZ - CITY_BOUNDS.minZ + 200} fill="#9da993" />
      {RIVER_POLYGONS.map((p, i) => <path key={`river-${i}`} d={[p.outer, ...p.holes].map(ring => `M${ring.map(v => `${v[0]},${v[1]}`).join("L")}Z`).join(" ")} fill="#618d88" fillRule="evenodd" />)}
      {BUILDINGS.map((b) => (b.footprint ? (
        <polygon key={b.id} points={b.footprint.map((p) => `${p.x},${p.z}`).join(" ")} fill="#7f8e7c" />
      ) : (
        <rect
          key={b.id}
          x={b.x - b.w / 2}
          y={b.z - b.d / 2}
          width={b.w}
          height={b.d}
          fill="#7f8e7c"
          transform={`rotate(${(-b.angle * 180) / Math.PI} ${b.x} ${b.z})`}
        />
      )))}
      {recipient && (
        <g>
          <rect x={recipient.x - 5} y={recipient.z - 5} width={10} height={10} fill="#a0e1cf" stroke="#294e45" strokeWidth={2} />
          {full && <text x={recipient.x + 12} y={recipient.z - 6} fill="#f1f6dd" fontSize={13}>送餐 · {NEIGHBOR_ORDERS[game.life.delivery!.route].name}</text>}
        </g>
      )}
      {[...ROAD_SEGMENTS, ...CITY_ROAD_SEGMENTS.filter(s => !inCore(s.a) || !inCore(s.b))].map((s, i) => (
        <path
          key={i}
          d={`M${s.a.x} ${s.a.z}L${s.b.x} ${s.b.z}`}
          stroke={s.road.bridge ? "#d6b582" : "#e0d8ba"}
          strokeWidth={s.road.width * (full ? 1 : 0.8)}
          fill="none"
        />
      ))}
      {(full || undergroundLocation(game.player)) && (
<g data-underground-layer="B1">
        {UNDERGROUND_WALKS.map(w => <polyline key={w.id} points={w.points.map(p => `${p[0]},${p[1]}`).join(" ")} stroke="#8d6598" strokeWidth={full ? 7 : 6} fill="none" />)}
        {UNDERGROUND_ENTRANCES.map(e => <circle key={e.id} cx={e.top[0]} cy={e.top[1]} r={full ? 6 : 3} fill="#e1bce5" />)}
      </g>
)}
      {game.evening.started && SOUND_SPOTS.filter(s => !game.evening.samples.includes(s.id)).map(s => (
        <g key={s.id}>
          <circle cx={s.x} cy={s.z} r={full ? 8 : 5} fill="#f7d076" stroke="#444e41" strokeWidth={2} />
          {full && <text x={s.x + 12} y={s.z - 9} fontSize={13} fill="#344c42">♪ {s.name}</text>}
        </g>
      ))}
      {route?.status === "route" && (
        <g data-navigation-route={route.destination.id}>
          <polyline points={route.points.map(p => `${p.x},${p.z}`).join(" ")} fill="none" stroke="#263e38" strokeWidth={full ? 7 : 9} strokeLinecap="round" strokeLinejoin="round" />
          <polyline points={route.points.map(p => `${p.x},${p.z}`).join(" ")} fill="none" stroke={route.destination.kind === "delivery" ? "#a0e1cf" : "#ffdc7d"} strokeWidth={full ? 3.5 : 5} strokeDasharray={route.guidance === "bearing" ? "18 14" : undefined} strokeLinecap="round" strokeLinejoin="round" />
        </g>
      )}
      {route?.destination.kind === "landmark" && <circle cx={route.destination.x} cy={route.destination.z} r={full ? 10 : 6} fill="none" stroke="#ffdc7d" strokeWidth={3} />}
      {q && (
        <circle
            cx={q.x}
            cy={q.z}
            r={full ? 9 : 5}
            fill="#f7d076"
            stroke="#444e41"
            strokeWidth={2}
          />
      )}
      {full &&
        LANDMARKS.map((l) => (
          <g key={l.id}>
            <circle cx={l.x} cy={l.z} r={5} fill="#405c50" />
            <text
              x={l.x + 12}
              y={l.z - 6}
              fill="#304a42"
              fontSize={full ? 65 : 19}
              fontWeight={600}
            >
              {l.name}
            </text>
          </g>
        ))}
      {full &&
        game.vehicles.map((v) => (
          <g key={v.id}>
            <circle
              cx={v.x}
              cy={v.z}
              r={6}
              fill={v.kind === "bike" ? "#436c60" : "#aa7045"}
            />
            <text x={v.x + 10} y={v.z + 10} fontSize={13} fill="#3e5847">
              {v.kind === "bike" ? "自行车" : "汽车"}
            </text>
          </g>
        ))}
      {full && game.traffic.map((v) => <rect key={v.id} x={v.x - 3} y={v.z - 5} width={6} height={10} fill="#435f68" transform={`rotate(${(-v.angle * 180) / Math.PI} ${v.x} ${v.z})`} />)}
      {full && game.npcs.filter(n => n.routine).map(n => (
<g key={n.id}>
        <title>{n.name} · {citizenStatus(n)}</title>
        <circle cx={n.x} cy={n.z} r={5} fill={CITIZEN_PLANS[n.id].outfit} stroke="#354e45" strokeWidth={1.8} />
        <text x={n.x + 10} y={n.z + 16} fontSize={12} fill="#304a42">{n.name}</text>
      </g>
))}
      <g
        transform={`translate(${game.player.x} ${game.player.z}) rotate(${(-game.player.angle * 180) / Math.PI})`}
      >
        <path
          d="M0 9 L-6 -6 L0 -3 L6 -6 Z"
          fill="#fff8dc"
          stroke="#314e43"
          strokeWidth={1.5}
        />
      </g>
    </svg>
  );
}
export default function LiuzhouGame() {
  const [game] = useState(createGame);
  const rig = useRef<CameraRig>({
    yaw: -1.35,
    pitch: 0.12,
    zoom: 10,
    dragged: 0,
    reset: true,
  }).current;
  const physics = useRef<Physics>();
  const [physicsReady, setPhysicsReady] = useState(false);
  const [sceneReady, setSceneReady] = useState(false);
  const [saveReady, setSaveReady] = useState(false);
  const [stream, setStream] = useState<StreamProgress>({ loaded: 0, total: 0, nearbyReady: false, complete: false, error: false });
  const streamRef = useRef(stream);
  const progress = useCallback((status: StreamProgress) => {
    streamRef.current = status;
    setStream(status);
    if (status.error) setFailed(true);
  }, []);
  const [failed, setFailed] = useState(false);
  const audio = useRef<StreetAudio>();
  const [muted, setMuted] = useState(false);
  const mutedRef = useRef(false);
  mutedRef.current = muted;
  const activateAudio = () => {
    try {
      if (!audio.current) audio.current = new StreetAudio();
      audio.current.resume();
    } catch {
      /* Optional on browsers without Web Audio. */
    }
  };
  useEffect(() => {
    const timer = window.setInterval(
      () => audio.current?.update(game, mutedRef.current, rig.listener),
      80,
    );
    return () => {
      window.clearInterval(timer);
      audio.current?.dispose();
    };
  }, [game, rig]);
  const [menu, setMenu] = useState<"map" | "help" | "journal" | "settings" | null>(null);
  const [lookSensitivity, setLookSensitivity] = useState(DEFAULT_LOOK_SENSITIVITY);
  const sensitivityRef = useRef(DEFAULT_LOOK_SENSITIVITY);
  const [settingsSaved, setSettingsSaved] = useState(true);
  useEffect(() => {
    try {
      const value = normalizeLookSensitivity(JSON.parse(localStorage.getItem(LOOK_SENSITIVITY_KEY) || "null"));
      sensitivityRef.current = value;
      setLookSensitivity(value);
    } catch { /* Use the default when browser storage is unavailable or damaged. */ }
  }, []);
  const changeLookSensitivity = (value: number) => {
    const next = normalizeLookSensitivity(value);
    sensitivityRef.current = next;
    setLookSensitivity(next);
    try {
      localStorage.setItem(LOOK_SENSITIVITY_KEY, JSON.stringify(next));
      setSettingsSaved(true);
    } catch { setSettingsSaved(false); }
  };
  const menuRef = useRef(menu);
  menuRef.current = menu;
  const [revision, refresh] = useState(0);
  const [waypoint, setWaypoint] = useState<Destination | null>(null);
  const waypointRef = useRef(waypoint);
  waypointRef.current = waypoint;
  const routeWorker = useRef<Worker>();
  const routeRequest = useRef<RouteRequest>();
  const navigation = useRef(new StreetNavigation(request => {
    routeRequest.current = request;
    routeWorker.current?.postMessage(request);
  })).current;
  const [manual, setManual] = useState(false);
  const manualRef = useRef(false);
  const keys = useRef(new Set<string>());
  const touch = useRef({ forward: 0, turn: 0 });
  const host = useRef<HTMLElement>(null);
  const dialoguePanel = useRef<HTMLDivElement>(null);
  const dialogueVisible = game.phase === "playing" && !!game.dialogue;
  useEffect(() => {
    const panel = dialoguePanel.current; const root = host.current;
    if (!dialogueVisible || !panel || !root) return;
    const measure = () => {
      const bounds = panel.getBoundingClientRect(); const parent = root.getBoundingClientRect();
      rig.dialoguePanel = { x: bounds.left - parent.left, y: bounds.top - parent.top, width: bounds.width, height: bounds.height };
    };
    const observer = new ResizeObserver(measure);
    observer.observe(panel); observer.observe(root); measure();
    panel.addEventListener("animationend", measure);
    return () => { observer.disconnect(); panel.removeEventListener("animationend", measure); delete rig.dialoguePanel; };
  }, [dialogueVisible, rig]);
  const controls = useRef<StreetControls>();
  const accumulator = useRef(0);
  const lastSave = useRef(0);
  const readNavigation = useCallback(() => {
    const delivery = deliveryTarget(game.life, game.npcs);
    const target = game.exploration ? null : game.stage < 6 ? QUESTS[game.stage] : eveningTarget(game);
    const destination: Destination | null = waypointRef.current || (delivery ? {
      ...delivery, id: `delivery-${game.life.delivery!.route}`, name: `送餐 · ${NEIGHBOR_ORDERS[game.life.delivery!.route].name}`, kind: "delivery",
    } : target ? { ...target, id: `story-${game.stage}-${target.target}`, name: target.title, kind: "story" } : null);
    const vehicle = game.vehicles.find(v => v.id === game.vehicle);
    if (destination && game.phase !== "title" && (game.flight.active || !inCore(game.player) || !inCore(destination))) {
      const metres = distance(game.player, destination);
      return { destination, mode: vehicle?.kind || "walk", points: [{ ...game.player }, { ...destination }], metres, status: metres < 18 ? "arrived" : "route", guidance: "bearing" } as Route;
    }
    return navigation.update(game.player, game.phase === "title" ? null : destination, vehicle?.kind || "walk", performance.now());
  }, [game, navigation]);
  const update = useCallback(() => { readNavigation(); refresh((n) => n + 1); }, [readNavigation]);
  useEffect(() => {
    const worker = new Worker(new URL("./navigation.worker.ts", import.meta.url));
    routeWorker.current = worker;
    worker.onmessage = (event: MessageEvent<{ version: number; points: { x: number; z: number }[] }>) => {
      navigation.accept(event.data.version, event.data.points); update();
    };
    worker.onerror = () => { if (routeRequest.current) navigation.accept(routeRequest.current.version, []); update(); };
    return () => { worker.terminate(); routeWorker.current = undefined; };
  }, [navigation, update]);
  const clearInput = useCallback(() => {
    keys.current.clear();
    touch.current = { forward: 0, turn: 0 };
    accumulator.current = 0;
  }, []);
  useEffect(() => {
    let cancelled = false;
    let owned: Physics | undefined;
    loadGame(game);
    setSaveReady(true);
    createPhysics(game)
      .then((p) => {
        owned = p;
        if (cancelled) {
          p.dispose();
          return;
        }
        physics.current = p;
        setPhysicsReady(true);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    const timer = window.setInterval(update, 100);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      if (owned) owned.dispose();
      physics.current = undefined;
    };
  }, [game, update]);
  const start = () => {
    activateAudio();
    game.phase = "playing";
    setMenu(null);
    clearInput();
    host.current?.focus();
    controls.current?.capture();
    update();
  };
  const pause = useCallback(() => {
    if (game.phase === "playing") {
      game.phase = "paused";
      controls.current?.release();
      saveGame(game);
      clearInput();
      update();
    }
  }, [game, clearInput, update]);
  const openMenu = useCallback(
    (next: "map" | "help" | "journal" | "settings") => {
      pause();
      if (game.phase === "title" && physics.current) game.phase = "paused";
      setMenu(next);
    },
    [pause, game],
  );
  const resume = useCallback(() => {
    game.phase = "playing";
    setMenu(null);
    clearInput();
    host.current?.focus();
    controls.current?.capture();
    update();
  }, [game, clearInput, update]);
  const action = useCallback(
    (key: string) => {
      if (key === "Escape") {
        if (controls.current?.justEscaped()) return;
        if (game.phase === "paused") resume();
        else pause();
        return;
      }
      if (key === "KeyM" && game.phase !== "title") {
        if (menuRef.current === "map") resume();
        else openMenu("map");
        return;
      }
      if (key === "KeyJ" && game.phase !== "title") {
        if (menuRef.current === "journal") resume();
        else openMenu("journal");
        return;
      }
      if (game.phase !== "playing") return;
      if (game.dialogue && /^Digit[1-4]$/.test(key)) {
        chooseDialogue(game, Number(key.slice(-1)) - 1);
        clearInput();
        if (!game.dialogue) controls.current?.capture();
        update();
        return;
      }
      if (key === "KeyE" || key === "Enter") {
        interact(game);
        if (game.dialogue || game.evening.watching) controls.current?.release();
        else controls.current?.capture();
        physics.current?.reset();
        clearInput();
        update();
        return;
      }
      if (game.dialogue) return;
      if (key === "KeyF") { toggleFlight(game); clearInput(); saveGame(game); update(); return; }
      if (key === "KeyH" && game.vehicle) {
        game.horn = game.time;
        notify(game, "叮——附近的行人回过头来");
        game.npcs
          .filter((n) => distance(n, game.player) < 18)
          .forEach((n) => {
            n.angle = Math.atan2(game.player.x - n.x, game.player.z - n.z);
          });
      }
      if (key === "KeyC" && !game.flight.active) {
        rig.yaw = game.player.angle;
        rig.pitch = 0.12;
        rig.reset = true;
      }
      if (key === "KeyP") {
        const l = LANDMARKS.find(
          (item) => distance(game.player, item) < 40 && !game.stamps.includes(item.id),
        );
        if (l) {
          game.stamps.push(l.id);
          game.money += 5;
          notify(game, `手账收录：${l.name} · +¥5`);
          saveGame(game);
        } else notify(game, "靠近新地标按 P，收进旅行手账");
      }
      if (/Digit[1-4]/.test(key)) {
        game.character = (Object.keys(CHARACTERS) as Character[])[
          Number(key.slice(-1)) - 1
        ];
        saveGame(game);
        notify(game, `切换为${CHARACTERS[game.character].name}`);
      }
      update();
    },
    [game, rig, clearInput, pause, resume, openMenu, update],
  );
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.code !== "Escape" && (e.target as HTMLElement).matches("input, select, textarea, [contenteditable='true']")) return;
      if (
        (e.target as HTMLElement).tagName === "BUTTON" &&
        ["Enter", "Space"].includes(e.code)
      ) return;
      if (
        ["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(
          e.code,
        )
      ) e.preventDefault();
      if (!e.repeat) action(e.code);
      keys.current.add(e.code);
    };
    const up = (e: KeyboardEvent) => keys.current.delete(e.code);
    const hidden = () => {
      if (document.hidden) pause();
    };
    const blur = () => { controls.current?.blur(); pause(); };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", blur);
    document.addEventListener("visibilitychange", hidden);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", blur);
      document.removeEventListener("visibilitychange", hidden);
    };
  }, [action, pause]);
  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const control = new StreetControls({
      root: el,
rig,
pause,
clear: clearInput,
changed: update,
      sensitivity: () => sensitivityRef.current,
      playing: () => game.phase === "playing" && !game.dialogue && !game.evening.watching,
    });
    controls.current = control;
    let drag: { x: number; y: number; id: number } | null = null;
    const down = (e: PointerEvent) => {
      if (!(e.target instanceof HTMLCanvasElement) || game.phase !== "playing" || game.dialogue || game.evening.watching) return;
      if (e.pointerType === "mouse" && typeof el.requestPointerLock === "function") {
        control.capture();
        if (!control.message) return;
      }
      drag = { x: e.clientX, y: e.clientY, id: e.pointerId };
      el.setPointerCapture(e.pointerId);
      el.focus();
    };
    const move = (e: PointerEvent) => {
      if (!drag || drag.id !== e.pointerId || control.locked) return;
      control.look((e.clientX - drag.x) * 2, (e.clientY - drag.y) * 1.333, e.pointerType !== "touch");
      drag.x = e.clientX;
      drag.y = e.clientY;
    };
    const up = () => {
      drag = null;
    };
    const wheel = (e: WheelEvent) => {
      if ((!control.locked && !(e.target instanceof HTMLCanvasElement)) || game.phase !== "playing" || game.dialogue) return;
      e.preventDefault();
      rig.zoom = Math.max(4, Math.min(22, rig.zoom + e.deltaY * 0.01));
    };
    el.addEventListener("pointerdown", down);
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", up);
    el.addEventListener("wheel", wheel, { passive: false });
    return () => {
      control.dispose();
      if (controls.current === control) controls.current = undefined;
      el.removeEventListener("pointerdown", down);
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
      el.removeEventListener("pointercancel", up);
      el.removeEventListener("wheel", wheel);
    };
  }, [game, rig, pause, clearInput, update]);
  const tick = useCallback(
    (dt: number) => {
      if (!physics.current || manualRef.current || game.phase !== "playing" || controls.current?.altHeld) return;
      const pressed = (...codes: string[]) => codes.some((c) => keys.current.has(c));
      const input = {
        forward:
          touch.current.forward ||
          Number(pressed("KeyW", "ArrowUp")) -
            Number(pressed("KeyS", "ArrowDown")),
        turn:
          touch.current.turn ||
          Number(pressed("KeyD", "ArrowRight")) -
            Number(pressed("KeyA", "ArrowLeft")),
        sprint: pressed("ShiftLeft", "ShiftRight"),
        brake: pressed("Space"),
        jump: pressed("Space"),
        descend: pressed("KeyC"),
        precise: pressed("KeyQ"),
      };
      accumulator.current = Math.min(0.12, accumulator.current + dt);
      while (accumulator.current >= 1 / 60) {
        step(game, input, 1 / 60, physics.current, rig.yaw);
        accumulator.current -= 1 / 60;
      }
      if (game.time - lastSave.current > 8) {
        saveGame(game);
        lastSave.current = game.time;
      }
    },
    [game, rig],
  );
  useEffect(() => {
    const win = window as GameWindow;
    win.render_game_to_text = () => JSON.stringify({ ...publicState(game), loading: streamRef.current, navigation: readNavigation(), controls: { pointerLocked: controls.current?.locked ?? false, yaw: rig.yaw, pitch: rig.pitch, sensitivity: sensitivityRef.current } });
    if (new URLSearchParams(window.location.search).get("test") === "1") {
      win.liuzhouTest = {
        game,
        rig,
        visual: () => rig.avatars?.() || [],
        manual: (value) => {
          manualRef.current = value;
          setManual(value);
        },
        move: (input, frames) => {
          for (let i = 0; i < frames; i++) step(
              game,
              {
                forward: 0,
                turn: 0,
                sprint: false,
                brake: false,
                jump: false,
                ...input,
              },
              1 / 60,
              physics.current,
              rig.yaw,
            );
          update();
        },
      };
      win.advanceTime = (ms) => {
        for (let i = 0; i < Math.ceil(ms / (1000 / 60)); i++) step(game, undefined, 1 / 60, physics.current, rig.yaw);
        update();
      };
    }
    const save = () => saveGame(game);
    window.addEventListener("pagehide", save);
    return () => {
      delete win.render_game_to_text;
      delete win.advanceTime;
      delete win.liuzhouTest;
      window.removeEventListener("pagehide", save);
    };
  }, [game, rig, update, readNavigation]);
  const ready = useCallback(() => setSceneReady(true), []);
  const quest = game.stage < 6 ? QUESTS[game.stage] : eveningTarget(game) || { ...QUESTS[6], title: "明天，还在这里", description: "第二章完成 · 自由探索，或找七海重看放映" };
  const frame = eveningFrame(game.evening);
  const near = nearestInteraction(game);
  const playing = game.phase === "playing";
  const title = game.phase === "title";
  const route = readNavigation();
  const current = game.vehicles.find((v) => v.id === game.vehicle);
  const setTouch =
    (axis: "forward" | "turn", value: number) => (e: React.PointerEvent<HTMLButtonElement>) => {
      e.preventDefault();
      e.currentTarget.setPointerCapture(e.pointerId);
      touch.current[axis] = value;
    };
  const release = (axis: "forward" | "turn") => () => {
    touch.current[axis] = 0;
  };
  return (
    <main
      ref={host}
      tabIndex={-1}
      className={styles.game}
      data-revision={revision}
      data-manual={manual}
      data-screening={game.evening.watching}
      data-dialogue={dialogueVisible}
      data-pointer-locked={controls.current?.locked ?? false}
      aria-label="柳州GTA三维游戏"
    >
      <div className={styles.scene}>
        <RenderBoundary>
          {saveReady && <Scene game={game} rig={rig} tick={tick} ready={ready} progress={progress} />}
        </RenderBoundary>
      </div>
      <header className={styles.header}>
        <Link href="/demos" aria-label="回到游戏库">
          ←
        </Link>
        <span className={styles.brand}>
          柳州GTA<span>LIUZHOU / CITY EXPLORATION</span>
        </span>
        <div className={styles.headerRight}>
          <span>{undergroundLocation(game.player) ? "地下街 · B1" : inCore(game.player) ? "东门街区" : "柳州城区"} · {game.evening.started ? "19:06" : game.stage === 6 ? "18:42" : "17:12"}</span>
          <button
            onClick={() => {
              activateAudio();
              setMuted((v) => !v);
            }}
            aria-label={muted ? "开启声音" : "关闭声音"}
            aria-pressed={muted}
          >
            {muted ? "♪̸" : "♪"}
          </button>
          <button onClick={() => openMenu("help")} aria-label="操作说明">
            ?
          </button>
          <button onClick={() => openMenu("settings")} disabled={!physicsReady}>
            设置
          </button>
          <button
            onClick={() => {
              if (game.phase === "paused") resume();
              else pause();
            }}
            aria-label="暂停游戏"
          >
            Ⅱ
          </button>
        </div>
      </header>
      {title && (
        <div className={styles.title}>
          <p className={styles.eyebrow}>A LITTLE JOURNEY IN A REAL CITY</p>
          <h1>
            柳州
            <br />
            <em>GTA</em>
          </h1>
          <p className={styles.intro}>
            骑过老街，开过红桥。
            <br />
            和岁己、栞栞、米汀、七海，在柳州碰个面。
          </p>
          <button
            className={styles.primary}
            onClick={() => { game.exploration = false; start(); }}
            disabled={!physicsReady || !sceneReady || !stream.nearbyReady || failed}
          >
            {failed
              ? "街区加载失败，请刷新重试"
              : physicsReady && sceneReady && stream.nearbyReady
                ? game.stage > 0
                  ? "继续这趟旅行 ↗"
                  : "走进柳州 ↗"
                : "正在准备附近街区…"}
          </button>
          <button className={styles.exploreStart} disabled={!physicsReady || !sceneReady || !stream.nearbyReady || failed} onClick={() => { game.exploration = true; start(); notify(game, "自由巡览 · F 开启飞行 · M 选择地标"); update(); }}>自由巡览 · 快速飞行 ↗</button>
          {!stream.complete && !failed && <p className={styles.loadingNote}>{stream.nearbyReady ? "附近已就绪，可以进入；其余街景继续加载" : "优先准备当前位置，远处街景随后补齐"}</p>}
          <p className={styles.titleNote}>
            东门与文惠桥 · 两章街区故事
            <br />
            真实道路骨架 / 风格化重建 / 虚构同人故事
          </p>
        </div>
      )}
      {!title && (
        <>
          {!stream.complete && !failed && <div className={styles.streaming} role="status">远处街景加载中 {stream.total ? `${Math.min(99, Math.floor((stream.loaded / stream.total) * 100))}%` : "…"}</div>}
          <div className={styles.objective}>
            <span className={styles.eyebrow}>
              {game.exploration ? "CITY EXPLORATION" : game.stage < 6
                ? `CHAPTER 01 / ${String(game.stage + 1).padStart(2, "0")}`
                : game.evening.completed ? "CHAPTER 02 / COMPLETE" : game.evening.started ? `CHAPTER 02 / ${game.evening.samples.length}/3` : "CHAPTER 02 / NEXT"}
            </span>
            <h2>{game.exploration ? "柳州 · 自由巡览" : quest.title}</h2>
            <p>{game.exploration ? "M 选择目的地 · F 飞行 · Q 慢飞 · 空格升高 · C 降低" : quest.description}</p>
            {!game.exploration && (game.stage < 6 || eveningTarget(game)) && (
              <span className={styles.distance}>
                ◇ {Math.round(distance(game.player, quest))} m
              </span>
            )}
            {game.life.delivery && (
              <p className={styles.deliveryObjective}>
                ▣ 送餐 · {NEIGHBOR_ORDERS[game.life.delivery.route].name}
                <span>{deliveryWarm(game.life) ? `热气 ${Math.ceil(warmSeconds(game.life) - game.life.delivery.elapsed)}s · 含小费 ¥18` : "慢慢送，报酬 ¥12 仍在"}</span>
              </p>
            )}
          </div>
          {game.evening.recording && (
            <div className={styles.recording} role="status" aria-label="现场采样进度">
              <span>● {SOUND_SPOTS.find(s => s.id === game.evening.recording?.id)?.name}</span>
              <progress max={RECORD_SECONDS} value={game.evening.recording.progress} aria-label="录音进度" />
              <small>{recordingStatus(game)} · {Math.min(RECORD_SECONDS, game.evening.recording.progress).toFixed(1)} / {RECORD_SECONDS}s</small>
            </div>
          )}
          {game.evening.watching && (
            <div className={styles.screening} role="status" aria-label="江边放映字幕">
              <span>{game.evening.elapsed >= SHOW_SECONDS ? "第二章 · 明天，还在这里" : `江边放映 · ${frame.speaker}`}</span>
              <p>{frame.caption}</p>
              <button onClick={() => action("KeyE")}>{game.evening.elapsed >= SHOW_SECONDS ? "回到街上" : "暂离放映"} <kbd>E</kbd></button>
            </div>
          )}
          <div className={styles.mapWrap}>
            <button
              className={styles.mapButton}
              onClick={() => openMenu("map")}
              aria-label="打开街区地图"
            >
              <StreetMap game={game} route={route} />
              <span className={styles.north}>N ↑</span>
            </button>
            <p>
              {undergroundLocation(game.player) ? "龙城地下街 · B1" : nearestRoad(game.player).name}
              <span>M · 街区地图</span>
            </p>
            {route && (
<p className={styles.navigation} aria-label="街区导航">
              <strong>{route.status === "route" ? `${route.guidance === "bearing" ? "直线方位" : "↗"} ${Math.ceil(route.metres)} m` : route.status === "planning" ? "正在规划路线…" : route.status === "arrived" ? "已到达附近" : "暂时无法规划"}</strong>
              <span>{route.status === "unavailable" ? "沿当前通道回到街道后再试" : route.destination.name}</span>
            </p>
)}
          </div>
          <div className={styles.status}>
            <span>
              {CHARACTERS[game.character].name} /{" "}
              {current ? (current.kind === "bike" ? "骑行" : "驾车") : game.flight.active ? "飞行" : "步行"}
            </span>
            <strong>
              {Math.round(Math.abs(game.player.speed) * 3.6)}
              <small>km/h</small>
            </strong>
            <span>
              {game.flight.active ? `离地 ${Math.round(publicState(game).flight.clearance)} m` : `¥ ${game.money} · 手账 ${game.stamps.length}/${LANDMARKS.length}`}
            </span>
          </div>
          {playing && !game.dialogue && !game.evening.watching && near && (
            <button className={styles.prompt} onClick={() => action("KeyE")}>
              <kbd>E</kbd>
              {near.label}
            </button>
          )}
          {playing && !game.dialogue && !game.evening.watching && !near && (
            <p className={styles.hint}>
              {current
                ? "W/S 油门 · A/D 转向 · 空格刹车 · H 鸣笛"
                : game.flight.active ? "WASD 飞行 · Q 慢飞 · 空格升高 · C 降低 · Shift 加速 · F 收起" : "WASD 移动 · Shift 跑步 · 空格跳跃 · F 飞行 · 鼠标转动视角"}
            </p>
          )}
          {playing && !game.dialogue && !game.evening.watching && !controls.current?.locked && !controls.current?.touch && (
            <p className={styles.hint} style={{ bottom: 62 }}>{controls.current?.message || "点击画面捕获鼠标 · 移动鼠标看四周 · Esc 暂停"}</p>
          )}
          {game.noticeUntil > game.time && !game.evening.recording && (
            <p className={styles.toast} role="status">
              {game.notice}
            </p>
          )}
          {!game.saveOK && (
            <span className={styles.saveWarning}>本机存档暂不可用</span>
          )}
          <nav className={styles.quick} aria-label="旅行工具" hidden={game.evening.watching}>
            <button disabled={!!game.dialogue || !playing || !!current} onClick={() => action("KeyF")}>{game.flight.active ? "收起飞行" : "开启飞行"} <kbd>F</kbd></button>
            <button onClick={() => openMenu("journal")}>
              手账 <kbd>J</kbd>
            </button>
            <button onClick={() => action("KeyP")}>
              收录地标 <kbd>P</kbd>
            </button>
            <button
              disabled={!!game.dialogue || !playing}
              onClick={() => {
                game.character = (Object.keys(CHARACTERS) as Character[])[
                  (Object.keys(CHARACTERS).indexOf(game.character) + 1) % 4
                ];
                saveGame(game);
                update();
              }}
            >
              换角色
            </button>
          </nav>
        </>
      )}
      {game.dialogue && playing && (
        <div
          ref={dialoguePanel}
          className={styles.dialogue}
          role="dialog"
          aria-modal="true"
          aria-label={`与${game.dialogue.name}对话`}
        >
          {game.dialogue.portrait && (
            <div
              className={styles.portrait}
              style={{ backgroundImage: `url("${game.dialogue.portrait}")` }}
            />
          )}
          <div>
            <span className={styles.eyebrow}>{game.dialogue.name}</span>
            <p>{game.dialogue.lines[game.dialogue.index]}</p>
            {game.dialogue.index === game.dialogue.lines.length - 1 && game.dialogue.choices && (
              <div className={styles.dialogueChoices} aria-label="对话选项">
                {game.dialogue.choices.map((choice, index) => (
                  <button key={choice.id} disabled={choice.disabled} onClick={() => { chooseDialogue(game, index); clearInput(); if (!game.dialogue) controls.current?.capture(); update(); }}>
                    <kbd>{index + 1}</kbd>{choice.label}
                  </button>
                ))}
              </div>
            )}
            <button onClick={() => action("KeyE")}>
              {game.dialogue.index + 1 < game.dialogue.lines.length
                ? "继续"
                : game.dialogue.choices ? "这次先逛逛" : "收起"}{" "}
              <kbd>E ↵</kbd>
            </button>
          </div>
        </div>
      )}
      {game.phase === "paused" && (
        <div className={styles.scrim}>
          <section
            className={styles.panel}
            role="dialog"
            aria-modal="true"
            aria-label={
              menu === "map"
                ? "街区地图"
                : menu === "help"
                  ? "操作说明"
                  : menu === "journal"
                    ? "旅行手账"
                    : menu === "settings" ? "视角设置" : "旅行暂停"
            }
          >
            <button
              className={styles.close}
              onClick={resume}
              aria-label="关闭面板，继续游戏"
            >
              ×
            </button>
            <p className={styles.eyebrow}>LIUZHOU / FIELD NOTES</p>
            <h2>
              {menu === "map"
                ? "柳州 · 城市巡览"
                : menu === "help"
                  ? "慢慢逛，也能开快一点。"
                  : menu === "journal"
                    ? "今天，想记住什么？"
                    : menu === "settings" ? "调到顺手为止。" : "在这里歇一会。"}
            </h2>
            {menu === "map" ? (
              <>
                <StreetMap game={game} route={route} full />
                <div className={styles.destinations} aria-label="选择导航目的地">
                  <button onClick={() => setWaypoint(null)} aria-pressed={!waypoint}>{game.exploration ? "清除目的地" : "跟随任务"}</button>
                  {LANDMARKS.map(l => <button key={l.id} aria-pressed={waypoint?.id === l.id} onClick={() => setWaypoint({ ...l, ...(l.id === "river" ? { x: 270, z: -180, name: "柳江北岸" } : {}), kind: "landmark" })}>{l.id === "river" ? "柳江北岸" : l.name}</button>)}
                </div>
                <p>北 ↑ · 实线为街区路线；虚线是直线方位参考，需自行避开建筑、山体与江面。F 开启飞行，Shift 加速，按住 Q 慢飞。</p>
                <small>
                  道路及建筑轮廓 © OpenStreetMap contributors、Overture Maps Foundation、East Asian Buildings / CLSM ·
                  ODbL。地形来自 Mapzen / AWS Terrain Tiles（NASA SRTM 等，约 30 米源精度）；道路地面、桥梁高程及建筑高度为近似重建。
                  <a href="/games/liuzhou/building-footprints.json" download>建筑轮廓数据</a>
                </small>
              </>
            ) : menu === "settings" ? (
              <div className={styles.settings}>
                <label htmlFor="liuzhou-look-sensitivity">
                  鼠标视角灵敏度
                  <output htmlFor="liuzhou-look-sensitivity">{Math.round(lookSensitivity * 100)}%</output>
                </label>
                <input
                  id="liuzhou-look-sensitivity"
                  type="range"
                  min={MIN_LOOK_SENSITIVITY * 100}
                  max={MAX_LOOK_SENSITIVITY * 100}
                  step={5}
                  value={Math.round(lookSensitivity * 100)}
                  aria-valuetext={`${Math.round(lookSensitivity * 100)}%`}
                  aria-describedby="liuzhou-look-sensitivity-note"
                  onChange={e => changeLookSensitivity(Number(e.target.value) / 100)}
                />
                <div className={styles.settingScale}><span>慢 · 20%</span><span>快 · 200%</span></div>
                <p id="liuzhou-look-sensitivity-note">同时调整左右转向与上下俯仰，步行和飞行均生效。100% 为原来的速度，触屏拖动不受影响。</p>
                <button onClick={() => changeLookSensitivity(DEFAULT_LOOK_SENSITIVITY)}>恢复默认 · 60%</button>
                <small role="status">{settingsSaved ? "修改自动保存在此浏览器，刷新后保留。" : "浏览器暂时无法保存，当前设置仍然有效。"}</small>
              </div>
            ) : menu === "help" ? (
              <div className={styles.instructions}>
                <p><kbd>F</kbd>开启 / 收起飞行 · <kbd>空格</kbd>升高 · <kbd>C</kbd>降低 · <kbd>Shift</kbd>加速。贴近建筑或降落时，按住 <kbd>Q</kbd> 慢飞，同时减慢升降；触屏可按住“慢飞”。飞行仍有碰撞，江面上请先飞回岸边再收起。</p>
                <p>
                  <kbd>W A S D</kbd>步行移动 / 驾车油门与转向
                </p>
                <p>
                  <kbd>Shift</kbd>跑步 <kbd>空格</kbd>跳跃 / 载具刹车
                </p>
                <p>
                  <kbd>E</kbd>交谈、上车、停稳后下车
                </p>
                <p>
                  <kbd>鼠标 / 滚轮</kbd>转动 / 拉近视角 <kbd>C</kbd>未飞行时镜头归正
                </p>
                <p>
                  <kbd>M</kbd>地图 <kbd>P</kbd>地标手账 <kbd>1–4</kbd>换角色
                </p>
                <p>
                  <kbd>Esc</kbd>释放鼠标并暂停 <kbd>Alt</kbd>按住显示鼠标 <kbd>H</kbd>车铃 / 鸣笛
                </p>
                <p>
                  点击进入或继续后隐藏鼠标，移动鼠标直接转动视角。交谈和菜单自动释放鼠标，收起后恢复。自动保存任务和停车位置，失焦后暂停。触屏可以按住方向键，同时拖动画面转向。
                </p>
                <p>路上的车辆会减速让行；遇到排队车辆请绕行。地图中的蓝色小车是街区车流。</p>
                <p>取完主线餐食后，可再找粉店阿姨接邻里送餐单。最后一页点选或按数字选择；E 只收起。热气小费可选，迟到仍有基础报酬。保温餐篮一次购买，永久生效。</p>
                <p>首章后找栞栞开始第二章。三处采样顺序不限，按 E 开录后下车站稳六秒；车声过近时等待，走出录音圈则收起。集齐找米汀编排，再找七海开始放映。放映可暂停/暂离，奖励仅首次完成领取。</p>
              </div>
            ) : menu === "journal" ? (
              <div className={styles.notes}>
                <article>
                  <span>{game.evening.completed ? "✓ 第二章完成" : "第二章 · 把今天留给明天"}</span>
                  <h3>{game.evening.started ? "这座城，有我们的声音" : "东门的一盏灯"}</h3>
                  <p>{game.stage < 6 ? "先完成第一章的声音明信片，再找栞栞商量放映。" : quest.description}</p>
                  {SOUND_SPOTS.map(s => <p key={s.id}>{game.evening.samples.includes(s.id) ? "✓" : "○"} {s.name} · {s.place}</p>)}
                  {game.evening.arrangement && <p>编排：{game.evening.arrangement === "river" ? "江水 → 桥风 → 锅沿" : "锅沿 → 桥风 → 江水"} · 可找米汀重选</p>}
                  {game.evening.completed && <p>放映收入 ¥28 已结算 · 找七海可免费重看</p>}
                </article>
                <article>
                  <span>邻里送餐 · 已完成 {game.life.delivered} 单</span>
                  <h3>{game.life.delivery ? `正在送给${NEIGHBOR_ORDERS[game.life.delivery.route].name}` : "有空，再去粉店坐坐"}</h3>
                  <p>{game.stage < 2 ? "先帮栞栞取完四碗粉，阿姨就会介绍街坊的订单。" : "从东门沿老街往西南，到曙光东路找阿姨的粉店。一单 ¥12，热乎送到多 ¥6；没有失败倒计时。叔叔、游客和买菜居民轮流点餐。"}</p>
                  <p>{game.life.insulated ? "✓ 保温餐篮 · 热气 150 秒" : "普通餐篮 · 热气 90 秒；粉店 ¥32 升级至 150 秒"}</p>
                  {game.life.receipt && <p>最近收据：{game.life.receipt.name} · ¥{game.life.receipt.amount}{game.life.receipt.warm ? "（含 ¥6 小费）" : ""}</p>}
                </article>
                {LANDMARKS.map((l) => (
                  <article key={l.id}>
                    <span>
                      {game.stamps.includes(l.id) ? "✓ 已收录" : "○ 靠近后按 P"}
                    </span>
                    <h3>{l.name}</h3>
                    <p>{l.detail}</p>
                  </article>
                ))}
                <p>剧情与店铺均为创作，不代表角色的真实经历。</p>
              </div>
            ) : (
              <>
                <p>进度已保存在这台设备。下一站：{quest.description}。</p>
                <button onClick={() => setMenu("map")}>查看地图</button>
                <button onClick={() => setMenu("help")}>操作说明</button>
                <button onClick={() => setMenu("settings")}>视角设置</button>
              </>
            )}
            <button className={styles.primary} onClick={resume}>
              回到街上 ↗
            </button>
          </section>
        </div>
      )}
      {playing && !game.dialogue && !game.evening.watching && (
        <div className={styles.touch} aria-label="触屏操作">
          <div className={styles.pad}>
            <button
              aria-label="向前"
              onPointerDown={setTouch("forward", 1)}
              onPointerUp={release("forward")}
              onPointerCancel={release("forward")}
            >
              ↑
            </button>
            <div>
              <button
                aria-label="向左"
                onPointerDown={setTouch("turn", -1)}
                onPointerUp={release("turn")}
                onPointerCancel={release("turn")}
              >
                ←
              </button>
              <button
                aria-label="向后"
                onPointerDown={setTouch("forward", -1)}
                onPointerUp={release("forward")}
                onPointerCancel={release("forward")}
              >
                ↓
              </button>
              <button
                aria-label="向右"
                onPointerDown={setTouch("turn", 1)}
                onPointerUp={release("turn")}
                onPointerCancel={release("turn")}
              >
                →
              </button>
            </div>
          </div>
          <div className={`${styles.touchActions} ${game.flight.active ? styles.flightActions : ""}`}>
            <button onClick={() => action("KeyE")}>互动</button>
            <button
              aria-label="刹车或跳跃"
              onPointerDown={(e) => {
                e.currentTarget.setPointerCapture(e.pointerId);
                keys.current.add("Space");
              }}
              onPointerUp={() => keys.current.delete("Space")}
              onPointerCancel={() => keys.current.delete("Space")}
            >
              {current ? "刹车" : game.flight.active ? "升高" : "跳跃"}
            </button>
            <button onClick={() => action("KeyF")}>{game.flight.active ? "收起" : "飞行"}</button>
            {game.flight.active && (
<>
              <button aria-label="飞行降低" onPointerDown={e => { e.currentTarget.setPointerCapture(e.pointerId); keys.current.add("KeyC"); }} onPointerUp={() => keys.current.delete("KeyC")} onPointerCancel={() => keys.current.delete("KeyC")}>降低</button>
              <button aria-label="飞行加速" onPointerDown={e => { e.currentTarget.setPointerCapture(e.pointerId); keys.current.add("ShiftLeft"); }} onPointerUp={() => keys.current.delete("ShiftLeft")} onPointerCancel={() => keys.current.delete("ShiftLeft")}>加速</button>
              <button aria-label="飞行慢速" onPointerDown={e => { e.currentTarget.setPointerCapture(e.pointerId); keys.current.add("KeyQ"); }} onPointerUp={() => keys.current.delete("KeyQ")} onPointerCancel={() => keys.current.delete("KeyQ")}>慢飞</button>
            </>
)}
            <button onClick={() => openMenu("map")}>地图</button>
          </div>
        </div>
      )}
      <footer className={styles.credit}>
        © OpenStreetMap contributors · Overture Maps Foundation · ODbL · Mapzen / AWS Terrain Tiles <span>老城漫游 / 首章开发中</span>
      </footer>
    </main>
  );
}
