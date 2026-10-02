import type { Metadata } from "next";
import BeachVolley from "@/components/beachVolley/BeachVolley";

export const metadata: Metadata = {
  title: "晴海双打 · 岁己 × 栞栞 | 沙滩排球",
  description:
    "和岁己、栞栞去晴海沙滩打一场排球。单人挑战、同机双人、专属必杀，一起把夏天留在空中。",
};
export default function BeachVolleyPage() {
  return <BeachVolley />;
}
