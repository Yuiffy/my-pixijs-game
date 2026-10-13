'use client';

import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef, type MutableRefObject } from 'react';
import * as THREE from 'three';
import { FIELD_COLORS, fieldActive, MAX_BOSS_FIELDS } from './bossFields';
import { createAreaWarningBuffers, writeAreaWarning } from './groundWarning';
import type { GameState } from './types';

function Field({ stateRef, index }: { stateRef: MutableRefObject<GameState>; index: number }) {
  const root = useRef<THREE.Group>(null);
  const floor = useRef<THREE.Mesh>(null);
  const beam = useRef<THREE.Mesh>(null);
  const pine = useRef<THREE.Group>(null);
  const shield = useRef<THREE.Mesh>(null);
  const clock = useRef<THREE.Mesh>(null);
  const drones = useRef<THREE.Group>(null);
  const song = useRef<THREE.Group>(null);

  const data = useMemo(() => {
    const buffers = createAreaWarningBuffers(5.2);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(buffers.positions, 3).setUsage(THREE.DynamicDrawUsage));
    geometry.setDrawRange(0, 0);
    return { buffers, geometry, last: '' };
  }, []);
  useEffect(() => () => data.geometry.dispose(), [data]);
  useFrame(() => {
    if (!root.current) return;
    const state = stateRef.current; const f = state.bossFields[index];
    root.current.visible = !!f;
    if (!f) return;
    const active = fieldActive(f); const color = FIELD_COLORS[f.kind];
    root.current.position.set(f.x, f.y, f.z);
    if (floor.current) {
      floor.current.visible = ['pine', 'freeze', 'leap', 'quake', 'starfall'].includes(f.kind);
      if (floor.current.visible) {
        const radius = f.kind === 'quake' && active ? Math.max(0.05, ((f.age - f.delay) / f.duration) * f.radius) : f.radius;
        const key = `${radius},${f.id},${f.x},${f.y},${f.z},${f.radius},${state.shortcut},${state.templeGate},${state.harborGate},${state.chapterGates},${state.valleyGates},${state.haven.gates}`;
        if (key !== data.last) {
          data.geometry.setDrawRange(0, writeAreaWarning(data.buffers, { ...f, facing: 0 }, state, { range: radius, arc: Math.PI, innerRange: f.kind === 'quake' && active ? Math.max(0, radius - 0.5) : 0 }));
          data.geometry.attributes.position.needsUpdate = true; data.last = key;
        }
        const mat = floor.current.material as THREE.MeshBasicMaterial;
        mat.color.set(color); mat.opacity = active ? 0.34 : 0.12 + 0.14 * Math.min(1, f.age / Math.max(0.01, f.delay));
      }
    }
    if (beam.current) {
      beam.current.visible = f.kind === 'beam';
      beam.current.rotation.y = f.facing;
      beam.current.position.set(Math.sin(f.facing) * (f.length / 2), 1, Math.cos(f.facing) * (f.length / 2));
      beam.current.scale.set(active ? f.radius * 2 : 0.06, active ? 0.65 : 0.06, f.length);
      (beam.current.material as THREE.MeshBasicMaterial).color.set(color);
    }
    if (pine.current) { pine.current.visible = f.kind === 'pine'; pine.current.scale.setScalar(active ? 1 : 0.35 + 0.65 * (f.age / f.delay)); }
    if (shield.current) {
      shield.current.visible = f.kind === 'shield' || f.kind === 'counter';
      shield.current.rotation.y = f.facing;
      shield.current.scale.setScalar(f.kind === 'counter' ? 0.55 : 1);
      shield.current.position.set(Math.sin(f.facing) * 0.8, 1, Math.cos(f.facing) * 0.8);
      (shield.current.material as THREE.MeshBasicMaterial).color.set(color);
    }
    if (clock.current) { clock.current.visible = f.kind === 'freeze'; clock.current.position.y = 1.9; clock.current.rotation.z = active ? 0 : f.age * 2; }
    if (drones.current) { drones.current.visible = f.kind === 'drones'; drones.current.rotation.y = f.facing; drones.current.position.y = 1.5; }
    if (song.current) { song.current.visible = f.kind === 'starcards' || f.kind === 'starfall' || f.kind === 'song' || f.kind === 'dragon' || f.kind === 'gust'; song.current.rotation.y = f.age * 1.8; song.current.position.y = 1.5; }

  });
  return (
<group ref={root} visible={false} name={`boss-field-${index}`}>
    <mesh ref={floor} geometry={data.geometry} frustumCulled={false}><meshBasicMaterial transparent side={THREE.DoubleSide} depthWrite={false} polygonOffset polygonOffsetFactor={-2} polygonOffsetUnits={-2} /></mesh>
    <mesh ref={beam}><boxGeometry args={[1, 1, 1]} /><meshBasicMaterial transparent opacity={0.8} /></mesh>
    <group ref={pine}>
      <mesh position={[0, 0.4, 0]}><cylinderGeometry args={[0.08, 0.13, 0.8, 6]} /><meshStandardMaterial color="#8b633d" /></mesh>
      {[0.6, 1, 1.35].map((y, i) => <mesh key={y} position={[0, y, 0]}><coneGeometry args={[0.65 - i * 0.16, 0.65, 7]} /><meshStandardMaterial color="#80bb6a" emissive="#365d29" emissiveIntensity={0.4} /></mesh>)}
    </group>
    <mesh ref={shield}><sphereGeometry args={[1, 16, 12, 0, Math.PI]} /><meshBasicMaterial transparent opacity={0.3} side={THREE.DoubleSide} wireframe /></mesh>
    <mesh ref={clock}><torusGeometry args={[0.65, 0.06, 6, 24]} /><meshBasicMaterial color="#b9efff" /><mesh position={[0, 0.2, 0]}><boxGeometry args={[0.05, 0.4, 0.04]} /><meshBasicMaterial color="#b9efff" /></mesh><mesh position={[0.15, 0, 0]}><boxGeometry args={[0.3, 0.05, 0.04]} /><meshBasicMaterial color="#b9efff" /></mesh></mesh>
    <group ref={drones}>{[-1, 1].map(side => (
<group key={side} position={[side, 0, 0]}>
      <mesh><boxGeometry args={[0.38, 0.28, 0.4]} /><meshStandardMaterial color="#ece3ff" emissive="#9b62c9" emissiveIntensity={0.6} /></mesh>
      {[-0.1, 0.1].map(x => <mesh key={x} position={[x, 0.3, 0]}><boxGeometry args={[0.08, 0.4, 0.1]} /><meshBasicMaterial color="#d7aaff" /></mesh>)}
      <mesh position={[0, 0, 0.32]} rotation={[Math.PI / 2, 0, 0]}><cylinderGeometry args={[0.07, 0.07, 0.35, 6]} /><meshBasicMaterial color="#fce2ff" /></mesh>
    </group>
))}</group>
    <group ref={song}>{[0, 1, 2].map(i => <mesh key={i} position={[Math.sin(i * 2.1) * 0.8, i * 0.25, Math.cos(i * 2.1) * 0.8]}><octahedronGeometry args={[0.16]} /><meshBasicMaterial color="#ffd4a0" /></mesh>)}</group>

  </group>
);
}

export default function BossFieldView({ stateRef }: { stateRef: MutableRefObject<GameState> }) {
  return <group>{Array.from({ length: MAX_BOSS_FIELDS }, (_, index) => <Field key={index} index={index} stateRef={stateRef} />)}</group>;
}
