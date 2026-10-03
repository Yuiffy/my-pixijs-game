import type { Game, Stage } from "./types";

export const CHAPTERS: Record<Stage, { name: string; subtitle: string }> = {
  visit: { name: "序章 / 有人等你", subtitle: "23:50 · 下播后的邀请" },
  tea: { name: "01 / 两个人的晚安茶", subtitle: "00:05 · 可以慢慢来" },
  photo: { name: "02 / 把今天留下来", subtitle: "00:12 · 一张合照" },
  home: { name: "03 / 我们还有明天", subtitle: "00:16 · 晚安之前" },
  unease: { name: "04 / 她没有开口", subtitle: "00:17 · 迟到的声音" },
  power: { name: "05 / 还在听吗", subtitle: "00:17 · 停电" },
  memories: { name: "06 / 真实的今晚", subtitle: "00:17 · 维护备份" },
  corridor: { name: "07 / 回放走廊", subtitle: "00:17 · 记忆不会倒过来" },
  chase: { name: "08 / 别回答她", subtitle: "00:17 · 切断监听" },
  choice: { name: "09 / 最后一句晚安", subtitle: "00:18 · 可以说再见" },
  dawn: { name: "尾声 / 明天见", subtitle: "05:46 · 两个人的出口" },
};

export const NOTES: Record<string, { title: string; text: string }> = {
  diary: {
    title: "岁己的房间维护手记",
    text: "晚安房间，是下播以后还可以和朋友坐一会儿的地方。茶、照片、留言，都由房间监听备份。每天 00:17，房间应当停止监听并打开出口。\n\n回放可以保存一句话，却不能代替说话的人。若回放没有停止：恢复三个房间的电，取回三份备份，使用结束时间恢复访客权限，再断开电路、电脑、镜面三个监听通道。\n\n我会在出口等你。——岁己",
  },
  "power-note": {
    title: "三间房的配电标签",
    text: "月亮：客厅的晚安茶。\n星：直播间的工作灯。\n太阳：玄关通向明天。\n\n旧电路需要先接客厅，再接直播间，最后接玄关，才不会过载。\n月亮 → 星 → 太阳。这也是刚才岁己教你的顺序。",
  },
  "tea-memory": {
    title: "今晚 / 两个人的茶",
    text: "我替岁己泡了一杯晚安茶。她没有催我，把杯子接过去时说：“小心烫。今天可以慢慢来。”\n\n月亮杯、星灯、门口的太阳，是她熟悉的房间。",
  },
  "photo-memory": {
    title: "今晚 / 合照",
    text: "岁己向镜头比了心。我们的合照已经保存，照片上的 SUI 是正着写的。镜面回放会把名字翻成 IUS。\n\n真正的今晚不会被倒过来。",
  },
  "promise-memory": {
    title: "今晚 / 明天见",
    text: "我们说好了：陪伴不必是永远留在同一个晚上。今天可以结束，明天仍然可以见面。\n\n晚安时间：00:17。",
  },
  "tape-kitchen": {
    title: "备份 01 / 晚安时间",
    text: "“这是房间维护用的备份。晚安茶结束在零点十七分，时钟记住的是 00:17。别跟着回放退回直播开始的时候。”\n\n电脑的访客密码与第一扇真实的门，都使用今晚的结束时间：00:17。",
  },
  "tape-shelf": {
    title: "备份 02 / 正着的名字",
    text: "“照片上的 SUI 正着写。她会记得你放的味道，回放只会念出同一句话。找到名字没有倒过来的门。”\n\n第二扇真实的门，和刚才合照里的名字一致。",
  },
  "tape-bedroom": {
    title: "备份 03 / 晚安之后",
    text: "“真正的晚安之后，广播会安静。安静的门通往监听室。断开电路、电脑、镜面这三个回放通道，我就在出口等你。”\n\n第三扇真实的门：没有波形的广播。回放只想重复今晚，本来的岁己会等你走向明天。",
  },
  "seal-clock": {
    title: "真实的门 / 00:17",
    text: "记住的是说晚安的时间，不是循环回直播开始。接下来，找合照上正着的 SUI。",
  },
  "seal-portrait": {
    title: "真实的门 / SUI",
    text: "这是合照里的名字，正着写的 SUI。最后一扇门，应当是说完晚安后安静的广播。",
  },
  "seal-radio": {
    title: "真实的门 / 安静",
    text: "晚安之后可以安静。监听室的出口恢复了；关闭电路、电脑、镜面，回放才不能继续复制房间。",
  },
};

export function note(g: Game, id: string) {
  if (id === "tea-memory") return {
      ...NOTES[id],
      text: `我们一起做了${g.evening.blend === "lemon" ? "柠檬" : "蜂蜜"}晚安茶。她记得我放的味道，也记得我把杯子递给她。\n\n月亮杯、星灯、门口的太阳，是她教我的接电顺序。`,
    };
  if (id === "promise-memory") return {
      ...NOTES[id],
      text:
        g.evening.promise === "extra"
          ? "我说想再坐一会儿。岁己笑着说：“不过可不是永远哦。我们还有明天。到零点十七分，就一起说晚安。”\n\n回放却删掉了后半句话。"
          : "我说：“明天也想见到你。”岁己回答：“说好了，明天见。今天也可以好好结束呀。”\n\n晚安时间：00:17。回放却说，明天不会来了。",
    };
  return NOTES[id];
}

export function conversation(g: Game) {
  switch (g.evening.dialogue) {
    case "greeting":
      return {
        text: "欢迎来到我的晚安房间。下播以后，也想和你一起待一会儿。怎么啦，见到我开心吗？",
        options: [
          { id: "happy", text: "当然开心，终于可以这样见到你了。" },
          { id: "help", text: "开心呀，也想帮你做点什么。" },
        ],
      };
    case "serve":
      return {
        text: `${g.evening.blend === "lemon" ? "柠檬" : "蜂蜜"}茶，好香。是特地给我做的吗？`,
        options: [
          { id: "care", text: "给你，慢慢喝，小心烫。" },
          { id: "tease", text: "先尝尝，看我有没有泡得比你更好喝。" },
        ],
      };
    case "promise":
      return {
        text: "和你在一起，这个晚上过得好快呀。明天……还会再来见我吗？房间会在零点十七分说晚安。",
        options: [
          { id: "tomorrow", text: "明天也想见到你。今天好好说晚安。" },
          { id: "extra", text: "想再坐一会儿，不过我们还有明天。" },
        ],
      };
    case "anomaly":
      return {
        text: "你怎么突然看着我？……那句“再陪我一会儿”，刚才不是我说的。",
        options: [
          { id: "name", text: "岁己，看着我。照片里的名字倒过来了。" },
          { id: "voice", text: "声音从电脑那边来的。你刚才没有开口。" },
        ],
      };
    default:
      return { text: "我在这里。", options: [] };
  }
}

export function objective(g: Game) {
  if (g.stage === "visit") return "走到岁己身边，回应她的欢迎。";
  if (g.stage === "tea") return g.evening.carrying
      ? "端着晚安茶，走到岁己身边递给她。"
      : "去厨房，和岁己一起泡一杯晚安茶。";
  if (g.stage === "photo") return "把茶几上的相机摆好，给岁己拍一张合照。";
  if (g.stage === "home") return !g.evening.promise
      ? "和岁己说好明天的约定。"
      : "走到电脑前，和岁己结束今晚的晚安房间。";
  if (g.stage === "unease") return [
      "看看茶几上的合照。刚才的声音不对劲。",
      "去问岁己，她刚才真的说话了吗？",
      "在电脑上停止房间监听。岁己去检查镜子。",
    ][g.evening.anomaly];
  if (g.stage === "power") return "打开手电，按月亮 → 星 → 太阳恢复三个房间的电。";
  if (g.stage === "memories") return g.tapes.length < 3
      ? `取回三份房间维护备份 · ${g.tapes.length}/3`
      : "用今晚的结束时间恢复电脑上的访客权限。";
  if (g.stage === "corridor") return [
      "选择写着 00:17 的时钟之门。",
      "选择和合照一致、SUI 正着写的名字之门。",
      "选择说完晚安后安静的广播之门。",
    ][g.seals];
  if (g.stage === "chase") return `断开电路、电脑、镜面的房间监听 · ${g.sources.length}/3`;
  if (g.stage === "choice") return "回到电脑前，决定怎样结束今晚。";
  return "岁己在出口等你。带着今晚的合照走向天亮。";
}

export function actionLabel(g: Game, id: string) {
  if (id === "sui") return g.stage === "tea" && g.evening.carrying
      ? "把晚安茶递给岁己"
      : "和岁己说话";
  if (id === "kettle") return "一起泡晚安茶";
  if (id === "tripod") return "摆好相机，准备合照";
  if (id === "photo-frame") return "看看刚才的合照";
  if (id === "computer") return g.stage === "home"
      ? "结束今晚的晚安房间"
      : g.stage === "unease"
        ? "停止房间监听"
        : g.stage === "memories"
          ? "恢复访客权限"
          : g.stage === "chase"
            ? "关闭电脑回放"
            : "说最后一句晚安";
  if (id === "fuse") return g.stage === "chase" ? "断开电路回放" : "恢复房间供电";
  if (id === "mirror") return "断开镜面回放";
  if (id === "entry") return g.stage === "dawn" ? "带着合照走向天亮" : "打开公寓门";
  if (id === "echo") return "听听她是否记得今晚";
  if (id === "fridge" || id === "notebook") return "阅读维护手记";
  if (id.startsWith("tape-")) return "播放房间维护备份";
  if (["clock", "portrait", "radio"].includes(id)) return "选择这扇记忆之门";
  if (id === "hide") return "进入衣柜躲藏";
  return "检查出口";
}
