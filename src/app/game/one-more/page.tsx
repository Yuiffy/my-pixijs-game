import type { Metadata } from "next";
import dynamic from "next/dynamic";

export const metadata: Metadata = {
  title: "岁岁过招 · 三庭收钟",
  description: "走过竹庭、钟台与终庭，敲响属于小岁的收场钟。",
};
const OneMoreGame = dynamic(
  () => import("@/components/oneMoreGame/OneMoreGame"),
  { ssr: false },
);

export default function SparringPage() {
  return <OneMoreGame />;
}
