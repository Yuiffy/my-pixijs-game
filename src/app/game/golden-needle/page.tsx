import type { Metadata } from "next";
import GoldenNeedle from "@/components/goldenNeedle/GoldenNeedle";

export const metadata: Metadata = {
  title: "不许手抖 · 黄金微针模拟室 | 岁己小游戏",
  description:
    "拿稳小方块探头，控制下针节奏，及时冷敷，也可以选择栓剂止痛。源自岁己直播闲聊的虚构美容手术小游戏。",
};

export default function GoldenNeedlePage() {
  return <GoldenNeedle />;
}
