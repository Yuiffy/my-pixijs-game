import type { Game } from "./engine";

export const CGS = [
  { id: "host-lamp", skin: "host", title: "收工后留给你的灯", hint: "与主播酱完成任意一个夜晚", text: "耳机摘下来了，沙发旁的灯还亮着。她拍了拍身旁的位置：今天也辛苦了。" },
  { id: "sui-repair", skin: "sui", title: "场外技术员，辛苦啦", hint: "与岁己同住时，修复设备并确认恢复直播", text: "信号灯重新亮起。她松了一口气，偷偷朝镜头外的你竖起拇指：还好你在。" },
  { id: "nana7mi-supper", skin: "nana7mi", title: "两碗热汤的夜晚", hint: "与七海达成出门吃宵夜结局", text: "不用再压低声音了。街角的热汤还冒着气，她把第一碗推到你面前。" },
  { id: "shiori-home", skin: "shiori", title: "行李明天再收吧", hint: "与栞栞触发旅行归家开局，并完成这一整晚", text: "旅行箱还靠在玄关，今晚的直播也结束了。终于可以一起坐下来，慢慢聊一路上的小事。" },
  { id: "mizuki-computer", skin: "mizuki", title: "这一局，听我的", hint: "与弥月同住时，在电脑上玩一会儿，再完成这一晚", text: "下播后，她熟练地握住鼠标，给你看刚才的操作轨迹：这里这样调，一起再试一局？" },
] as const;
export type CgId = (typeof CGS)[number]["id"];
export const cgOf = (id: CgId) => CGS.find(cg => cg.id === id)!;
export const validCgs = (value: unknown): CgId[] => (Array.isArray(value)
  ? CGS.filter(cg => value.includes(cg.id)).map(cg => cg.id) : []);

/** Unlock from accomplished story facts, never from a selected skin or practice session. */
export function earnedCgs(s: Game): CgId[] {
  const d = s.daily;
  return CGS.filter(cg => cg.skin === s.skin && (
    cg.id === "host-lamp" ? s.won
      : cg.id === "sui-repair" ? d?.events.repair.stage === "fixed"
        : cg.id === "nana7mi-supper" ? s.won && d?.after === "supper"
          : cg.id === "shiori-home" ? s.won && d?.outing.trip
            : s.won && !!d && d.computerPlay >= 8
  )).map(cg => cg.id);
}
