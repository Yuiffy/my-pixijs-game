import type { Metadata } from "next";
import MiniGame from "@/components/miniGames/MiniGame";

export const metadata: Metadata = {
  title: "晶圆周期 · 半导体经营",
  description: "决定报价、库存与扩产时机，穿越六年半导体周期。",
};
export default function FabPage() {
  return <MiniGame kind="fab" />;
}
