"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { Runtime3D } from "./runtime3d";
import { worldPoint } from "./navigation";
import { BATHROOM, CAT_BOWL, CAT_LITTER, onBreak } from "./household";
import { labelTexture } from "./textures3d";

type Vec = [number, number, number];
function Box({ at, size, color }: { at: Vec; size: Vec; color: string }) {
  return <mesh position={at} castShadow receiveShadow><boxGeometry args={size} /><meshStandardMaterial color={color} /></mesh>;
}
function Ball({ at, scale, color }: { at: Vec; scale: Vec; color: string }) {
  return <mesh position={at} scale={scale} castShadow><sphereGeometry args={[1, 12, 8]} /><meshStandardMaterial color={color} /></mesh>;
}
export function NoodleCup({ runtime: r }: { runtime: Runtime3D }) {
  const lid = useRef<THREE.Group>(null);
  const soup = useRef<THREE.Group>(null);
  const texture = useMemo(() => labelTexture("鲜香桶面", "超市配送 · 需热水冲泡", "#b45742"), []);
  useEffect(() => () => texture.dispose(), [texture]);
  useFrame(() => {
    const state = r.game.daily?.household.noodles;
    const opened = state === "ready" || state === "carrying" || state === "served";
    if (lid.current) { lid.current.visible = !opened; lid.current.rotation.x = r.game.busy?.key === "pour-noodles" ? -0.8 : 0; }
    if (soup.current) soup.current.visible = opened || r.game.busy?.key === "pour-noodles";
  });
  return (
<group>
    <mesh position={[0, 0.13, 0]} castShadow><cylinderGeometry args={[0.19, 0.145, 0.26, 20, 1, true]} /><meshStandardMaterial color="#b75d46" side={THREE.DoubleSide} /></mesh>
    <mesh position={[0, 0.15, 0]}><cylinderGeometry args={[0.189, 0.162, 0.16, 20, 1, true, -Math.PI / 3, (Math.PI * 2) / 3]} /><meshBasicMaterial map={texture} /></mesh>
    <mesh position={[0, 0.26, 0]} rotation={[-Math.PI / 2, 0, 0]}><ringGeometry args={[0.173, 0.198, 24]} /><meshStandardMaterial color="#f2dfb4" side={THREE.DoubleSide} /></mesh>
    <group ref={lid} position={[0, 0.265, 0]}><mesh rotation={[-Math.PI / 2, 0, 0]}><circleGeometry args={[0.177, 24]} /><meshStandardMaterial color="#e7c681" side={THREE.DoubleSide} /></mesh><Box at={[0.13, 0.01, 0.04]} size={[0.09, 0.008, 0.065]} color="#f0dab0" /></group>
    <group ref={soup} position={[0, 0.24, 0]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]}><circleGeometry args={[0.17, 20]} /><meshStandardMaterial color="#b89046" /></mesh>
      {[0, 1, 2, 3, 4, 5].map(i => <mesh key={i} position={[Math.sin(i * 2) * 0.07, 0.006, Math.cos(i * 2) * 0.07]} rotation={[Math.PI / 2, 0, i]}><torusGeometry args={[0.06, 0.009, 4, 12, 5.4]} /><meshStandardMaterial color="#f4d08a" /></mesh>)}
      <Box at={[0.14, 0.08, 0.04]} size={[0.014, 0.16, 0.022]} color="#efdfb8" />
      <Box at={[0.14, 0.164, 0.04]} size={[0.046, 0.025, 0.022]} color="#efdfb8" />
      {[-1, 0, 1].map(i => <Box key={i} at={[0.14 + i * 0.017, 0.19, 0.04]} size={[0.01, 0.04, 0.022]} color="#efdfb8" />)}
    </group>
  </group>
);
}

function Cat({ runtime: r }: { runtime: Runtime3D }) {
  const rig = useRef<THREE.Group>(null); const body = useRef<THREE.Group>(null); const legs = useRef<THREE.Group>(null); const eyes = useRef<THREE.Group>(null); const tail = useRef<THREE.Group>(null); const
head = useRef<THREE.Group>(null);
  useFrame(() => {
    const c = r.game.daily?.household.cat;
    if (!rig.current || !c) return;
    const [x, z] = worldPoint(c);
    rig.current.position.set(x, 0, z); rig.current.rotation.y = c.yaw;
    const sleeping = c.mode === "sleep"; const
moving = c.mode === "walk" && c.path.length > 0;
    if (body.current) { body.current.position.y = sleeping ? -0.1 : 0; body.current.scale.y = sleeping ? 0.7 : 1; }
    if (legs.current) {
      legs.current.visible = !sleeping;
      legs.current.children.forEach((leg, i) => { leg.rotation.x = moving ? Math.sin(r.game.elapsed * 12 + i * Math.PI) * 0.45 : 0; });
    }
    if (eyes.current) eyes.current.scale.y = sleeping ? 0.1 : 0.9;
    if (head.current) { head.current.rotation.x = c.mode === "eat" ? 0.65 + Math.sin(c.clock * 6) * 0.09 : sleeping ? 0.15 : 0; head.current.position.y = c.mode === "eat" ? 0.24 : 0.37; }
    if (tail.current) tail.current.rotation.z = sleeping ? 1.2 : Math.sin(c.clock * 2) * 0.3;
  });
  return (
<group ref={rig} userData={{ spot: "cat" }}>
    <group ref={body}>
      <Ball at={[0, 0.25, 0]} scale={[0.16, 0.19, 0.29]} color="#c99258" />
      <Ball at={[0, 0.22, 0.08]} scale={[0.14, 0.15, 0.2]} color="#f1d5ab" />
      <group ref={head} position={[0, 0.37, 0.24]}>
        <Ball at={[0, 0, 0]} scale={[0.18, 0.15, 0.145]} color="#d2a36c" />
        {[-1, 1].map(side => (
<group key={side}>
          <mesh position={[side * 0.12, 0.155, -0.025]} rotation={[0, 0, side * -0.16]}><coneGeometry args={[0.075, 0.17, 3]} /><meshStandardMaterial color="#c99258" /></mesh>
          <Ball at={[side * 0.07, -0.045, 0.13]} scale={[0.067, 0.047, 0.038]} color="#f4dec0" />
        </group>
))}
        <group ref={eyes}>{[-1, 1].map(side => <Ball key={side} at={[side * 0.083, 0.026, 0.13]} scale={[0.023, 0.031, 0.012]} color="#465f44" />)}</group>
        <Ball at={[0, -0.022, 0.16]} scale={[0.025, 0.018, 0.014]} color="#b4796f" />
      </group>
      <group ref={tail} position={[0, 0.25, -0.25]}>
        <Ball at={[0, 0.1, -0.06]} scale={[0.045, 0.16, 0.055]} color="#c99258" />
        <Ball at={[0.02, 0.26, -0.065]} scale={[0.045, 0.085, 0.045]} color="#95633e" />
      </group>
    </group>
    <group ref={legs}>{[-1, 1].flatMap(x => [-1, 1].map(z => <group key={`${x}${z}`} position={[x * 0.11, 0.2, z * 0.18]}><Ball at={[0, -0.1, 0]} scale={[0.048, 0.11, 0.055]} color="#f1d5ab" /></group>))}</group>
  </group>
);
}
export default function HouseholdScene({ runtime: r }: { runtime: Runtime3D }) {
  const group = useRef<THREE.Group>(null); const grains = useRef<THREE.Group>(null); const clumps = useRef<THREE.Group>(null); const scoop = useRef<THREE.Group>(null); const foodBag = useRef<THREE.Group>(null); const kettle = useRef<THREE.Group>(null); const steam = useRef<THREE.Group>(null); const cup = useRef<THREE.Group>(null); const water = useRef<THREE.Mesh>(null); const lamp = useRef<THREE.MeshStandardMaterial>(null); const
occupied = useRef<THREE.MeshStandardMaterial>(null);
  const sign = useMemo(() => labelTexture("洗手间", "请给彼此一点私人空间", "#879789"), []);
  useEffect(() => () => sign.dispose(), [sign]);
  const [bx, bz] = worldPoint(CAT_BOWL); const [lx, lz] = worldPoint(CAT_LITTER); const
[,wz] = worldPoint(BATHROOM);
  useFrame(() => {
    const h = r.game.daily?.household;
    if (group.current) group.current.visible = !!h;
    if (!h) return;
    const { busy } = r.game;
const p = busy ? busy.elapsed / busy.duration : 0;
    if (grains.current) grains.current.visible = h.cat.fed || (busy?.key === "cat-food" && p > 0.4);
    if (clumps.current) clumps.current.children.forEach((child, i) => { child.visible = i >= h.cat.scoops && r.game.tasks.includes("cat-litter"); });
    if (scoop.current) { scoop.current.rotation.z = busy?.key === "cat-litter" ? Math.sin(p * Math.PI) * -0.8 : -0.3; scoop.current.position.y = busy?.key === "cat-litter" ? Math.sin(p * Math.PI) * 0.25 : 0; }
    if (foodBag.current) { foodBag.current.rotation.z = busy?.key === "cat-food" ? Math.sin(p * Math.PI) * 1.2 : 0; foodBag.current.position.y = busy?.key === "cat-food" ? 0.3 : 0; }
    if (cup.current) cup.current.visible = ["boiling", "hot", "steeping", "ready"].includes(h.noodles) && busy?.key !== "take-noodles";
    if (kettle.current) { kettle.current.rotation.z = busy?.key === "pour-noodles" ? -Math.sin(p * Math.PI) * 0.7 : 0; kettle.current.position.y = busy?.key === "pour-noodles" ? Math.sin(p * Math.PI) * 0.18 : 0; }
    if (water.current) water.current.visible = busy?.key === "pour-noodles" && p > 0.2 && p < 0.85;
    if (lamp.current) lamp.current.color.set(h.noodles === "boiling" ? "#ffb55b" : "#617c64");
    if (steam.current) {
      steam.current.visible = ["boiling", "hot", "steeping", "ready"].includes(h.noodles);
      steam.current.children.forEach((mesh, i) => { mesh.position.y = 1.25 + ((r.game.elapsed * 0.12 + i * 0.12) % 0.45); mesh.scale.setScalar(0.6 + Math.sin(r.game.elapsed + i) * 0.2); });
    }
    if (occupied.current) occupied.current.color.set(onBreak(r.game) && h.rest.stage === "inside" ? "#b26c61" : "#7d9c7c");
  });
  return (
<group ref={group}>
    <Cat runtime={r} />
    <group position={[bx, 0, bz]} userData={{ spot: "cat-bowl" }}>
      <Box at={[0, 0.015, 0]} size={[0.72, 0.03, 0.46]} color="#b6bb95" />
      <mesh position={[0, 0.085, 0]}><cylinderGeometry args={[0.19, 0.23, 0.14, 18]} /><meshStandardMaterial color="#b28466" /></mesh>
      <mesh position={[0, 0.158, 0]} rotation={[-Math.PI / 2, 0, 0]}><circleGeometry args={[0.16, 18]} /><meshStandardMaterial color="#6e6756" /></mesh>
      <group ref={grains}>{Array.from({ length: 14 }, (_, i) => <Ball key={i} at={[Math.sin(i * 2.4) * 0.11, 0.165, Math.cos(i * 2.4) * 0.11]} scale={[0.025, 0.017, 0.021]} color="#98633a" />)}</group>
      <group ref={foodBag}><Box at={[0.34, 0.2, 0]} size={[0.19, 0.36, 0.15]} color="#d4b57a" /><Ball at={[0.34, 0.2, 0.082]} scale={[0.05, 0.06, 0.01]} color="#746c4e" /></group>
    </group>
    <group position={[lx, 0, lz]} userData={{ spot: "cat-litter" }}>
      <Box at={[0, 0.08, 0]} size={[0.76, 0.16, 0.51]} color="#819791" /><Box at={[0, 0.165, 0]} size={[0.63, 0.015, 0.39]} color="#d6c9a8" />
      <group ref={clumps}>{[0, 1, 2].map(i => <Ball key={i} at={[-0.2 + i * 0.2, 0.185, Math.sin(i * 2) * 0.09]} scale={[0.067, 0.033, 0.049]} color="#9e8a63" />)}</group>
      <group ref={scoop}><Box at={[0.25, 0.29, 0.1]} size={[0.07, 0.3, 0.025]} color="#d2af75" /><Box at={[0.25, 0.17, 0.1]} size={[0.16, 0.07, 0.1]} color="#a89b7c" /></group>
      <Box at={[0.49, 0.1, 0]} size={[0.18, 0.2, 0.17]} color="#576e62" />
    </group>
    <group position={[-5.95, 0, wz]} rotation={[0, Math.PI / 2, 0]} userData={{ spot: "bathroom" }}>
      <Box at={[0, 1.05, 0]} size={[0.78, 2.1, 0.06]} color="#9da99c" />
      <mesh position={[0, 1.58, 0.037]}><planeGeometry args={[0.6, 0.37]} /><meshBasicMaterial map={sign} /></mesh>
      <mesh position={[0.26, 1, 0.06]}><sphereGeometry args={[0.035, 10, 8]} /><meshStandardMaterial color="#bda87e" /></mesh>
      <mesh position={[0, 1.26, 0.041]}><circleGeometry args={[0.035, 12]} /><meshStandardMaterial ref={occupied} color="#7d9c7c" /></mesh>
    </group>
    <group userData={{ spot: "kitchen" }}>
      <group position={[-1.47, 0.88, -2.2]}><group ref={kettle}>
        <mesh position={[0, 0.15, 0]}><cylinderGeometry args={[0.115, 0.145, 0.28, 18]} /><meshStandardMaterial color="#d2dccc" metalness={0.25} roughness={0.4} /></mesh>
        <Box at={[0, 0.31, 0]} size={[0.15, 0.045, 0.15]} color="#8a9c8c" />
        <mesh position={[-0.16, 0.16, 0]} rotation={[Math.PI / 2, 0, 0]}><torusGeometry args={[0.12, 0.023, 6, 16, Math.PI * 1.7]} /><meshStandardMaterial color="#718879" /></mesh>
        <mesh position={[0.13, 0.22, 0]} rotation={[0, 0, -0.7]}><cylinderGeometry args={[0.04, 0.055, 0.16, 10]} /><meshStandardMaterial color="#d2dccc" /></mesh>
      </group>
      </group><mesh position={[-1.47, 0.89, -2.06]}><sphereGeometry args={[0.015, 8, 6]} /><meshStandardMaterial ref={lamp} color="#617c64" /></mesh>
      <group ref={cup} position={[-1.02, 0.865, -2.08]}><NoodleCup runtime={r} /></group>
      <mesh ref={water} position={[-1.14, 1.19, -2.08]} rotation={[0, 0, -0.7]}><cylinderGeometry args={[0.012, 0.012, 0.22, 8]} /><meshStandardMaterial color="#d3ebdd" transparent opacity={0.6} /></mesh>
      <group ref={steam}>{[0, 1, 2].map(i => <mesh key={i} position={[-1.44 + i * 0.055, 1.3, -2.16]}><sphereGeometry args={[0.065, 8, 6]} /><meshStandardMaterial color="#f5eee0" transparent opacity={0.22} depthWrite={false} /></mesh>)}</group>
    </group>
  </group>
);
}
