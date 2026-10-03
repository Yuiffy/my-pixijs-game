'use client';

import { Canvas } from '@react-three/fiber';
import { useMemo } from 'react';
import { Actor } from './WorldView';
import { createGame } from './engine';
import { giantScale } from './dungeons';
import type { Enemy } from './types';

export default function BestiaryPortrait({ enemy }: { enemy: Enemy }) {
  const stateRef = useMemo(() => { const state = createGame(); state.enemies = [{ ...enemy, x: 0, y: 0, z: 0, facing: 0, hp: enemy.maxHp, action: 'idle', aggro: false, flash: 0 }]; return { current: state }; }, [enemy]);
  const scale = giantScale(enemy.id);
  return <Canvas aria-label={`${enemy.name}模型`} dpr={1} style={{ height: 260 }} camera={{ position: [2.5 * scale, 1.7 * scale, 4 * scale], fov: 34 }}><color attach="background" args={['#213c46']} /><ambientLight intensity={1.6} /><directionalLight position={[4, 6, 4]} intensity={3} /><group position={[0, -0.6 * scale, 0]}><Actor stateRef={stateRef} enemyId={enemy.id} /></group></Canvas>;
}
