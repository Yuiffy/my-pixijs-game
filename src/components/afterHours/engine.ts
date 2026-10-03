import type { Game, Input, Stage } from "./types";
import {
  activeSpots,
  clearLine,
  findPath,
  friendlyStage,
  companionTarget,
  focusedSpot,
  move,
  walkable,
} from "./world";

export const SAVE_KEY = "sui-after-hours-v1";
export const EMPTY_INPUT: Input = { forward: 0, right: 0, run: false };
export const STAGES: Stage[] = [
  "visit",
  "tea",
  "photo",
  "home",
  "unease",
  "power",
  "memories",
  "corridor",
  "chase",
  "choice",
  "dawn",
];

export function createGame(): Game {
  return {
    version: 2,
    mode: "title",
    stage: "visit",
    panel: "none",
    player: { x: -1.9, z: 2.75, yaw: 0.88, pitch: -0.035, stamina: 100 },
    sui: { x: -4.15, z: 1.15, yaw: 0.88, path: [], repath: 0 },
    evening: {
      greeted: false,
      tea: 0,
      blend: null,
      carrying: false,
      served: false,
      photo: false,
      promise: null,
      anomaly: 0,
      dialogue: null,
      gesture: "wave",
      gestureUntil: 12,
    },
    photoRequest: 0,
    photoImage: "",
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
  if (g.stage === "visit") speak(
      g,
      "岁己",
      "终于来啦，小饼干。今天的直播结束了，不过我们的晚安茶还没开始呢。",
      10,
    );
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

export function chooseDialogue(g: Game, answer: string) {
  if (g.mode !== "playing" || g.panel !== "dialogue") return;
  const kind = g.evening.dialogue;
  const allowed: Record<string, string[]> = {
    greeting: ["happy", "help"],
    serve: ["care", "tease"],
    promise: ["tomorrow", "extra"],
    anomaly: ["name", "voice"],
  };
  if (!kind || !allowed[kind].includes(answer)) return;
  g.evening.dialogue = null;
  g.evening.gestureUntil = g.time + 9;
  if (kind === "greeting" && g.stage === "visit") {
    g.evening.greeted = true;
    g.evening.gesture = answer === "happy" ? "shy" : "wave";
    chapter(g, "tea");
    speak(
      g,
      "岁己",
      answer === "happy"
        ? "我也很开心呀。先做一杯茶吧，今天可以慢慢来。"
        : "好呀，我教你泡晚安茶。先放茶包，再倒热水，最后选你喜欢的味道。",
      10,
    );
  } else if (kind === "serve" && g.stage === "tea" && g.evening.carrying) {
    g.evening.carrying = false;
    g.evening.served = true;
    g.evening.gesture = "offer";
    g.notes.push("tea-memory");
    chapter(g, "photo");
    speak(
      g,
      "岁己",
      `${g.evening.blend === "honey" ? "蜂蜜的，好甜。" : "柠檬的，好清香。"}${answer === "tease" ? "你做的当然最好喝啦。" : "谢谢你还记得别让我烫到。"}一起拍张合照，好不好？`,
      11,
    );
  } else if (kind === "promise" && g.stage === "home") {
    g.evening.promise = answer as "tomorrow" | "extra";
    g.evening.gesture = "shy";
    g.notes.push("promise-memory");
    g.panel = "none";
    g.revision++;
    speak(
      g,
      "岁己",
      answer === "tomorrow"
        ? "说好了，明天见。今天也可以好好结束呀。帮我结束房间监听，我们就说晚安。"
        : "再坐一会儿也很好，不过可不是永远哦。我们还有明天。到零点十七分，就一起说晚安。",
      12,
    );
  } else if (
    kind === "anomaly" &&
    g.stage === "unease" &&
    g.evening.anomaly === 1
  ) {
    g.evening.anomaly = 2;
    g.evening.gesture = "worried";
    g.panel = "none";
    g.revision++;
    speak(
      g,
      "岁己",
      "刚才我没有说话。声音是监听回放……先在电脑上停止房间监听。我去检查卧室的镜子，别回答那个声音。",
      13,
    );
  }
}

export function makeTea(
  g: Game,
  ingredient: "bag" | "water" | "honey" | "lemon",
) {
  if (
    g.mode !== "playing" ||
    g.panel !== "tea" ||
    g.stage !== "tea" ||
    g.evening.carrying
  ) return;
  if (
    (ingredient === "bag" && g.evening.tea === 0) ||
    (ingredient === "water" && g.evening.tea === 1)
  ) {
    g.evening.tea++;
    g.revision++;
    return;
  }
  if (g.evening.tea !== 2 || !["honey", "lemon"].includes(ingredient)) return;
  g.evening.tea = 3;
  g.evening.blend = ingredient as "honey" | "lemon";
  g.evening.carrying = true;
  g.panel = "none";
  g.revision++;
  speak(
    g,
    "岁己",
    "好香呀。端过来吧，我们去沙发那边。客厅的月亮杯、直播间的星灯、门口的太阳……这三个房间的电也是按这个顺序接的。",
    13,
  );
  notify(g, "晚安茶做好了。走到岁己身边，递给她。", 8);
}

export function takePhoto(g: Game) {
  if (
    g.mode !== "playing" ||
    g.stage !== "photo" ||
    g.panel !== "photo" ||
    g.photoRequest
  ) return;
  g.photoRequest = 1;
  g.revision++;
}

export function finishPhoto(g: Game, image: string) {
  if (
    g.mode !== "playing" ||
    g.stage !== "photo" ||
    g.panel !== "photo" ||
    !g.photoRequest ||
    !image.startsWith("data:image/jpeg;base64,") ||
    image.length < 40
  ) return;
  g.photoImage = image;
  g.evening.photo = true;
  g.evening.gesture = "shy";
  g.evening.gestureUntil = g.time + 10;
  g.notes.push("photo-memory");
  chapter(g, "home");
  speak(
    g,
    "岁己",
    "拍得真好看。记住哦，合照上的 SUI 是正着写的。照片放在茶几上，明天也可以再一起拍一张。",
    12,
  );
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
    ["你为什么要关掉我？", "你也听见我在害怕，对吗？", "原来……今晚可以结束。"][
      g.sources.length - 1
    ],
  );
  if (g.sources.length === 3) {
    chapter(g, "choice");
    g.echo.x = 5.3;
    g.echo.z = -2.1;
    g.echo.alert = 0;
    speak(
      g,
      "回声",
      "如果结束今晚，明天还有人记得我吗？你会记得她的名字吗？",
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
  if (id === "sui") {
    const dialogue =
      g.stage === "visit"
        ? "greeting"
        : g.stage === "tea" && g.evening.carrying
          ? "serve"
          : g.stage === "home" && !g.evening.promise
            ? "promise"
            : g.stage === "unease" && g.evening.anomaly === 1
              ? "anomaly"
              : null;
    if (dialogue) {
      g.evening.dialogue = dialogue;
      g.panel = "dialogue";
    } else speak(
        g,
        "岁己",
        g.stage === "tea"
          ? "我在这儿等你。茶包、热水，最后再选味道。"
          : "不用着急，我们还有明天。",
        8,
      );
  } else if (id === "kettle") {
    g.panel = "tea";
  } else if (id === "tripod" && g.stage === "photo") {
    if (Math.hypot(g.sui.x + 4.15, g.sui.z - 1.15) > 0.15) {
      notify(g, "等岁己走到合照的位置。", 4);
      return;
    }
    g.panel = "photo";
    g.sui.yaw = Math.atan2(-2.1 - g.sui.x, 2.25 - g.sui.z);
    g.evening.gesture = "heart";
    speak(g, "岁己", "看镜头了吗？三、二……等你按快门哦。", 8);
  } else if (id === "photo-frame" && g.stage === "unease") {
    g.evening.anomaly = 1;
    g.panel = "photograph";
    g.revision++;
    speak(g, "你", "照片里的名字倒过来了。刚才的合照……不是这样的。", 9);
    notify(g, "去问岁己。她刚才真的说话了吗？", 7);
  } else if (id === "notebook" || id === "fridge") {
    g.notes.push(id === "notebook" ? "diary" : "power-note");
    g.panel = "journal";
    g.revision++;
  } else if (id === "computer" && g.stage === "home") {
    if (!g.evening.promise) {
      notify(g, "先和岁己说完今天的晚安约定。", 6);
      return;
    }
    chapter(g, "unease");
    speak(
      g,
      "房间监听",
      g.evening.promise === "extra"
        ? "再坐一会儿……再坐一会儿……永远。"
        : "明天见……明天……明天不会来了。",
      10,
    );
    notify(g, "房间没有退出，麦克风还在回放。茶几上的合照变了。", 9);
  } else if (id === "computer" && g.stage === "unease") {
    if (g.evening.anomaly < 2) {
      notify(g, "先检查合照，再问岁己这是谁的声音。", 6);
      return;
    }
    chapter(g, "power");
    speak(g, "回声", "不能结束。你答应过，要再陪我一会儿。");
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
      "tape-kitchen":
        "这是房间维护用的备份。晚安茶结束在零点十七分，时钟记住的是 00:17。别跟着回放退回直播开始的时候。",
      "tape-shelf":
        "照片上的 SUI 正着写。她会记得你放的味道，回放只会念出同一句话。找到名字没有倒过来的门。",
      "tape-bedroom":
        "真正的晚安之后，广播会安静。安静的门通往监听室。断开电路、电脑、镜面这三个回放通道，我就在出口等你。",
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
        "你",
        g.seals === 1
          ? "00:17，是我们说好晚安的时间。下一扇门，找合照上正着的 SUI。"
          : "是合照里的名字。最后一扇门，是说完晚安后真正安静的广播。",
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
    speak(g, "回声", "再陪我一会儿。再陪我一会儿。再陪我一会儿。");
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
    speak(g, "你", "灯亮了，岁己却不在这里。钟停在了我们说晚安的零点十七分。");
    notify(g, "找到三份房间维护录音，恢复离开房间的权限。", 8);
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
  speak(
    g,
    "房间系统",
    "访客权限已恢复。回放走廊会复制房间；只选择和今晚记忆一致的门。",
    10,
  );
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
  g.sui.x = -4.25;
  g.sui.z = 3.75;
  g.sui.path = [];
  speak(
    g,
    "岁己",
    `${g.evening.blend === "lemon" ? "柠檬茶" : "蜂蜜茶"}和我们的合照，我都记得。今天可以结束，明天还会再见。`,
    12,
  );
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
      const patrol = [
        { x: 3.6, z: -3.6 },
        { x: -6.2, z: 3.3 },
        { x: 6.2, z: 1.6 },
        { x: -3, z: 10 },
      ];
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
  } else if (["memories", "choice"].includes(g.stage)) {
    g.echo.yaw = Math.atan2(g.player.x - g.echo.x, g.player.z - g.echo.z);
  }
  if (friendlyStage(g)) {
    const s = g.sui;
    const target = companionTarget(g);
    s.repath -= dt;
    if (s.repath <= 0) {
      s.path = findPath(s, target, g);
      s.repath = 0.8;
    }
    const next = s.path[0];
    if (next && Math.hypot(next.x - s.x, next.z - s.z) > 0.025) {
      const dx = next.x - s.x;
      const dz = next.z - s.z;
      const d = Math.hypot(dx, dz);
      const step = Math.min(d, dt * 1.08);
      move(s, (dx / d) * step, (dz / d) * step, g);
      s.yaw = Math.atan2(dx, dz);
      if (d < 0.07) s.path.shift();
    } else {
      const wanted = Math.atan2(g.player.x - s.x, g.player.z - s.z);
      s.yaw +=
        Math.atan2(Math.sin(wanted - s.yaw), Math.cos(wanted - s.yaw)) *
        Math.min(1, dt * 3);
    }
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
    version: 2,
    evening: g.evening,
    photoImage: g.photoImage,
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
      ![1, 2].includes(data.version) ||
      !STAGES.includes(data.stage) ||
      typeof data.player !== "object"
    ) return null;
    const g = createGame();
    g.stage =
      data.version === 1 && data.stage === "home" ? "visit" : data.stage;
    if (data.version === 1 && g.stage !== "visit") {
      g.evening = {
        ...g.evening,
        greeted: true,
        tea: 3,
        blend: "honey",
        served: true,
        photo: true,
        promise: "tomorrow",
        anomaly: 2,
      };
    } else if (
      data.version === 2 &&
      data.evening &&
      typeof data.evening === "object"
    ) {
      const e = data.evening;
      g.evening.greeted = Boolean(e.greeted);
      g.evening.tea = Number.isInteger(e.tea)
        ? Math.max(0, Math.min(3, e.tea))
        : 0;
      g.evening.blend = ["honey", "lemon"].includes(e.blend) ? e.blend : null;
      g.evening.carrying = Boolean(e.carrying && g.evening.blend);
      g.evening.served = Boolean(e.served);
      g.evening.photo = Boolean(e.photo);
      g.evening.promise = ["tomorrow", "extra"].includes(e.promise)
        ? e.promise
        : null;
      g.evening.anomaly = Number.isInteger(e.anomaly)
        ? Math.max(0, Math.min(2, e.anomaly))
        : 0;
      if (
        typeof data.photoImage === "string" &&
        data.photoImage.startsWith("data:image/jpeg;base64,") &&
        data.photoImage.length < 500000
      ) g.photoImage = data.photoImage;
      // Progress must remain playable when a damaged save loses its portrait.
      if (g.evening.carrying && g.evening.tea !== 3) return null;
      if (
        STAGES.indexOf(g.stage) >= STAGES.indexOf("tea") &&
        !g.evening.greeted
      ) return null;
      if (
        STAGES.indexOf(g.stage) >= STAGES.indexOf("photo") &&
        (!g.evening.served || !g.evening.blend)
      ) return null;
      if (STAGES.indexOf(g.stage) >= STAGES.indexOf("home") && !g.evening.photo) return null;
      if (
        STAGES.indexOf(g.stage) >= STAGES.indexOf("unease") &&
        !g.evening.promise
      ) return null;
    } else if (data.version === 2) {
      return null;
    }
    const companion = companionTarget(g);
    g.sui.x = companion.x;
    g.sui.z = companion.z;
    for (const key of ["x", "z", "yaw", "pitch", "stamina"] as const) {
      if (!Number.isFinite(data.player[key])) return null;
      g.player[key] = data.player[key];
    }
    if (!walkable(g.player, g)) return null;
    g.player.pitch = Math.max(-1.15, Math.min(1.05, g.player.pitch));
    g.player.stamina = Math.max(0, Math.min(100, g.player.stamina));
    const strings = (value: unknown, allowed: string[]) => (Array.isArray(value)
        ? (Array.from(
            new Set(
              value.filter((v) => typeof v === "string" && allowed.includes(v)),
            ),
          ) as string[])
        : []);
    g.tapes = strings(data.tapes, [
      "tape-kitchen",
      "tape-shelf",
      "tape-bedroom",
    ]);
    g.notes = strings(data.notes, [
      "diary",
      "power-note",
      "tea-memory",
      "photo-memory",
      "promise-memory",
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
    photoImage: g.photoImage ? "saved photograph" : "",
    spots: activeSpots(g),
    coordinateSystem: "+x east, +z south, +y up; metres",
    collision:
      "same footprint for player and echo; no progress-setting debug API",
  };
}
