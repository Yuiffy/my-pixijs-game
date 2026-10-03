import type { Game, Input, Stage } from "./types";
import {
  activeSpots,
  clearLine,
  findPath,
  focusedSpot,
  move,
  walkable,
} from "./world";

export const SAVE_KEY = "sui-after-hours-v1";
export const EMPTY_INPUT: Input = { forward: 0, right: 0, run: false };
export const STAGES: Stage[] = [
  "home",
  "power",
  "memories",
  "corridor",
  "chase",
  "choice",
  "dawn",
];

export function createGame(): Game {
  return {
    version: 1,
    mode: "title",
    stage: "home",
    panel: "none",
    player: { x: 3.25, z: -2.4, yaw: -0.48, pitch: -0.045, stamina: 100 },
    echo: {
      x: 5.65,
      z: -2,
      yaw: -1.7,
      alert: 0,
      cooldown: 0,
      path: [],
      repath: 0,
      patrol: 0,
    },
    time: 0,
    stageTime: 0,
    tapes: [],
    notes: [],
    seals: 0,
    sources: [],
    fuse: [],
    mistakes: 0,
    deaths: 0,
    hidden: false,
    flashlight: false,
    focus: null,
    subtitle: { speaker: "", text: "", until: 0 },
    notice: { text: "", until: 0 },
    ending: null,
    revision: 0,
  };
}

export function speak(g: Game, speaker: string, text: string, seconds = 7) {
  g.subtitle = { speaker, text, until: g.time + seconds };
}

export function notify(g: Game, text: string, seconds = 4) {
  g.notice = { text, until: g.time + seconds };
}

export function startGame(g: Game) {
  g.mode = "playing";
  g.panel = "none";
  if (g.stage === "home") speak(g, "岁己", "好啦，今天就到这里。……怎么还有一个人没走？");
}

export function pause(g: Game, paused: boolean) {
  if (g.mode === "playing" && paused) {
    g.mode = "paused";
    g.panel = "none";
    g.hidden = false;
  } else if (g.mode === "paused" && !paused) g.mode = "playing";
}

function chapter(g: Game, stage: Stage) {
  g.stage = stage;
  g.stageTime = 0;
  g.panel = "none";
  g.focus = null;
  g.hidden = false;
  g.revision++;
}

function sourceOff(g: Game, id: string) {
  if (g.sources.includes(id)) return;
  g.sources.push(id);
  g.revision++;
  g.echo.cooldown = 7;
  g.echo.path = [];
  g.echo.repath = 0;
  notify(g, `回声源已关闭 · ${g.sources.length}/3`);
  speak(
    g,
    "回声",
    [
      "你为什么要关掉我？",
      "你也听见我在害怕，对吗？",
      "原来……我只是最后一条弹幕。",
    ][g.sources.length - 1],
  );
  if (g.sources.length === 3) {
    chapter(g, "choice");
    g.echo.x = 5.3;
    g.echo.z = -2.1;
    g.echo.alert = 0;
    speak(
      g,
      "回声",
      "如果关掉直播，就再也没人陪我了。你会记得我的名字吗？",
      10,
    );
  }
}

export function interact(g: Game) {
  if (g.mode !== "playing" || g.panel !== "none") return;
  if (g.hidden) {
    g.hidden = false;
    g.echo.cooldown = Math.max(g.echo.cooldown, 1.5);
    return;
  }
  const spot = focusedSpot(g);
  if (!spot) return;
  const { id } = spot;
  if (id === "notebook" || id === "fridge") {
    g.notes.push(id === "notebook" ? "diary" : "power-note");
    g.panel = "journal";
    g.revision++;
  } else if (id === "computer" && g.stage === "home") {
    chapter(g, "power");
    speak(g, "回声", "等一下。不是说好……再陪我一会儿吗？");
    notify(g, "灯灭了。按 F 打开手电。", 6);
  } else if (id === "fuse" && g.stage === "power") {
    g.panel = "fuse";
    g.fuse = [];
  } else if (id.startsWith("tape-")) {
    if (!g.tapes.includes(id)) {
      g.tapes.push(id);
      g.notes.push(id);
      g.revision++;
    }
    const words: Record<string, string> = {
      "tape-kitchen": "我记得是零点。走廊里，只有时钟肯停下来。",
      "tape-shelf": "下播后十七分钟。她的名字写反了。我的表停在 00:17。",
      "tape-bedroom": "去找没有波形的广播。然后，关掉电、屏幕和镜子。",
    };
    speak(g, "旧录音 · 岁己", words[id], 8);
    notify(g, "录音已记入手记 · J 查看");
  } else if (id === "computer" && g.stage === "memories") {
    if (g.tapes.length < 3) {
      notify(g, "三段录音拼起来，才是完整的午夜。");
      return;
    }
    g.panel = "code";
  } else if (id === "entry") {
    if (g.stage === "corridor") {
      notify(g, "门外的走廊已经不是刚才的走廊。");
      return;
    }
    if (g.stage === "dawn") {
      g.mode = "ending";
      g.ending = "dawn";
      g.revision++;
      return;
    }
    if (g.stage === "chase") {
      notify(g, "门把手冰冷。先切断三处回声源。");
      return;
    }
    notify(g, "门外传来同样的一声敲门。现在还打不开。");
  } else if (
    ["clock", "portrait", "radio"].includes(id) &&
    g.stage === "corridor"
  ) {
    const correct = ["clock", "portrait", "radio"][g.seals];
    if (id !== correct) {
      g.mistakes++;
      notify(g, "这不是记忆。走廊重新开始了。", 5);
      speak(g, "回声", "你又回来了。这样也很好，不是吗？");
      g.player.x = -3;
      g.player.z = 6.8;
      g.player.yaw = Math.PI;
      g.echo.x = -3;
      g.echo.z = 16.5;
      g.stageTime = 0;
      g.revision++;
      return;
    }
    g.notes.push(`seal-${id}`);
    g.seals++;
    g.revision++;
    if (g.seals < 3) {
      notify(g, `记忆门印 · ${g.seals}/3`, 5);
      g.player.x = -3;
      g.player.z = 6.8;
      g.player.yaw = Math.PI;
      g.stageTime = 0;
      speak(
        g,
        "岁己",
        g.seals === 1
          ? "钟停了。可名字为什么是倒着的？"
          : "最后一次。没有波形的声音，才是真正的出口。",
      );
    } else {
      chapter(g, "chase");
      g.player.x = -3;
      g.player.z = 6.8;
      g.player.yaw = 0;
      g.echo.x = -3;
      g.echo.z = 16.5;
      g.echo.cooldown = 8;
      g.echo.alert = 12;
      speak(g, "旧录音 · 岁己", "别再回答她。去关掉配电箱、电脑和镜子！", 9);
    }
  } else if (id === "exit") {
    notify(g, "出口牌上写着 ON AIR。找到三扇真实的门。");
  } else if (
    g.stage === "chase" &&
    ["fuse", "computer", "mirror"].includes(id)
  ) {
    sourceOff(g, id);
  } else if (id === "computer" && g.stage === "choice") {
    g.panel = "choice";
  } else if (id === "hide") {
    g.hidden = true;
    g.echo.alert = 0;
    g.echo.path = [];
    g.echo.repath = 0;
    notify(g, "放轻呼吸。按 E 离开衣柜。", 5);
  } else if (id === "echo") {
    speak(
      g,
      "回声",
      g.stage === "home"
        ? "还在听吗？我是最后一个，不可以先走哦。"
        : "我是你没有说出口的那一句“再见”。",
    );
  }
}

export function fuseSwitch(g: Game, index: number) {
  if (
    g.mode !== "playing" ||
    g.panel !== "fuse" ||
    g.stage !== "power" ||
    ![0, 1, 2].includes(index)
  ) return;
  const sequence = [1, 0, 2];
  if (sequence[g.fuse.length] !== index) {
    g.fuse = [];
    g.mistakes++;
    notify(g, "接电顺序不对。再看看冰箱上的便签。");
    return;
  }
  g.fuse.push(index);
  if (g.fuse.length === 3) {
    chapter(g, "memories");
    speak(g, "岁己", "灯亮了。可电脑上的时间……怎么一直都是零点十七分？");
    notify(g, "公寓里有三段旧录音。", 6);
  }
}

export function submitCode(g: Game, code: string) {
  if (g.mode !== "playing" || g.panel !== "code" || g.tapes.length !== 3) return;
  if (code !== "0017") {
    g.mistakes++;
    notify(g, "时间不对。录音已经记在手记里。");
    return;
  }
  chapter(g, "corridor");
  speak(g, "回声", "原来你还记得。门开了，要不要试试能走多远？", 8);
  notify(g, "公寓门已经解锁。走到门口，穿过走廊。", 7);
}

export function chooseEnding(g: Game, choice: "name" | "stay") {
  if (g.mode !== "playing" || g.panel !== "choice" || g.stage !== "choice") return;
  g.panel = "none";
  if (choice === "stay") {
    g.mode = "ending";
    g.ending = "loop";
    g.revision++;
    return;
  }
  chapter(g, "dawn");
  speak(g, "岁己", "我会记得你。但我们都不必永远留在这里。明天见。", 10);
  notify(g, "门开了。走向天亮。", 8);
}

export function look(g: Game, dx: number, dy: number) {
  if (g.mode !== "playing" || g.panel !== "none" || g.hidden) return;
  if (!Number.isFinite(dx) || !Number.isFinite(dy)) return;
  g.player.yaw = Math.atan2(
    Math.sin(g.player.yaw + dx),
    Math.cos(g.player.yaw + dx),
  );
  g.player.pitch = Math.max(-1.15, Math.min(1.05, g.player.pitch + dy));
}

function tick(g: Game, dt: number, input: Input) {
  if (g.mode !== "playing" || g.panel !== "none") return;
  g.time += dt;
  g.stageTime += dt;
  if (!g.hidden) {
    const forward = Number.isFinite(input.forward)
      ? Math.max(-1, Math.min(1, input.forward))
      : 0;
    const right = Number.isFinite(input.right)
      ? Math.max(-1, Math.min(1, input.right))
      : 0;
    const length = Math.max(1, Math.hypot(forward, right));
    const running =
      input.run && g.player.stamina > 1 && Math.hypot(forward, right) > 0.1;
    const speed = running ? 3.7 : 2.05;
    const movement = (speed * dt) / length;
    move(
      g.player,
      (-Math.sin(g.player.yaw) * forward + Math.cos(g.player.yaw) * right) *
        movement,
      (-Math.cos(g.player.yaw) * forward - Math.sin(g.player.yaw) * right) *
        movement,
      g,
    );
    g.player.stamina = Math.max(
      0,
      Math.min(100, g.player.stamina + (running ? -24 : 19) * dt),
    );
  } else g.player.stamina = Math.min(100, g.player.stamina + 25 * dt);
  if (g.stage === "chase") {
    const e = g.echo;
    e.cooldown = Math.max(0, e.cooldown - dt);
    e.alert = Math.max(0, e.alert - dt);
    const distance = Math.hypot(e.x - g.player.x, e.z - g.player.z);
    if (
      !g.hidden &&
      ((distance < 9 && clearLine(e, g.player, g, 0, true)) ||
        (input.run && distance < 10))
    ) e.alert = 7;
    if (!e.cooldown) {
      // Patrol destinations must be on the floor, not at a tabletop object
      // inside a collider. Otherwise A* cannot reach the streaming computer.
      const patrol = [{ x: 3.6, z: -3.6 }, { x: -6.2, z: 3.3 }, { x: 6.2, z: 1.6 }, { x: -3, z: 10 }];
      const target =
        e.alert > 0 && !g.hidden ? g.player : patrol[e.patrol % patrol.length];
      e.repath -= dt;
      if (e.repath <= 0) {
        e.path = findPath(e, target, g);
        e.repath = 0.7;
      }
      const next = e.path[0];
      if (next) {
        const dx = next.x - e.x;
        const dz = next.z - e.z;
        const distanceToNext = Math.hypot(dx, dz);
        const step = Math.min(distanceToNext, (e.alert > 0 ? 1.65 : 0.85) * dt);
        if (distanceToNext > 0.01) {
          move(
            e,
            (dx / distanceToNext) * step,
            (dz / distanceToNext) * step,
            g,
          );
          e.yaw = Math.atan2(dx, dz);
        }
        if (distanceToNext < 0.12) e.path.shift();
      }
      if (Math.hypot(e.x - target.x, e.z - target.z) < 0.65 && e.alert <= 0) {
        e.patrol++;
        e.repath = 0;
      }
      if (!g.hidden && distance < 0.62 && clearLine(e, g.player, g, 0, true)) {
        g.mode = "dead";
        g.deaths++;
        g.revision++;
        g.focus = null;
        speak(g, "回声", "别怕。我们可以……从这里重新开始。");
      }
    }
  } else if (["home", "memories", "choice"].includes(g.stage)) {
    g.echo.yaw = Math.atan2(g.player.x - g.echo.x, g.player.z - g.echo.z);
  }
  g.focus = focusedSpot(g)?.id || null;
}

export function stepGame(
  g: Game,
  milliseconds: number,
  input: Input = EMPTY_INPUT,
) {
  if (!Number.isFinite(milliseconds) || milliseconds < 0) return;
  let remaining = Math.min(milliseconds / 1000, 5);
  while (remaining > 0.000001) {
    const dt = Math.min(remaining, 1 / 60);
    tick(g, dt, input);
    remaining -= dt;
  }
  if (!milliseconds) g.focus = focusedSpot(g)?.id || null;
}

export function retry(g: Game) {
  if (g.mode !== "dead") return;
  g.mode = "playing";
  g.panel = "none";
  g.hidden = false;
  g.player.x = -2.5;
  g.player.z = 3.6;
  g.player.yaw = 0;
  g.player.pitch = 0;
  g.player.stamina = 100;
  g.echo.x = -3;
  g.echo.z = 16;
  g.echo.cooldown = 10;
  g.echo.repath = 0;
  g.echo.path = [];
  g.echo.alert = 0;
  notify(g, "已回到本章检查点，关掉的回声源会保留。", 6);
}

export function saveGame(g: Game) {
  return JSON.stringify({
    version: 1,
    stage: g.stage,
    player: g.player,
    time: g.time,
    tapes: g.tapes,
    notes: g.notes,
    seals: g.seals,
    sources: g.sources,
    mistakes: g.mistakes,
    deaths: g.deaths,
    flashlight: g.flashlight,
    ending: g.ending,
  });
}

export function loadGame(raw: string | null): Game | null {
  if (!raw) return null;
  try {
    const data = JSON.parse(raw);
    if (
      data.version !== 1 ||
      !STAGES.includes(data.stage) ||
      typeof data.player !== "object"
    ) return null;
    const g = createGame();
    g.stage = data.stage;
    for (const key of ["x", "z", "yaw", "pitch", "stamina"] as const) {
      if (!Number.isFinite(data.player[key])) return null;
      g.player[key] = data.player[key];
    }
    if (!walkable(g.player, g)) return null;
    g.player.pitch = Math.max(-1.15, Math.min(1.05, g.player.pitch));
    g.player.stamina = Math.max(0, Math.min(100, g.player.stamina));
    const strings = (value: unknown, allowed: string[]) => (Array.isArray(value)
        ? (Array.from(new Set(value.filter((v) => typeof v === "string" && allowed.includes(v)))) as string[])
        : []);
    g.tapes = strings(data.tapes, [
      "tape-kitchen",
      "tape-shelf",
      "tape-bedroom",
    ]);
    g.notes = strings(data.notes, [
      "diary",
      "power-note",
      ...g.tapes,
      "seal-clock",
      "seal-portrait",
      "seal-radio",
    ]);
    g.sources = strings(data.sources, ["fuse", "computer", "mirror"]);
    g.seals = Number.isInteger(data.seals)
      ? Math.max(0, Math.min(3, data.seals))
      : 0;
    for (const key of ["time", "mistakes", "deaths"] as const) g[key] = Number.isFinite(data[key]) ? Math.max(0, data[key]) : 0;
    g.flashlight = Boolean(data.flashlight);
    if (data.ending === "dawn" || data.ending === "loop") g.ending = data.ending;
    if (g.stage === "chase") {
      g.echo.x = -3;
      g.echo.z = 16;
      g.echo.cooldown = 10;
    }
    if (g.stage === "corridor") {
      g.echo.x = -3;
      g.echo.z = 16.5;
    }
    return g;
  } catch {
    return null;
  }
}

export function publicState(g: Game) {
  return {
    ...g,
    spots: activeSpots(g),
    coordinateSystem: "+x east, +z south, +y up; metres",
    collision:
      "same footprint for player and echo; no progress-setting debug API",
  };
}
