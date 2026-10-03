'use client';

import { useFrame } from '@react-three/fiber';
import { useRef, type MutableRefObject } from 'react';
import * as THREE from 'three';
import type { GameState } from './types';

export default function ProjectileView({ stateRef }: { stateRef: MutableRefObject<GameState> }) {
  const meshes = useRef<(THREE.Mesh | null)[]>([]);
  useFrame(() => { meshes.current.forEach((m, i) => { if (!m) return; const bolt = stateRef.current.projectiles[i]; m.visible = !!bolt; if (bolt) { m.position.set(bolt.x, bolt.y, bolt.z); m.rotation.y = Math.atan2(bolt.vx, bolt.vz); m.scale.set(bolt.kind === 'stone' ? 2 : 1, bolt.kind === 'stone' ? 2 : 1, bolt.kind === 'stone' ? 0.6 : 1); } }); });
  return <group>{Array.from({ length: 12 }, (_, i) => <mesh key={i} ref={m => { meshes.current[i] = m; }} visible={false}><boxGeometry args={[0.08, 0.08, 0.72]} /><meshBasicMaterial color="#ffe2a5" /></mesh>)}</group>;
}
