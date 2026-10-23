import type { Metadata } from "next";
import LiuzhouGame from "@/components/liuzhou/LiuzhouGame";

export const metadata: Metadata = {
  title: "江风有回音 · 柳州开放街区",
  description:
    "在真实道路骨架上探索柳州东门街区，与岁己、栞栞、米汀和七海骑行、驾车，收集城市的声音。",
};

export default function LiuzhouPage() {
  return <LiuzhouGame />;
}
