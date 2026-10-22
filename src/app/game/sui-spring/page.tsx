import type { Metadata } from "next";
import SpringGame from "@/components/suiPlatformer/SpringGame";

export const metadata: Metadata = {
  title: "岁己 · 春日第一封信 | 横版跳跃冒险",
  description:
    "在春日花田、风车坡、屋顶花园和首播舞台奔跑跳跃。四个手工关卡、可变跳高、极简棋子伙伴与一本慢慢集齐的图鉴。",
};
export default function SpringPage() {
  return <SpringGame />;
}
