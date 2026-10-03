'use client';

import { useRef, type MutableRefObject } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { GameState } from './types';
/** Realtime props, rising steam and lanterns; no remote video load interrupts the journey. */
export default function InterludeView({ stateRef }: { stateRef: MutableRefObject<GameState> }) {
  const dinner = useRef<THREE.Group>(null); const steam = useRef<THREE.Group>(null); const lantern = useRef<THREE.Group>(null); const elapsed = useRef(0);
  useFrame((_, dt) => {
    const s = stateRef.current; const active = s.mode === 'interlude';
    if (!active) elapsed.current = 0; else elapsed.current += Math.min(dt, 0.05);
    if (dinner.current) { dinner.current.visible = active && !s.chapterComplete; dinner.current.position.set(s.player.x, s.player.y, s.player.z); }
    if (steam.current) steam.current.children.forEach((m, i) => { const t = (elapsed.current * 0.45 + i / 5) % 1; m.position.set(Math.sin(t * 4 + i) * 0.08, 1.2 + t * 0.65, -0.65); m.scale.setScalar(0.06 + t * 0.11); (m as THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial>).material.opacity = (1 - t) * 0.26; });
    if (lantern.current) { lantern.current.visible = active && s.valleyComplete; lantern.current.position.set(s.player.x, s.player.y + 0.35 + Math.sin(elapsed.current) * 0.1, s.player.z - 1.6 - elapsed.current * 0.18); }
  });
  return (
<group>
    <group ref={dinner} visible={false}>
      <mesh position={[0, 0.85, -0.65]}><boxGeometry args={[1.35, 0.12, 0.85]} /><meshStandardMaterial color="#6d432e" /></mesh>
      <mesh position={[0, 1.02, -0.65]}><cylinderGeometry args={[0.22, 0.12, 0.18, 20]} /><meshStandardMaterial color="#ddc7a1" /></mesh>
      <mesh position={[0, 1.13, -0.65]} scale={[1, 0.35, 1]}><sphereGeometry args={[0.19, 14, 8]} /><meshStandardMaterial color="#deaf6b" /></mesh>
      <mesh position={[0.05, 1.17, -0.66]} rotation={[-Math.PI / 2, 0, 0]}><circleGeometry args={[0.075, 16]} /><meshStandardMaterial color="#ffdc74" /></mesh>
      <group ref={steam}>{Array.from({ length: 5 }, (_, i) => <mesh key={i}><sphereGeometry args={[1, 8, 6]} /><meshBasicMaterial color="#ffe9c8" transparent opacity={0.2} depthWrite={false} /></mesh>)}</group>
    </group>
    <group ref={lantern} visible={false}><mesh><cylinderGeometry args={[0.28, 0.36, 0.13, 8]} /><meshStandardMaterial color="#c9b079" /></mesh><mesh position={[0, 0.13, 0]}><coneGeometry args={[0.09, 0.24, 6]} /><meshBasicMaterial color="#ffe597" /></mesh></group>
  </group>
);
}
