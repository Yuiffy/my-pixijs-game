import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { faultActive } from "./lifeEvents";
import { worldPoint } from "./navigation";
import type { Runtime3D } from "./runtime3d";

export default function LifeEventScene({ runtime: r }: { runtime: Runtime3D }) {
  const lights = useRef<THREE.Group>(null);
  useFrame(() => {
    const fault = r.game.daily?.events.repair;
    lights.current?.children.forEach((child, i) => {
      const material = (child as THREE.Mesh).material as THREE.MeshStandardMaterial;
      const bad = faultActive(r.game) && fault?.stage !== "testing" && fault?.kind === ["mic", "camera", "network"][i];
      material.color.set(bad ? "#ed9760" : "#85d0ae");
      material.emissive.copy(material.color);
      material.emissiveIntensity = bad ? 0.4 + Math.sin(r.game.elapsed * 5) * 0.3 : 0.3;
    });
  });
  const [x, z] = worldPoint({ x: 806, y: 292 });
  return (
<group position={[x, 0, z]} userData={{ spot: "equipment" }}>
    <mesh position={[0, 0.78, 0]} castShadow><boxGeometry args={[0.48, 0.37, 0.24]} /><meshStandardMaterial color="#3b514d" /></mesh>
    <group ref={lights}>{[-1, 0, 1].map(i => <mesh key={i} position={[i * 0.12, 0.89, 0.128]}><sphereGeometry args={[0.026, 10, 8]} /><meshStandardMaterial color="#85d0ae" emissive="#85d0ae" /></mesh>)}</group>
    {[-1, 0, 1].map(i => <mesh key={i} position={[i * 0.12, 0.71, 0.16]} rotation={[0.3, 0, i * 0.2]}><cylinderGeometry args={[0.012, 0.012, 0.31, 6]} /><meshStandardMaterial color={["#d69e65", "#b9a8d4", "#79aab8"][i + 1]} /></mesh>)}
    <mesh position={[0, 0.55, 0]}><boxGeometry args={[0.04, 0.2, 0.08]} /><meshStandardMaterial color="#ac9579" /></mesh>
  </group>
);
}
