'use client';

import { useFrame } from '@react-three/fiber';
import { useLayoutEffect, useMemo, useRef, type MutableRefObject } from 'react';
import * as THREE from 'three';
import type { GameState, Landmark } from './types';
import { LANDMARKS } from './world';
import { FERRY_ROUTES, ferryStatus } from './ferries';
import { discoveryColor, discoveryPhase, notePresentation } from './landmarkPresentation';
import GeometryBatch, { type StoneBox } from './GeometryBatch';

type StateRef = MutableRefObject<GameState>;
const notes = LANDMARKS.filter(l => l.kind === 'note' && !['laptop', 'temple-lamp', 'canal-lamp'].includes(l.id));
const ferries = LANDMARKS.filter(l => Object.hasOwn(FERRY_ROUTES, l.id));
const markers = [...notes, ...ferries];
// Keep the signs beside the two arrival positions instead of in the traveller's silhouette.
const ferrySignX = (l: Landmark) => l.x + (['haven-ferry', 'boatyard-ferry'].includes(l.id) ? 1.2 : 0);

function furniture(l: Landmark): StoneBox[] {
  const p = notePresentation(l);
  const ferry = Object.hasOwn(FERRY_ROUTES, l.id);
  if (!p && !ferry) return [];
  const model = p?.model;
  const offset = p?.offset ?? -0.65;
  const b: StoneBox[] = [];
  const box = (x: number, y: number, z: number, w: number, h: number, d: number, color: string, rotation?: [number, number, number]) => b.push({ position: [(ferry ? ferrySignX(l) : l.x) + x, l.y + y, l.z + offset + z], size: [w, h, d], color, rotation });
  const wood = '#917151';
  const stone = '#89968c';
  const metal = '#c5a574';
  const paper = '#ede2c3';
  const ink = '#566156';
  if (ferry) {
    box(0, 1.3, 0, 0.11, 2.6, 0.11, wood);
    box(0, 2.15, 0, 1.25, 0.6, 0.1, '#425950');
    // A roofed boat silhouette distinguishes the sign from a rain shrine.
    for (const side of [-1, 1]) {
      box(0, 2.08, side * 0.07, 0.75, 0.13, 0.05, paper);
      box(0, 2.35, side * 0.07, 0.64, 0.07, 0.05, metal);
      for (const x of [-0.24, 0.24]) box(x, 2.2, side * 0.07, 0.05, 0.25, 0.05, paper);
    }
    return b;
  }
  if (model === 'paper' || model === 'rubbing' || model === 'sign') {
    const w = model === 'sign' ? 1.55 : model === 'rubbing' ? 1.2 : 0.94;
    const h = model === 'rubbing' ? 1.4 : model === 'sign' ? 0.68 : 0.88;
    box(0, 0.75, -0.03, 0.12, 1.5, 0.12, wood);
    box(0, 1.55, 0, w, h, 0.12, wood);
    // Both approach directions should reveal a written surface, including underground foyers.
    for (const side of [-1, 1]) {
      box(0, 1.55, side * 0.07, w - 0.16, h - 0.13, 0.02, model === 'sign' ? '#60756b' : paper);
      for (let i = 0; i < 4; i++) box(-0.05 + (i % 2) * 0.08, 1.55 + h * 0.26 - i * h * 0.16, side * 0.088, w * (i === 3 ? 0.35 : 0.62), 0.025, 0.008, model === 'sign' ? paper : ink);
      for (const y of [1.55 - h / 2, 1.55 + h / 2]) box(0, y, side * 0.1, w + 0.09, 0.045, 0.06, metal);
    }
    box(0, 0.08, 0, 0.68, 0.16, 0.45, stone);
  } else if (model === 'book') {
    box(0, 0.52, 0, 0.2, 1.04, 0.23, wood);
    box(0, 0.09, 0, 0.8, 0.18, 0.5, stone);
    box(0, 1.08, 0, 1.08, 0.12, 0.74, wood);
    for (const side of [-1, 1]) {
      box(side * 0.23, 1.17, 0, 0.45, 0.07, 0.64, paper, [0, 0, side * -0.06]);
      for (let i = 0; i < 5; i++) box(side * 0.23, 1.219, -0.2 + i * 0.09, 0.32 - (i % 2) * 0.06, 0.008, 0.016, ink);
    }
    box(0, 1.195, 0, 0.035, 0.055, 0.68, '#b88864');
  } else if (model === 'stele' || model === 'seal') {
    box(0, 0.1, 0, 1.35, 0.2, 0.65, stone);
    box(0, 1.1, 0, model === 'seal' ? 0.72 : 1.06, 1.8, 0.3, '#758b82');
    box(0, 2.04, 0, model === 'seal' ? 1 : 1.25, 0.16, 0.42, metal);
    for (const side of [-1, 1]) for (let i = 0; i < 5; i++) box(-0.03 + (i % 2) * 0.07, 1.68 - i * 0.25, side * 0.16, model === 'seal' ? 0.36 : 0.64 - (i % 2) * 0.12, 0.035, 0.013, '#d7cda4');
  } else if (model === 'bell') {
    for (const x of [-0.8, 0.8]) {
      box(x, 1.55, 0, 0.17, 3.1, 0.22, wood);
      box(x, 0.09, 0, 0.42, 0.18, 0.52, stone);
    }
    box(0, 3.07, 0, 2, 0.22, 0.38, wood);
    box(0, 3.25, 0, 2.24, 0.12, 0.72, '#69746a');
    box(0.51, 1.85, 0.1, 0.034, 1.7, 0.034, '#ddc8a2');
    box(0.51, 1, 0.1, 0.16, 0.23, 0.16, metal);
  } else if (model === 'wheel' || model === 'winch') {
    box(0, 0.11, 0, 1.38, 0.22, 0.66, stone);
    for (const x of [-0.43, 0.43]) box(x, 0.72, 0, 0.16, 1.3, 0.26, wood);
    box(0, 0.55, 0, 1, 0.55, 0.36, '#637b71');
    if (model === 'winch') {
      box(0.42, 1.42, 0, 0.12, 0.8, 0.12, metal, [0, 0, 0.4]);
      box(0.57, 1.8, 0, 0.46, 0.09, 0.11, wood);
      box(-0.75, 0.28, 0.06, 0.6, 0.16, 0.24, '#b9a785');
    }
  } else if (model === 'lantern' || model === 'basin' || model === 'name-lamp') {
    box(0, 0.12, 0, 1.65, 0.24, 1.05, stone);
    box(0, 0.48, 0, 1.1, 0.48, 0.73, '#718b80');
    box(0, 0.83, 0, 1.4, 0.22, 0.94, metal);
    if (model !== 'basin') {
      box(0, 1.24, 0, 0.52, 0.68, 0.52, '#d3c291');
      for (const x of [-0.36, 0.36]) for (const z of [-0.3, 0.3]) box(x, 1.5, z, 0.055, 1.2, 0.055, wood);
      box(0, 2.08, 0, 1, 0.1, 0.9, metal);
      if (model === 'name-lamp') for (const x of [-0.16, 0, 0.16]) box(x, 1.29, 0.29, 0.06, 0.4, 0.015, ink);
    }
  }
  return b;
}

function Details({ l, stateRef }: { l: Landmark; stateRef: StateRef }) {
  const p = notePresentation(l)!;
  const wheel = useRef<THREE.Group>(null);
  const flame = useRef<THREE.Mesh>(null);
  const water = useRef<THREE.Mesh>(null);
  useFrame(() => {
    const s = stateRef.current;
    const phase = discoveryPhase(s, l.id);
    if (wheel.current) wheel.current.rotation.z = phase === 'complete' ? Math.PI * 0.8 : -0.2;
    if (flame.current) {
      (flame.current.material as THREE.MeshBasicMaterial).color.set(discoveryColor(p.role, phase));
      flame.current.scale.setScalar(1 + Math.sin(s.time * 2) * 0.05);
    }
    if (water.current) water.current.rotation.z = s.time * 0.14;
  });
  return (
<group position={[l.x, l.y, l.z + p.offset]} name={`discovery-model-${l.id}`}>
    {p.model === 'wheel' && (
<group ref={wheel} position={[0, 1.35, 0.22]}>
      <mesh castShadow><torusGeometry args={[0.61, 0.09, 6, 20]} /><meshStandardMaterial color="#c7a572" metalness={0.45} roughness={0.6} /></mesh>
      {[0, Math.PI / 3, -Math.PI / 3].map(a => <mesh key={a} rotation={[0, 0, a]} castShadow><boxGeometry args={[1.16, 0.065, 0.07]} /><meshStandardMaterial color="#a48b62" /></mesh>)}
      <mesh rotation={[Math.PI / 2, 0, 0]}><cylinderGeometry args={[0.16, 0.16, 0.13, 8]} /><meshStandardMaterial color="#c7a572" /></mesh>
    </group>
)}
    {p.model === 'winch' && (
<group position={[0, 1.1, 0]} rotation={[0, 0, Math.PI / 2]}>
      <mesh castShadow><cylinderGeometry args={[0.29, 0.29, 0.76, 12]} /><meshStandardMaterial color="#b0a185" roughness={1} /></mesh>
      {[-0.4, 0.4].map(y => <mesh key={y} position={[0, y, 0]} rotation={[Math.PI / 2, 0, 0]} castShadow><torusGeometry args={[0.36, 0.075, 6, 16]} /><meshStandardMaterial color="#bf9f6a" metalness={0.4} /></mesh>)}
    </group>
)}
    {p.model === 'bell' && (
<group>
      <mesh ref={flame} position={[0, 2.9, 0]}><sphereGeometry args={[0.08, 6, 4]} /><meshBasicMaterial color="#ffda8b" /></mesh>
      <mesh position={[0, 2.35, 0]} castShadow><cylinderGeometry args={[0.32, 0.61, 0.98, 16, 1, true]} /><meshStandardMaterial color="#c1a266" metalness={0.55} roughness={0.48} side={THREE.DoubleSide} /></mesh>
      <mesh position={[0, 1.86, 0]} rotation={[Math.PI / 2, 0, 0]} castShadow><torusGeometry args={[0.59, 0.065, 6, 20]} /><meshStandardMaterial color="#d9ba79" /></mesh>
      <mesh position={[0, 2.04, 0]}><sphereGeometry args={[0.12, 8, 6]} /><meshStandardMaterial color="#7e6849" /></mesh>
    </group>
)}
    {(p.model === 'lantern' || p.model === 'name-lamp') && (
<group>
      <mesh ref={flame} position={[0, 1.78, 0]}><octahedronGeometry args={[0.25]} /><meshBasicMaterial color="#ffda8b" /></mesh>
      <mesh position={[0, 2.23, 0]} rotation={[0, Math.PI / 4, 0]} castShadow><coneGeometry args={[0.73, 0.3, 4]} /><meshStandardMaterial color="#617769" /></mesh>
      <mesh position={[0, 0.955, 0]} rotation={[-Math.PI / 2, 0, 0]}><ringGeometry args={[0.42, 0.53, 32]} /><meshBasicMaterial color="#d9b878" /></mesh>
    </group>
)}
    {p.model === 'basin' && (
<group>
      <mesh position={[0, 1.05, 0]} rotation={[-Math.PI / 2, 0, 0]} castShadow><torusGeometry args={[0.53, 0.14, 8, 20]} /><meshStandardMaterial color="#b8ae88" /></mesh>
      <mesh ref={flame} position={[0, 1.055, 0]} rotation={[-Math.PI / 2, 0, 0]}><circleGeometry args={[0.48, 24]} /><meshBasicMaterial color="#86dcc3" /></mesh>
      <mesh ref={water} position={[0, 1.065, 0]} rotation={[-Math.PI / 2, 0, 0]}><ringGeometry args={[0.24, 0.27, 24]} /><meshBasicMaterial color="#cde6dc" /></mesh>
    </group>
)}
    {p.model === 'seal' && <mesh position={[0, 1.8, 0.23]}><torusGeometry args={[0.4, 0.06, 6, 20]} /><meshStandardMaterial color="#c4b887" metalness={0.25} /></mesh>}
  </group>
);
}

function Beacons({ stateRef }: { stateRef: StateRef }) {
  const gems = useRef<THREE.InstancedMesh>(null);
  const beams = useRef<THREE.InstancedMesh>(null);
  const rings = useRef<THREE.InstancedMesh>(null);
  const transform = useMemo(() => new THREE.Object3D(), []);
  const tint = useMemo(() => new THREE.Color(), []);
  useLayoutEffect(() => { for (const ref of [gems, beams, rings]) if (ref.current) ref.current.frustumCulled = false; }, []);
  useFrame(({ camera }) => {
    const s = stateRef.current;
    markers.forEach((l, i) => {
      const p = notePresentation(l);
      const ferry = ferryStatus(s, l.id);
      const phase = ferry ? ferry.ready ? 'ready' : 'sealed' : discoveryPhase(s, l.id);
      const done = phase === 'complete';
      const role = p?.role ?? 'mechanism';
      tint.set(ferry ? ferry.ready ? '#8aefd6' : '#b0a18a' : discoveryColor(role, phase));
      const height = p?.height ?? 3.2;
      const z = l.z + (p?.offset ?? -0.65);
      const d = Math.hypot(camera.position.x - l.x, camera.position.y - l.y - height, camera.position.z - z);
      const radius = (ferry ? 0.13 : role === 'lore' ? 0.12 : 0.2) * (done ? 0.55 : 1) * Math.max(1, Math.min(1.8, d / 36));
      transform.position.set(ferry ? ferrySignX(l) : l.x, l.y + height + Math.sin(s.time * 1.7 + i) * 0.045, z);
      transform.rotation.set(0, s.time * 0.22, 0); transform.scale.setScalar(radius); transform.updateMatrix();
      gems.current?.setMatrixAt(i, transform.matrix); gems.current?.setColorAt(i, tint);
      const h = done ? 0.35 : ferry ? 0.8 : role === 'lore' ? 0.62 : 1.5;
      transform.position.y -= h / 2; transform.rotation.set(0, 0, 0); transform.scale.set(radius * 0.6, h, radius * 0.6); transform.updateMatrix();
      beams.current?.setMatrixAt(i, transform.matrix); beams.current?.setColorAt(i, tint);
      transform.position.set(l.x, l.y + 0.04, z); transform.rotation.set(-Math.PI / 2, 0, 0);
      transform.scale.setScalar(ferry && !ferry.ready ? 0 : role === 'mechanism' ? 0.9 : role === 'clue' && !done ? 0.55 : 0); transform.updateMatrix();
      rings.current?.setMatrixAt(i, transform.matrix); rings.current?.setColorAt(i, tint);
    });
    for (const ref of [gems, beams, rings]) if (ref.current) {
      ref.current.instanceMatrix.needsUpdate = true;
      if (ref.current.instanceColor) ref.current.instanceColor.needsUpdate = true;
    }
  });
  return (
<group name="discovery-beacons">
    <instancedMesh ref={gems} args={[undefined, undefined, markers.length]}><octahedronGeometry args={[1]} /><meshBasicMaterial toneMapped={false} /></instancedMesh>
    <instancedMesh ref={beams} args={[undefined, undefined, markers.length]}><cylinderGeometry args={[0.2, 1, 1, 6, 1, true]} /><meshBasicMaterial transparent opacity={0.25} depthWrite={false} toneMapped={false} side={THREE.DoubleSide} /></instancedMesh>
    <instancedMesh ref={rings} args={[undefined, undefined, markers.length]}><ringGeometry args={[0.85, 1, 24]} /><meshBasicMaterial transparent opacity={0.48} depthWrite={false} toneMapped={false} /></instancedMesh>
  </group>
);
}

export default function DiscoveryView({ stateRef }: { stateRef: StateRef }) {
  const boxes = useMemo(() => markers.flatMap(furniture), []);
  return (
<group name="discovery-objects">
    <GeometryBatch boxes={boxes} />
    {notes.filter(l => ['wheel', 'winch', 'bell', 'lantern', 'name-lamp', 'basin', 'seal'].includes(notePresentation(l)!.model)).map(l => <Details key={l.id} l={l} stateRef={stateRef} />)}
    <Beacons stateRef={stateRef} />
  </group>
);
}
