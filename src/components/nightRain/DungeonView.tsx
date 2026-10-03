'use client';

import { useFrame } from '@react-three/fiber';
import { useRef, type MutableRefObject } from 'react';
import * as THREE from 'three';
import { DUNGEON_FOYERS, DUNGEON_SOLIDS, DUNGEON_SURFACES, DUNGEONS, dungeonPoint, undergroundId, type DungeonId } from './dungeons';
import type { GameState } from './types';

function Stone({ position, size, color = '#756e74' }: { position: [number, number, number]; size: [number, number, number]; color?: string }) {
  return <mesh position={position} castShadow receiveShadow><boxGeometry args={size} /><meshStandardMaterial color={color} roughness={0.94} /></mesh>;
}
function Lift({ id, stateRef }: { id: DungeonId; stateRef: MutableRefObject<GameState> }) {
  const d = DUNGEONS[id]; const platform = useRef<THREE.Group>(null); const motes = useRef<THREE.Group>(null); const cloth = useRef<THREE.Group>(null); const
light = useRef<THREE.PointLight>(null);
  useFrame(() => {
    const s = stateRef.current;
    if (platform.current) platform.current.position.y = s.liftRide?.dungeon === id ? s.player.y : undergroundId(s.player) === id ? d.floor : d.upper.y;
    if (motes.current) motes.current.position.y = Math.sin(s.time * 1.3) * 0.18;
    if (cloth.current) cloth.current.rotation.x = Math.sin(s.time * 2.2) * 0.12;
    if (light.current) light.current.intensity = Math.hypot(s.player.x - d.upper.x, s.player.z - d.upper.z) < 22 ? 9 : 0;
  });
  return (
<group name={`${id}-lift-and-entrance`}>
    {/* Lights stay mounted during travel to avoid light-count shader recompilation. */}
    <pointLight ref={light} position={[d.foyer.x2 - 0.7, d.upper.y + 2, d.upper.z]} color={id === 'crypt' ? '#efc78e' : '#9edaca'} intensity={9} distance={12} decay={2} />
    <group position={[d.upper.x, 0, d.upper.z]}>
      <group ref={platform} position={[0, d.upper.y, 0]}>
        <Stone position={[0, -0.16, 0]} size={[4.5, 0.32, 4.5]} color="#64636a" />
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.012, 0]}><ringGeometry args={[0.45, 0.56, 8]} /><meshBasicMaterial color={id === 'crypt' ? '#e4c697' : '#b1dfd2'} /></mesh>
        <Stone position={[0, 0.07, 0]} size={[0.62, 0.14, 0.62]} color="#b4a88c" />
        {[-1, 1].map(x => <group key={x}><Stone position={[x * 2.1, 0.65, 0]} size={[0.12, 1.3, 4.3]} color="#5a5145" /><Stone position={[x * 2.1, 1.32, 0]} size={[0.15, 0.12, 4.3]} color="#a49573" /></group>)}
        <Stone position={[0, 0.65, -2.1]} size={[4.3, 1.3, 0.12]} color="#5a5145" />
      </group>
      {[-1.45, 1.45].map(x => <mesh key={x} position={[x, (d.upper.y + d.floor) / 2 + 1.5, -1.45]}><cylinderGeometry args={[0.045, 0.045, d.upper.y - d.floor + 4, 6]} /><meshStandardMaterial color="#9e977f" metalness={0.65} roughness={0.5} /></mesh>)}
      {Array.from({ length: Math.ceil((d.upper.y - d.floor) / 2) }, (_, i) => <Stone key={i} position={[0, d.floor + i * 2 + 0.8, -1.77]} size={[3.5, 0.09, 0.12]} color={i % 2 ? '#8a7a67' : '#697c74'} />)}
    </group>
    <group position={[d.foyer.x2 + 0.3, d.upper.y, d.upper.z]}>
      {id === 'cave' && [-1, 1].map(side => <group key={`mouth-${side}`}><mesh position={[-1.1, 1.7, side * 2.1]} scale={[1.8, 2.9, 1.35]} rotation={[0.2, side * 0.5, 0.15]} castShadow><dodecahedronGeometry args={[1, 0]} /><meshStandardMaterial color="#688375" roughness={1} /></mesh><mesh position={[0.8, 0.23, side * 1.65]} scale={[0.6, 0.4, 0.5]}><dodecahedronGeometry args={[1, 0]} /><meshStandardMaterial color="#869484" /></mesh></group>)}
      {[-1, 1].map(z => <Stone key={z} position={[0, 1.45, z * 1.25]} size={[0.7, 2.9, 0.45]} color={id === 'crypt' ? '#a49681' : '#798f82'} />)}
      <Stone position={[0, 2.95, 0]} size={[0.8, 0.3, 2.95]} color="#aa9d83" />
      {id === 'crypt' ? <group rotation={[0, 0.48, 0]} position={[0, 0, -1.1]}><Stone position={[0, 1.25, 0.7]} size={[0.16, 2.5, 1.4]} color="#746551" /><Stone position={[0.1, 1.4, 1.2]} size={[0.1, 0.3, 0.12]} color="#d5b878" /></group> : <group ref={cloth} position={[0.15, 2.2, -1.1]}><mesh><planeGeometry args={[0.65, 0.7]} /><meshStandardMaterial color="#afbeaa" side={THREE.DoubleSide} /></mesh></group>}
      {[0, 1, 2, 3].map(i => <group key={i} position={[0.45 + i * 0.7, 0, Math.sin(i * 2) * 0.45]}><Stone position={[0, 0.16, 0]} size={[0.24, 0.32, 0.24]} color="#9f9175" /><mesh position={[0, 0.39, 0]}><sphereGeometry args={[0.09, 7, 5]} /><meshBasicMaterial color={id === 'crypt' ? '#f0cf92' : '#9edaca'} /></mesh></group>)}
      <group ref={motes}>{Array.from({ length: 8 }, (_, i) => <mesh key={i} position={[-0.8 + (i % 3) * 0.4, 0.7 + i * 0.16, -0.5 + (i % 4) * 0.3]}><sphereGeometry args={[0.025, 5, 4]} /><meshBasicMaterial color={id === 'crypt' ? '#e7c79e' : '#aadfce'} transparent opacity={0.5} /></mesh>)}</group>
    </group>
    <pointLight position={[d.upper.x + 4, d.floor + 4.5, d.upper.z + 7]} color={id === 'crypt' ? '#d5b596' : '#a1c9b9'} intensity={18} distance={25} decay={2} />
  </group>
);
}
export default function DungeonView({ stateRef }: { stateRef: MutableRefObject<GameState> }) {
  return (
<group name="optional-dungeons">
    {DUNGEON_SOLIDS.map(s => <Stone key={s.id} position={s.position} size={s.size} color={s.color} />)}
    {DUNGEON_SURFACES.map(s => (
<group key={s.id}>
      <Stone position={[(s.x1 + s.x2) / 2, s.y - 0.3, (s.z1 + s.z2) / 2]} size={[s.x2 - s.x1, 0.6, s.z2 - s.z1]} color={s.color} />
      {Array.from({ length: Math.ceil((s.z2 - s.z1) / 2) }, (_, i) => <Stone key={i} position={[(s.x1 + s.x2) / 2, s.y + 0.005, s.z1 + i * 2]} size={[s.x2 - s.x1, 0.015, 0.045]} color="#42494e" />)}
      {[s.x1 + 0.7, s.x2 - 0.7].map(x => <group key={x}>{Array.from({ length: Math.ceil((s.z2 - s.z1) / 5) }, (_, n) => <mesh key={n} position={[x, s.y + 4, s.z1 + 2 + n * 5]} castShadow><cylinderGeometry args={[0.35, 0.55, 8, s.id.startsWith('crypt') ? 8 : 5]} /><meshStandardMaterial color={s.id.startsWith('crypt') ? '#8e8697' : '#739487'} /></mesh>)}</group>)}
    </group>
))}
    {DUNGEON_FOYERS.filter(s => s.id.endsWith('foyer')).map(s => {
      const id = s.id.startsWith('crypt') ? 'crypt' : 'cave'; const
p = DUNGEONS[id].upper;
      return <group key={s.id}>{[[s.x1, p.x - 2.3, s.z1, s.z2], [p.x + 2.3, s.x2, s.z1, s.z2], [p.x - 2.3, p.x + 2.3, s.z1, p.z - 2.3], [p.x - 2.3, p.x + 2.3, p.z + 2.3, s.z2]].map(([x1, x2, z1, z2], i) => <Stone key={i} position={[(x1 + x2) / 2, s.y - 0.2, (z1 + z2) / 2]} size={[x2 - x1, 0.4, z2 - z1]} color={s.color} />)}</group>;
    })}
    {DUNGEON_SURFACES.filter(s => s.id.startsWith('crypt')).map(s => (
<group key={`vault-${s.id}`}>
      {Array.from({ length: Math.floor((s.z2 - s.z1) / 6) }, (_, n) => <group key={n} position={[s.x1 + 0.7, s.y, s.z1 + 3 + n * 6]}><Stone position={[-0.3, 1.2, 0]} size={[0.65, 2.4, 2.3]} color="#5d5967" />{[0.7, 1.5].map(y => <Stone key={y} position={[0.2, y, 0]} size={[0.7, 0.16, 1.7]} color="#b1a390" />)}<mesh position={[0.15, 1.73, 0.4]}><sphereGeometry args={[0.18, 8, 6]} /><meshStandardMaterial color="#d2c6ad" /></mesh></group>)}
    </group>
))}
    {DUNGEON_SURFACES.filter(s => s.id.startsWith('cave')).map(s => (
<group key={`rocks-${s.id}`}>
      {Array.from({ length: Math.ceil((s.z2 - s.z1) / 4) }, (_, n) => <mesh key={n} position={[s.x1 - 0.9, s.y + 3, s.z1 + 2 + n * 4]} rotation={[0.2, n * 1.4, 0.3]} scale={[1.25, 4, 1.6]} castShadow><dodecahedronGeometry args={[1.15, 0]} /><meshStandardMaterial color={n % 2 ? '#456560' : '#577971'} roughness={1} /></mesh>)}
    </group>
))}
    {[0, 1, 2, 3, 4, 5].map(i => { const p = dungeonPoint('cave', { x: 113 + i * 1.6, y: 0.5 + (i % 3) * 0.2, z: 120.5 }); return <mesh key={`crystal-${i}`} position={[p.x, p.y, p.z]} rotation={[0, i, i % 2 ? 0.3 : -0.25]}><coneGeometry args={[0.25, 1 + (i % 3) * 0.4, 5]} /><meshStandardMaterial color="#9de2cd" emissive="#5baf98" emissiveIntensity={0.35} /></mesh>; })}
    <Lift id="crypt" stateRef={stateRef} /><Lift id="cave" stateRef={stateRef} />
  </group>
);
}
