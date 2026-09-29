import { ACTIVITIES } from "../activities";
import type { MarriageGameState } from "../types";

// 关键过场：纯演出，由前后两个状态的差异触发，不影响数值
export type CutsceneKind = "official" | "wedding" | "baby" | "closed" | "handoff";

export interface Cutscene {
  kind: CutsceneKind;
  place: string;
  title: string;
  lines: string[];
  image: string | null;
  action: string;
}

interface Names {
  player: string;
  candidate: string | null;
  image: string | null;
}

const EARLY_STAGES = new Set(["single", "chatting"]);

function firstVenue(state: MarriageGameState) {
  const first = state.dateLog.find(record => record.candidateId === state.candidateId);
  return first ? ACTIVITIES[first.activity].title : "一次普通的见面";
}

export function detectCutscenes(previous: MarriageGameState, next: MarriageGameState, names: Names): Cutscene[] {
  const scenes: Cutscene[] = [];
  const partner = names.candidate ?? "对方";
  if (next.phase === "turn" && EARLY_STAGES.has(previous.stage) && next.stage === "dating") {
    scenes.push({
      kind: "official",
      place: "朋友圈",
      title: "我们在一起了",
      lines: [
        `你发了一条仅三个字的朋友圈：“在一起。”配图是和${partner}的合照。`,
        `从${firstVenue(next)}开始，到今天。`,
        "妈妈是第一个点赞的，家庭群里瞬间刷了二十条“恭喜”。",
      ],
      image: names.image,
      action: "放下手机",
    });
  }
  if (previous.stage !== "married" && previous.stage !== "parenthood" && next.stage === "married") {
    const simple = next.lastChildAction === "simple-wedding";
    scenes.push({
      kind: "wedding",
      place: simple ? "民政局门口" : "婚宴大厅",
      title: simple ? "两个红本本" : "婚礼进行曲",
      lines: simple
        ? ["排了四十分钟的队，拍照的阿姨说：“笑一个，再近一点。”", `走出大门，${partner}把结婚证举到阳光下看了很久。`, "晚上两家人吃了顿便饭，没有司仪，也没有敬酒环节。"]
        : ["司仪念完誓词，台下的亲戚比你还先哭。", `${partner}悄悄在你耳边说：“敬完这一轮我们就去吃点东西。”`, "婚礼结束那晚，你们一起算了份礼金和尾款。"],
      image: names.image,
      action: "开始新的生活",
    });
  }
  if (previous.stage !== "parenthood" && next.stage === "parenthood") {
    scenes.push({
      kind: "baby",
      place: "产科病房外",
      title: "家里多了一个人",
      lines: ["走廊的灯一夜没关，护士抱出来的时候，你才发现自己在发抖。", "家庭群的名字当天就改成了“宝宝成长记”。", "从这周开始，每一笔账、每一个晚上都多了一个人。"],
      image: null,
      action: "抱一抱",
    });
  }
  if (!previous.matchClosed && next.matchClosed && next.phase === "turn") {
    scenes.push({
      kind: "closed",
      place: "聊天记录",
      title: "对话停在了这里",
      lines: [`和${partner}的聊天记录停在了最后一句。`, "你没有删掉，只是把它从置顶里取了下来。"],
      image: names.image,
      action: "翻篇",
    });
  }
  // 家庭对弈：行动方切换时遮住屏幕，防止偷看对方的手机
  if (next.mode === "duel" && next.phase === "turn" && next.activeActor !== previous.activeActor) {
    const parentTurn = next.activeActor === "parent";
    scenes.push({
      kind: "handoff",
      place: "请交接",
      title: parentTurn ? "请把手机交给家长" : `请把手机交给${names.player}`,
      lines: [parentTurn ? "接下来是家长的一周：公园相亲角和爸妈家的客厅。" : `接下来是${names.player}的一周：工位、下班路上和晚上的房间。`, "对方准备好之后再点开始，别偷看聊天记录。"],
      image: null,
      action: "我准备好了",
    });
  }
  return scenes;
}
