'use client';

import { Canvas } from '@react-three/fiber';
import { useMemo } from 'react';
import { Actor, enemyModelScale } from './WorldView';
import { createGame } from './engine';
import type { Enemy } from './types';

export default function BestiaryPortrait({ enemy }: { enemy: Enemy }) {
  const stateRef = useMemo(() => { const state = createGame(); state.enemies = [{ ...enemy, x: 0, y: 0, z: 0, facing: 0, hp: enemy.maxHp, action: 'idle', aggro: false, flash: 0 }]; return { current: state }; }, [enemy]);
  const scale = enemyModelScale(enemy);
  return <Canvas aria-label={`${enemy.name}模型`} dpr={1} style={{ height: 260 }} camera={{ position: [2.2 * scale, 0.95 * scale, 4.2 * scale], fov: 32 }} onCreated={({ camera }) => camera.lookAt(0, 0, 0)}><color attach="background" args={['#213c46']} /><ambientLight intensity={1.6} /><directionalLight position={[4, 6, 4]} intensity={3} /><group position={[0, -1.08 * scale, 0]}><Actor stateRef={stateRef} enemyId={enemy.id} /></group></Canvas>;
}
