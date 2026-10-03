'use client';

import { useFrame } from '@react-three/fiber';
import { useRef, type MutableRefObject } from 'react';
import * as THREE from 'three';
import type { GameState } from './types';
import { LANDMARKS } from './world';

// Persistent quest papers get a taller purple wisp; directions get a small ivory glint.
export const QUEST_PAPERS = new Set(['names-register', 'keel-rubbing', 'well-testimony', 'ferry-note', 'valley-note', 'crypt-note', 'cave-note']);
const discoveries = LANDMARKS.filter(l => l.kind === 'note' && l.id !== 'laptop' && !['temple-lamp', 'canal-lamp', 'chapter-bell', 'dawn-bell', 'river-heart'].includes(l.id));
export default function DiscoveryView({ stateRef }: { stateRef: MutableRefObject<GameState> }) {
  const wisps = useRef<(THREE.Group | null)[]>([]); const winch = useRef<THREE.Group>(null);
  const ferries = useRef<(THREE.Group | null)[]>([]);
  useFrame(() => {
    const s = stateRef.current;
    wisps.current.forEach((g, i) => { if (g) { g.visible = !s.collected.includes(discoveries[i].id); g.rotation.y = s.time * 0.25; g.position.y = discoveries[i].y + 0.65 + Math.sin(s.time * 2 + i) * 0.07; } });
    if (winch.current) { winch.current.visible = !s.collected.includes('ferry-winch'); winch.current.rotation.y = s.time * 0.3; }
    ferries.current.forEach(g => { if (g) { g.visible = s.collected.includes('ferry-winch'); g.position.y = 0.4 + Math.sin(s.time * 2) * 0.08; } });
  });
  const anchor = LANDMARKS.find(l => l.id === 'ferry-winch');
  return (
    <group name="discovery-markers">
      {discoveries.map((l, i) => { const quest = QUEST_PAPERS.has(l.id); return <group key={l.id} ref={g => { wisps.current[i] = g; }} position={[l.x, l.y + 0.65, l.z]}><mesh><octahedronGeometry args={[quest ? 0.18 : 0.09]} /><meshBasicMaterial color={quest ? '#c39dff' : '#dceeff'} transparent opacity={0.9} depthWrite={false} /></mesh><mesh position={[0, 0.1, 0]}><cylinderGeometry args={[0.012, 0.04, quest ? 1.55 : 0.45, 6, 1, true]} /><meshBasicMaterial color={quest ? '#c39dff' : '#e1eefa'} transparent opacity={quest ? 0.34 : 0.16} depthWrite={false} side={THREE.DoubleSide} /></mesh>{quest && <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.6, 0]}><ringGeometry args={[0.23, 0.29, 16]} /><meshBasicMaterial color="#c39dff" transparent opacity={0.6} /></mesh>}</group>; })}
      {anchor && <group position={[anchor.x, anchor.y + 2.3, anchor.z]}><group ref={winch}><mesh><octahedronGeometry args={[0.32]} /><meshBasicMaterial color="#8aefd6" /></mesh><mesh><cylinderGeometry args={[0.025, 0.1, 2.6, 8, 1, true]} /><meshBasicMaterial color="#8aefd6" transparent opacity={0.32} side={THREE.DoubleSide} depthWrite={false} /></mesh></group></group>}
      {LANDMARKS.filter(l => l.kind === 'ferry' && !l.id.includes('crypt') && !l.id.includes('cave')).map((l, i) => <group key={l.id} position={[l.x, l.y, l.z]}><group ref={g => { ferries.current[i] = g; }}><mesh rotation={[-Math.PI / 2, 0, 0]}><ringGeometry args={[0.7, 0.86, 24]} /><meshBasicMaterial color="#8aefd6" transparent opacity={0.6} /></mesh></group></group>)}
    </group>
  );
}
