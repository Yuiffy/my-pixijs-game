"use client";

import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import type * as THREE from "three";
import { endingScene, type EndingId } from "./endings";
import type { Runtime3D } from "./runtime3d";

type Vec = [number, number, number];
function Block({ at, size, color }: { at: Vec; size: Vec; color: string }) {
  return <mesh position={at} castShadow receiveShadow><boxGeometry args={size} /><meshStandardMaterial color={color} roughness={0.8} /></mesh>;
}
function Bowl({ x, z, soup = false }: { x: number; z: number; soup?: boolean }) {
  return (
    <group position={[x, 0.7, z]}>
      <mesh castShadow><cylinderGeometry args={[0.15, 0.09, 0.12, 20]} /><meshStandardMaterial color="#eee4cc" /></mesh>
      <mesh position={[0, 0.065, 0]}><cylinderGeometry args={[0.135, 0.135, 0.008, 20]} /><meshStandardMaterial color={soup ? "#be914e" : "#e6c878"} /></mesh>
      {[-1, 1].map(i => <Block key={i} at={[i * 0.04, 0.075, i * 0.035]} size={[0.05, 0.015, 0.045]} color={soup ? "#908065" : "#7d995b"} />)}
      <Block at={[0.17, 0.025, 0.01]} size={[0.025, 0.025, 0.25]} color="#ad875b" />
    </group>
  );
}
function Seat({ x, sofa = false }: { x: number; sofa?: boolean }) {
  return (
    <group position={[x, 0, -0.06]}>
      <Block at={[0, 0.31, 0]} size={[sofa ? 1.6 : 0.5, 0.3, 0.55]} color={sofa ? "#9bab8f" : "#b09370"} />
      <Block at={[0, 0.69, -0.25]} size={[sofa ? 1.6 : 0.48, 0.55, 0.12]} color={sofa ? "#9bab8f" : "#c0ab87"} />
    </group>
  );
}
function Vignette({ id }: { id: EndingId }) {
  const night = id === "night-walk" || id === "supper-table";
  const dinner = id === "rice-share" || id === "supper-table";
  return (
    <>
      <Block at={[0, -0.08, 0]} size={[9, 0.16, 7]} color={night ? "#52666b" : "#cab89d"} />
      <Block at={[0, night ? 3 : 1.65, night ? -3.8 : -2.1]} size={[9, night ? 6 : 3.3, 0.12]} color={night ? "#293f51" : id === "dry-hair" ? "#ddcdd0" : "#dedbc7"} />
      <pointLight position={[1.7, 2.5, 1.2]} color="#ffe4b5" intensity={night ? 16 : 6} distance={8} />
      {!night && <Block at={[-1.6, 1.8, -2]} size={[1.2, 1.4, 0.06]} color="#6d878d" />}
      <mesh position={night ? [-1.8, 2.7, -3.5] : [-1.45, 2.05, -1.95]}><sphereGeometry args={[0.17, 16, 12]} /><meshStandardMaterial color="#fff1c1" emissive="#ffe3aa" emissiveIntensity={0.7} /></mesh>
      {!night && <Block at={[-1.6, 1.8, -1.92]} size={[0.04, 1.42, 0.025]} color="#ad9b82" />}
      {night && [-3, 3].map(x => <group key={x} position={[x, 0, -2.3]}><Block at={[0, 1.2, 0]} size={[2.3, 2.4, 0.45]} color="#42565a" />{[-0.55, 0.55].map(dx => <Block key={dx} at={[dx, 1.65, 0.25]} size={[0.38, 0.5, 0.04]} color="#cebb88" />)}</group>)}
      {dinner && (
        <>
          <Seat x={-0.52} /><Seat x={0.52} />
          <Block at={[0, 0.58, 0.62]} size={[1.75, 0.12, 0.8]} color={night ? "#b77b54" : "#bb9d76"} />
          {[-1, 1].map(i => <Block key={i} at={[i * 0.65, 0.26, 0.62]} size={[0.09, 0.52, 0.55]} color="#927258" />)}
          {night ? <><Bowl x={-0.45} z={0.6} soup /><Bowl x={0.45} z={0.6} soup /><mesh position={[0, 0.67, 0.76]}><cylinderGeometry args={[0.19, 0.16, 0.035, 20]} /><meshStandardMaterial color="#eee4cc" /></mesh>{[-1, 0, 1].map(i => <Block key={i} at={[i * 0.07, 0.705, 0.76]} size={[0.06, 0.045, 0.19]} color="#a45f34" />)}</> : <Bowl x={0} z={0.6} />}
          {night && (
<>
            <Block at={[1.6, 0.48, -0.7]} size={[1.5, 0.96, 0.8]} color="#b67e53" />
            <Block at={[1.6, 2.05, -0.7]} size={[2, 0.15, 1.1]} color="#c48563" />
            {[1, 2].map(x => <group key={x} position={[x, 1.8, -0.4]}><mesh><sphereGeometry args={[0.17, 12, 10]} /><meshStandardMaterial color="#edb461" emissive="#efb54e" emissiveIntensity={1.2} /></mesh></group>)}
          </>
)}
        </>
      )}
      {id === "kitchen-care" && (
<>
        <Block at={[-0.25, 0.43, 0.45]} size={[1.45, 0.86, 0.65]} color="#91a38a" />
        <Block at={[-0.25, 0.9, 0.45]} size={[1.55, 0.07, 0.73]} color="#d7c4a3" />
        <mesh position={[-0.38, 0.96, 0.43]}><cylinderGeometry args={[0.24, 0.19, 0.07, 24]} /><meshStandardMaterial color="#424942" /></mesh>
        <mesh position={[-0.38, 1.005, 0.43]}><cylinderGeometry args={[0.19, 0.19, 0.015, 20]} /><meshStandardMaterial color="#dcb96b" /></mesh>
        <Block at={[-0.05, 0.96, 0.43]} size={[0.35, 0.035, 0.04]} color="#9a7654" />
        <Block at={[0.78, 0.3, -0.6]} size={[0.5, 0.6, 0.5]} color="#bdab89" />
      </>
)}
      {(id === "warm-water" || id === "dry-hair") && (
<>
        {id === "warm-water" ? <><Seat x={-0.47} /><Seat x={0.4} /></> : <Seat x={0.34} />}
        <Block at={[1.65, 0.3, -0.6]} size={[1.7, 0.6, 1.9]} color="#b49d86" />
        <Block at={[1.65, 0.66, -0.6]} size={[1.75, 0.13, 1.95]} color="#e9dfce" />
        <Block at={[1.65, 0.77, -1.3]} size={[1.1, 0.1, 0.38]} color="#e5d0c1" />
        <Block at={[1.65, 0.76, -0.2]} size={[1.77, 0.05, 1.15]} color={id === "dry-hair" ? "#baa0ad" : "#9dafb8"} />
      </>
)}
      {id === "lamp" && <Seat x={0} sofa />}
      {(id === "lamp" || id === "warm-water" || id === "dry-hair") && (
<>
        <Block at={[-1.3, 0.85, 0]} size={[0.05, 1.7, 0.05]} color="#aa8b5e" />
        <mesh position={[-1.3, 1.65, 0]}><coneGeometry args={[0.32, 0.38, 20]} /><meshStandardMaterial color="#f3dfb0" emissive="#e6c88b" emissiveIntensity={0.2} /></mesh>
      </>
)}
      {id === "night-walk" && (
<>
        <Block at={[0, 0.015, 0.55]} size={[2.6, 0.03, 4]} color="#899995" />
        <Block at={[1.65, 1.45, -0.25]} size={[0.07, 2.9, 0.07]} color="#666d62" />
        <mesh position={[1.65, 2.9, -0.25]}><sphereGeometry args={[0.22, 16, 12]} /><meshStandardMaterial color="#f7dfaa" emissive="#f6cd78" emissiveIntensity={1.3} /></mesh>
        {[-2.7, 2.7].map(x => <group key={x} position={[x, 0, -0.7]}><Block at={[0, 0.3, 0]} size={[0.55, 0.6, 0.55]} color="#87786d" /><mesh position={[0, 1.1, 0]}><sphereGeometry args={[0.6, 12, 10]} /><meshStandardMaterial color="#597970" /></mesh></group>)}
      </>
)}
    </>
  );
}
const IDS: EndingId[] = ["lamp", "rice-share", "kitchen-care", "warm-water", "dry-hair", "supper-table", "night-walk"];
export default function EndingScene({ runtime: r }: { runtime: Runtime3D }) {
  const root = useRef<THREE.Group>(null);
  useFrame(() => {
    if (!root.current) return;
    const scene = endingScene(r.game);
    root.current.visible = !!scene;
    root.current.children.forEach((child, i) => { child.visible = IDS[i] === scene?.id; });
  });
  return <group ref={root} position={[0, 0, 12]} visible={false}>{IDS.map(id => <group key={id}><hemisphereLight args={["#ffedcc", "#889da1", 1.5]} /><directionalLight position={[-3, 5, 4]} intensity={1.8} color="#fff1d5" /><Vignette id={id} /></group>)}</group>;
}

export function EndingHandProp({ runtime: r, player, right }: { runtime: Runtime3D; player: boolean; right: boolean }) {
  const root = useRef<THREE.Group>(null);
  useFrame(() => {
    if (!root.current) return;
    const id = endingScene(r.game)?.id;
    const active = player ? right : !right;
    const prop = !active ? -1 : id === "rice-share" || id === "supper-table" ? 0 : id === "warm-water" ? 1 : id === "kitchen-care" && player ? 2 : id === "dry-hair" && player ? 3 : -1;
    root.current.children.forEach((child, i) => { child.visible = i === prop; });
  });
  return (
<group ref={root} position={[0, -0.48, 0.035]}>
    <group visible={false}><Block at={[0, -0.08, 0]} size={[0.025, 0.25, 0.025]} color="#bd9965" /><mesh position={[0, -0.21, 0]} scale={[1, 0.5, 1.6]}><sphereGeometry args={[0.045, 10, 8]} /><meshStandardMaterial color="#c4b899" /></mesh></group>
    <group visible={false}><mesh><cylinderGeometry args={[0.065, 0.065, 0.12, 16]} /><meshStandardMaterial color="#ecdec8" /></mesh></group>
    <group visible={false}><Block at={[0, -0.08, 0]} size={[0.027, 0.3, 0.02]} color="#bd965e" /><Block at={[0, -0.26, 0]} size={[0.1, 0.09, 0.02]} color="#bd965e" /></group>
    <group visible={false}><Block at={[0.05, 0, 0]} size={[0.42, 0.08, 0.25]} color="#ece3d3" /><Block at={[0.2, -0.08, 0]} size={[0.1, 0.2, 0.25]} color="#e2d8c9" /></group>
  </group>
);
}
