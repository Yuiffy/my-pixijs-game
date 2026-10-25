'use client';

import { useRef, type MutableRefObject } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { GameState } from './types';
import { ShrineWisps } from './RainEffects';

/** The seated keeper holds a flame inside a broken aureole. Street lamps never
 * use this silhouette, the kneeling stone base, or the ascending golden thread. */
export default function HomewardShrine({ stateRef, id, position }: { stateRef: MutableRefObject<GameState>; id: string; position: [number, number, number] }) {
  const flame = useRef<THREE.Group>(null); const halo = useRef<THREE.Group>(null);
  const ring = useRef<THREE.Mesh>(null); const light = useRef<THREE.PointLight>(null);
  const ribbon = useRef<THREE.Group>(null);
  useFrame(() => {
    const s = stateRef.current; const lit = s.litLamps.includes(id);
    const nearby = Math.hypot(s.player.x - position[0], s.player.z - position[2]) < 32;
    if (flame.current) { flame.current.visible = lit && nearby; flame.current.scale.set(1 + Math.sin(s.time * 5) * 0.08, 1 + Math.sin(s.time * 3.7) * 0.17, 1); }
    if (halo.current) halo.current.children.forEach(child => { const mat = (child as THREE.Mesh).material as THREE.MeshStandardMaterial; mat.emissive.set(lit ? '#bf7a26' : '#456b71'); mat.emissiveIntensity = lit ? 0.65 + Math.sin(s.time * 1.4) * 0.14 : 0.3; });
    if (ring.current) { const mat = ring.current.material as THREE.MeshBasicMaterial; mat.color.set(lit ? '#edbd68' : '#94bcc0'); mat.opacity = (lit ? 0.36 : 0.14) + Math.sin(s.time * 1.4) * 0.04; }
    if (light.current) { light.current.intensity = nearby ? lit ? 12 + Math.sin(s.time * 4) * 0.9 : 1.2 : 0; light.current.color.set(lit ? '#ffc06c' : '#96c9d3'); }
    if (ribbon.current) { ribbon.current.visible = lit && nearby; ribbon.current.rotation.y = s.time * 0.28; }
  });
  return (
<group name={`homeward-shrine-${id}`} position={position}>
    <ShrineWisps stateRef={stateRef} id={id} />
    <mesh position={[0, 0.1, 0]} receiveShadow><cylinderGeometry args={[0.82, 0.95, 0.2, 12]} /><meshStandardMaterial color="#777968" roughness={0.95} /></mesh>
    <mesh ref={ring} position={[0, 0.21, 0]} rotation={[-Math.PI / 2, 0, 0]}><ringGeometry args={[0.65, 0.71, 48]} /><meshBasicMaterial transparent depthWrite={false} /></mesh>
    <mesh position={[0, 0.39, 0.03]} scale={[1, 0.42, 0.8]} castShadow><sphereGeometry args={[0.59, 12, 8]} /><meshStandardMaterial color="#777565" roughness={1} /></mesh>
    <mesh position={[0, 0.78, -0.12]} castShadow><coneGeometry args={[0.43, 1.05, 10]} /><meshStandardMaterial color="#777969" roughness={0.96} /></mesh>
    <mesh position={[0, 1.35, -0.13]} scale={[0.88, 1.2, 0.9]} castShadow><sphereGeometry args={[0.28, 10, 8]} /><meshStandardMaterial color="#92917b" roughness={1} /></mesh>
    <mesh position={[0, 1.34, 0.075]} scale={[0.8, 1, 0.15]}><sphereGeometry args={[0.19, 10, 8]} /><meshStandardMaterial color="#404d49" roughness={1} /></mesh>
    {[-1, 1].map(side => <mesh key={side} position={[side * 0.24, 0.91, 0.19]} rotation={[0.75, 0, side * 0.5]} castShadow><capsuleGeometry args={[0.105, 0.47, 4, 8]} /><meshStandardMaterial color="#8b8874" roughness={0.95} /></mesh>)}
    <mesh position={[0, 0.85, 0.4]}><cylinderGeometry args={[0.28, 0.15, 0.14, 12]} /><meshStandardMaterial color="#ad8957" metalness={0.55} roughness={0.7} /></mesh>
    <group ref={halo} position={[0, 1.12, -0.28]}>
      {[0.12, 2.35, 4.55].map(a => <mesh key={a} rotation={[0, 0, a]} castShadow><torusGeometry args={[0.82, 0.075, 6, 18, 1.8]} /><meshStandardMaterial color="#b39a67" roughness={0.8} metalness={0.35} /></mesh>)}
    </group>
    <group ref={flame} position={[0, 1.02, 0.4]}>
      <mesh scale={[0.65, 1.65, 0.65]}><sphereGeometry args={[0.21, 10, 10]} /><meshBasicMaterial color="#ffaf48" transparent opacity={0.72} depthWrite={false} /></mesh>
      <mesh position={[0, -0.02, 0.01]} scale={[0.45, 1.35, 0.45]}><sphereGeometry args={[0.2, 8, 8]} /><meshBasicMaterial color="#fff4cc" /></mesh>
    </group>
    <group ref={ribbon} position={[0, 0.9, 0.1]}>{Array.from({ length: 9 }, (_, i) => <mesh key={i} position={[Math.cos(i * 1.7) * (0.27 + i * 0.025), 0.3 + i * 0.2, Math.sin(i * 1.7) * 0.34]}><sphereGeometry args={[0.025 + i * 0.001, 5, 4]} /><meshBasicMaterial color="#ffe1a0" /></mesh>)}</group>
    <pointLight ref={light} position={[0, 1.25, 0.45]} color="#ffc06c" distance={9} intensity={12} decay={2} />
  </group>
);
}
