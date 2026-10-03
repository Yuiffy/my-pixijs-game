import type { Metadata } from "next";
import AfterHours from "@/components/afterHours/AfterHours";

export const metadata: Metadata = {
  title: "岁己：零点之后 · 3D 心理恐怖游戏",
  description:
    "下播以后，房间里的另一个岁己还在等最后一句话。探索午夜公寓，找回录音，穿过回声走廊，把自己的名字带回天亮。",
};

export default function AfterHoursPage() {
  return <AfterHours />;
}
