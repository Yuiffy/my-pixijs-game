import type { Metadata } from "next";
import StreamerGame from "@/components/streamerGame/StreamerGame";

export const metadata: Metadata = {
  title: "饼干岁，听我说 | 直播控场肉鸽",
  description:
    "扮演虚拟主播，打出话题、接住弹幕、用行动卡救场。三幕直播，七种结局，每一句都由你来控场。",
};

export default function StreamerPage() {
  return <StreamerGame />;
}
