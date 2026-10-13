import { beforeStream } from "./outings";
import type { Game } from "./engine";
import { nightRoll, onBreak } from "./household";
import { skinOf } from "./skins";

export const FAULTS = {
  mic: { name: "麦克风接触不良", symptom: "嘴在动，输入电平却一直是零；画面和网络都正常。", fix: "重新插紧麦克风线", channel: "声音" },
  camera: { name: "面捕补光熄灭", symptom: "声音正常，虚拟形象却不跟着眨眼；摄像头旁的补光灯灭了。", fix: "接好补光灯电源", channel: "面捕" },
  network: { name: "网络连接不稳", symptom: "本地声音和面捕正常，上传状态反复掉线；网线卡扣松了。", fix: "扣紧路由器网线", channel: "网络" },
} as const;
export type FaultKind = keyof typeof FAULTS;
export type LifeEvents = {
  nap: { active: boolean; clock: number; reaction: number; cooldown: number; rewarded: boolean };
  repair: { kind: FaultKind; stage: "pending" | "fault" | "isolated" | "testing" | "fixed" | "none"; due: number; stable: number; mistakes: number; feedback: string };
};
export function createLifeEvents(s: Game): LifeEvents {
  return {
    nap: { active: false, clock: 0, reaction: 0, cooldown: 0, rewarded: false },
    repair: { kind: (["mic", "camera", "network"] as const)[Math.floor(nightRoll(s.seed, 62) * 3)], stage: s.level === 4 || (s.level === 5 && nightRoll(s.seed, 61) < 0.48) ? "pending" : "none", due: 18 + nightRoll(s.seed, 63) * 14, stable: 0, mistakes: 0, feedback: "" },
  };
}
export const faultActive = (s: Game) => !!s.daily && ["fault", "isolated", "testing"].includes(s.daily.events.repair.stage);
export const repairMuted = (s: Game) => !!s.daily && ["isolated", "testing"].includes(s.daily.events.repair.stage);
export function beginNap(s: Game) {
  const d = s.daily;
  if (s.phase !== "playing" || !d || d.stage !== "home" || s.carry || d.events.nap.cooldown > 0) return;
  d.events.nap.active = true; d.events.nap.clock = 0; d.events.nap.reaction = 0;
  d.panel = "nap"; s.path = []; s.visit = null;
  s.message = "你挪到床边，侧身躺下。枕头太软，呼噜声不知不觉跑了出来……";
}
export function wakeNap(s: Game) {
  const d = s.daily;
  if (s.phase !== "playing" || !d?.events.nap.active) return;
  const n = d.events.nap;
  n.active = false; n.cooldown = 20; d.panel = null; s.requireRelease = true;
  if (!n.rewarded && n.clock >= 2 && n.reaction < 3) { s.love += 4; n.rewarded = true; }
  s.message = n.reaction >= 3 ? "你赶紧坐起来，朝TA做了个抱歉的手势。还是去客厅沙发等吧。" : "你及时收住呼噜，轻轻坐起来。TA嘴角弯了一下，又转回直播屏幕。";
}
export function repairInput(s: Game, input: "isolate" | FaultKind | "resume" | "close") {
  const d = s.daily;
  if (s.phase !== "playing" || !d || d.panel !== "repair" || !faultActive(s)) return;
  const r = d.events.repair;
  if (input === "close") { d.panel = null; s.requireRelease = true; return; }
  if (input === "isolate" && r.stage === "fault") {
    r.stage = "isolated"; r.feedback = "TA切到稍等画面并闭麦，向你比了个OK。看指示灯，找出需要处理的那一路。";
  } else if (input in FAULTS && r.stage === "isolated") {
    if (input === r.kind) { r.stage = "testing"; r.stable = 0; r.feedback = "接好了。先观察三秒，确认信号稳定，再示意TA恢复直播。"; } else { r.mistakes++; r.feedback = "这一路原本正常。先别乱拔，按症状检查另一处；已经闭麦，不会惊动观众。"; }
  } else if (input === "resume" && r.stage === "testing" && r.stable >= 3) {
    r.stage = "fixed"; d.panel = null; s.requireRelease = true; s.love += r.mistakes ? 12 : 20;
    s.message = `${skinOf(s.skin).name}恢复直播：“好啦，刚刚一点小状况。”桌下的手轻轻碰了碰你。`;
    d.messages.push({ from: "partner", text: "修好啦，谢谢我的场外技术员。等下播请你吃宵夜。" });
  }
}
export function stepLifeEvents(s: Game, dt: number) {
  const d = s.daily;
  if (!d || beforeStream(s) || d.stage !== "home" || d.arrival !== "done") return;
  const { nap: n, repair: r } = d.events;
  n.cooldown = Math.max(0, n.cooldown - dt);
  if (n.active) {
    n.clock += dt;
    if (n.clock >= 2.5 && !onBreak(s) && !repairMuted(s)) {
      s.suspicion = Math.min(90, s.suspicion + dt * (s.muted > 0 ? 0.05 : 0.8));
      s.peak = Math.max(s.peak, s.suspicion);
      const reaction = n.clock >= 9 ? 3 : n.clock >= 6 ? 2 : 1;
      if (reaction !== n.reaction) {
        n.reaction = reaction;
        s.message = reaction === 1 ? "TA转过来眯起眼睛：你这个呼噜声……" : reaction === 2 ? "TA一边继续说话，一边朝客厅摆摆手：去那边睡！" : "手机震了一下：宝贝，呼噜声进麦了，去客厅睡嘛。";
        if (reaction === 3) d.messages.push({ from: "partner", text: "呼噜声都进麦啦！床先让给枕头，去沙发等我，下播就来找你。" });
      }
    }
    if (n.clock >= 12) wakeNap(s);
  }
  if (r.stage === "pending" && s.elapsed >= r.due && !d.panel && !s.busy && !s.visit && !onBreak(s) && s.actionProgress === 0) {
    r.stage = "fault";
    r.feedback = FAULTS[r.kind].symptom;
    s.message = `${skinOf(s.skin).name}悄悄指了指设备：${r.feedback} 去直播桌右侧看看。`;
    d.messages.push({ from: "partner", text: "设备好像出问题了，能悄悄过来帮我看看吗？" });
  }
  if (r.stage === "testing") r.stable = Math.min(3, r.stable + dt);
}
