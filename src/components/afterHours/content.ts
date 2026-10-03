import type { Game, Stage } from "./types";

export const CHAPTERS: Record<Stage, { name: string; subtitle: string }> = {
  home: { name: "01 / 最后一条弹幕", subtitle: "23:59 · 收工以后" },
  power: { name: "02 / 还在听吗", subtitle: "00:00 · 停电" },
  memories: { name: "03 / 午夜的录音", subtitle: "00:17 · 谁留在这里" },
  corridor: { name: "04 / 回声走廊", subtitle: "00:17 · 出口在重复" },
  chase: { name: "05 / 别回答她", subtitle: "00:17 · 切断三处回声源" },
  choice: { name: "06 / 我的名字", subtitle: "00:18 · 最后一次道别" },
  dawn: { name: "尾声 / 天会亮", subtitle: "05:46 · 离开公寓" },
};

export const NOTES: Record<string, { title: string; text: string }> = {
  diary: {
    title: "收工手记",
    text: "我叫岁己。直播可以结束，房间也可以安静。明天的我会记得今天的我。不用为一条不肯离开的弹幕，永远留在零点。\n\n如果有人用我的声音叫我，先确认她有没有影子。",
  },
  "power-note": {
    title: "配电顺序",
    text: "旧配电箱会过载。先接中间的月亮，再接左边的星，最后接右边的太阳。\n\n月亮 → 星 → 太阳。不要同时打开。",
  },
  "tape-kitchen": {
    title: "录音 01 · 零点",
    text: "“我记得是零点。她说大家都走了，只有她愿意陪我。那时候我还觉得，房间太安静了。”\n\n回声走廊的第一扇真门：只有时钟肯停下来。",
  },
  "tape-shelf": {
    title: "录音 02 · 十七分",
    text: "“下播后十七分钟，门外又传来了我的声音。她的名字写反了。我把表停在了 00:17。”\n\n第二扇真门：读出倒过来的名字。",
  },
  "tape-bedroom": {
    title: "录音 03 · 关掉直播",
    text: "“声音不是观众，观众也不是声音。如果你看到没有波形的收音机，不要再回答。然后，关掉电、屏幕和镜子。”\n\n第三扇真门：选择没有声音的广播。",
  },
  "seal-clock": {
    title: "第一个门印",
    text: "停住的时钟是真的。她说：只要时钟不走，我们就不会分别。",
  },
  "seal-portrait": {
    title: "第二个门印",
    text: "IUS 是 SUI 的倒影。门后没有人，只有一条已经念过的弹幕。",
  },
  "seal-radio": {
    title: "第三个门印",
    text: "没有波形的广播里，传来真正的自己：“别再回答她。去关掉三个回声源。”",
  },
};

export function objective(g: Game) {
  if (g.stage === "home") return "走到直播电脑前，结束今天的直播。";
  if (g.stage === "power") return "打开手电，找到配电箱。冰箱便签记着接电顺序。";
  if (g.stage === "memories") return g.tapes.length < 3
      ? `找到三段午夜录音 · ${g.tapes.length}/3`
      : "用录音里的时间解开直播电脑，再打开公寓门。";
  if (g.stage === "corridor") return [
      "找一扇时间停止的门。",
      "找到倒过来的名字。",
      "寻找没有波形的声音。",
    ][g.seals];
  if (g.stage === "chase") return `切断配电箱、直播电脑和镜子的回声 · ${g.sources.length}/3`;
  if (g.stage === "choice") return "回到电脑前，把最后一句话留给她。";
  return "走出公寓，天会亮。";
}

export function actionLabel(g: Game, id: string) {
  if (id === "computer") {
    if (g.stage === "home") return "结束直播";
    if (g.stage === "memories") return "输入午夜密码";
    if (g.stage === "chase") return "关闭直播回声";
    return "说最后一句话";
  }
  if (id === "fuse") return g.stage === "chase" ? "切断电路回声" : "修复配电箱";
  if (id === "mirror") return "找回真实名字";
  if (id === "entry") return g.stage === "dawn" ? "走向天亮" : "打开公寓门";
  if (id === "echo") return "听她说话";
  if (id === "fridge" || id === "notebook") return "阅读便签";
  if (id.startsWith("tape-")) return "播放这段录音";
  if (["clock", "portrait", "radio"].includes(id)) return "敲这扇门";
  if (id === "hide") return "进入衣柜躲藏";
  return "检查出口";
}
