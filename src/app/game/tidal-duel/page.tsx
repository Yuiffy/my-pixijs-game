import type { Metadata } from "next";
import TidalDuel from "@/components/tidalDuel/TidalDuel";

export const metadata: Metadata = {
  title: "晴海对决 · 岁己 vs 栞栞",
  description: "海岛格斗，读招反击。和岁己、栞栞在晴海擂台过招，单人挑战、同机双人和自由练习。",
};
export default function TidalDuelPage() { return <TidalDuel />; }
