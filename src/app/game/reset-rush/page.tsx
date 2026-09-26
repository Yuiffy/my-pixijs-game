import type { Metadata } from "next";
import ResetRush from "@/components/resetRush/ResetRush";

export const metadata: Metadata = {
  title: "RESET / 开蹬！ · 开发者的额度桌游",
  description:
    "蹬空额度、押注重置、发布碉游。与三位电脑开发者来一场 42 天的开发竞赛。",
};

export default function ResetRushPage() {
  return <ResetRush />;
}
