import type { Metadata } from "next";
import LiuzhouGame from "@/components/liuzhou/LiuzhouGame";

export const metadata: Metadata = {
  title: "柳州GTA",
  description:
    "沿真实道路与地形探索柳州，与岁己、栞栞、米汀和七海步行、骑行、驾车，或飞向五星街、柳州站和鹅山。",
};

export default function LiuzhouPage() {
  return <LiuzhouGame />;
}
