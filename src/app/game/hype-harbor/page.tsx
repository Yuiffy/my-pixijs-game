import type { Metadata } from "next";
import dynamic from "next/dynamic";

export const metadata: Metadata = {
  title: "上船！应援事务所 · 虚拟主播投资桌游",
  description:
    "上船应援、当认知民或蹲名场面切片，和 AI 或本地朋友一起体验虚拟主播投资桌游。",
};

const HypeHarbor = dynamic(() => import("@/components/hypeHarbor/HypeHarbor"), {
  ssr: false,
});

export default function HypeHarborPage() {
  return <HypeHarbor />;
}
