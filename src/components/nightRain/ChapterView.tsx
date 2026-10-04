'use client';

import { memo, useMemo } from 'react';
import GeometryBatch, { type StoneBox } from './GeometryBatch';

// Thai roof tiers and gold finials carry the skyline; warm cloth and window
// light distinguish the inhabited lower city from the cold fortress above it.
function RoofTower({ x, z, y, scale = 1 }: { x: number; z: number; y: number; scale?: number }) {
  return (
<group position={[x, y, z]} scale={scale}>
    <mesh position={[0, 2.3, 0]} castShadow><cylinderGeometry args={[1, 2.1, 4.6, 4]} /><meshStandardMaterial color="#a69b78" /></mesh>
    {[0, 1, 2].map(i => (
<group key={i} position={[0, i * 1.7, 0]}>
      <mesh rotation={[0, Math.PI / 4, 0]} castShadow><cylinderGeometry args={[3.2 - i * 0.7, 4.1 - i * 0.7, 0.45, 4]} /><meshStandardMaterial color="#cbac6e" metalness={0.3} roughness={0.55} /></mesh>
      <mesh position={[0, 1.2, 0]} rotation={[0, Math.PI / 4, 0]} castShadow><coneGeometry args={[4 - i * 0.7, 2.4, 4]} /><meshStandardMaterial color={i % 2 ? '#596f62' : '#8c5343'} /></mesh>
    </group>
))}
    <mesh position={[0, 7.2, 0]} castShadow><coneGeometry args={[0.45, 5.5, 8]} /><meshStandardMaterial color="#d5b46c" metalness={0.5} roughness={0.45} /></mesh>
  </group>
);
}

function ChapterView() {
  const masonry = useMemo(() => {
    const boxes: StoneBox[] = [];
    // Crenellations and buttresses sit beyond the traversable eight-metre wall.
    for (let x = -114; x <= -66; x += 4) {
      for (const z of [-165, -157]) boxes.push({ position: [x, 19.1, z], size: [1.1, 1.25, 0.8], color: '#b4ac91' });
      boxes.push({ position: [x, 8, -165.5], size: [1.5, 16, 1.4], color: '#627976' });
    }
    for (let x = -102; x <= -70; x += 4) boxes.push({ position: [x, 13.1, -134], size: [1.1, 1.25, 0.8], color: '#a9a58e' });
    // Cloth shades, dried nets and awnings, clear of feet and the camera corridor.
    for (let x = -49; x < -7; x += 6) {
      boxes.push({ position: [x, 3.8, -69], size: [4.5, 0.08, 2.1], rotation: [0.12, 0, 0], color: x % 3 ? '#b68458' : '#60948d' });
      boxes.push({ position: [x, 2.7, -69.8], size: [0.1, 5.4, 0.1], color: '#705942' });
    }
    for (let x = -73; x <= -47; x += 3.8) {
      boxes.push({ position: [x, 9.4, -103], size: [1.6, 2.3, 0.06], rotation: [0.08, 0, -0.08], color: ['#ab674a', '#527e86', '#c1a75f'][Math.floor(Math.abs(x)) % 3] });
    }
    // Library shelves remain against the solid north wall, away from the aisle.
    for (let x = -88; x < -62; x += 3) {
      boxes.push({ position: [x, 13.6, -199.3], size: [2.4, 3.2, 0.55], color: '#584b3e' });
      for (let i = 0; i < 5; i++) boxes.push({ position: [x - 0.8 + i * 0.4, 13.7, -198.98], size: [0.22, 1.8, 0.08], color: i % 2 ? '#c0a76d' : '#8b7159' });
    }
    // Gold floor inlays reinforce the boss arena's generous, unobstructed centre.
    for (const x of [-143, -123]) boxes.push({ position: [x, 24.02, -245], size: [0.08, 0.02, 24], color: '#c5ac70' });
    for (const z of [-256, -233]) boxes.push({ position: [-133, 24.02, z], size: [20, 0.02, 0.08], color: '#c5ac70' });
    return boxes;
  }, []);
  const lamps = useMemo(() => {
    const points: [number, number, number][] = [];
    for (let x = -49; x < -4; x += 7) points.push([x, 0, -61.6]);
    for (let x = -117; x < -91; x += 5) points.push([x, 12, -189.6], [x, 12, -196.4]);
    for (let z = -214; z <= -192; z += 4) points.push([-123.5, 12 + (Math.max(0, -z - 197) / 22) * 12, z]);
    for (let x = -110; x < -67; x += 7) points.push([x, 18, -164.5]);
    return points;
  }, []);
  return (
<group name="royal-city">
    <GeometryBatch boxes={masonry} />
    {lamps.map(([x, y, z], i) => (
<group key={i} position={[x, y, z]}>
      <mesh position={[0, 1.35, 0]}><cylinderGeometry args={[0.04, 0.07, 2.7, 5]} /><meshStandardMaterial color="#7a7257" /></mesh>
      <mesh position={[0, 2.55, 0]}><boxGeometry args={[0.28, 0.45, 0.28]} /><meshBasicMaterial color="#ffcb80" /></mesh>
      <mesh position={[0, 2.85, 0]} rotation={[0, Math.PI / 4, 0]}><coneGeometry args={[0.35, 0.23, 4]} /><meshStandardMaterial color="#735441" /></mesh>
    </group>
))}
    <RoofTower x={-41.8} z={-133} y={22.8} scale={0.7} />
    <RoofTower x={-68.2} z={-133} y={22.8} scale={0.7} />
    <RoofTower x={-88.5} z={-177} y={22} scale={0.85} />
    <RoofTower x={-147} z={-245} y={42} scale={1.1} />
    <RoofTower x={-119} z={-245} y={42} scale={1.1} />
    <RoofTower x={-133} z={-274} y={32} scale={1.8} />
    {/* A banyan and a small garden establish a memorable safe rest space. */}
    <mesh position={[-82.8, 3.5, -59.7]} castShadow><cylinderGeometry args={[0.35, 0.7, 7, 7]} /><meshStandardMaterial color="#716a4e" /></mesh>
    {[-1, 0, 1].map(i => <mesh key={i} position={[-82.8 + i * 1.9, 7 + Math.abs(i) * 0.5, -59.7]} castShadow><icosahedronGeometry args={[3.1, 1]} /><meshStandardMaterial color={i === 0 ? '#486850' : '#617b53'} /></mesh>)}
  </group>
);
}
export default memo(ChapterView);
