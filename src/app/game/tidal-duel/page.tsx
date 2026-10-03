import type { Metadata } from "next";
import TidalDuel from "@/components/tidalDuel/TidalDuel";

export const metadata: Metadata = {
  title: "晴海对决 · 岁己 vs 栞栞",
  description:
    "晴海对决·潮夜，精细像素动作与暮色栈道。小猫帽原皮岁己、旅装栞栞和可选衣装，猫步连掌、流心潮波、拆投与脱身；单人挑战、同机双人、自由练习。",
};
export default function TidalDuelPage() {
  return <TidalDuel />;
}
