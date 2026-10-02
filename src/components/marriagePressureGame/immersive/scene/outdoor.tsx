"use client";

import { useMemo, useRef, type MutableRefObject } from "react";
import { useFrame } from "@react-three/fiber";
import type { CommuteMotion } from "./commuteMotion";
import * as THREE from "three";
import { hashKey } from "../../inbox";
import type { Season } from "../lines";
import { Ball, Box, Cyl, Figure, Floor, Hot, PortraitBillboard } from "./kit";

export const SEASON_TREE: Record<Season, string> = {
  spring: "#e9a5b8",
  summer: "#3f8a4a",
  autumn: "#d98a3a",
  winter: "#d9dfe4",
};

export function Tree({ position, season, scale = 1 }: { position: [number, number, number]; season: Season; scale?: number }) {
  return (
    <group position={position} scale={scale}>
      <Cyl position={[0, 0.7, 0]} radius={0.1} top={0.07} height={1.4} color="#6a4a33" segments={6} />
      <Ball position={[0, 1.7, 0]} radius={0.62} color={SEASON_TREE[season]} />
      <Ball position={[0.3, 1.45, 0.2]} radius={0.4} color={SEASON_TREE[season]} />
    </group>
  );
}

// 通勤天气跟随场景时钟；其他场景仍按需渲染。
export function Weather({ season, area = 14, motion }: { season: Season; area?: number; motion?: MutableRefObject<CommuteMotion> }) {
  const points = useRef<THREE.Points>(null);
  const geometry = useMemo(() => {
    const count = season === "winter" ? 240 : season === "summer" ? 320 : 0;
    const positions = new Float32Array(count * 3);
    for (let index = 0; index < count; index++) {
      positions[index * 3] = ((hashKey(season, index, "x") % 1000) / 1000) * area - area / 2;
      positions[index * 3 + 1] = ((hashKey(season, index, "y") % 1000) / 1000) * 6;
      positions[index * 3 + 2] = ((hashKey(season, index, "z") % 1000) / 1000) * area - area / 2 - 2;
    }
    const result = new THREE.BufferGeometry();
    result.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    return result;
  }, [season, area]);
  useFrame(() => {
    if (!motion || !points.current) return;
    const position = geometry.getAttribute("position") as THREE.BufferAttribute;
    for (let i = 0; i < position.count; i++) {
      const initialY = ((hashKey(season, i, "y") % 1000) / 1000) * 6;
      position.setY(i, (((initialY - motion.current.elapsed * (season === "summer" ? 3.8 : 0.65)) % 6) + 6) % 6);
    }
    position.needsUpdate = true;
  });
  if (season !== "winter" && season !== "summer") return null;
  return (
    <points ref={points} geometry={geometry}>
      <pointsMaterial color={season === "winter" ? "#ffffff" : "#9fb7d6"} size={season === "winter" ? 0.045 : 0.025} transparent opacity={0.85} />
    </points>
  );
}

export function Building({ position, size, color, seed }: { position: [number, number, number]; size: [number, number, number]; color: string; seed: number }) {
  const lit = useMemo(() => {
    const cells: Array<[number, number]> = [];
    const columns = Math.max(1, Math.floor(size[0] / 0.5));
    const rows = Math.max(1, Math.floor(size[1] / 0.6));
    for (let x = 0; x < columns; x++) for (let y = 1; y < rows; y++) if (hashKey(seed, x, y) % 3 === 0) cells.push([x, y]);
    return { cells, columns };
  }, [seed, size]);
  return (
    <group position={position}>
      <Box position={[0, size[1] / 2, 0]} size={size} color={color} />
      {lit.cells.map(([x, y]) => (
        <Box key={`${x}-${y}`} position={[-size[0] / 2 + 0.25 + x * 0.5, y * 0.6, size[2] / 2 + 0.01]} size={[0.24, 0.3, 0.02]} color="#ffd98a" emissive="#ffc766" />
      ))}
    </group>
  );
}

export function StreetLamp({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      <Cyl position={[0, 1.4, 0]} radius={0.04} height={2.8} color="#3a3d44" segments={6} />
      <Ball position={[0, 2.85, 0]} radius={0.12} color="#ffe6a8" emissive />
      <pointLight position={[0, 2.7, 0]} intensity={2.2} distance={4.5} color="#ffd89a" />
    </group>
  );
}

function ResumeUmbrella({ position, color }: { position: [number, number, number]; color: string }) {
  return (
    <group position={position}>
      <Cyl position={[0, 0.9, 0]} radius={0.03} height={1.8} color="#3a3d44" segments={6} />
      <Cyl position={[0, 1.8, 0]} radius={0.9} top={0.02} height={0.35} color={color} segments={8} />
      {[-0.5, 0, 0.5].map(x => <Box key={x} position={[x, 1.2, 0.05]} size={[0.3, 0.42, 0.01]} color="#fbf8f1" />)}
    </group>
  );
}

// 公园相亲角：一排雨伞下挂满简历；早上的广场舞姐妹在长椅上聊天
export function ParkScene({ season, portraits, showParent }: { season: Season; portraits: string[]; showParent: boolean }) {
  return (
    <group>
      <Floor size={[22, 16]} color={season === "winter" ? "#dde3e2" : season === "autumn" ? "#9f9a5a" : "#7ea564"} />
      <Box position={[0, 0.02, 0.8]} size={[22, 0.04, 2.4]} color="#c9bda6" />
      <Hot id="board" marker={[0, 2.6, -1.8]}>
        <ResumeUmbrella position={[-2.4, 0, -2]} color="#c24b4b" />
        <ResumeUmbrella position={[0, 0, -2.2]} color="#3d6a9c" />
        <ResumeUmbrella position={[2.4, 0, -2]} color="#e0b24c" />
        <Box position={[0, 1.0, -2.6]} size={[6.4, 0.02, 0.02]} color="#6a6f78" />
        {[-2.6, -1.8, -1.0, 1.0, 1.8, 2.6].map(x => <Box key={x} position={[x, 0.85, -2.58]} size={[0.28, 0.36, 0.01]} color="#f6efe0" />)}
      </Hot>
      {portraits.map((image, index) => (
        <PortraitBillboard key={image} image={image} position={[(index - (portraits.length - 1) / 2) * 1.6, 0.02, -0.9]} height={1.45} />
      ))}
      <Hot id="bench" marker={[-4.2, 1.9, 0.2]}>
        <Box position={[-4.2, 0.42, 0.3]} size={[2.2, 0.08, 0.5]} color="#8a6446" />
        <Box position={[-4.2, 0.7, 0.52]} size={[2.2, 0.4, 0.06]} color="#8a6446" />
        <Figure position={[-4.9, 0, 0.2]} look={{ shirt: "#d0607a", hair: "#3a2e2a", hairLong: true }} seated rotation={0.2} scale={0.95} />
        <Figure position={[-4.2, 0, 0.2]} look={{ shirt: "#8a6ab0", hair: "#5a5550" }} seated scale={0.95} />
        <Figure position={[-3.5, 0, 0.2]} look={{ shirt: "#3f8a86", hair: "#2a2522", hairLong: true }} seated rotation={-0.2} scale={0.95} holding="phone" />
      </Hot>
      <Hot id="sisters" marker={[4.3, 1.4, 0.4]}>
        <Box position={[4.3, 0.45, 0.4]} size={[0.5, 0.9, 0.4]} color="#2b2c30" />
        <Cyl position={[4.3, 0.6, 0.61]} radius={0.15} height={0.02} color="#6a6f78" rotation={[Math.PI / 2, 0, 0]} />
      </Hot>
      {showParent && (
        <Hot id="park-phone" marker={[1.8, 2.0, 1.4]}>
          <Figure position={[1.8, 0, 1.4]} look={{ shirt: "#b8584a", hair: "#4a4440", hairLong: true }} rotation={Math.PI - 0.4} holding="phone" />
        </Hot>
      )}
      {!showParent && <Figure position={[1.8, 0, 1.4]} look={{ shirt: "#b8584a", hair: "#4a4440", hairLong: true }} rotation={Math.PI - 0.4} holding="phone" />}
      <Figure position={[3.2, 0, -0.8]} look={{ shirt: "#6a7f5a", hair: "#8d8a84" }} rotation={-0.6} />
      {[-8, -5.5, 5.8, 8.2].map(x => <Tree key={x} position={[x, 0, -3.8]} season={season} scale={1.3} />)}
      <Tree position={[-7, 0, 2.4]} season={season} />
      <Weather season={season} />
    </group>
  );
}
