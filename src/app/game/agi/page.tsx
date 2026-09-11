import type { Metadata } from "next";
import MiniGame from "@/components/miniGames/MiniGame";

export const metadata: Metadata = {
  title: "智能纪元 · AI 厂商模拟",
  description: "训练、蒸馏、发布与自我提升，与三家竞争者竞速 AGI。",
};
export default function AgiPage() {
  return <MiniGame kind="agi" />;
}
