import type { Metadata } from "next";
import MiniGame from "@/components/miniGames/MiniGame";

export const metadata: Metadata = {
  title: "主播，别嚼了！ · 直播偷吃挑战",
  description: "一边聊天，一边偷偷清空零食桌，挑战五场直播。",
};
export default function SnackPage() {
  return <MiniGame kind="snack" />;
}
