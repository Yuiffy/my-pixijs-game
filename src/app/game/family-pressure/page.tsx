import type { Metadata } from "next";
import MarriagePressureGame from "@/components/marriagePressureGame/MarriagePressureGame";

export const metadata: Metadata = {
  title: "年关牌局：这婚，你催吗？ | 家庭策略游戏",
  description:
    "扮演被催婚的子女、催婚的家长，或进行本地双人家庭对弈。在工作、房租、相亲、结婚和生育压力中走向多种结局。",
};

export default function FamilyPressurePage() {
  return <MarriagePressureGame />;
}
