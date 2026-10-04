import type { Metadata } from "next";
import TidalDuel from "@/components/tidalDuel/TidalDuel";

export const metadata: Metadata = {
  title: "潮夜格斗 · 三人像素对战",
  description:
    "潮夜格斗，岁己、栞栞与弥月的像素格斗。小猫帽岁己、旅装栞栞与黑丝原皮弥月，各有地面和空中招式，原皮超杀命中触发专属动画；支持单人挑战、同机双人和自由练习。",
};
export default function TidalDuelPage() {
  return <TidalDuel />;
}
