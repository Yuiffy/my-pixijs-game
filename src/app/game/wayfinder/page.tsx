import type { Metadata } from "next";
import Wayfinder from "@/components/wayfinder/Wayfinder";

export const metadata: Metadata = {
  title: "风邮小镇 · 沿着好奇心找路",
  description:
    "一款温暖的找路冒险。送一封信，认一座钟楼，带着回信回家。在海港与两层商场里练习看地图、记地标、返程和绕路。",
};
export default function WayfinderPage() {
  return <Wayfinder />;
}
