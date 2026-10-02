"use client";

import type { ReactNode } from "react";
import type { VenueId } from "../../activities";
import type { Season } from "../lines";
import { Ball, Box, Cyl, Figure, Floor, PortraitBillboard, Sign, Window } from "./kit";
import { venueView } from "./venueView";
import { Tree, Weather } from "./outdoor";

export interface VenueLook {
  background: string;
  fog: [number, number];
  ambient: number;
  sun: number;
  sunColor: string;
  outdoor: boolean;
}

// 每个场馆的光照与天空；outdoor 决定是否叠加季节天气
export const VENUE_LOOKS: Record<VenueId, VenueLook> = {
  restaurant: { background: "#3a2a22", fog: [8, 18], ambient: 0.55, sun: 1.1, sunColor: "#ffe2b8", outdoor: false },
  hotpot: { background: "#3a1c1a", fog: [8, 18], ambient: 0.5, sun: 1.0, sunColor: "#ffc9a0", outdoor: false },
  western: { background: "#1f1a1e", fog: [6, 14], ambient: 0.3, sun: 0.7, sunColor: "#ffd2a0", outdoor: false },
  cafe: { background: "#3b3128", fog: [8, 18], ambient: 0.6, sun: 1.1, sunColor: "#fff0d8", outdoor: false },
  riverside: { background: "#e9a878", fog: [10, 30], ambient: 0.55, sun: 1.3, sunColor: "#ffc48a", outdoor: true },
  museum: { background: "#e8e6e1", fog: [10, 24], ambient: 0.8, sun: 0.9, sunColor: "#ffffff", outdoor: false },
  mall: { background: "#f0ece4", fog: [10, 26], ambient: 0.85, sun: 0.9, sunColor: "#ffffff", outdoor: false },
  boardgame: { background: "#2e2a26", fog: [7, 16], ambient: 0.55, sun: 1.1, sunColor: "#ffe8c0", outdoor: false },
  cinema: { background: "#0e0f14", fog: [6, 16], ambient: 0.18, sun: 0.35, sunColor: "#9fb7ff", outdoor: false },
  nightmarket: { background: "#141a2c", fog: [8, 22], ambient: 0.35, sun: 0.5, sunColor: "#ffb870", outdoor: true },
  catcafe: { background: "#f3e3dc", fog: [8, 18], ambient: 0.8, sun: 1.0, sunColor: "#fff2e8", outdoor: false },
  mountain: { background: "#a9cbe6", fog: [12, 40], ambient: 0.7, sun: 1.5, sunColor: "#fff4dc", outdoor: true },
  karting: { background: "#b8cde0", fog: [12, 36], ambient: 0.7, sun: 1.4, sunColor: "#fff4dc", outdoor: true },
  archery: { background: "#2a2d33", fog: [8, 22], ambient: 0.55, sun: 1.1, sunColor: "#fff0d8", outdoor: false },
  comicon: { background: "#1f2440", fog: [10, 26], ambient: 0.6, sun: 1.0, sunColor: "#d8e0ff", outdoor: false },
  livehouse: { background: "#0b0a10", fog: [6, 16], ambient: 0.15, sun: 0.4, sunColor: "#ff5fa0", outdoor: false },
  kitchen: { background: "#efe6d6", fog: [8, 18], ambient: 0.75, sun: 1.1, sunColor: "#fff2dc", outdoor: false },
  trip: { background: "#f2b38a", fog: [14, 40], ambient: 0.6, sun: 1.4, sunColor: "#ffc98f", outdoor: true },
};

function Room({ floor, wall, children }: { floor: string; wall: string; children?: ReactNode }) {
  return (
    <>
      <Floor size={[10, 8]} color={floor} />
      <Box position={[0, 1.6, -4.05]} size={[10, 3.2, 0.1]} color={wall} />
      <Box position={[-5.05, 1.6, 0]} size={[0.1, 3.2, 8]} color={wall} />
      <Box position={[5.05, 1.6, 0]} size={[0.1, 3.2, 8]} color={wall} />
      {children}
    </>
  );
}

function Table({ round = false, color = "#8a6446", top = "#c9a57b", y = 0.74 }: { round?: boolean; color?: string; top?: string; y?: number }) {
  return (
    <group position={[0, 0, -0.4]}>
      {round
        ? <Cyl position={[0, y, 0]} radius={0.62} height={0.05} color={top} segments={16} />
        : <Box position={[0, y, 0]} size={[1.3, 0.05, 0.8]} color={top} />}
      <Cyl position={[0, y / 2, 0]} radius={0.07} height={y} color={color} />
    </group>
  );
}

function Crowd({ spots, colors }: { spots: Array<[number, number, number]>; colors: string[] }) {
  return (
    <>
      {spots.map((spot, index) => (
        <Figure key={spot.join(",")} position={[spot[0], 0, spot[1]]} rotation={spot[2]} look={{ shirt: colors[index % colors.length], hairLong: index % 2 === 0 }} scale={0.95} />
      ))}
    </>
  );
}

function VenueProps({ venue, season }: { venue: VenueId; season: Season }) {
  switch (venue) {
    case "restaurant":
      return (
        <Room floor="#9a7a5a" wall="#efe2c8">
          <Table round top="#c24b4b" />
          {[[-0.2, -0.35], [0.2, -0.5], [0, -0.2]].map(([x, z]) => <Cyl key={`${x}${z}`} position={[x, 0.79, z]} radius={0.14} height={0.04} color="#f5f1e8" />)}
          {[-2.4, 0, 2.4].map(x => <Ball key={x} position={[x, 2.7, -2]} radius={0.22} color="#e0463a" emissive />)}
          <Sign position={[0, 2.2, -3.99]} size={[2, 0.5]} text="家常菜 · 小炒" background="#8a2f2f" glow font={52} />
          <Crowd spots={[[-3, -2.4, 0.4], [3.2, -2.2, -0.5]]} colors={["#5f7fa8", "#b8584a"]} />
        </Room>
      );
    case "hotpot":
      return (
        <Room floor="#6a3a30" wall="#b8433a">
          <Table round top="#3a2a24" />
          <Cyl position={[0, 0.84, -0.4]} radius={0.3} height={0.16} color="#d23c2a" segments={16} />
          <Cyl position={[0, 0.93, -0.4]} radius={0.28} height={0.01} color="#ff7a3a" segments={16} />
          {[0, 0.12, 0.24].map(y => (
            <mesh key={y} position={[-0.2 - y * 0.4, 1.01 + y, -0.4]} scale={[0.6, 1.4, 0.6]}>
              <sphereGeometry args={[0.06 + y * 0.1, 12, 8]} />
              <meshBasicMaterial color="#f5f1e8" transparent opacity={0.13 - y * 0.25} depthWrite={false} />
            </mesh>
          ))}
          <Sign position={[0, 2.3, -3.99]} size={[2.2, 0.6]} text="重庆火锅" background="#f0b43c" color="#6a1a14" glow font={60} />
          <Crowd spots={[[-3.2, -2, 0.3], [3.0, -2.4, -0.3], [2.4, -2.8, 0]]} colors={["#e0b24c", "#3d6a9c", "#4f8a55"]} />
        </Room>
      );
    case "western":
      return (
        <Room floor="#3a2a24" wall="#4a3530">
          <Table top="#f5f1e8" color="#3a2a24" />
          {[-0.3, 0.3].map(x => <Cyl key={x} position={[x, 0.86, -0.4]} radius={0.025} height={0.2} color="#f5e2b8" />)}
          {[-0.3, 0.3].map(x => <Ball key={`f${x}`} position={[x, 1.0, -0.4]} radius={0.03} color="#ffb34a" emissive />)}
          <pointLight position={[0, 1.4, -0.4]} intensity={2.2} distance={3} color="#ffb870" />
          <Window position={[-2, 1.8, -3.99]} size={[1.6, 1.4]} sky="#1c2744" />
          <Window position={[2, 1.8, -3.99]} size={[1.6, 1.4]} sky="#1c2744" />
        </Room>
      );
    case "cafe":
      return (
        <Room floor="#a88a6a" wall="#e6d8c2">
          <Table round top="#f2eee6" />
          <Cyl position={[-0.18, 0.81, -0.35]} radius={0.06} height={0.1} color="#fbf8f1" />
          <Cyl position={[0.2, 0.81, -0.5]} radius={0.06} height={0.1} color="#fbf8f1" />
          <Box position={[0, 0.55, -3.2]} size={[4, 1.1, 0.7]} color="#6a4a33" />
          <Box position={[1.2, 1.35, -3.2]} size={[0.6, 0.5, 0.4]} color="#9aa0a8" metalness={0.6} />
          <Sign position={[0, 2.4, -3.99]} size={[1.8, 0.5]} text="COFFEE" background="#2f3a33" color="#f0d496" glow font={60} />
          <Figure position={[-0.8, 0, -3.6]} look={{ shirt: "#2f3a33" }} />
          <Window position={[-3.4, 1.7, -3.99]} size={[1.6, 1.6]} sky="#bcd6ea" />
        </Room>
      );
    case "riverside":
      return (
        <>
          <Floor size={[30, 20]} color="#8d8a84" />
          <mesh position={[0, 0.02, -8]} rotation={[-Math.PI / 2, 0, 0]}>
            <planeGeometry args={[30, 12]} />
            <meshStandardMaterial color="#4a78a0" roughness={0.2} metalness={0.3} />
          </mesh>
          <Box position={[0, 0.55, -1.8]} size={[30, 0.06, 0.06]} color="#c9ccd0" />
          {[-6, -3, 0, 3, 6].map(x => <Box key={x} position={[x, 0.28, -1.8]} size={[0.06, 0.55, 0.06]} color="#c9ccd0" />)}
          {[-10, -7, -4, 4, 7, 10].map(x => <Box key={`b${x}`} position={[x, 2, -15]} size={[2, 4 + (Math.abs(x) % 3), 1.5]} color="#6d6a78" />)}
          <Tree position={[-4.4, 0, 0.8]} season={season} />
          <Tree position={[4.6, 0, 0.8]} season={season} />
          <Crowd spots={[[-3, -0.6, 1.6], [3.4, 0.4, -1.4]]} colors={["#4f6a8a", "#b8584a"]} />
        </>
      );
    case "museum":
      return (
        <Room floor="#d8d2c6" wall="#f6f3ee">
          {[-3, 0, 3].map((x, index) => (
            <group key={x}>
              <Box position={[x, 1.7, -3.95]} size={[1.6, 1.1, 0.06]} color="#6a4a33" />
              <Box position={[x, 1.7, -3.9]} size={[1.4, 0.9, 0.02]} color={["#3d6a9c", "#c1913f", "#4f8a55"][index]} />
            </group>
          ))}
          <Box position={[2.4, 0.5, -1.6]} size={[0.6, 1.0, 0.6]} color="#f2eee6" />
          <Cyl position={[2.4, 1.2, -1.6]} radius={0.18} top={0.08} height={0.4} color="#3d6a9c" />
          <Crowd spots={[[-2.4, -2.6, Math.PI], [3.6, -2.8, Math.PI]]} colors={["#6a6f78", "#a0586b"]} />
        </Room>
      );
    case "mall":
      return (
        <Room floor="#e9e6e0" wall="#f6f3ee">
          {[-3.2, 0, 3.2].map((x, index) => (
            <group key={x}>
              <Box position={[x, 1.2, -3.9]} size={[2.6, 2.4, 0.1]} color={["#f2c9a0", "#bcd4de", "#e9a5b8"][index]} />
              <Sign position={[x, 2.2, -3.83]} size={[1.8, 0.4]} text={["服饰", "书店", "潮玩"][index]} background="#2f3a44" glow font={52} />
            </group>
          ))}
          <Box position={[-4.2, 1.2, -1]} size={[0.8, 0.1, 3]} color="#9aa0a8" rotation={[0.5, 0, 0]} />
          <Crowd spots={[[-2, -2.4, 0.5], [2.6, -2.2, -0.4], [3.8, -1.2, -1.2]]} colors={["#3d6a9c", "#c24b4b", "#e0b24c"]} />
        </Room>
      );
    case "boardgame":
      return (
        <Room floor="#6a4a33" wall="#d8cbb4">
          <Table top="#4f7a5a" />
          <Box position={[0, 0.775, -0.4]} size={[0.9, 0.01, 0.6]} color="#e8d9b0" />
          {[[-0.3, -0.5, "#c24b4b"], [-0.1, -0.3, "#3d6a9c"], [0.2, -0.45, "#e0b24c"], [0.35, -0.25, "#f5f1e8"], [0.05, -0.6, "#4f8a55"]].map(([x, z, color]) => (
            <Box key={`${x}${z}`} position={[x as number, 0.81, z as number]} size={[0.06, 0.06, 0.06]} color={color as string} />
          ))}
          {[-3, -1.5, 1.5, 3].map((x, index) => (
            <group key={x}>
              <Box position={[x, 1.1, -3.8]} size={[1.3, 2.2, 0.4]} color="#8a6446" />
              {[0.5, 1.0, 1.5].map(y => <Box key={y} position={[x, y, -3.58]} size={[1.1, 0.3, 0.05]} color={["#c24b4b", "#3d6a9c", "#e0b24c", "#7a6aa8"][(index + y * 2) % 4]} />)}
            </group>
          ))}
        </Room>
      );
    case "cinema":
      return (
        <Room floor="#221c24" wall="#1a1620">
          <Box position={[0, 1.8, -3.9]} size={[7, 2.6, 0.05]} color="#dfe6ff" emissive="#8aa0ff" />
          {[0.2, 1.2, 2.2].map(z => [-3, -2, -1, 1, 2, 3].map(x => (
            <group key={`${x}${z}`}>
              <Box position={[x, 0.3, z - 1.4]} size={[0.8, 0.5, 0.6]} color="#8a2f3a" />
              <Box position={[x, 0.75, z - 1.1]} size={[0.8, 0.6, 0.12]} color="#8a2f3a" />
            </group>
          )))}
          <Cyl position={[0.4, 0.9, -0.2]} radius={0.12} top={0.16} height={0.3} color="#f0d496" />
        </Room>
      );
    case "nightmarket":
      return (
        <>
          <Floor size={[24, 18]} color="#3a3d44" />
          {[-3.6, -1.2, 1.2, 3.6].map((x, index) => (
            <group key={x}>
              <Box position={[x, 0.5, -2.6]} size={[1.9, 1.0, 1.0]} color={["#c24b4b", "#e0b24c", "#3d6a9c", "#4f8a55"][index]} />
              <Box position={[x, 2.1, -2.6]} size={[2.1, 0.08, 1.3]} color="#f5f1e8" />
              <Sign position={[x, 1.7, -2.05]} size={[1.4, 0.36]} text={["烤串", "糖水", "臭豆腐", "炒酸奶"][index]} background="#1f1a18" color="#ffd26a" glow font={52} />
            </group>
          ))}
          {Array.from({ length: 14 }, (_, index) => <Ball key={index} position={[-6.5 + index, 2.6 + Math.sin(index) * 0.15, -1.6]} radius={0.07} color={index % 2 ? "#ffcf6a" : "#ff7a6a"} emissive />)}
          <pointLight position={[0, 2.4, -1.4]} intensity={3} distance={8} color="#ffb870" />
          <Crowd spots={[[-2.6, -1.2, 0.5], [2.4, -1.4, -0.6], [3.4, 0.6, -1.4], [-3.6, 0.8, 1.2]]} colors={["#6a6f78", "#b8584a", "#3f8a86", "#8a6ab0"]} />
        </>
      );
    case "catcafe":
      return (
        <Room floor="#e8d6c8" wall="#f7e8e0">
          <Table round top="#fbf8f1" />
          {[[-1.2, 0.5, "#e0a060"], [1.6, 0.2, "#3a3a3a"], [-0.4, 1.0, "#f5f1e8"], [2.4, -1.8, "#8a8f96"]].map(([x, z, color]) => (
            <group key={`${x}${z}`} position={[x as number, 0, z as number]}>
              <Box position={[0, 0.12, 0]} size={[0.32, 0.18, 0.18]} color={color as string} />
              <Box position={[0.18, 0.24, 0]} size={[0.14, 0.14, 0.14]} color={color as string} />
              <Box position={[-0.2, 0.2, 0]} size={[0.16, 0.04, 0.04]} color={color as string} rotation={[0, 0, 0.6]} />
            </group>
          ))}
          <Cyl position={[-3.2, 0.9, -2.8]} radius={0.12} height={1.8} color="#c9a57b" />
          <Cyl position={[-3.2, 1.6, -2.8]} radius={0.5} height={0.08} color="#e9a5b8" />
          <Sign position={[0, 2.3, -3.99]} size={[1.8, 0.5]} text="喵 · 猫咖" background="#e9a5b8" color="#6a2a3a" font={56} />
        </Room>
      );
    case "mountain":
      return (
        <>
          <Floor size={[40, 30]} color={season === "winter" ? "#e6ebee" : "#7ea564"} />
          <Cyl position={[-8, 3.5, -16]} radius={7} top={0.4} height={7} color="#6a8a6a" segments={6} />
          <Cyl position={[6, 4.5, -18]} radius={8} top={0.4} height={9} color="#5f7f66" segments={6} />
          <Cyl position={[6, 8.6, -18]} radius={1.6} top={0.2} height={1.2} color="#f5f7f8" segments={6} />
          <Box position={[0, 0.02, -1]} size={[1.6, 0.04, 12]} color="#b8a07a" rotation={[0, 0.2, 0]} />
          {[-3.6, -2.4, 2.6, 3.8, -5, 5.2].map((x, index) => <Tree key={x} position={[x, 0, -2 - index * 0.8]} season={season} scale={1.2} />)}
          <Box position={[2.6, 0.9, -3.2]} size={[0.1, 1.8, 0.1]} color="#6a4a33" />
          <Sign position={[2.6, 1.6, -3.14]} size={[0.8, 0.3]} text="山顶 1.2km" background="#3f6a4a" font={40} />
        </>
      );
    case "karting":
      return (
        <>
          <Floor size={[40, 30]} color="#6a8a5a" />
          <Box position={[0, 0.02, -3]} size={[16, 0.04, 4]} color="#3a3d44" />
          {[-6, -2, 2, 6].map(x => <Box key={x} position={[x, 0.05, -3]} size={[1.2, 0.02, 0.14]} color="#f5f1e8" />)}
          {[-7, -5, 5, 7].map(x => [0, 1].map(level => <Cyl key={`${x}${level}`} position={[x, 0.18 + level * 0.3, -0.8]} radius={0.3} height={0.3} color={level ? "#c24b4b" : "#2b2c30"} />))}
          {[[-1.6, "#e0b24c"], [1.4, "#3d6a9c"]].map(([x, color]) => (
            <group key={x} position={[x as number, 0, -2.6]}>
              <Box position={[0, 0.25, 0]} size={[0.8, 0.22, 1.3]} color={color as string} />
              {[[-0.4, -0.5], [0.4, -0.5], [-0.4, 0.5], [0.4, 0.5]].map(([wx, wz]) => <Cyl key={`${wx}${wz}`} position={[wx, 0.16, wz]} radius={0.16} height={0.14} color="#1b1c20" rotation={[0, 0, Math.PI / 2]} />)}
            </group>
          ))}
          <Sign position={[0, 2.6, -6]} size={[3, 0.7]} text="START / FINISH" background="#1b1c20" font={52} />
          <Box position={[-1.6, 1.3, -6]} size={[0.12, 2.6, 0.12]} color="#c9ccd0" />
          <Box position={[1.6, 1.3, -6]} size={[0.12, 2.6, 0.12]} color="#c9ccd0" />
        </>
      );
    case "archery":
      return (
        <Room floor="#8a7a62" wall="#5a5550">
          {[-2.4, 0, 2.4].map(x => (
            <group key={x} position={[x, 1.2, -3.8]}>
              <Cyl position={[0, 0, 0]} radius={0.6} height={0.1} color="#f5f1e8" rotation={[Math.PI / 2, 0, 0]} segments={20} />
              <Cyl position={[0, 0, 0.03]} radius={0.42} height={0.1} color="#3d6a9c" rotation={[Math.PI / 2, 0, 0]} segments={20} />
              <Cyl position={[0, 0, 0.06]} radius={0.26} height={0.1} color="#c24b4b" rotation={[Math.PI / 2, 0, 0]} segments={20} />
              <Cyl position={[0, 0, 0.09]} radius={0.12} height={0.1} color="#f0c64a" rotation={[Math.PI / 2, 0, 0]} segments={20} />
            </group>
          ))}
          {[-1.2, 1.2].map(x => <Box key={x} position={[x, 0.01, -1.5]} size={[0.04, 0.01, 5]} color="#f5f1e8" />)}
          <Box position={[-3.6, 0.8, 0]} size={[0.5, 1.6, 0.8]} color="#6a4a33" />
        </Room>
      );
    case "comicon":
      return (
        <Room floor="#4a4f6a" wall="#2a2f4a">
          {[-3.2, 0, 3.2].map((x, index) => (
            <group key={x}>
              <Box position={[x, 0.5, -3.2]} size={[2.4, 1.0, 0.8]} color="#f5f1e8" />
              <Sign position={[x, 2.2, -3.95]} size={[2.4, 1.2]} text={["同人本", "谷子", "COS 区"][index]} background={["#e9587a", "#57a0e9", "#e9b857"][index]} glow font={64} />
            </group>
          ))}
          <Crowd spots={[[-2.4, -1.6, 0.4], [-1.2, -2.2, 0], [2.0, -1.8, -0.4], [3.4, -1.0, -0.9], [-3.8, -0.6, 1.1]]} colors={["#e9587a", "#57a0e9", "#f0f0f0", "#8a6ab0", "#3f8a86"]} />
        </Room>
      );
    case "livehouse":
      return (
        <Room floor="#1a1820" wall="#141218">
          <Box position={[0, 0.4, -3.2]} size={[6, 0.8, 1.6]} color="#2b2c30" />
          <Figure position={[-1.2, 0.8, -3.2]} look={{ shirt: "#1b1c20", hairLong: true }} />
          <Figure position={[0.6, 0.8, -3.3]} look={{ shirt: "#8a2f3a" }} holding="bag" />
          {[["#ff4f8a", -2], ["#4f9aff", 0], ["#ffcf4a", 2]].map(([color, x]) => (
            <pointLight key={x} position={[x as number, 2.6, -2.2]} intensity={6} distance={5} color={color as string} />
          ))}
          <Crowd spots={[[-2.2, -1.4, Math.PI], [-0.8, -1.8, Math.PI], [1.4, -1.5, Math.PI], [2.6, -1.0, Math.PI]]} colors={["#2b2c30", "#3a3d44", "#4a3530", "#2f3a44"]} />
        </Room>
      );
    case "kitchen":
      return (
        <Room floor="#d8cbb4" wall="#f2ece2">
          <Box position={[0, 0.45, -3.4]} size={[6, 0.9, 1.0]} color="#e9e6e0" />
          <Box position={[0, 0.92, -3.4]} size={[6, 0.05, 1.0]} color="#9aa0a8" />
          <Cyl position={[-1.2, 1.05, -3.3]} radius={0.22} height={0.22} color="#3a3d44" />
          <Box position={[1.4, 1.0, -3.3]} size={[0.6, 0.06, 0.4]} color="#c9a57b" />
          <Box position={[3.6, 1.0, -3.4]} size={[0.9, 2.0, 0.9]} color="#f5f7f8" />
          <Table top="#c9a57b" />
          <Ball position={[0.2, 0.84, -0.4]} radius={0.08} color="#c24b4b" />
          <Ball position={[-0.2, 0.84, -0.3]} radius={0.08} color="#4f8a55" />
        </Room>
      );
    case "trip":
      return (
        <>
          <Floor size={[40, 30]} color="#e8d6a8" />
          <mesh position={[0, 0.03, -10]} rotation={[-Math.PI / 2, 0, 0]}>
            <planeGeometry args={[40, 14]} />
            <meshStandardMaterial color="#3f86b0" roughness={0.2} metalness={0.2} />
          </mesh>
          <Ball position={[5, 3, -18]} radius={1.4} color="#ffcf8a" emissive />
          {[-6, -4, 4, 6.5].map((x, index) => (
            <group key={x} position={[x, 0, -3.5]}>
              <Box position={[0, 0.8, 0]} size={[1.6, 1.6, 1.4]} color={["#f5f1e8", "#bcd4de", "#f2c9a0", "#e9a5b8"][index]} />
              <Box position={[0, 1.8, 0]} size={[1.8, 0.4, 1.6]} color="#b8584a" rotation={[0, 0, 0.1]} />
            </group>
          ))}
          <Cyl position={[-2.4, 1.2, -1.4]} radius={0.06} height={2.4} color="#6a4a33" />
          <Ball position={[-2.4, 2.4, -1.4]} radius={0.5} color="#4f8a55" />
        </>
      );
    default:
      return null;
  }
}

// 第一人称：自己的位置交给相机，对方在桌子另一侧或身旁。
export function VenueScene({ venue, season, portrait }: { venue: VenueId; season: Season; portrait: string | null }) {
  const look = VENUE_LOOKS[venue];
  const view = venueView(venue);
  return (
    <group>
      <VenueProps venue={venue} season={season} />
      {portrait && (
        <>
          <Figure position={[view.partner[0], 0, view.partner[2] - 0.2]} look={{ shirt: "#494354", pants: "#343944" }} seated={view.seated} hideHead />
          <PortraitBillboard image={portrait} position={view.partner} height={view.seated ? 0.82 : 0.72} framed={false} />
        </>
      )}
      {view.seated && venue !== "cinema" && <Box position={[0, 0.4, -1.4]} size={[0.52, 0.08, 0.5]} color="#6a4a33" />}
      {venue === "cafe" && (
<>
        <Cyl position={[-0.28, 0.79, 0]} radius={0.11} height={0.02} color="#ded2bc" />
        <Cyl position={[-0.28, 0.86, 0]} radius={0.065} height={0.12} color="#fbf4e5" />
        <Cyl position={[-0.28, 0.923, 0]} radius={0.053} height={0.003} color="#71482f" />
        <Box position={[0.27, 0.783, -0.08]} size={[0.22, 0.018, 0.3]} color="#32474b" rotation={[0, -0.18, 0]} />
        <Sign position={[-1.5, 1.9, -3.98]} size={[0.8, 0.5]} text="慢慢喝，慢慢聊" background="#8b7760" font={30} />
      </>
)}
      {look.outdoor && <Weather season={season} />}
    </group>
  );
}
