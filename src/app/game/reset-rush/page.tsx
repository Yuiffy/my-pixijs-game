import type { Metadata } from "next";
import ResetRush from "@/components/resetRush/ResetRush";

export const metadata: Metadata = {
  title: "RESET / 开蹬！ · 开发者的额度桌游",
  description:
    "安排并行队列，用额度换时间。管理真人精力、押注重置，与三位电脑开发者竞赛。",
};

export default function ResetRushPage() {
  return <ResetRush />;
}
