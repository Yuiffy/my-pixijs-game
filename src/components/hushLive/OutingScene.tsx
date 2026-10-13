import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { worldPoint } from "./navigation";
import type { Runtime3D } from "./runtime3d";

export default function OutingScene({ runtime: r }: { runtime: Runtime3D }) {
  const luggage = useRef<THREE.Group>(null);
  useFrame(() => {
    if (!luggage.current) return;
    const d = r.game.daily;
    luggage.current.visible = !!d?.outing.trip;
    luggage.current.children.forEach((child, i) => {
      const arriving = d?.outing.stage === "arrival";
      const position = arriving ? i === 0 ? r.game.player : d.outing : { x: 85 + i * 38, y: 503 };
      const [x, z] = worldPoint(position);
      child.position.set(x + (arriving ? 0.3 : 0), 0, z + 0.16);
    });
  });
  return (
<group ref={luggage} userData={{ ignoreRay: true }}>{["#789992", "#c5a178"].map(color => (
<group key={color}>
    <mesh position={[0, 0.31, 0]} castShadow><boxGeometry args={[0.32, 0.49, 0.22]} /><meshStandardMaterial color={color} /></mesh>
    {[-1, 1].map(sign => <group key={sign}><mesh position={[sign * 0.11, 0.65, 0]}><boxGeometry args={[0.018, 0.23, 0.02]} /><meshStandardMaterial color="#a5b4b0" /></mesh><mesh position={[sign * 0.11, 0.045, 0]} rotation={[0, 0, Math.PI / 2]}><cylinderGeometry args={[0.045, 0.045, 0.035, 10]} /><meshStandardMaterial color="#333e3c" /></mesh></group>)}
    <mesh position={[0, 0.77, 0]}><boxGeometry args={[0.25, 0.025, 0.035]} /><meshStandardMaterial color="#344440" /></mesh>
    {[-1, 0, 1].map(i => <mesh key={i} position={[i * 0.065, 0.32, 0.116]}><boxGeometry args={[0.013, 0.36, 0.01]} /><meshStandardMaterial color="#e4dac6" /></mesh>)}
  </group>
))}</group>
);
}
