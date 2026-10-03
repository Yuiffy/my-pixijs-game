'use client';

import { useFrame } from '@react-three/fiber';
import { useRef, type MutableRefObject } from 'react';
import * as THREE from 'three';
import { DUNGEON_LANDMARKS, DUNGEON_PORTALS, DUNGEON_SURFACES } from './dungeons';
import type { GameState } from './types';

// Exposed edges only: openings between overlapping rooms and the side route stay open.
const boundaryWalls = DUNGEON_SURFACES.flatMap(s => ['west', 'east', 'north', 'south'].flatMap(side => {
  const alongZ = side === 'west' || side === 'east';
  const start = alongZ ? s.z1 : s.x1;
  const end = alongZ ? s.z2 : s.x2;
  const fixed = side === 'west' ? s.x1 : side === 'east' ? s.x2 : side === 'north' ? s.z1 : s.z2;
  const outward = side === 'west' || side === 'north' ? -1 : 1;
  return Array.from({ length: Math.ceil((end - start) / 2) }, (_, i) => {
    const length = Math.min(2, end - start - i * 2);
    const mid = start + i * 2 + length / 2;
    const x = alongZ ? fixed + outward * 0.1 : mid;
    const z = alongZ ? mid : fixed + outward * 0.1;
    if (DUNGEON_SURFACES.some(other => other !== s && x > other.x1 && x < other.x2 && z > other.z1 && z < other.z2)) return null;
    return { x: alongZ ? fixed + outward * 0.23 : mid, z: alongZ ? mid : fixed + outward * 0.23, w: alongZ ? 0.45 : length, d: alongZ ? length : 0.45, crypt: s.id.startsWith('crypt') };
  }).filter((wall): wall is NonNullable<typeof wall> => !!wall);
}));

export default function DungeonView({ stateRef }: { stateRef: MutableRefObject<GameState> }) {
  const portals = useRef<(THREE.Mesh | null)[]>([]);
  useFrame(() => { portals.current.forEach((p, i) => { if (p) { p.rotation.z = stateRef.current.time * 0.15; (p.material as THREE.MeshBasicMaterial).opacity = 0.4 + Math.sin(stateRef.current.time * 2 + i) * 0.15; } }); });
  return (
    <group name="optional-dungeons">
      {boundaryWalls.map((wall, i) => <mesh key={`boundary-${i}`} position={[wall.x, 1.65, wall.z]} receiveShadow><boxGeometry args={[wall.w, 3.3, wall.d]} /><meshStandardMaterial color={wall.crypt ? '#686273' : '#496f64'} roughness={1} /></mesh>)}
      {DUNGEON_SURFACES.map(s => <group key={s.id}><mesh position={[(s.x1 + s.x2) / 2, -0.3, (s.z1 + s.z2) / 2]} receiveShadow><boxGeometry args={[s.x2 - s.x1, 0.6, s.z2 - s.z1]} /><meshStandardMaterial color={s.color} roughness={0.9} /></mesh>{[s.x1 + 0.5, s.x2 - 0.5].map(x => <group key={x}>{Array.from({ length: Math.ceil((s.z2 - s.z1) / 5) }, (_, n) => <mesh key={n} position={[x, 1.9, s.z1 + 2 + n * 5]} castShadow><cylinderGeometry args={[s.id.startsWith('crypt') ? 0.35 : 0.6, 0.55, 3.8, s.id.startsWith('crypt') ? 8 : 5]} /><meshStandardMaterial color={s.id.startsWith('crypt') ? '#8e8697' : '#739487'} /></mesh>)}</group>)}</group>)}
      {/* Open camera side and broken vaults keep routes readable from the chase camera. */}
      {DUNGEON_SURFACES.filter(s => s.id.startsWith('crypt')).map(s => (
<group key={`vault-${s.id}`}>
        {Array.from({ length: Math.floor((s.z2 - s.z1) / 6) }, (_, n) => (
<group key={n} position={[s.x1 + 0.7, 0, s.z1 + 3 + n * 6]}>
          <mesh position={[-0.3, 1.2, 0]} castShadow><boxGeometry args={[0.65, 2.4, 2.3]} /><meshStandardMaterial color="#5d5967" /></mesh>
          {[0.7, 1.5].map(y => <mesh key={y} position={[0.2, y, 0]}><boxGeometry args={[0.7, 0.16, 1.7]} /><meshStandardMaterial color="#b1a390" /></mesh>)}
          <mesh position={[0.15, 1.73, 0.4]}><sphereGeometry args={[0.18, 8, 6]} /><meshStandardMaterial color="#d2c6ad" /></mesh>
        </group>
))}
      </group>
))}
      {DUNGEON_SURFACES.filter(s => s.id.startsWith('cave')).map(s => (
<group key={`rocks-${s.id}`}>
        {Array.from({ length: Math.ceil((s.z2 - s.z1) / 4) }, (_, n) => <mesh key={n} position={[s.x1 - 0.9, 1.4, s.z1 + 2 + n * 4]} rotation={[0.2, n * 1.4, 0.3]} scale={[1.25, 2.3, 1.6]} castShadow><dodecahedronGeometry args={[1.15, 0]} /><meshStandardMaterial color={n % 2 ? '#456560' : '#577971'} roughness={1} /></mesh>)}
      </group>
))}
      {[0, 1, 2, 3, 4, 5].map(i => <mesh key={`crystal-${i}`} position={[113 + i * 1.6, 0.5 + (i % 3) * 0.2, 120.5]} rotation={[0, i, i % 2 ? 0.3 : -0.25]}><coneGeometry args={[0.25, 1 + (i % 3) * 0.4, 5]} /><meshStandardMaterial color="#9de2cd" emissive="#5baf98" emissiveIntensity={0.35} /></mesh>)}
      {DUNGEON_LANDMARKS.filter(l => DUNGEON_PORTALS[l.id]).map((l, i) => <group key={l.id} position={[l.x, l.y, l.z]}><mesh position={[0, 1.35, 0]}><torusGeometry args={[1.05, 0.24, 6, 16, Math.PI]} /><meshStandardMaterial color="#788e8e" /></mesh><mesh ref={p => { portals.current[i] = p; }} position={[0, 1, 0.1]}><ringGeometry args={[0.65, 0.76, 20]} /><meshBasicMaterial color={l.id.startsWith('crypt') ? '#c49bef' : '#9fe5ca'} transparent depthWrite={false} side={THREE.DoubleSide} /></mesh></group>)}
    </group>
  );
}
