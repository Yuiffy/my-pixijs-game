import type { Metadata } from "next";
import MarriagePressureGame from "@/components/marriagePressureGame/MarriagePressureGame";

export const metadata: Metadata = {
  title: "年关牌局：这婚，你催吗？ | 家庭策略游戏",
  description:
    "40位虚构候选，微信聊天、请客或AA见面、双向选择和婚后共担。在24个季度中扮演当事人或家长，也支持本地双人。",
};

export default function FamilyPressurePage() {
  return <MarriagePressureGame />;
}
