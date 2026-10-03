'use client';

import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef, type MutableRefObject } from 'react';
import * as THREE from 'three';
import { samplePlayerAttack, weaponPoint, WEAPON_LENGTHS } from './playerMotion';
import { weaponAttack } from './weapons';
import type { GameState } from './types';

/** Sample the actual grip and shaft of the equipped weapon, in the player's facing frame. */
export default function CombatTrail({ stateRef }: { stateRef: MutableRefObject<GameState> }) {
  const mesh = useRef<THREE.Mesh>(null);
  const data = useMemo(() => {
    const positions = new Float32Array(18 * 6 * 3);
    const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    return { geometry, positions, v: new THREE.Vector3() };
  }, []);
  useEffect(() => () => data.geometry.dispose(), [data]);
  useFrame(() => {
    if (!mesh.current) return;
    const s = stateRef.current; const p = s.player; const spec = p.attack ? weaponAttack(s, p.attack) : null;
    mesh.current.visible = !!spec && p.actionTime >= spec.impact - 0.06 && p.actionTime <= spec.impact + spec.active + 0.09;
    if (!spec || !mesh.current.visible) return;
    const mat = mesh.current.material as THREE.MeshBasicMaterial; mat.color.set(spec.color);
    mat.opacity = 0.32 * Math.min(1, (spec.impact + spec.active + 0.09 - p.actionTime) / 0.09);
    const point = (t: number, radius: number) => {
      const pose = samplePlayerAttack(s, p.attack!, t);
      const [x, y, z] = weaponPoint(pose, radius);
      return [(Math.cos(p.facing) * x + Math.sin(p.facing) * z) * 1.05, y * 1.05 + p.jumpHeight, (-Math.sin(p.facing) * x + Math.cos(p.facing) * z) * 1.05];
    };
    let cursor = 0;
    const finish = Math.min(p.actionTime, spec.impact + spec.active); const start = Math.max(spec.impact - 0.07, finish - 0.075);
    for (let i = 0; i < 18; i += 1) {
      const a = start + (finish - start) * (i / 18); const b = start + (finish - start) * ((i + 1) / 18);
      const length = WEAPON_LENGTHS[s.weapon];
      const a0 = point(a, length * 0.7); const a1 = point(a, length); const b0 = point(b, length * 0.7); const b1 = point(b, length);
      for (const [x, y, z] of [a0, a1, b1, a0, b1, b0]) { data.positions[cursor++] = x; data.positions[cursor++] = y; data.positions[cursor++] = z; }
    }
    data.geometry.attributes.position.needsUpdate = true;
  });
  return <mesh ref={mesh} geometry={data.geometry} frustumCulled={false} visible={false}><meshBasicMaterial transparent opacity={0.55} side={THREE.DoubleSide} depthWrite={false} blending={THREE.AdditiveBlending} /></mesh>;
}
