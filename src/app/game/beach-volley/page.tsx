import type { Metadata } from "next";
import BeachVolley from "@/components/beachVolley/BeachVolley";

export const metadata: Metadata = {
  title: "晴海双打 · 岁己 × 栞栞 × 米汀 | 沙滩排球",
  description:
    "和岁己、栞栞、米汀去晴海沙滩打一场排球。自由搭配对阵、方向击球、专属必杀与视频特写，一起把夏天留在空中。",
};
export default function BeachVolleyPage() {
  return <BeachVolley />;
}
