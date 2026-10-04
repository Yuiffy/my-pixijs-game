'use client';

import { memo, useEffect, useMemo, useRef, type MutableRefObject } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { GameState } from './types';
import GeometryBatch, { type StoneBox } from './GeometryBatch';
import { DUNGEONS } from './dungeons';

function Grove() {
  const trunks = useRef<THREE.InstancedMesh>(null);
  const leaves = useRef<THREE.InstancedMesh>(null);
  const points = useMemo(() => [
    ...Array.from({ length: 30 }, (_, i) => [-58 + (i % 3) * 4, 9, -337 - Math.floor(i / 3) * 10]),
    ...Array.from({ length: 22 }, (_, i) => [-132 - (i % 2) * 6, 1, -367 - Math.floor(i / 2) * 6]),
    ...Array.from({ length: 24 }, (_, i) => [-225 - (i % 3) * 5, 0, -365 - Math.floor(i / 3) * 9]),
    ...Array.from({ length: 18 }, (_, i) => [-183 - (i % 3) * 7, 0, -460 - Math.floor(i / 3) * 12]),
  ], []);
  useEffect(() => {
    const m = new THREE.Object3D();
    points.forEach(([x, y, z], i) => {
      const h = 9 + (i % 5) * 1.3;
      m.position.set(x, y + h / 2, z); m.scale.set(0.2, h, 0.2); m.updateMatrix(); trunks.current?.setMatrixAt(i, m.matrix);
      m.position.y = y + h; m.scale.set(2.6, 4 + (i % 3), 2.6); m.updateMatrix(); leaves.current?.setMatrixAt(i, m.matrix);
    });
    if (trunks.current) { trunks.current.instanceMatrix.needsUpdate = true; trunks.current.computeBoundingSphere(); }
    if (leaves.current) { leaves.current.instanceMatrix.needsUpdate = true; leaves.current.computeBoundingSphere(); }
  }, [points]);
  return <group name="river-bamboo"><instancedMesh ref={trunks} args={[undefined, undefined, points.length]} castShadow><cylinderGeometry args={[0.8, 1, 1, 5]} /><meshStandardMaterial color="#879168" /></instancedMesh><instancedMesh ref={leaves} args={[undefined, undefined, points.length]} castShadow><icosahedronGeometry args={[1, 0]} /><meshStandardMaterial color="#57775d" roughness={1} /></instancedMesh></group>;
}

function RiverMechanisms({ stateRef }: { stateRef: MutableRefObject<GameState> }) {
  const wheel = useRef<THREE.Group>(null);
  const lamps = useRef<THREE.Group>(null);
  useFrame(() => {
    const s = stateRef.current;
    if (wheel.current) wheel.current.rotation.x = s.time * (s.collected.includes('mill-sluice') ? 0.28 : 0.045);
    if (lamps.current) { lamps.current.visible = s.valleyComplete; lamps.current.position.z = -(s.time % 30) * 0.25; }
  });
  return (
<group>
    <group position={[-217, 5.3, -402]} ref={wheel}>
      {[-0.65, 0.65].map(x => <mesh key={x} rotation={[0, Math.PI / 2, 0]} position={[x, 0, 0]}><torusGeometry args={[4, 0.16, 6, 24]} /><meshStandardMaterial color="#b08e64" /></mesh>)}
      {Array.from({ length: 12 }, (_, i) => <group key={i} rotation={[(i * Math.PI) / 6, 0, 0]}><mesh position={[0, 2, 0]}><boxGeometry args={[0.2, 4, 0.18]} /><meshStandardMaterial color="#826c51" /></mesh><mesh position={[0, 3.85, 0]}><boxGeometry args={[1.65, 0.35, 0.85]} /><meshStandardMaterial color="#998966" /></mesh></group>)}
    </group>
    <group ref={lamps} visible={false}>{Array.from({ length: 24 }, (_, i) => <mesh key={i} position={[-150 + Math.sin(i * 3) * 7, -0.92, -543 - i * 1.9]}><boxGeometry args={[0.45, 0.15, 0.45]} /><meshBasicMaterial color={i % 2 ? '#ffda91' : '#a5edce'} /></mesh>)}</group>
  </group>
);
}

function ValleyView({ stateRef }: { stateRef: MutableRefObject<GameState> }) {
  const water = useMemo(() => {
    const shape = new THREE.Shape(); const p = DUNGEONS.cave.upper;
    shape.moveTo(-306, 285); shape.lineTo(4, 285); shape.lineTo(4, 615); shape.lineTo(-306, 615); shape.closePath();
    const hole = new THREE.Path();
    hole.moveTo(p.x - 3.3, -p.z - 3.3); hole.lineTo(p.x - 3.3, -p.z + 3.3); hole.lineTo(p.x + 3.3, -p.z + 3.3); hole.lineTo(p.x + 3.3, -p.z - 3.3); hole.closePath(); shape.holes.push(hole);
    return shape;
  }, []);
  const boxes = useMemo(() => {
    const b: StoneBox[] = [];
    for (let x = -183; x < -149; x += 4) {
      b.push({ position: [x, -0.65, -343], size: [0.4, 4.5, 7], color: '#6e7866' });
      b.push({ position: [x, 5.2, -339.5], size: [0.11, 6.4, 0.11], color: '#857352' });
      b.push({ position: [x, 6, -339.5], size: [0.25, 0.45, 0.25], color: '#edc586' });
    }
    for (const x of [-196, -204]) for (const z of [-334, -360]) {
      b.push({ position: [x, 5.2, z], size: [4.5, 0.13, 2.4], rotation: [0.12, 0, 0], color: x === -196 ? '#aa8054' : '#789983' });
      b.push({ position: [x, 2.5, z], size: [3.5, 1, 1], color: '#9b8665' });
    }
    for (let z = -398; z < -346; z += 7) for (const x of [-92.5, -73.2]) b.push({ position: [x, 12, z], size: [0.12, 16, 0.12], color: '#a4a178' });
    for (let x = -103; x < -77; x += 4) b.push({ position: [x, 18.02, -413], size: [0.13, 0.02, 12], color: '#d3bc80' });
    for (const x of [-163, -137]) b.push({ position: [x, 8.02, -510], size: [0.18, 0.02, 30], color: '#bed5af' });
    for (const z of [-495, -524]) b.push({ position: [-150, 8.02, z], size: [26, 0.02, 0.18], color: '#c9c491' });
    // Cliff faces stay outside the walking network; pale strata frame the gorge.
    for (let i = 0; i < 12; i++) {
      b.push({ position: [-305 - (i % 2) * 4, 8 + (i % 3), -320 - i * 19], size: [12, 25 + (i % 4) * 5, 21], rotation: [0, (i % 3) * 0.1, 0], color: i % 2 ? '#56766e' : '#6c8576' });
      b.push({ position: [-44 + (i % 2) * 5, 11 + (i % 3), -326 - i * 19], size: [12, 34 + (i % 4) * 4, 21], color: i % 2 ? '#6a8271' : '#567366' });
    }
    for (let z = -322; z > -552; z -= 9) b.push({ position: [-169 + Math.sin(z) * 7, -1.17, z], size: [8 + Math.cos(z) * 3, 0.015, 0.07], color: '#698f90' });
    return b;
  }, []);
  return (
<group name="mist-river-valley">
    <mesh position={[0, -1.24, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow><shapeGeometry args={[water]} /><meshStandardMaterial color="#365d62" roughness={0.28} metalness={0.35} /></mesh>
    <GeometryBatch boxes={boxes} /><Grove /><RiverMechanisms stateRef={stateRef} />
    {/* Roofed long-tail boats mark the actual, labelled ferry endpoints. */}
    {([[-130, 0.3, -366.5], [-178.3, 0.3, -398], [17, -0.7, -34.5]] as const).map(([x, y, z]) => (
<group key={x} position={[x, y, z]}>
      <mesh><boxGeometry args={[6, 0.45, 1.5]} /><meshStandardMaterial color="#aa704b" /></mesh>
      {[-1, 1].map(side => <mesh key={side} position={[0, 0.5, side * 0.8]} rotation={[side * 0.2, 0, 0]}><boxGeometry args={[6.5, 0.9, 0.12]} /><meshStandardMaterial color="#b79863" /></mesh>)}
      <mesh position={[0, 2, 0]}><boxGeometry args={[4.5, 0.15, 2.4]} /><meshStandardMaterial color="#649588" /></mesh>
      {[-1.7, 1.7].map(k => <mesh key={k} position={[k, 1, 0]}><boxGeometry args={[0.08, 2, 0.08]} /><meshStandardMaterial color="#ae9369" /></mesh>)}
      <mesh position={[3.5, 0.55, 0]} rotation={[0, 0, -0.4]}><boxGeometry args={[2.5, 0.12, 0.12]} /><meshStandardMaterial color="#8b7253" /></mesh>
    </group>
))}
    {([[-225, 13, -449], [-93, 28, -435], [-171, 17, -521], [-129, 17, -521]] as const).map(([x, y, z]) => (
<group key={x} position={[x, y, z]}>
      {[0, 1, 2].map(i => <mesh key={i} position={[0, i * 2, 0]} rotation={[0, Math.PI / 4, 0]} castShadow><coneGeometry args={[4.5 - i, 3.3, 4]} /><meshStandardMaterial color={i % 2 ? '#b89b66' : '#698a77'} /></mesh>)}
      <mesh position={[0, 7, 0]}><coneGeometry args={[0.3, 4, 8]} /><meshStandardMaterial color="#d3b675" /></mesh>
    </group>
))}
  </group>
);
}
export default memo(ValleyView);
