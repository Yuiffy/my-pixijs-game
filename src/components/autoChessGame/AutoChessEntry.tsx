"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";

const Classic = dynamic(() => import("./PhaserGame"), { ssr: false });
const Multiplayer = dynamic(() => import("./multiplayer/AutoChessLobby"), { ssr: false });

export default function AutoChessEntry() {
  const [multiplayer, setMultiplayer] = useState<boolean | null>(null);
  useEffect(() => {
    const query = new URLSearchParams(window.location.search);
    setMultiplayer(query.get("mode") === "multiplayer" || query.has("room"));
  }, []);
  if (multiplayer === null) return null;
  return multiplayer ? <Multiplayer /> : <Classic />;
}
