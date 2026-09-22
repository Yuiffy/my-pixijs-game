import type { Metadata } from "next";
import HushLive from "@/components/hushLive/HushLive";

export const metadata: Metadata = {
  title: "嘘，TA还在播 · 同居潜行恋爱小游戏",
  description:
    "你是虚拟主播的秘密恋人。递外卖、拿充电器、隔墙语音和偷偷亲吻，在五个夜晚里守住两个人的小秘密。",
};

export default function HushLivePage() {
  return <HushLive />;
}
