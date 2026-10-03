import type { Metadata } from "next";
import AfterHours from "@/components/afterHours/AfterHours";

export const metadata: Metadata = {
  title: "岁己：零点之后 · 3D 心理恐怖游戏",
  description:
    "赴岁己的晚安之约，一起泡茶、拍照、约定明天。零点之后，用真实的今晚走出监听回放，和岁己一起走向天亮。",
};

export default function AfterHoursPage() {
  return <AfterHours />;
}
