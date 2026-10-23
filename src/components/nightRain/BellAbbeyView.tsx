'use client';

import { useFrame } from '@react-three/fiber';
import { useRef, type MutableRefObject } from 'react';
import * as THREE from 'three';
import type { GameState } from './types';
import StaticDistrict from './StaticDistrict';
import { BELL_SURFACES } from './bellAbbey';

function Stone({ at, size, color = '#82968c' }: { at: [number, number, number]; size: [number, number, number]; color?: string }) {
  return <mesh position={at} castShadow receiveShadow><boxGeometry args={size} /><meshStandardMaterial color={color} roughness={0.83} /></mesh>;
}
function Arch({ at, radius = 4, height = 5 }: { at: [number, number, number]; radius?: number; height?: number }) {
  return <group position={at}>{[-1, 1].map(side => <group key={side}><Stone at={[side * radius, height / 2, 0]} size={[0.65, height, 0.8]} /><Stone at={[side * radius, 0.25, 0]} size={[1.1, 0.5, 1.2]} color="#b4af93" /><Stone at={[side * radius, height, 0]} size={[0.95, 0.35, 1.1]} color="#c1b393" /></group>)}<mesh position={[0, height, 0]} castShadow><torusGeometry args={[radius, 0.38, 6, 24, Math.PI]} /><meshStandardMaterial color="#a6ad97" roughness={0.8} /></mesh><mesh position={[0, height + radius, 0]}><boxGeometry args={[0.55, 0.85, 1]} /><meshStandardMaterial color="#c5ab6d" metalness={0.35} /></mesh></group>;
}
function Bell({ at, scale = 1, fallen = false }: { at: [number, number, number]; scale?: number; fallen?: boolean }) {
  const profile = [[0.05, 2.4], [0.45, 2.35], [0.7, 2], [0.8, 1.2], [1, 0.45], [1.38, 0.1], [1.4, 0], [1.23, -0.05], [1.13, 0.2], [0.75, 1.2], [0.6, 1.9], [0.35, 2.1]].map(([x, y]) => new THREE.Vector2(x, y));
  return <group position={at} scale={scale} rotation={fallen ? [0, 0, 0.8] : [0, 0, 0]}><mesh castShadow receiveShadow><latheGeometry args={[profile, 24]} /><meshStandardMaterial color="#927646" roughness={0.5} metalness={0.65} side={THREE.DoubleSide} /></mesh>{[0.17, 0.35, 1.8].map((y, i) => <mesh key={y} position={[0, y, 0]} rotation={[Math.PI / 2, 0, 0]}><torusGeometry args={[i === 2 ? 0.77 : 1.25 - i * 0.07, 0.035, 6, 32]} /><meshStandardMaterial color="#c3a065" metalness={0.7} roughness={0.45} /></mesh>)}<mesh position={[0, 0.7, 0]}><cylinderGeometry args={[0.055, 0.09, 2, 8]} /><meshStandardMaterial color="#3c524e" /></mesh><mesh position={[0, -0.25, 0]}><sphereGeometry args={[0.16, 8, 6]} /><meshStandardMaterial color="#d1aa65" /></mesh></group>;
}
function PathLight({ at }: { at: [number, number, number] }) {
  return <group position={at}><Stone at={[0, 0.6, 0]} size={[0.16, 1.2, 0.16]} color="#526e65" /><mesh position={[0, 1.45, 0]}><boxGeometry args={[0.28, 0.45, 0.28]} /><meshStandardMaterial color="#ffe6ad" emissive="#ffd187" emissiveIntensity={1.7} /></mesh><Stone at={[0, 1.73, 0]} size={[0.55, 0.1, 0.55]} color="#b09866" /></group>;
}
function Mechanism({ stateRef }: { stateRef: MutableRefObject<GameState> }) {
  const water = useRef<THREE.Mesh>(null); const heart = useRef<THREE.Mesh>(null);
  useFrame(() => {
    const s = stateRef.current;
    if (water.current) water.current.position.y = s.collected.includes('bell-clapper') ? 15.35 : 15.8;
    if (heart.current) { heart.current.visible = s.bellComplete; heart.current.position.y = 38 + Math.sin(s.time * 0.5) * 0.2; }
  });
  return <group><mesh ref={water} position={[-68, 15.8, -813]} rotation={[-Math.PI / 2, 0, 0]}><planeGeometry args={[57, 33]} /><meshStandardMaterial color="#375f5c" metalness={0.45} roughness={0.22} /></mesh><mesh ref={heart} position={[-44, 38, -894]} visible={false}><octahedronGeometry args={[0.4]} /><meshStandardMaterial color="#ffe9b2" emissive="#ffcc72" emissiveIntensity={2} /></mesh></group>;
}
export default function BellAbbeyView({ stateRef }: { stateRef: MutableRefObject<GameState> }) {
  const root = useRef<THREE.Group>(null);
  const naveLight = useRef<THREE.PointLight>(null); const archiveLight = useRef<THREE.PointLight>(null);
  useFrame(() => {
    const active = stateRef.current.player.z < -630;
    if (root.current) root.current.visible = active;
    if (naveLight.current) naveLight.current.intensity = active ? 60 : 0;
    if (archiveLight.current) archiveLight.current.intensity = active ? 15 : 0;
  });
  return (
<>
    {/* Keep the light count stable when distant scenery hides, avoiding world shader recompilation. */}
    <pointLight ref={naveLight} position={[-44, 45, -863]} color="#ffdb9f" intensity={0} distance={27} decay={2} />
    <pointLight ref={archiveLight} position={[-110, 20, -815]} color="#ffd79a" intensity={0} distance={13} decay={2} />
<group ref={root} name="bell-abbey"><StaticDistrict name="bell-abbey-stone">
    {BELL_SURFACES.filter(s => s.endY === undefined && !s.id.includes('link')).map(s => <Stone key={s.id} at={[(s.x1 + s.x2) / 2, (s.y - 10) / 2, (s.z1 + s.z2) / 2]} size={[s.x2 - s.x1 - 0.3, s.y + 9.4, s.z2 - s.z1 - 0.3]} color="#687e73" />)}
    {/* Basalt shoulders and distant spires ground the monastery in the same valley. */}
    <mesh position={[-61, -10, -828]} scale={[87, 19, 103]}><sphereGeometry args={[1, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2]} /><meshStandardMaterial color="#627d75" roughness={1} /></mesh>
    {Array.from({ length: 17 }, (_, i) => {
      const east = i % 2 === 0; const x = east ? 2 + (i % 3) * 18 : -142 - (i % 3) * 15; const z = -766 - Math.floor(i / 2) * 18;
      return <group key={`cliff-${i}`}><mesh position={[x, -8 + (i % 3), z]} scale={[15 + (i % 4), 23 + (i % 5) * 6, 17]} rotation={[0, i * 0.7, 0]}><cylinderGeometry args={[0.6, 1, 1, 6]} /><meshStandardMaterial color={east ? '#6c8b7f' : '#53766e'} roughness={1} /></mesh><mesh position={[x, 12 + (i % 5) * 3, z]}><coneGeometry args={[2.3, 17 + (i % 4), 6]} /><meshStandardMaterial color="#486a60" roughness={1} /></mesh></group>;
    })}
    {[-90.8, -45.4].flatMap(x => [-807, -822].map(z => <Stone key={`rib-${x}-${z}`} at={[x, 20, z]} size={[0.8, 8, 1.1]} color="#a0ab91" />))}
    {[-64.8, -23.2].flatMap(x => [-846, -858, -874].map(z => <group key={`buttress-${x}-${z}`}><Stone at={[x, 39.5, z]} size={[1.6, 11, 2.2]} color="#899c87" /><mesh position={[x, 45.8, z]}><coneGeometry args={[1.5, 2.6, 4]} /><meshStandardMaterial color="#c2b58f" /></mesh></group>))}
    {[-57, -31].flatMap(x => [-847, -856, -866, -877].map(z => <mesh key={`wax-${x}-${z}`} position={[x, 34.4, z]}><cylinderGeometry args={[0.09, 0.12, 0.8, 6]} /><meshStandardMaterial color="#d7c8a1" emissive="#d6a65e" emissiveIntensity={0.25} /></mesh>))}
    <mesh position={[-113, 17.3, -817.85]} rotation={[Math.PI / 2, 0.35, 0]}><torusGeometry args={[0.3, 0.055, 6, 20]} /><meshStandardMaterial color="#c3ad74" roughness={0.9} /></mesh>
    <Arch at={[-44, 28, -755]} radius={6} height={5} />
    <Arch at={[-78, 16, -803]} radius={3.3} height={4} />
    <Arch at={[-110, 16, -819]} radius={5} height={3} />
    {[-847, -860, -875].map(z => <Arch key={z} at={[-44, 34, z]} radius={14} height={9} />)}
    {[-58, -30].flatMap(x => [-851, -871].map(z => <group key={`${x}-${z}`}><Stone at={[x, 39.5, z]} size={[1.4, 11, 1.4]} color="#aab29f" /><Stone at={[x, 44.8, z]} size={[2, 0.6, 2]} color="#d2bd91" />{[-1, 1].map(side => <mesh key={side} position={[x, 39.4, z + side * 0.78]}><boxGeometry args={[0.32, 7.5, 0.06]} /><meshStandardMaterial color="#c4aa6c" metalness={0.35} /></mesh>)}</group>))}
    <Bell at={[-44, 47, -863]} scale={2.2} />
    <mesh position={[-44, 58, -863]}><cylinderGeometry args={[0.14, 0.14, 13, 8]} /><meshStandardMaterial color="#61736b" metalness={0.6} /></mesh>
    <Stone at={[-44, 64, -863]} size={[33, 1.4, 2]} color="#b4b293" />
    {[-59, -29].map(x => <group key={x}><Stone at={[x, 51, -863]} size={[1.6, 26, 2]} color="#7c9388" /><mesh position={[x, 66, -863]}><coneGeometry args={[2.4, 5, 6]} /><meshStandardMaterial color="#607d72" /></mesh></group>)}
    <mesh position={[-44, 46, -891]}><torusGeometry args={[7.5, 0.26, 8, 48]} /><meshStandardMaterial color="#c5ab73" roughness={0.5} metalness={0.5} /></mesh>
    <mesh position={[-44, 46, -891.4]}><circleGeometry args={[7.1, 48]} /><meshBasicMaterial color="#d9d4b0" transparent opacity={0.22} /></mesh>
    {[-59, -29].flatMap(x => [-849, -857, -865, -873].map(z => <mesh key={`${x}-${z}`} position={[x, 39, z]} rotation={[0, Math.PI / 2, 0]}><planeGeometry args={[2, 6]} /><meshStandardMaterial color="#d6c18f" emissive="#e7ad61" emissiveIntensity={0.32} side={THREE.DoubleSide} /></mesh>))}
    {[-77, -63].map(x => <group key={x}><Stone at={[x, 18, -813]} size={[2.5, 4, 2.5]} color="#5e7970" /><Bell at={[x, 21, -813]} scale={0.8} /></group>)}
    <Bell at={[-86, 16.2, -807]} scale={1.1} fallen /><Bell at={[-56, 16.3, -807]} scale={0.75} fallen />
    <Stone at={[-116.5, 16.6, -820]} size={[3.4, 1.2, 1.5]} color="#b5ad91" />
    {Array.from({ length: 9 }, (_, i) => <Stone key={i} at={[-117.5 + (i % 3), 17.3 + Math.floor(i / 3) * 0.2, -820]} size={[0.65, 0.2, 1.1]} color={i % 2 ? '#d4c29b' : '#8a7455'} />)}
    {[-775, -782, -794].map(z => <PathLight key={z} at={[-80, 28 + ((z + 774) * 12) / 28, z]} />)}
    {[-800, -814, -830].map(z => <PathLight key={z} at={[-22.8, 34, z]} />)}
    <PathLight at={[-85, 16, -815]} /><PathLight at={[-109, 16, -810]} /><PathLight at={[-50, 34, -838]} />
    {[-60, -28].map(x => <group key={x}>{[-882, -890, -898].map(z => <Stone key={z} at={[x, 35.2, z]} size={[0.6, 2.4, 0.6]} color="#c0b18e" />)}</group>)}
  </StaticDistrict><Mechanism stateRef={stateRef} /></group>
</>
);
}
