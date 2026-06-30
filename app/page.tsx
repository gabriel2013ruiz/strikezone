"use client";

import dynamic from "next/dynamic";

// The game uses WebGL/DOM heavily — load it client-only (no SSR).
const Game = dynamic(() => import("@/components/Game"), { ssr: false });

export default function Page() {
  return <Game />;
}
