import type { Metadata } from "next";
import dynamic from "next/dynamic";

export const metadata: Metadata = {
  title: "岁岁过招 · 竹庭篇",
  description: "岁己与饼师傅的第一场过招。",
};
const OneMoreGame = dynamic(
  () => import("@/components/oneMoreGame/OneMoreGame"),
  { ssr: false },
);

export default function SparringPage() {
  return <OneMoreGame />;
}
