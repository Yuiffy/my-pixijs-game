'use client';

import { useFrame } from '@react-three/fiber';
import { useRef, type MutableRefObject } from 'react';
import * as THREE from 'three';
import { enemyAttack } from './enemyCombat';
import type { GameState } from './types';

/** The signature effects use the actual combat position and countdown. */
export default function BossSignatures({ stateRef }: { stateRef: MutableRefObject<GameState> }) {
  const frost = useRef<THREE.Mesh>(null); const guns = useRef<THREE.Group>(null); const beams = useRef<(THREE.Mesh | null)[]>([]);
  useFrame(() => {
    const s = stateRef.current; const mage = s.enemies.find(e => e.kind === 'abbot'); const gunner = s.enemies.find(e => e.kind === 'regent');
    if (frost.current && mage) {
      frost.current.visible = mage.hp > 0 && mage.aggro && mage.phase === 2;
      frost.current.position.set(mage.x, mage.y + 0.045, mage.z); frost.current.rotation.z = s.time * 0.16;
      (frost.current.material as THREE.MeshBasicMaterial).opacity = 0.26 + Math.sin(s.time * 2) * 0.06;
    }
    if (guns.current && gunner) {
      const shooting = gunner.hp > 0 && gunner.aggro && gunner.attackIndex % 3 === 0 && ['windup', 'attack'].includes(gunner.action);
      guns.current.visible = shooting; guns.current.position.set(gunner.x, gunner.y, gunner.z); guns.current.rotation.y = gunner.facing;
      const attack = enemyAttack(gunner);
      beams.current.forEach(beam => {
        if (!beam) return;
        beam.position.z = attack.range / 2; beam.scale.y = attack.range;
        const mat = beam.material as THREE.MeshBasicMaterial; mat.opacity = gunner.action === 'attack' ? 0.85 : 0.13;
        mat.color.set(gunner.action === 'attack' ? '#efd7ff' : '#f1c598');
      });
    }
  });
  return (
    <group name="character-signatures">
      <mesh ref={frost} visible={false} rotation={[-Math.PI / 2, 0, 0]}><ringGeometry args={[3.8, 4, 64]} /><meshBasicMaterial color="#b9eaff" transparent depthWrite={false} side={THREE.DoubleSide} blending={THREE.AdditiveBlending} /></mesh>
      <group ref={guns} visible={false}>{[-1, 1].map((side, i) => <mesh key={side} ref={el => { beams.current[i] = el; }} rotation={[Math.PI / 2, 0, 0]} position={[side * 0.4, 1.65, 2.8]}><cylinderGeometry args={[0.018, 0.018, 1, 6]} /><meshBasicMaterial transparent opacity={0.2} depthWrite={false} blending={THREE.AdditiveBlending} /></mesh>)}</group>
    </group>
  );
}
