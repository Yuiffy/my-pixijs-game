"use client";

import { useMemo } from "react";
import * as THREE from "three";
import { hashKey } from "../../inbox";
import type { Season } from "../lines";
import { Ball, Box, Cyl, Figure, Floor, Hot, PortraitBillboard, Sign } from "./kit";

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

// 天气粒子：冬天下雪，夏天下雨；静态点阵，按需渲染不耗电
export function Weather({ season, area = 14 }: { season: Season; area?: number }) {
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
  if (season !== "winter" && season !== "summer") return null;
  return (
    <points geometry={geometry}>
      <pointsMaterial color={season === "winter" ? "#ffffff" : "#9fb7d6"} size={season === "winter" ? 0.045 : 0.025} transparent opacity={0.85} />
    </points>
  );
}

function Building({ position, size, color, seed }: { position: [number, number, number]; size: [number, number, number]; color: string; seed: number }) {
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

function StreetLamp({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      <Cyl position={[0, 1.4, 0]} radius={0.04} height={2.8} color="#3a3d44" segments={6} />
      <Ball position={[0, 2.85, 0]} radius={0.12} color="#ffe6a8" emissive />
      <pointLight position={[0, 2.7, 0]} intensity={2.2} distance={4.5} color="#ffd89a" />
    </group>
  );
}

// 下班路上：街边店铺、地铁口、公交站，手机在手里亮着
export function CommuteScene({ season }: { season: Season }) {
  return (
    <group>
      <Floor size={[24, 18]} color="#4a4d54" />
      <Box position={[0, 0.06, 1.6]} size={[24, 0.12, 2.6]} color="#8d8a84" />
      <Box position={[0, 0.02, -1.2]} size={[24, 0.04, 0.12]} color="#e9e4da" />
      {season === "winter" && <Box position={[0, 0.125, 1.6]} size={[24, 0.01, 2.6]} color="#eef2f5" />}
      {[-9, -6, -3, 0, 3, 6, 9].map((x, index) => (
        <Building key={x} position={[x, 0, -7]} size={[2.6, 4 + (hashKey(x) % 5), 2]} color={["#5c6270", "#6d6a70", "#586470", "#6f6760"][index % 4]} seed={x} />
      ))}
      <Hot id="barber" marker={[-2.9, 2.6, 2.4]}>
        <Box position={[-2.9, 1.2, 2.2]} size={[2.2, 2.4, 0.3]} color="#e4ddd0" />
        <Box position={[-2.9, 0.95, 2.36]} size={[1.6, 1.4, 0.02]} color="#bcd4de" emissive="#3a5a6a" />
        <Sign position={[-2.9, 2.05, 2.37]} size={[1.6, 0.4]} text="快剪 · 理发" background="#b84a4a" glow font={52} />
        <Cyl position={[-1.75, 0.9, 2.45]} radius={0.08} height={1.1} color="#e84a4a" segments={8} />
      </Hot>
      <group>
        <Box position={[3.3, 1.2, 2.2]} size={[2.4, 2.4, 0.3]} color="#d7d1c6" />
        <Sign position={[3.3, 2.05, 2.37]} size={[1.8, 0.4]} text="24h 便利店" background="#3f8a4a" glow font={52} />
        <Box position={[3.3, 0.95, 2.36]} size={[1.9, 1.4, 0.02]} color="#f6f0d8" emissive="#bba86a" />
      </group>
      <Hot id="moments" marker={[1.8, 2.4, 0.4]}>
        <Box position={[1.8, 1.1, 0.3]} size={[1.2, 2.2, 0.08]} color="#9aa0a8" opacity={0.5} />
        <Box position={[1.8, 1.3, 0.35]} size={[0.9, 1.3, 0.03]} color="#f6e8d2" emissive="#d0a060" />
        <Sign position={[1.8, 1.3, 0.37]} size={[0.8, 0.45]} text="朋友圈" background="#57b36a" glow font={56} />
      </Hot>
      <Hot id="track" marker={[-1.8, 1.3, -0.6]}>
        <Box position={[-1.8, 0.5, -0.8]} size={[2.6, 0.08, 0.08]} color="#c9ccd0" />
        <Box position={[-1.8, 0.25, -0.8]} size={[2.6, 0.5, 0.02]} color="#8d949c" opacity={0.6} />
        <Sign position={[-1.8, 0.9, -0.76]} size={[1.3, 0.28]} text="滨江步道 →" background="#287a75" font={44} />
      </Hot>
      <Sign position={[-5.6, 2.3, 0.26]} size={[1.4, 0.5]} text="地铁 2 号线" background="#c24b4b" glow font={52} />
      <Box position={[-5.6, 0.9, 0.2]} size={[1.6, 1.8, 0.1]} color="#3a3d44" />
      <Hot id="street-phone" marker={[0, 2.05, 1.0]}>
        <Figure position={[0, 0.12, 1.1]} look={{ shirt: season === "winter" ? "#3f4a5c" : season === "summer" ? "#e8e1d4" : "#7a6a5a", hair: "#221d1b" }} rotation={Math.PI} holding="phone" />
      </Hot>
      <Figure position={[-1.8, 0.12, 1.9]} look={{ shirt: "#8a5a5a", hairLong: true }} rotation={-1.2} holding="bag" />
      <Figure position={[2.4, 0.12, 2.0]} look={{ shirt: "#4f6a8a" }} rotation={1.4} holding="phone" />
      <Box position={[-4.5, 0.55, -2.4]} size={[3.4, 1.0, 1.5]} color="#c24b4b" />
      <Box position={[-4.5, 1.05, -2.4]} size={[2.2, 0.5, 1.3]} color="#2d3040" />
      <Box position={[5.2, 0.5, -3.3]} size={[1.8, 0.9, 1.3]} color="#e0b24c" />
      <StreetLamp position={[-2, 0.12, 0.5]} />
      <StreetLamp position={[4.5, 0.12, 0.5]} />
      <Tree position={[-8.2, 0.12, 1.6]} season={season} />
      <Tree position={[8.4, 0.12, 1.6]} season={season} />
      <Weather season={season} />
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
