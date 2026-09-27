import type { Metadata } from "next";
import dynamic from "next/dynamic";

export const metadata: Metadata = {
  title: "上船！应援事务所 · 主播活动协办桌游",
  description:
    "经营粉丝应援社团，拖动角色排活动，派人协办、垫筹备费、达标分酬金。和 AI 或朋友一起抢席位、做调研、蹲名场面。",
};

const HypeHarbor = dynamic(() => import("@/components/hypeHarbor/HypeHarbor"), {
  ssr: false,
});

export default function HypeHarborPage() {
  return <HypeHarbor />;
}
