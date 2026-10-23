import type { Metadata } from "next";
import SpringGame from "@/components/suiPlatformer/SpringGame";

export const metadata: Metadata = {
  title: "春日第一封信 · 旧原型归档",
  robots: { index: false, follow: false },
};
export default function SpringArchivePage() {
  return <SpringGame />;
}
