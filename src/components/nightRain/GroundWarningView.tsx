'use client';

import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef, type MutableRefObject } from 'react';
import * as THREE from 'three';
import { enemyAttack, enemyTell } from './enemyCombat';
import { createWarningBuffers, writeGroundWarning } from './groundWarning';
import type { GameState } from './types';

export default function GroundWarning({ stateRef, enemyId }: { stateRef: MutableRefObject<GameState>; enemyId: string }) {
  const mesh = useRef<THREE.Mesh>(null);
  const data = useMemo(() => {
    const enemy = stateRef.current.enemies.find(e => e.id === enemyId)!;
    const buffers = createWarningBuffers(enemy);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(buffers.positions, 3).setUsage(THREE.DynamicDrawUsage));
    geometry.setDrawRange(0, 0);
    return { buffers, geometry, last: '' };
  }, [stateRef, enemyId]);
  useEffect(() => () => data.geometry.dispose(), [data]);
  useFrame(() => {
    if (!mesh.current) return;
    const state = stateRef.current; const enemy = state.enemies.find(e => e.id === enemyId);
    mesh.current.visible = !!enemy && !enemyAttack(enemy).skill && (enemy.action === 'windup' || (enemy.action === 'attack' && !enemy.hitDone));
    if (!enemy || !mesh.current.visible) return;
    const key = `${enemy.x},${enemy.y},${enemy.z},${enemy.facing},${enemy.phase},${enemy.attackIndex},${state.shortcut},${state.templeGate},${state.harborGate},${state.chapterGates},${state.valleyGates},${state.haven.gates}`;
    if (key !== data.last) {
      const count = writeGroundWarning(data.buffers, enemy, state);
      data.geometry.attributes.position.needsUpdate = true;
      data.geometry.setDrawRange(0, count); data.last = key;
    }
    const attack = enemyAttack(enemy); const tell = enemyTell(enemy);
    const material = mesh.current.material as THREE.MeshBasicMaterial;
    material.color.set(attack.parryable ? '#ffc270' : '#ef655e');
    material.opacity = tell.committed ? 0.42 : 0.13 + Math.min(1, 1 - enemy.timer / attack.windup) * 0.15;
  });
  return (
<mesh name="enemy-ground-warning" ref={mesh} geometry={data.geometry} visible={false} frustumCulled={false}>
    <meshBasicMaterial transparent opacity={0.25} side={THREE.DoubleSide} depthWrite={false} polygonOffset polygonOffsetFactor={-2} polygonOffsetUnits={-2} />
  </mesh>
);
}
