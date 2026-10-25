'use client';

import { useRef, type MutableRefObject } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { enemyRole, isBoss } from './encounters';
import { BOSS_ROSTER } from './bossRoster';
import type { Enemy, GameState } from './types';

/** Secondary cloth follows simulation time, including pause/hitstop. Equipment
 * silhouettes distinguish combat roles before their health bars appear. */
export default function EnemyPresence({ enemy, stateRef }: { enemy: Enemy; stateRef: MutableRefObject<GameState> }) {
  const cloth = useRef<THREE.Group>(null); const role = enemyRole(enemy);
  const boss = isBoss(enemy); const palette = BOSS_ROSTER[enemy.kind];
  const color = palette?.coat ?? (role === 'blade' ? '#682c35' : role === 'staff' ? '#9b8357' : '#455c58');
  useFrame(() => {
    if (!cloth.current) return;
    const s = stateRef.current; const e = s.enemies.find(q => q.id === enemy.id);
    if (!e) return;
    const intensity = e.action === 'attack' ? 0.26 : e.action === 'chase' ? 0.16 : 0.05;
    cloth.current.rotation.x = -0.08 - Math.sin(s.time * 2.7 + e.spawn.x) * intensity;
    cloth.current.rotation.z = Math.sin(s.time * 1.9 + e.spawn.z) * 0.07;
  });
  return (
    <group name={`presence-${enemy.id}`}>
      <group ref={cloth} position={[0, 1.2, -0.24]}>
        {[-1, 1].map(side => <mesh key={side} position={[side * 0.14, -0.42, -0.08]} rotation={[-0.12, side * 0.08, side * 0.045]} castShadow><boxGeometry args={[0.27, boss ? 0.92 : 0.66, 0.035]} /><meshStandardMaterial color={color} roughness={0.94} /></mesh>)}
      </group>
      {(role === 'crossbow' || role === 'slinger') && <group position={[-0.22, 1.05, -0.28]} rotation={[0, 0, -0.3]}><mesh castShadow><cylinderGeometry args={[0.11, 0.09, 0.6, 8]} /><meshStandardMaterial color="#584a3b" roughness={0.95} /></mesh>{[-1, 0, 1].map(i => <mesh key={i} position={[i * 0.05, 0.3, 0]}><boxGeometry args={[0.018, 0.4, 0.018]} /><meshStandardMaterial color="#b7b399" /></mesh>)}</group>}
      {role === 'bulwark' && <mesh position={[-0.34, 1.27, 0]} rotation={[0, 0, -0.3]} castShadow><sphereGeometry args={[0.24, 8, 6, 0, Math.PI * 2, 0, Math.PI / 2]} /><meshStandardMaterial color="#746f5d" roughness={0.6} metalness={0.45} /></mesh>}
      {role === 'pike' && <mesh position={[0, 1.02, -0.3]} rotation={[0, 0, -0.1]} castShadow><boxGeometry args={[0.11, 0.85, 0.05]} /><meshStandardMaterial color="#7b493c" roughness={1} /></mesh>}
    </group>
  );
}
