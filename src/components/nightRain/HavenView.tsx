'use client';

import { memo, useEffect, useMemo, useRef, type MutableRefObject } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { GameState } from './types';
import { HAVEN_LANDMARKS, havenAvailable } from './haven';
import GeometryBatch, { type StoneBox } from './GeometryBatch';

type StateRef = MutableRefObject<GameState>;
function Plaque({ text, position, width = 3 }: { text: string; position: [number, number, number]; width?: number }) {
  const texture = useMemo(() => {
    const canvas = document.createElement('canvas'); canvas.width = 640; canvas.height = 128;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#263e3c'; ctx.fillRect(0, 0, 640, 128); ctx.strokeStyle = '#caae75'; ctx.strokeRect(5, 5, 630, 118);
    ctx.fillStyle = '#f4ddb2'; ctx.font = '42px Microsoft YaHei'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(text, 320, 64);
    const t = new THREE.CanvasTexture(canvas); t.colorSpace = THREE.SRGBColorSpace; return t;
  }, [text]);
  useEffect(() => () => texture.dispose(), [texture]);
  return <mesh position={position}><planeGeometry args={[width, width / 5]} /><meshBasicMaterial map={texture} side={THREE.DoubleSide} /></mesh>;
}

function Resident({ id, stateRef }: { id: string; stateRef: StateRef }) {
  const root = useRef<THREE.Group>(null); const head = useRef<THREE.Group>(null);
  const l = HAVEN_LANDMARKS.find(q => q.id === id)!;
  const scribe = id.includes('scribe'); const boat = id.includes('boatwright');
  const color = scribe ? '#858697' : boat ? '#6a8c7c' : '#c69c69';
  useFrame(() => {
    const s = stateRef.current; if (!root.current) return;
    root.current.visible = havenAvailable(s, id);
    if (head.current) head.current.rotation.y = Math.max(-0.6, Math.min(0.6, Math.atan2(s.player.x - l.x, s.player.z - l.z)));
  });
  return (
<group ref={root} position={[l.x, l.y, l.z]}>
    {[-0.15, 0.15].map(x => <mesh key={x} position={[x, 0.36, 0]} castShadow><boxGeometry args={[0.22, 0.72, 0.26]} /><meshStandardMaterial color="#344746" /></mesh>)}
    <mesh position={[0, 1.02, 0]} castShadow><cylinderGeometry args={[0.29, 0.41, 0.8, 8]} /><meshStandardMaterial color={color} /></mesh>
    {[-0.36, 0.36].map(x => <mesh key={x} position={[x, 0.96, 0.06]} rotation={[0.3, 0, x * 0.4]} castShadow><capsuleGeometry args={[0.09, 0.5, 3, 6]} /><meshStandardMaterial color={color} /></mesh>)}
    <group ref={head} position={[0, 1.63, 0]}>
      <mesh castShadow><sphereGeometry args={[0.27, 10, 8]} /><meshStandardMaterial color="#cfae86" /></mesh>
      <mesh position={[0, 0.17, 0]}><sphereGeometry args={[0.265, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2]} /><meshStandardMaterial color={scribe ? '#303d49' : '#bdb9a4'} /></mesh>
      {boat && <mesh position={[0, 0.18, 0]}><coneGeometry args={[0.44, 0.2, 12]} /><meshStandardMaterial color="#b3a077" /></mesh>}
      {[-0.09, 0.09].map(x => <mesh key={x} position={[x, 0.01, 0.246]}><sphereGeometry args={[0.027, 6, 4]} /><meshStandardMaterial color="#253634" /></mesh>)}
    </group>
    {scribe ? <mesh position={[0, 1.05, 0.4]} rotation={[-0.4, 0, 0]}><boxGeometry args={[0.46, 0.07, 0.36]} /><meshStandardMaterial color="#ddc69d" /></mesh> : <mesh position={[0, 0.83, 0.38]}><cylinderGeometry args={[0.21, 0.16, 0.18, 10]} /><meshStandardMaterial color={boat ? '#ac855b' : '#d5bb8a'} /></mesh>}
  </group>
);
}

function HavenView({ stateRef }: { stateRef: StateRef }) {
  const lights = useRef<(THREE.Mesh | null)[]>([]);
  const names = useRef<THREE.Group>(null);
  const boxes = useMemo(() => {
    const b: StoneBox[] = [];
    for (let z = 34; z < 67; z += 5) for (const x of [-21, 17]) {
      b.push({ position: [x, 5.65, z], size: [0.12, 3.3, 0.12], color: '#887753' });
      b.push({ position: [x, 7.4, z], size: [0.5, 0.08, 0.5], color: '#c1a166' });
    }
    for (let x = -35; x < -25; x += 2) for (let y = 5; y < 8; y += 0.6) b.push({ position: [x, y, 55.9], size: [1.8, 0.12, 0.35], color: '#c8b898' });
    for (const [x, z] of [[-15, 52], [10, 52], [-32, 44]]) b.push({ position: [x, 4.48, z], size: [2.2, 0.16, 0.7], color: '#b49260' });
    for (let z = 108; z <= 148; z += 8) for (const x of [-22, 4]) {
      b.push({ position: [x, 2.5, z], size: [0.6, 5, 0.6], color: '#8d9b86' });
      b.push({ position: [x, 4.5, z], size: [1, 0.3, 1], color: '#b6a774' });
    }
    return b;
  }, []);
  useFrame(() => {
    const s = stateRef.current; const { ending } = s.haven;
    lights.current.forEach((m, i) => { if (m) (m.material as THREE.MeshStandardMaterial).emissive.set(i < 3 ? s.haven.echoes > i ? '#73dabf' : '#654327' : ending === 'release' ? '#7fdbc4' : '#e4a65c'); });
    if (names.current) names.current.visible = !!ending;
  });
  return (
<group name="returning-lantern-sanctuary">
    <GeometryBatch boxes={boxes} />
    {HAVEN_LANDMARKS.filter(l => l.kind === 'npc' && l.id !== 'well-choice').map(l => <Resident key={l.id} id={l.id} stateRef={stateRef} />)}
    {[-17, -5, 7].map((x, i) => (
<group key={x} position={[x, 4, 60]}>
      <mesh position={[0, 0.35, 0]}><cylinderGeometry args={[0.7, 0.85, 0.7, 10]} /><meshStandardMaterial color="#9f9275" /></mesh>
      <mesh ref={m => { lights.current[i] = m; }} position={[0, 1.3, 0]}><octahedronGeometry args={[0.38]} /><meshStandardMaterial color="#d6c69a" emissive="#654327" emissiveIntensity={1.8} /></mesh>
      <Plaque position={[0, 2.4, 0]} text={['钟', '水', '名'][i]} width={1.6} />
    </group>
))}
    {Array.from({ length: 14 }, (_, i) => <mesh key={i} ref={m => { lights.current[i + 3] = m; }} position={[i % 2 ? -21 : 17, 7.1, 34 + Math.floor(i / 2) * 5]}><boxGeometry args={[0.38, 0.55, 0.38]} /><meshStandardMaterial color="#f2d3a2" emissive="#e4a65c" emissiveIntensity={1.4} /></mesh>)}
    <group ref={names} visible={false}>{Array.from({ length: 15 }, (_, i) => <mesh key={i} position={[-18 + i * 2.5, 8 + Math.sin(i) * 0.3, 63]}><boxGeometry args={[0.4, 1.2, 0.07]} /><meshStandardMaterial color="#f3ddad" emissive="#6d5940" /></mesh>)}</group>
    <mesh position={[-5, 4.02, 45]} rotation={[-Math.PI / 2, 0, 0]}><ringGeometry args={[2.2, 2.38, 48]} /><meshStandardMaterial color="#ddba78" /></mesh>
    <pointLight position={[-5, 8, 45]} color="#ffcc85" intensity={45} distance={22} decay={1.7} />
    <pointLight position={[-16, 7, 40]} color="#ffd397" intensity={18} distance={12} />
    <Plaque text="归灯庭 · 给归人留座" position={[-16, 8.5, 34]} width={6} />
    <Plaque text="听雨书廊" position={[-31, 9, 39]} width={4} />
    <Plaque text="归灯小渡" position={[26, 8, 42]} width={3.5} />
    <Plaque text="弃铃书房" position={[-58, 10, -18]} width={4} />
    <Plaque text="沉灯船坞" position={[-272, 6, -339]} width={4} />
    <group position={[-9, 0, 153]}><mesh position={[0, 0.3, 0]}><cylinderGeometry args={[0.8, 1, 0.6, 12]} /><meshStandardMaterial color="#90998c" /></mesh><mesh position={[0, 1.1, 0]}><octahedronGeometry args={[0.4]} /><meshStandardMaterial color="#e3d5a5" emissive="#c4a571" emissiveIntensity={1.7} /></mesh></group>
  </group>
);
}
export default memo(HavenView);
