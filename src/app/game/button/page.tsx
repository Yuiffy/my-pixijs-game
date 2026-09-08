import type { Metadata } from "next";
import ButtonGame from "@/components/buttonGame/ButtonGame";

export const metadata: Metadata = {
  title: "这个按钮，你按吗？ | 虚拟主播篇",
  description: "一个心动的理由，一个纠结的代价。虚拟主播主题的按钮选择游戏。",
};

export default function ButtonPage() {
  return <ButtonGame />;
}
