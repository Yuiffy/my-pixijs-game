import type RAPIER from "@dimforge/rapier3d-compat";
import { advanceLocomotion, createLocomotion, type Locomotion } from "./actorMotion";
import { createTraffic, stepTraffic, type TrafficCar } from "./traffic";
import { terrainHeight } from "./terrain";
import { terrainChunks, terrainSurface, terrainTriangleHeight } from "./terrainMesh";
import { undergroundFloor, undergroundFree, undergroundLevel, undergroundLocation, undergroundStairSupport, undergroundSurface, UNDERGROUND_STEPS } from "./underground";
import { CITY_BOUNDS, createFlight, FLIGHT_BOOST, FLIGHT_CEILING, FLIGHT_SPEED, FLIGHT_INSPECT_SPEED, FLIGHT_INSPECT_VERTICAL, inCity, inCore, type Flight } from "./exploration";
import { BRIDGE_SECTIONS, BRIDGE_RAILS, bridgeSurface, bridgeSupportSolid, deckVertices, restoreBridgePosition } from "./bridges";
import { GUANGYA_SUPPORTS, previousGuangyaDeck } from "./guangya";
import { NPC_HOMES, NPC_MEETING_POINTS } from "./pedestrian-layout";
import { MARKET_RESIDENTS, marketProjection } from "./market";
import { STATION_PREFIX, STATION_RESIDENTS, stationRoofHeight, stationRoofSolid, stationRoofSurface } from "./station";
import { ESHAN_RESIDENTS } from "./eshan";
import { SQUARE_RESIDENTS } from "./square";
import { XIHUAN_RESIDENTS } from "./xihuan";
import { WUXING_RESIDENTS } from "./wuxing";
import { eshanSurfaceHeight } from "./eshanSurface";
import { pedestrianHeight } from "./pedestrian";
import { constrainToBridge } from "./world";
import { DONGMEN, GATE_GROUND, GATE_SOLIDS, restoreGatePosition } from "./dongmen";
import { restoreStreetPosition, streetSupportHeight, STREET_SOLIDS } from "./street";
import { citizenLine, createCitizenRoutine, restoreCitizens, stepCitizens, type CitizenRoutine } from "./citizens";
import { BASKET_PRICE, createStreetLife, DELIVERY_PAY, deliveryWarm, finiteCounter, loadStreetLife, NEIGHBOR_ORDERS, WARM_TIP, warmSeconds, type StreetLife } from "./life";
import { createEvening, eveningFrame, eveningTarget, loadEvening, RECORD_SECONDS, recordingStatus, SHOW_SECONDS, SOUND_SPOTS, stepEvening, type Evening } from "./evening";
import {
  BUILDINGS,
  buildingContains,
  buildingElevation,
  buildingFoundationDepth,
  inRiver,
  canTraverse,
  distance,
  nearestRoad,
  ROADS,
  SAVE_KEY,
  type Point,
} from "./world";

export type Character = "sui" | "shiori" | "nagisa" | "nana";
export const CHARACTERS = {
  sui: {
    name: "岁己",
    hair: "#d4d3e4",
    outfit: "#a288c5",
    trim: "#282332",
    eyes: "#dc5e43",
    portrait: "/images/livers/sui.png",
  },
  shiori: {
    name: "栞栞",
    hair: "#e8d8b8",
    outfit: "#e7d3ab",
    trim: "#71513b",
    eyes: "#729cce",
    portrait: "/images/livers/shiori.png",
  },
  nagisa: {
    name: "米汀",
    hair: "#b5c2d5",
    outfit: "#eee5d8",
    trim: "#333747",
    eyes: "#7491ac",
    portrait: "/images/livers/nagisa.png",
  },
  nana: {
    name: "七海",
    hair: "#805a50",
    outfit: "#393a42",
    trim: "#73a4bf",
    eyes: "#d5aa63",
    portrait: "/images/livers/nana7mi.png",
  },
};
export type Actor = Point & { angle: number; speed: number; y: number };
export type Vehicle = Actor & {
  id: string;
  kind: "bike" | "car";
  color: string;
  odometer?: number;
  braking?: boolean;
  steering?: number;
};
export type Npc = Actor & {
  id: string;
  name: string;
  character?: Character;
  line: string;
  home: Point;
  routine?: CitizenRoutine;
};
export type Input = {
  forward: number;
  turn: number;
  sprint: boolean;
  brake: boolean;
  jump: boolean;
  descend?: boolean;
  precise?: boolean;
};
export type Dialogue = {
  name: string;
  speakerId?: string;
  lines: string[];
  index: number;
  advance: boolean;
  portrait?: string;
  effect?: { kind: "story"; stage: number } | { kind: "delivery"; order: number };
  choices?: { id: "accept" | "insulate" | "cancel" | "evening" | "street" | "river" | "screen"; label: string; disabled?: boolean }[];
};
export type Game = {
  phase: "title" | "playing" | "paused";
  player: Actor;
  locomotion: Locomotion;
  flight: Flight;
  exploration: boolean;
  character: Character;
  vehicle: string | null;
  vehicles: Vehicle[];
  traffic: TrafficCar[];
  npcs: Npc[];
  stage: number;
  dialogue: Dialogue | null;
  time: number;
  bikeDistance: number;
  carDistance: number;
  stamps: string[];
  money: number;
  notice: string;
  noticeUntil: number;
  photo: number;
  horn: number;
  blocked: boolean;
  saveOK: boolean;
  day: number;
  life: StreetLife;
  evening: Evening;
};
export const QUESTS = [
  {
    title: "一座城的声音",
    description: "去东门城楼旁找栞栞",
    target: "shiori",
    x: 28,
    z: -23,
  },
  {
    title: "热腾腾的见面礼",
    description: "骑自行车，去曙光东路粉店取餐",
    target: "chef",
    x: -170,
    z: 117,
  },
  {
    title: "城市采样计划",
    description: "把热粉送给罗池路的米汀",
    target: "nagisa",
    ...NPC_HOMES.nagisa,
  },
  {
    title: "桥的另一边",
    description: "开车载着音箱，去南岸找七海",
    target: "nana",
    ...NPC_HOMES.nana,
  },
  {
    title: "把柳江装进口袋",
    description: "回北岸金沙角，步行录下江水声",
    target: "record",
    x: 253,
    z: -175,
  },
  {
    title: "今晚，一起开场",
    description: "回到东门城楼旁，和大家会合",
    target: "shiori",
    x: 28,
    z: -23,
  },
  {
    title: "江风有回音",
    description: "第一章完成 · 自由逛街、换人、骑行与开车",
    target: "",
    x: 28,
    z: -23,
  },
];
const npc = (
  id: string,
  name: string,
  x: number,
  z: number,
  line: string,
  character?: Character,
): Npc => ({
  id,
  name,
  ...(NPC_HOMES[id] || { x, z }),
  y: pedestrianHeight(NPC_HOMES[id] || { x, z }),
  angle: Math.PI,
  speed: 0,
  home: { ...(NPC_HOMES[id] || { x, z }) },
  line,
  character,
  routine: createCitizenRoutine(id),
});
export function createGame(): Game {
  return {
    phase: "title",
    character: "sui",
    player: { x: 31, z: -10, y: terrainHeight({ x: 31, z: -10 }), angle: Math.PI, speed: 0 },
    locomotion: createLocomotion(),
    flight: createFlight(),
    exploration: false,
    vehicle: null,
    traffic: createTraffic(),
    vehicles: [
      {
        id: "bike-1",
        kind: "bike",
        x: 42,
        z: -8,
        y: terrainHeight({ x: 42, z: -8 }),
        angle: 2.3,
        speed: 0,
        color: "#76b7ad",
      },
      {
        id: "car-1",
        kind: "car",
        x: -207,
        z: 8,
        y: terrainHeight({ x: -207, z: 8 }),
        angle: 1.0,
        speed: 0,
        color: "#e8c270",
      },
      {
        id: "car-2",
        kind: "car",
        x: 45,
        z: 5,
        y: terrainHeight({ x: 45, z: 5 }),
        angle: 2.9,
        speed: 0,
        color: "#c9d9d3",
      },
      {
        id: "bike-2",
        kind: "bike",
        x: 249,
        z: -181,
        y: terrainHeight({ x: 249, z: -181 }),
        angle: 1.4,
        speed: 0,
        color: "#d2826d",
      },
    ],
    npcs: [
      npc("shiori", "栞栞", 28, -23, "沿着江边走，总能走回这里。", "shiori"),
      npc(
        "nagisa",
        "米汀",
        -217,
        -18,
        "把熟悉的声音录下来，就不会忘记今天。",
        "nagisa",
      ),
      npc("nana", "七海", 219, 622, "桥上风很大。慢点开，我又不会跑。", "nana"),
      npc("chef", "阿姨", -170, 117, "辣油放旁边，趁热吃。别骑太快！"),
      npc("uncle", "散步的叔叔", 78, -42, "这边是东门，往南看就是文惠桥。"),
      npc(
        "walker-1",
        "散步的市民",
        -75,
        47,
        "一天最舒服的时候，就是来江边走走。",
      ),
      npc(
        "walker-2",
        "骑行爱好者",
        -116,
        94,
        "骑车靠边，桥上别急着超车。",
      ),
      npc(
        "walker-3",
        "拍照的游客",
        250,
        -157,
        "红桥、青山、江水，刚好在一个画面里。",
      ),
      npc(
        "walker-4",
        "买菜的居民",
        -221,
        -55,
        "前面是罗池路。找粉店？闻着香味走。",
      ),
      ...MARKET_RESIDENTS.map(n => ({ ...npc(n.id, n.name, n.x, n.z, n.line), angle: marketProjection(n).across > 0 ? Math.PI : 0 })),
      ...STATION_RESIDENTS.map(n => ({ ...npc(n.id, n.name, n.x, n.z, n.line), angle: 1 })),
      ...ESHAN_RESIDENTS.map(n => ({ ...npc(n.id, n.name, n.x, n.z, n.line), angle: 1.5 })),
      ...SQUARE_RESIDENTS.map(n => ({ ...npc(n.id, n.name, n.x, n.z, n.line), angle: 0.4 })),
      ...XIHUAN_RESIDENTS.map(n => ({ ...npc(n.id, n.name, n.x, n.z, n.line), angle: 0.8 })),
      ...WUXING_RESIDENTS.map(n => ({ ...npc(n.id, n.name, n.x, n.z, n.line), angle: 0.4 })),
    ],
    stage: 0,
    dialogue: null,
    time: 0,
    bikeDistance: 0,
    carDistance: 0,
    stamps: [],
    money: 60,
    notice: "",
    noticeUntil: 0,
    photo: 0,
    horn: 0,
    blocked: false,
    saveOK: true,
    day: 17.2,
    life: createStreetLife(),
    evening: createEvening(),
  };
}
export function notify(g: Game, message: string) {
  g.notice = message;
  g.noticeUntil = g.time + 4;
}
export function nearestInteraction(g: Game): {
  kind: "npc" | "vehicle" | "record" | "sample" | "screen";
  id: string;
  label: string;
  distance: number;
} | null {
  if (g.evening.watching) return { kind: "screen", id: "screen", label: g.evening.elapsed >= SHOW_SECONDS ? "回到街上" : "暂离放映 · 下次接着看", distance: 0 };
  if (g.evening.recording) return { kind: "sample", id: g.evening.recording.id, label: "停止这次采样", distance: 0 };
  if (g.flight.active) return null;
  if (g.vehicle) return { kind: "vehicle", id: g.vehicle, label: "下车", distance: 0 };
  const options = [
    ...(g.stage === 6 && g.evening.started ? SOUND_SPOTS.filter(s => !g.evening.samples.includes(s.id)).map(s => ({ kind: "sample" as const, id: s.id, label: `采样 · ${s.name}`, distance: distance(g.player, s) })) : []),
    ...g.npcs.filter(n => Math.abs(g.player.y - n.y) < 1.5).map((n) => ({
      kind: "npc" as const,
      id: n.id,
      label: `与${n.name}交谈`,
      distance: distance(g.player, n),
    })),
    ...g.vehicles.filter(v => Math.abs(g.player.y - v.y) < 1.5).map((v) => ({
      kind: "vehicle" as const,
      id: v.id,
      label: v.kind === "bike" ? "骑自行车" : "驾驶汽车",
      distance: distance(g.player, v),
    })),
    ...(g.stage === 4
      ? [
          {
            kind: "record" as const,
            id: "record",
            label: "录下柳江的声音",
            distance: distance(g.player, QUESTS[4]),
          },
        ]
      : []),
  ].filter((v) => v.distance < (v.kind === "vehicle" ? 5 : 4.6));
  options.sort((a, b) => a.distance - b.distance);
  return options[0] || null;
}
function talk(
  g: Game,
  name: string,
  lines: string[],
  advance = false,
  character?: Character,
) {
  const speaker = g.npcs.find(n => n.name === name);
  g.player.speed = 0;
  if (speaker) {
    speaker.speed = 0;
    speaker.angle = Math.atan2(g.player.x - speaker.x, g.player.z - speaker.z);
    g.player.angle = Math.atan2(speaker.x - g.player.x, speaker.z - g.player.z);
  }
  g.dialogue = {
    name,
    speakerId: speaker?.id,
    lines,
    index: 0,
    advance,
    portrait: character ? CHARACTERS[character].portrait : undefined,
    effect: advance ? { kind: "story", stage: g.stage } : undefined,
  };
}
function neighborTalk(g: Game, n: Npc) {
  if (n.id === "chef" && g.stage >= 2) {
    const active = g.life.delivery;
    const next = NEIGHBOR_ORDERS[g.life.delivered % NEIGHBOR_ORDERS.length];
    talk(g, n.name, [active
      ? `餐还在你那里。送给${NEIGHBOR_ORDERS[active.route].name}就好，不用着急，凉了也照样结账。`
      : `街坊托我带一份${next.meal}给${next.name}。愿意顺路帮忙吗？报酬 ¥${DELIVERY_PAY}，热乎送到再加 ¥${WARM_TIP}。`]);
    g.dialogue!.choices = [
      active ? { id: "cancel", label: "把餐退回来 · 取消这单" } : { id: "accept", label: `接下这单 · 送给${next.name}` },
      ...(!g.life.insulated ? [{ id: "insulate" as const, label: `买保温餐篮 · ¥${BASKET_PRICE}${g.money < BASKET_PRICE ? "（余额不足）" : ""}`, disabled: g.money < BASKET_PRICE }] : []),
    ];
    g.dialogue!.lines.push(`步行、骑车、开车都可以。${g.life.insulated ? "保温餐篮让" : "普通餐篮让"}热气保留 ${warmSeconds(g.life)} 秒；暂停和交谈不计时。${g.life.insulated ? "" : "保温餐篮可以延长到 150 秒，买一次就一直能用。"}`);
    return;
  }
  const d = g.life.delivery;
  const order = d && NEIGHBOR_ORDERS[d.route];
  if (d && order?.npc === n.id) {
    const warm = deliveryWarm(g.life);
    talk(g, n.name, [order.thanks, warm ? `还冒着热气呢！报酬 ¥${DELIVERY_PAY}，再给你 ¥${WARM_TIP} 小费。` : `凉一点也没关系，谢谢你送来。说好的报酬 ¥${DELIVERY_PAY}，一分不少。`]);
    g.dialogue!.effect = { kind: "delivery", order: d.id };
    return;
  }
  talk(g, n.name, [citizenLine(n)], false, n.character);
}
function eveningTalk(g: Game, n: Npc) {
  const e = g.evening;
  if (n.id === "shiori") {
    talk(g, n.name, e.started ? [e.completed
      ? "今晚的声音明信片留在手账里了。想再听，就请七海开一下放映机；不急的话，再去街上走走。"
      : "三处声音不用按顺序找。先去你想去的地方，路上也可以顺便替阿姨送餐。我们在东门等你。"]
      : ["刚才只听了一小段。要不要把街坊的日常也录进去，在这里办一场小小的江边放映？", "米汀把三处采样点记在地图上了。你跑街、骑车、开车都行，录音时下车站稳，等近处的车声过去。"], false, "shiori");
    if (!e.started) g.dialogue!.choices = [{ id: "evening", label: "开始第二章 · 把今天留给明天" }];
    return true;
  }
  if (!e.started) return false;
  if (n.id === "nagisa") {
    talk(g, n.name, e.samples.length < 3
      ? [`已经留住 ${e.samples.length}/3 段声音。站稳六秒就能录好，移步会重新开始；近处有车经过时等一等，进度不会掉。`, "随时可以收起录音机。录好的片段会保存，没录完的下次从头再来。"]
      : ["锅沿、桥风、水声，三段都齐了。你想让哪一段先开口？", "先听街巷，就像先和街坊打个招呼；先听江水，就像慢慢走进这座城。选哪种都能放给大家听。"], false, "nagisa");
    if (e.samples.length === 3) g.dialogue!.choices = [{ id: "street", label: "街巷先开口 · 锅沿 → 桥风 → 江水" }, { id: "river", label: "让江风先来 · 江水 → 桥风 → 锅沿" }];
    return true;
  }
  if (n.id === "nana") {
    talk(g, n.name, e.arrangement
      ? [e.completed ? "幕布和音箱都还在。再放一遍吧？这回可以换个编排，街坊的掌声还是留给你。" : "线接好了，音箱也试过了。大家都在，随时可以开场。", "放映时可以暂停，按 E 或点“暂离放映”回街上；没看完的下次接着看。"]
      : ["我先把幕布和灯架搭起来。你收齐三段声音后找米汀编排，再来叫我。桥头那段录音，站在北侧空地上就好，别站到车道里。"], false, "nana");
    if (e.arrangement) g.dialogue!.choices = [{ id: "screen", label: e.completed ? "再看一遍江边放映" : e.elapsed > 0 ? "接着看江边放映" : "大家都在 · 开始江边放映" }];
    return true;
  }
  if (n.id === "uncle") {
    talk(g, n.name, ["你们在录这个？小时候听见锅盖响，我就知道该从江边回家了。", "不用把人都录清楚，留下一点热闹就好。明天我还来这里散步。"]);
    return true;
  }
  return false;
}
export function chooseDialogue(g: Game, index: number) {
  const { dialogue } = g;
  if (g.phase !== "playing" || !dialogue || dialogue.index !== dialogue.lines.length - 1) return;
  const choice = dialogue.choices?.[index];
  if (!choice || choice.disabled) return;
  if (["evening", "street", "river", "screen"].includes(choice.id)) {
    if (g.stage !== 6 || g.vehicle) return;
    const e = g.evening;
    if (choice.id === "evening" && !e.started) {
      e.started = true;
      g.day = 19.1;
      talk(g, "栞栞", ["那就出发吧。地图上的三个金色录音点，顺路挑一个开始。今晚这里给你留一盏灯。"], false, "shiori");
      notify(g, "第二章 · 把今天留给明天");
    } else if ((choice.id === "street" || choice.id === "river") && e.started && e.samples.length === 3) {
      e.arrangement = choice.id;
      if (!e.completed) e.elapsed = 0;
      talk(g, "米汀", [choice.id === "street" ? "让锅沿先响，桥风在中间把路连起来，最后是江水。好了，去叫七海开场吧。" : "江水先把人带到岸边，跟着桥风走进街巷。好了，去叫七海开场吧。"], false, "nagisa");
    } else if (choice.id === "screen" && e.arrangement && e.samples.length === 3) {
      if (e.completed) e.elapsed = 0;
      e.watching = true;
      e.recording = null;
      g.player.speed = 0;
      g.dialogue = null;
    } else return;
    saveGame(g);
    return;
  }
  if (choice.id === "accept" && !g.life.delivery && g.stage >= 2) {
    const route = g.life.delivered % NEIGHBOR_ORDERS.length;
    g.life.delivery = { id: g.life.nextOrder++, route, elapsed: 0 };
    talk(g, "阿姨", [`${NEIGHBOR_ORDERS[route].meal}装好了。地图上的青色餐盒就是收餐人，到了下车交给他就好。`]);
    notify(g, "邻里送餐已接单 · 地图标出收餐人");
  } else if (choice.id === "insulate" && !g.life.insulated && g.money >= BASKET_PRICE) {
    g.money -= BASKET_PRICE;
    g.life.insulated = true;
    talk(g, "阿姨", ["给你换上青绿色的保温餐篮。以后每单热气能留 150 秒，正在送的这单也算。"]);
    notify(g, `保温餐篮已装好 · -¥${BASKET_PRICE}`);
  } else if (choice.id === "cancel" && g.life.delivery) {
    g.life.delivery = null;
    talk(g, "阿姨", ["餐我收回了，你先忙自己的事。这单没有报酬，想再帮忙随时过来。"]);
  } else return;
  saveGame(g);
}
export function interact(g: Game) {
  if (g.phase !== "playing") return;
  if (g.dialogue) {
    g.dialogue.index += 1;
    if (g.dialogue.index >= g.dialogue.lines.length) {
      const { effect } = g.dialogue;
      if (effect?.kind === "story" && effect.stage === g.stage) {
        // Stage and money are committed together; unfinished dialogue has no receipt.
        if (g.stage === 1) g.money = Math.max(0, g.money - 24);
        if (g.stage === 5) g.money = Math.min(9999, g.money + 40);
        g.stage += 1;
        if (g.stage === 6) {
          g.day = 18.7;
          arrangeParty(g);
        }
      }
      if (effect?.kind === "delivery" && g.life.delivery?.id === effect.order) {
        const d = g.life.delivery;
        const warm = deliveryWarm(g.life);
        const amount = DELIVERY_PAY + (warm ? WARM_TIP : 0);
        g.money = Math.min(9999, g.money + amount);
        g.life.delivered += 1;
        g.life.receipt = { order: d.id, name: NEIGHBOR_ORDERS[d.route].name, amount, warm };
        g.life.delivery = null;
        notify(g, `送餐完成 · +¥${amount}${warm ? "（含热气小费）" : ""} · 粉店还有街坊在等`);
      }
      g.dialogue = null;
      saveGame(g);
    }
    return;
  }
  const near = nearestInteraction(g);
  if (!near) {
    notify(g, "靠近人、车辆或金色标记后按 E");
    return;
  }
  if (near.kind === "screen") {
    g.evening.watching = false;
    saveGame(g);
    return;
  }
  if (near.kind === "sample") {
    if (g.evening.recording) g.evening.recording = null;
    else {
      g.evening.recording = { id: near.id as Evening["samples"][number], progress: 0 };
      notify(g, `录音机已打开 · 站稳 ${RECORD_SECONDS} 秒`);
    }
    return;
  }
  if (near.kind === "vehicle") {
    if (g.vehicle) {
      const v = g.vehicles.find((item) => item.id === g.vehicle)!;
      if (Math.abs(v.speed) > 2) {
        notify(g, "先刹车停稳再下车");
        return;
      }
      const exits = [-1, 1].map((side) => ({
        x: v.x + Math.cos(v.angle) * 2.4 * side,
        z: v.z - Math.sin(v.angle) * 2.4 * side,
      }));
      const exit = exits.find(
        (p) => canTraverse(p) &&
          !BUILDINGS.some((b) => buildingContains(p, b, 0.5)),
      );
      if (!exit) {
        notify(g, "这里太窄，往前挪一点再下车");
        return;
      }
      Object.assign(g.player, exit);
      g.vehicle = null;
      v.speed = 0;
      g.player.speed = 0;
    } else {
      g.vehicle = near.id;
      const mounted = g.vehicles.find((v) => v.id === near.id)!;
      Object.assign(g.player, {
        x: mounted.x,
        z: mounted.z,
        angle: mounted.angle,
        speed: 0,
        y: mounted.y,
      });
      notify(g, "W/S 油门与倒车 · A/D 转向 · 空格刹车 · H 鸣笛");
    }
    saveGame(g);
    return;
  }
  if (near.kind === "record") {
    talk(
      g,
      "柳江 · 现场采样",
      [
        "嘀——录音开始。江水拍岸，桥上轮胎声一点点远去。",
        "米汀：就是这个！现在，回东门和大家一起听吧。",
      ],
      true,
      "nagisa",
    );
    return;
  }
  const n = g.npcs.find((v) => v.id === near.id)!;
  const receiving = g.life.delivery && NEIGHBOR_ORDERS[g.life.delivery.route].npc === n.id;
  if (g.stage === 6 && !receiving && eveningTalk(g, n)) return;
  if (n.id !== QUESTS[g.stage].target) {
    neighborTalk(g, n);
    return;
  }
  if (g.stage === 0) talk(
      g,
      "栞栞",
      [
        "我们想给柳州录一张“声音明信片”。今晚就在东门这里放给大家听。",
        "先帮我去曙光东路取四碗粉吧。旁边那辆薄荷色自行车借你，骑起来很轻。",
      ],
      true,
      "shiori",
    );
  if (g.stage === 1) {
    if (g.bikeDistance < 45) {
      talk(g, "阿姨", [
        "栞栞说给你留了一辆自行车。骑过来取粉吧，拎着走会洒的。",
      ]);
      return;
    }
    talk(
      g,
      "阿姨",
      [
        "四碗，少辣，酸笋另外装。给你绑牢在车篮里了。",
        "米汀在罗池路等你，先给她送过去吧。",
      ],
      true,
    );
  }
  if (g.stage === 2) talk(
      g,
      "米汀",
      [
        "来得正好，还热着呢。录音机在我这里，音箱要找南岸的七海。",
        "借旁边的黄色小车吧，音箱放后备箱。沿文惠桥过江，她就在桥头等你。",
      ],
      true,
      "nagisa",
    );
  if (g.stage === 3) {
    if (g.carDistance < 180) {
      talk(g, "七海", ["音箱太重，车呢？去北岸开辆车过来吧。"]);
      return;
    }
    talk(
      g,
      "七海",
      [
        "终于来了！我把音箱放进后备箱，慢点开回去。",
        "还差江水声。金沙角的岸边很安静，记得下车再录，别把发动机声收进去了。",
      ],
      true,
      "nana",
    );
  }
  if (g.stage === 5) {
    talk(
      g,
      "栞栞",
      [
        "自行车铃、粉店的锅、桥上的风，还有柳江的水声……原来这就是今天。",
        "七海：别光听录音呀，大家都在这里。",
        "米汀：下一次，去更远一点的地方录吧。",
        "第一章 · 江风有回音。谢谢你把大家带到这里。",
      ],
      true,
      "shiori",
    );
  }
}
export function saveGame(g: Game) {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(
      SAVE_KEY,
      JSON.stringify({
        version: 1,
        terrainVersion: 2,
        bridgeVersion: 2,
        exploration: g.exploration,
        flight: g.flight.active,
        stage: g.stage,
        character: g.character,
        player: g.player,
        vehicles: g.vehicles,
        bikeDistance: g.bikeDistance,
        carDistance: g.carDistance,
        stamps: g.stamps,
        money: g.money,
        day: g.day,
        life: g.life,
        evening: g.evening,
        citizens: g.npcs.filter(n => n.routine).map(n => ({ id: n.id, x: n.x, z: n.z, angle: n.angle, routine: n.routine })),
      }),
    );
    g.saveOK = true;
  } catch {
    g.saveOK = false;
  }
}
function arrangeParty(g: Game) {
  const nagisa = g.npcs.find((n) => n.id === "nagisa")!;
  const nana = g.npcs.find((n) => n.id === "nana")!;
  Object.assign(nagisa, NPC_MEETING_POINTS.nagisa, { y: terrainHeight(NPC_MEETING_POINTS.nagisa), angle: 0.4 });
  Object.assign(nana, NPC_MEETING_POINTS.nana, { y: terrainHeight(NPC_MEETING_POINTS.nana), angle: -0.4 });
}
function restoreWorldPosition<T extends Point & { y: number }>(p: T, legacy: boolean, vehicle = false, previousBridge = false): T {
  const originalY = p.y;
  if (!vehicle && !legacy && undergroundLocation(p)) {
    const support = undergroundStairSupport(p) ?? undergroundLevel(p);
    if (originalY >= support - 0.25 && undergroundFree({ ...p, y: originalY + 1.4 })) return { ...p, y: originalY };
  }
  if (!vehicle && !legacy && !inRiver(p)) {
    const parkGround = eshanSurfaceHeight(p);
    if (parkGround !== undefined && Math.abs(originalY - parkGround) < 0.6) return { ...p, y: parkGround };
    const streetSupport = streetSupportHeight(p);
    if (streetSupport !== undefined) return { ...p, y: streetSupport };
    const stationRoof = stationRoofHeight(p);
    if (stationRoof !== undefined && Math.abs(originalY - stationRoof) < 0.6) return { ...p, y: stationRoof };
    const roof = BUILDINGS.find(b => !b.id.startsWith(STATION_PREFIX) && buildingContains(p, b, -0.1) && Math.abs(originalY - buildingElevation(b) - b.h) < 0.6);
    if (roof) return { ...p, y: buildingElevation(roof) + roof.h };
  }
  let result = { ...p, ...restoreStreetPosition(restoreGatePosition(p, vehicle), vehicle ? 1.15 : 0.42) };
  const deck = bridgeSurface(result, -0.2);
  if (deck) {
    const migrateGuangya = previousBridge && previousGuangyaDeck({ ...result, y: originalY });
    const bridge = restoreBridgePosition({ ...result, y: migrateGuangya ? deck.y : originalY }, legacy);
    if (bridge.y === deck.y && bridge.y > terrainHeight(bridge) + 0.5) result = { ...result, y: bridge.y };
  }
  const radius = vehicle ? 1.4 : 0.6;
  const occupied = (at: Point & { y: number }) => bridgeSupportSolid({ ...at, y: at.y + 1 }, radius) || BUILDINGS.some(b => buildingContains(at, b, radius) && (b.baseY === undefined || at.y + 1.9 > b.baseY - 3));
  if (occupied(result)) {
    for (let r = 2; r <= 70; r += 2) {
      let found = false;
      for (let i = 0; i < 32; i++) {
        const candidate = { x: p.x + Math.sin((i * Math.PI) / 16) * r, z: p.z + Math.cos((i * Math.PI) / 16) * r };
        if (!inCity(candidate) || inRiver(candidate) || occupied({ ...candidate, y: terrainHeight(candidate) })) continue;
        result = { ...result, ...candidate, y: terrainHeight(candidate) }; found = true; break;
      }
      if (found) break;
    }
  }
  return result;
}
export function loadGame(g: Game) {
  try {
    const s = JSON.parse(localStorage.getItem(SAVE_KEY) || "null");
    if (
      !s ||
      s.version !== 1 ||
      !Number.isInteger(s.stage) ||
      s.stage < 0 ||
      s.stage > 6
    ) return;
    g.stage = s.stage;
    if (Object.keys(CHARACTERS).includes(s.character)) g.character = s.character;
    if (
      s.player &&
      Number.isFinite(s.player.x) &&
      Number.isFinite(s.player.z) &&
      Number.isFinite(s.player.angle) &&
      (canTraverse(s.player) || (inCity(s.player) && (!inRiver(s.player) || s.flight === true || bridgeSurface(s.player))))
    ) Object.assign(g.player, {
        x: s.player.x,
        z: s.player.z,
        angle: s.player.angle,
        speed: 0,
        y: s.terrainVersion === 2 && Number.isFinite(s.player.y) ? s.player.y : terrainHeight(s.player) + (Number.isFinite(s.player.y) ? s.player.y : 0),
      });
    g.exploration = s.exploration === true;
    if (s.flight === true && inCity(g.player) && Number.isFinite(s.player?.y) && (s.player.y >= (eshanSurfaceHeight(g.player) ?? terrainHeight(g.player)) || undergroundFree({ ...g.player, y: s.player.y + 1 })) && s.player.y <= FLIGHT_CEILING) {
      g.flight.active = true;
      g.player.y = s.player.y;
      for (const b of BUILDINGS) if (g.player.y > buildingElevation(b) - buildingFoundationDepth(b) && buildingContains(g.player, b, 0.6)) g.player.y = Math.max(g.player.y, buildingElevation(b) + b.h + 0.1);
      const roof = stationRoofHeight(g.player);
      if (roof !== undefined && stationRoofSolid(g.player, 0)) g.player.y = roof + 0.1;
    } else Object.assign(g.player, restoreWorldPosition(g.player, s.terrainVersion !== 2, false, s.bridgeVersion !== 2));
    if (Array.isArray(s.vehicles)) for (const v of g.vehicles) {
        const saved = s.vehicles.find((item: Vehicle) => item.id === v.id);
        if (
          saved &&
          Number.isFinite(saved.angle) &&
          Number.isFinite(saved.x) &&
          Number.isFinite(saved.z) &&
          canTraverse(saved)
        ) Object.assign(v, {
            x: saved.x,
            z: saved.z,
            angle: saved.angle,
            speed: 0,
            y: s.terrainVersion === 2 && Number.isFinite(saved.y) ? saved.y : terrainHeight(saved),
          });
      }
    for (const v of g.vehicles) Object.assign(v, restoreWorldPosition(v, s.terrainVersion !== 2, true));
    g.bikeDistance = finiteCounter(s.bikeDistance);
    g.carDistance = finiteCounter(s.carDistance);
    g.stamps = Array.isArray(s.stamps)
      ? s.stamps.filter((v: unknown) => typeof v === "string").slice(0, 10)
      : [];
    g.money = finiteCounter(s.money, 9999);
    g.life = loadStreetLife(s.life);
    g.evening = g.stage === 6 ? loadEvening(s.evening) : createEvening();
    g.day = g.evening.started ? 19.1 : g.stage === 6 ? 18.7 : 17.2;
    if (g.stage === 6) arrangeParty(g);
    restoreCitizens(g.npcs, s.citizens);
    g.traffic = createTraffic([
      { ...g.player, radius: 1 },
      ...g.vehicles.map((v) => ({ ...v, radius: 1.5 })),
      ...g.npcs.map((n) => ({ ...n, radius: 0.7, person: true })),
    ]);
  } catch {
    g.saveOK = false;
  }
}
export type Physics = {
  world: RAPIER.World;
  body: RAPIER.RigidBody;
  collider: RAPIER.Collider;
  controller: RAPIER.KinematicCharacterController;
  velocityY: number;
  radius: number;
  setRadius: (radius: number) => void;
  reset: () => void;
  dispose: () => void;
};
export async function createPhysics(g: Game): Promise<Physics> {
  const { default: R } = await import("@dimforge/rapier3d-compat");
  const { ShapeUtils, Vector2, Quaternion, Euler } = await import("three");
  // Strict Mode and Fast Refresh may create several worlds. Re-initializing
  // the same WASM runtime invalidates pointers owned by those worlds.
  const runtimeCache = globalThis as typeof globalThis & {
    liuzhouRapierReady?: WeakMap<object, Promise<void>>;
  };
  const cache = runtimeCache.liuzhouRapierReady || new WeakMap();
  runtimeCache.liuzhouRapierReady = cache;
  let ready = cache.get(R);
  if (!ready) { ready = R.init(); cache.set(R, ready); }
  await ready;
  const world = new R.World({ x: 0, y: -22, z: 0 });
  for (const chunk of terrainChunks()) {
    if (chunk.maxX < CITY_BOUNDS.minX || chunk.minX > CITY_BOUNDS.maxX || chunk.maxZ < CITY_BOUNDS.minZ || chunk.minZ > CITY_BOUNDS.maxZ) continue;
    const ground = terrainSurface(chunk, chunk.step, rings => ShapeUtils.triangulateShape(rings[0].map(p => new Vector2(p[0], p[1])), rings.slice(1).map(ring => ring.map(p => new Vector2(p[0], p[1])))));
    world.createCollider(R.ColliderDesc.trimesh(new Float32Array(ground.positions), new Uint32Array(ground.indices)));
  }
  for (const section of BRIDGE_SECTIONS) {
    const slab = R.ColliderDesc.convexHull(new Float32Array(deckVertices(section)));
    if (slab) world.createCollider(slab);
  }
  for (const rail of BRIDGE_RAILS) world.createCollider(R.ColliderDesc.cuboid(...rail.size.map(n => n / 2) as [number, number, number])
    .setTranslation(...rail.at).setRotation(new Quaternion().setFromEuler(new Euler(rail.pitch, rail.yaw, 0, "YXZ"))));
  for (const support of GUANGYA_SUPPORTS) world.createCollider(R.ColliderDesc.cuboid(...support.size.map(n => n / 2) as [number, number, number])
    .setTranslation(...support.at).setRotation(new Quaternion().setFromEuler(new Euler(0, support.yaw, 0, "YXZ"))));
  const underground = undergroundSurface(rings => ShapeUtils.triangulateShape(rings[0].map(p => new Vector2(p[0], p[1])), rings.slice(1).map(ring => ring.map(p => new Vector2(p[0], p[1])))));
  world.createCollider(R.ColliderDesc.trimesh(new Float32Array(underground.positions), new Uint32Array(underground.indices)));
  const stationRoof = stationRoofSurface();
  world.createCollider(R.ColliderDesc.trimesh(new Float32Array(stationRoof.positions), new Uint32Array(stationRoof.indices)));
  for (const stair of UNDERGROUND_STEPS) world.createCollider(R.ColliderDesc.cuboid(stair.size[0] / 2, stair.size[1] / 2, stair.size[2] / 2)
    .setTranslation(...stair.at).setRotation({ x: 0, y: Math.sin(stair.angle / 2), z: 0, w: Math.cos(stair.angle / 2) }));
  for (const b of BUILDINGS) {
    const base = buildingElevation(b);
    if (b.footprint) {
      for (const triangle of ShapeUtils.triangulateShape(b.footprint.map((p) => new Vector2(p.x, p.z)), [])) {
        const vertices = triangle.flatMap((i) => [b.footprint![i].x, base - buildingFoundationDepth(b), b.footprint![i].z, b.footprint![i].x, base + b.h, b.footprint![i].z]);
        const hull = R.ColliderDesc.convexHull(new Float32Array(vertices));
        if (hull) world.createCollider(hull);
      }
      continue;
    }
    world.createCollider(
      R.ColliderDesc.cuboid(b.w / 2, b.h / 2, b.d / 2)
        .setTranslation(b.x, base + b.h / 2, b.z)
        .setRotation({
          x: 0,
          y: Math.sin(b.angle / 2),
          z: 0,
          w: Math.cos(b.angle / 2),
        }),
    );
  }
  for (const b of GATE_SOLIDS) world.createCollider(
    R.ColliderDesc.cuboid(b.size[0] / 2, b.size[1] / 2, b.size[2] / 2)
      .setTranslation(DONGMEN.x + b.at[0], GATE_GROUND + b.at[1], DONGMEN.z + b.at[2]),
  );
  for (const b of STREET_SOLIDS) world.createCollider(
    R.ColliderDesc.cuboid(b.size[0] / 2, b.size[1] / 2, b.size[2] / 2)
      .setTranslation(b.at[0], b.at[1] + terrainHeight({ x: b.at[0], z: b.at[2] }), b.at[2])
      .setRotation({ x: 0, y: Math.sin((b.angle || 0) / 2), z: 0, w: Math.cos((b.angle || 0) / 2) }),
  );
  const body = world.createRigidBody(
    R.RigidBodyDesc.kinematicPositionBased().setTranslation(
      g.player.x,
      g.player.y + 1,
      g.player.z,
    ),
  );
  const collider = world.createCollider(
    R.ColliderDesc.capsule(0.58, 0.38),
    body,
  );
  const controller = world.createCharacterController(0.035);
  controller.setApplyImpulsesToDynamicBodies(true);
  controller.enableAutostep(0.26, 0.25, false);
  controller.enableSnapToGround(0.3);
  return {
    world,
    body,
    collider,
    controller,
    velocityY: 0,
    radius: 0.38,
    setRadius: (radius) => collider.setShape(new R.Capsule(0.58, radius)),
    reset: () => body.setTranslation(
        { x: g.player.x, y: g.player.y + 1, z: g.player.z },
        true,
      ),
    dispose: () => world.free(),
  };
}
const neutral = {
  forward: 0,
  turn: 0,
  sprint: false,
  brake: false,
  jump: false,
};
export function toggleFlight(g: Game) {
  if (g.phase !== "playing" || g.dialogue || g.evening.watching) return false;
  if (g.vehicle) { notify(g, "先停稳下车，再开启飞行"); return false; }
  if (g.flight.active && inRiver(g.player) && (!bridgeSurface(g.player) || Math.abs(g.player.y - bridgeSurface(g.player)!.y) > 1)) { notify(g, "江面上请先飞到岸边或桥面，再收起飞行"); return false; }
  g.flight.active = !g.flight.active;
  g.flight.velocityY = g.flight.active ? 5 : 0;
  g.player.speed = 0;
  notify(g, g.flight.active ? "飞行已开启 · 空格升高 / C 降低 / Shift 加速" : "已收起飞行 · 正在落地");
  return true;
}
export function step(
  g: Game,
  input: Input = neutral,
  dt = 1 / 60,
  physics?: Physics,
  cameraAngle = 0,
) {
  if (g.phase !== "playing" || g.dialogue) return;
  g.time += dt;
  if (g.life.delivery && !g.evening.watching) g.life.delivery.elapsed = Math.min(86400, g.life.delivery.elapsed + dt);
  if (g.evening.watching) input = neutral;
  const v = g.vehicles.find((item) => item.id === g.vehicle);
  const actor = v || g.player;
  const beforeX = actor.x;
  const beforeZ = actor.z;
  let grounded = true;
  let velocityY = 0;
  if (v) {
    v.braking = input.brake || (input.forward < 0 && v.speed > 0.5);
    v.steering = -input.turn * Math.min(1, Math.abs(v.speed) / 4);
    const car = v.kind === "car";
    const max = car ? 24 : 12;
    const acceleration = input.brake
      ? -Math.sign(v.speed) * 22
      : input.forward * (car ? 9 : 5) - v.speed * (input.forward ? 0.22 : 1.0);
    const nextSpeed = Math.max(
      -max * 0.3,
      Math.min(max, v.speed + acceleration * dt),
    );
    v.speed =
      input.brake && Math.sign(nextSpeed) !== Math.sign(v.speed)
        ? 0
        : nextSpeed;
    v.angle +=
      -input.turn *
      Math.min(1, Math.abs(v.speed) / 4) *
      (car ? 1.15 : 1.8) *
      dt *
      Math.sign(v.speed || 1);
  } else {
    const magnitude = Math.min(1, Math.hypot(input.forward, input.turn));
    const wanted = magnitude * (g.flight.active ? input.precise ? FLIGHT_INSPECT_SPEED : input.sprint ? FLIGHT_BOOST : FLIGHT_SPEED : input.sprint ? 8.2 : 4.4);
    actor.speed += (wanted - actor.speed) * Math.min(1, dt * 12);
    if (magnitude > 0.01) {
      const target = cameraAngle + Math.atan2(-input.turn, input.forward);
      const diff = Math.atan2(
        Math.sin(target - actor.angle),
        Math.cos(target - actor.angle),
      );
      actor.angle += diff * Math.min(1, dt * 15);
    }
  }
  let dx = Math.sin(actor.angle) * actor.speed * dt;
  let dz = Math.cos(actor.angle) * actor.speed * dt;
  const desired = { x: actor.x + dx, z: actor.z + dz };
  const proposed = g.flight.active ? desired : constrainToBridge(
    actor,
    desired,
    v?.kind === "car" ? 1.15 : 0.45,
  );
  dx = proposed.x - actor.x;
  dz = proposed.z - actor.z;
  const deck = bridgeSurface(proposed, -0.25);
  g.blocked = !inCity(proposed, 1) || (!g.flight.active && inRiver(proposed) && (!deck || actor.y < deck.y - 1));
  if (!g.blocked) g.blocked = g.traffic.some(
    (car) => Math.abs(car.y - actor.y) < 2.2 && distance(car, proposed) < (v?.kind === "car" ? 3.1 : 2.35),
  );
  if (!g.blocked && v) g.blocked = g.npcs.some(
      (n) => Math.abs(n.y - actor.y) < 2.2 && distance(n, proposed) < (v.kind === "car" ? 2.3 : 1.1),
    );
  if (g.blocked) {
    dx = 0;
    dz = 0;
    actor.speed *= 0.8;
  }
  if (physics) {
    const radius = v?.kind === "car" ? 1.0 : 0.38;
    if (physics.radius !== radius) {
      physics.setRadius(radius);
      physics.radius = radius;
    }
    const centerHeight = 0.58 + radius + 0.04;
    physics.body.setTranslation(
      { x: actor.x, y: g.player.y + centerHeight, z: actor.z },
      false,
    );
    if (v || g.flight.active) physics.controller.disableAutostep();
    else physics.controller.enableAutostep(0.26, 0.25, false);
    if (g.flight.active) {
      physics.controller.disableSnapToGround();
      const wantedY = (Number(input.jump) - Number(input.descend || false)) * (input.precise ? FLIGHT_INSPECT_VERTICAL : input.sprint ? 65 : 24);
      g.flight.velocityY += (wantedY - g.flight.velocityY) * Math.min(1, dt * 7);
      physics.velocityY = Math.min(g.flight.velocityY, (FLIGHT_CEILING - g.player.y) / dt);
    } else {
      physics.controller.enableSnapToGround(0.3);
      if (!v && input.jump && (physics.controller.computedGrounded() || g.player.y < (undergroundFloor(g.player) ?? eshanSurfaceHeight(g.player) ?? terrainHeight(g.player)) + 0.05)) physics.velocityY = 7.2;
      physics.velocityY = Math.max(-28, physics.velocityY - 22 * dt);
    }
    physics.controller.computeColliderMovement(physics.collider, {
      x: dx,
      y: physics.velocityY * dt,
      z: dz,
    });
    const move = physics.controller.computedMovement();
    actor.x += move.x;
    actor.z += move.z;
    const floor = undergroundFloor({ ...actor, y: g.player.y }) ?? (inCore(actor) ? terrainHeight(actor) : terrainTriangleHeight(actor));
    g.player.y = Math.max(floor, g.player.y + move.y);
    // y=0 is also a real support: the global floor clamp may resolve the last
    // few millimetres before Rapier's contact offset reports grounded.
    grounded = !g.flight.active && (physics.controller.computedGrounded() || (g.player.y <= floor + 0.001 && physics.velocityY <= 0));
    if (grounded) physics.velocityY = 0;
    velocityY = physics.velocityY;
    if (
      Math.hypot(move.x, move.z) < Math.hypot(dx, dz) * 0.3 &&
      Math.abs(actor.speed) > 2
    ) {
      actor.speed *= 0.75;
      g.blocked = true;
    }
    physics.body.setNextKinematicTranslation({
      x: actor.x,
      y: g.player.y + centerHeight,
      z: actor.z,
    });
    physics.world.timestep = dt;
    physics.world.step();
  } else {
    actor.x += dx;
    actor.z += dz;
    const surface = bridgeSurface(actor, -0.2);
    const floor = undergroundFloor(actor) ?? terrainHeight(actor);
    g.player.y = g.flight.active ? Math.max(floor, Math.min(FLIGHT_CEILING, actor.y + (Number(input.jump) - Number(input.descend || false)) * (input.precise ? FLIGHT_INSPECT_VERTICAL : input.sprint ? 65 : 24) * dt)) : surface && Math.abs(actor.y - surface.y) < 0.6 ? surface.y : undergroundStairSupport(actor) ?? floor;
    grounded = !g.flight.active;
  }
  if (g.flight.active) g.flight.travelled += Math.hypot(actor.x - beforeX, actor.z - beforeZ);
  if (v) {
    v.y = g.player.y;
    const moved = Math.hypot(actor.x - beforeX, actor.z - beforeZ);
    v.odometer = (v.odometer || 0) + moved * Math.sign(v.speed);
    if (v.kind === "bike") g.bikeDistance += moved;
    else g.carDistance += moved;
    Object.assign(g.player, {
      x: v.x,
      z: v.z,
      angle: v.angle,
      speed: v.speed,
      y: v.y,
    });
  }
  advanceLocomotion(g.locomotion, v ? 0 : Math.hypot(actor.x - beforeX, actor.z - beforeZ), dt, g.time, v ? true : grounded, v ? 0 : velocityY);
  stepCitizens(g, dt);
  for (const n of g.npcs) n.y = pedestrianHeight(n);
  stepTraffic(g.traffic, [
    { ...g.player, radius: v?.kind === "car" ? 1.5 : 0.7, person: !v },
    ...g.npcs.map((n) => ({ x: n.x, y: n.y, z: n.z, radius: 0.7, person: true })),
    ...g.vehicles.filter((parked) => parked.id !== g.vehicle).map((parked) => ({ x: parked.x, y: parked.y, z: parked.z, radius: parked.kind === "car" ? 1.5 : 0.6 })),
  ], dt);
  const event = stepEvening(g, dt);
  if (event) {
    notify(g, event === "sample" ? `采样收好 · ${g.evening.samples.length}/3${g.evening.samples.length === 3 ? " · 回东门找米汀编排" : ""}` : event === "cancel" ? "录音机已收起 · 录好的片段仍在" : "第二章完成 · 江边放映 +¥28 · 明天，还在这里");
    saveGame(g);
  }
}
export function publicState(g: Game) {
  return {
    phase: g.phase,
    player: { ...g.player, character: g.character },
    locomotion: { ...g.locomotion },
    exploration: g.exploration,
    underground: undergroundLocation(g.player),
    flight: { ...g.flight, clearance: Number((g.player.y - (undergroundFloor(g.player) ?? terrainHeight(g.player))).toFixed(1)) },
    vehicle: g.vehicle,
    vehicles: g.vehicles,
    traffic: g.traffic,
    trafficRoutes: "游戏编排车流；沿 OSM 道路，非实际交通规则",
    npcs: g.npcs,
    stage: g.stage,
    quest: g.stage === 6 ? eveningTarget(g) || QUESTS[6] : QUESTS[g.stage],
    dialogue: g.dialogue,
    interaction: nearestInteraction(g),
    street: undergroundLocation(g.player) ? "龙城地下街 · 地下一层" : nearestRoad(g.player).name,
    bikeDistance: g.bikeDistance,
    carDistance: g.carDistance,
    blocked: g.blocked,
    money: g.money,
    life: g.life,
    evening: { ...g.evening, signal: recordingStatus(g), frame: g.evening.watching ? eveningFrame(g.evening) : null },
    stamps: g.stamps,
    coordinates: "metres; +x east, +z south; origin WGS84 109.41225,24.31415",
    roads: ROADS.length,
    saveOK: g.saveOK,
  };
}
