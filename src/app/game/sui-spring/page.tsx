import type { Metadata } from "next";
import DeliveryGame from "@/components/suiDelivery/DeliveryGame";

export const metadata: Metadata = {
  title: "岁己 · 春日第一单 | 横版配送冒险",
  description:
    "挑起面团、踩踏借力，借蒸汽冲过雨棚，搭乘剧场吊台，停稳宴席机。四个街区、十二个订单，最后走到留给岁己的红椅子，一起吃上热饭。",
};
export default function SpringPage() {
  return <DeliveryGame />;
}
