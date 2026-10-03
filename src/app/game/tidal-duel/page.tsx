import type { Metadata } from "next";
import TidalDuel from "@/components/tidalDuel/TidalDuel";

export const metadata: Metadata = {
  title: "潮夜格斗 · 岁己 vs 栞栞",
  description:
    "潮夜格斗，岁己与栞栞的像素格斗。按后防御、轻中重攻击、单键必杀与辅助连招，五个动作键轻松上手；原皮与独立换装、单人挑战、同机双人、自由练习。",
};
export default function TidalDuelPage() {
  return <TidalDuel />;
}
