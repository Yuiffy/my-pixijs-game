"use client";

import dynamic from "next/dynamic";

const PhaserGame = dynamic(() => import("@/components/PhaserGame"), {
  ssr: false,
  loading: () => (
    <main
      style={{
        minHeight: "100svh",
        display: "grid",
        placeItems: "center",
        background: "#f6f4ec",
        color: "#244d3e",
      }}
    >
      正在准备天空…
    </main>
  ),
});

export default function JumpOnePage() {
  return <PhaserGame />;
}
