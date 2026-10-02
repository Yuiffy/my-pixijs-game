"use client";

import { useRef, type MutableRefObject } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { Season } from "../lines";
import { Ball, Box, Cyl, Floor, Hot, Sign } from "./kit";
import { Building, StreetLamp, Tree, Weather } from "./outdoor";
import { STREET_LENGTH, STREET_SEGMENTS, streetPosition, type CommuteMotion } from "./commuteMotion";

type MotionRef = MutableRefObject<CommuteMotion>;
const SHOPS = ["快剪 · 理发", "24h 便利店", "巷口面馆", "鲜花 · 日常", "街角咖啡"];
const COLORS = ["#aa514d", "#45866d", "#ad7844", "#88677c", "#506f78"];

function StreetBlock({ index, season, motion }: { index: number; season: Season; motion: MotionRef }) {
  const block = useRef<THREE.Group>(null);
  useFrame(() => {
    if (block.current) block.current.position.z = streetPosition(index, motion.current.distance);
  });
  return (
    <group ref={block} position={[0, 0, streetPosition(index, 0)]}>
      <Box position={[0, 0.06, 0]} size={[4, 0.12, STREET_LENGTH]} color={season === "winter" ? "#bec5c6" : "#b9aea0"} />
      <Box position={[2, 0.1, 0]} size={[0.14, 0.2, STREET_LENGTH]} color="#dfd7c8" />
      <Box position={[-1.98, 0.14, 0]} size={[0.16, 0.28, STREET_LENGTH]} color="#dad2c4" />
      {[-5, -3, -1, 1, 3, 5].map(z => <Box key={z} position={[0, 0.124, z]} size={[3.9, 0.005, 0.025]} color="#92918c" />)}
      <Box position={[-0.9, 0.13, 0]} size={[0.26, 0.016, STREET_LENGTH]} color="#c8ac70" />
      <Box position={[4.5, 0, 0]} size={[4.9, 0.05, STREET_LENGTH]} color="#515a64" />
      {[-4, 0, 4].map(z => <Box key={z} position={[4.5, 0.031, z]} size={[0.08, 0.01, 1.8]} color="#e3d5ac" />)}
      {/* Store fronts face the pavement, leaving an unobstructed route ahead. */}
      <group position={[-2.65, 0.12, -2]} rotation={[0, Math.PI / 2, 0]}>
        <Box position={[0, 2.8, -0.6]} size={[7.5, 5.6, 1.2]} color={["#ae9c8d", "#889b9b", "#b6a48e", "#a59d9b", "#829299"][index]} />
        <Hot id={index === 0 ? "barber" : "moments"} marker={[0, 2.6, 0.1]}>
          <Box position={[0, 1.05, 0.02]} size={[5.5, 1.8, 0.05]} color="#d7d7c3" emissive="#84754b" />
          <Box position={[0, 1.05, 0.08]} size={[0.08, 1.9, 0.07]} color="#605c54" />
          <Box position={[1.9, 1.05, 0.08]} size={[0.08, 1.9, 0.07]} color="#605c54" />
          <Sign position={[0, 2.35, 0.09]} size={[5.8, 0.6]} text={SHOPS[index]} background={COLORS[index]} glow font={50} />
        </Hot>
        {[-2.4, 0, 2.4].map(x => <Box key={x} position={[x, 4.1, 0.02]} size={[1.15, 1.4, 0.04]} color="#e5d4a7" emissive="#806b47" />)}
        <Box position={[0, 2.8, 0.35]} size={[6.1, 0.1, 0.85]} color={COLORS[index]} />
      </group>
      <StreetLamp position={[1.65, 0.12, -3.5]} />
      <Tree position={[1.6, 0.12, 2.5]} season={season} scale={0.8} />
      <Building position={[9, 0, -2]} size={[3.6, 5 + (index % 3) * 2, 7]} color={COLORS[(index + 2) % 5]} seed={index + 42} />
      <Hot id="track" marker={[1.55, 1.6, 0]}>
        <Cyl position={[1.55, 0.7, 0]} radius={0.035} height={1.4} color="#525e5b" />
        <Sign position={[1.55, 1.45, 0.04]} size={[0.9, 0.34]} text="滨江步道 →" background="#36756e" font={40} />
      </Hot>
      {index === 1 && <Sign position={[-1.6, 2.7, 2]} size={[1.1, 0.4]} text="地铁 2 号线" background="#ac514e" font={40} />}
    </group>
  );
}

function Traffic({ motion, lane }: { motion: MotionRef; lane: number }) {
  const car = useRef<THREE.Group>(null);
  useFrame(() => {
    if (!car.current) return;
    const travel = motion.current.elapsed * (lane === 0 ? 3.5 : -2.6);
    car.current.position.z = 13 - ((((travel + lane * 23) % 58) + 58) % 58);
  });
  return (
    <group ref={car} position={[lane === 0 ? 3.3 : 5.8, 0, -lane * 18]} rotation={[0, lane === 0 ? Math.PI : 0, 0]}>
      <Box position={[0, 0.48, 0]} size={[1.2, 0.65, 2.5]} color={lane === 0 ? "#b86252" : "#d5ba72"} />
      <Box position={[0, 0.99, -0.12]} size={[1.05, 0.45, 1.3]} color="#536c79" />
      {[-0.43, 0.43].map(x => <Box key={x} position={[x, 0.5, 1.26]} size={[0.24, 0.17, 0.02]} color="#fff0c0" emissive="#fff0c0" />)}
      {[-1, 1].flatMap(side => [-0.78, 0.78].map(z => <Cyl key={`${side}-${z}`} position={[side * 0.6, 0.27, z]} radius={0.26} height={0.12} color="#30343a" rotation={[0, 0, Math.PI / 2]} />))}
    </group>
  );
}

function Walker({ motion }: { motion: MotionRef }) {
  const person = useRef<THREE.Group>(null);
  const leftLeg = useRef<THREE.Group>(null);
  const rightLeg = useRef<THREE.Group>(null);
  useFrame(() => {
    const t = motion.current.elapsed;
    if (person.current) person.current.position.set(0.95, 0.12 + Math.abs(Math.sin(t * 4)) * 0.025, 12 - ((t * 1.7 + 21) % 54));
    if (leftLeg.current) leftLeg.current.rotation.x = Math.sin(t * 4) * 0.4;
    if (rightLeg.current) rightLeg.current.rotation.x = -Math.sin(t * 4) * 0.4;
  });
  return (
    <group ref={person} position={[0.95, 0.12, -9]}>
      <group ref={leftLeg} position={[-0.11, 0.78, 0]}><Box position={[0, -0.35, 0]} size={[0.14, 0.7, 0.18]} color="#455264" /></group>
      <group ref={rightLeg} position={[0.11, 0.78, 0]}><Box position={[0, -0.35, 0]} size={[0.14, 0.7, 0.18]} color="#455264" /></group>
      <Box position={[0, 1.06, 0]} size={[0.44, 0.58, 0.3]} color="#9d6e63" />
      <Ball position={[0, 1.53, 0]} radius={0.19} color="#e6c4a7" />
      <Box position={[0, 1.69, -0.025]} size={[0.34, 0.1, 0.3]} color="#40352e" />
      <Box position={[-0.29, 0.62, 0]} size={[0.22, 0.32, 0.14]} color="#c2a77b" />
    </group>
  );
}

export default function CommuteScene({ season, motion }: { season: Season; motion: MotionRef }) {
  return (
    <group>
      <Floor size={[50, 120]} y={-0.04} color="#737d80" />
      {Array.from({ length: STREET_SEGMENTS }, (_, index) => <StreetBlock key={index} index={index} season={season} motion={motion} />)}
      <Traffic motion={motion} lane={0} />
      <Traffic motion={motion} lane={1} />
      <Walker motion={motion} />
      <Weather season={season} area={32} motion={motion} />
    </group>
  );
}
