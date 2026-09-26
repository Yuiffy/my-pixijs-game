import type { Metadata } from "next";
import ResetRush from "@/components/resetRush/ResetRush";

export const metadata: Metadata = {
  title: "RESET / 开蹬！ · 开发者的额度桌游",
  description:
    "接下项目，设置自动工作室与账号策略，用额度换时间，押注重置，与三位电脑开发者竞赛。",
};

export default function ResetRushPage() {
  return <ResetRush />;
}
