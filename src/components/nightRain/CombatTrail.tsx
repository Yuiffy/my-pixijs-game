'use client';

import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef, type MutableRefObject } from 'react';
import * as THREE from 'three';
import { attackSpec, combatPose } from './combat';
import type { GameState } from './types';

/** Sample the same authored arm/body poses as Actor, not an unrelated spinning ring. */
export default function CombatTrail({ stateRef }: { stateRef: MutableRefObject<GameState> }) {
  const mesh = useRef<THREE.Mesh>(null);
  const data = useMemo(() => {
    const positions = new Float32Array(18 * 6 * 3);
    const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    return { geometry, positions, body: new THREE.Matrix4(), arm: new THREE.Matrix4(), q: new THREE.Quaternion(), e: new THREE.Euler(), v: new THREE.Vector3(), scale: new THREE.Vector3(1.05, 1.05, 1.05) };
  }, []);
  useEffect(() => () => data.geometry.dispose(), [data]);
  useFrame(() => {
    if (!mesh.current) return;
    const p = stateRef.current.player; const spec = attackSpec(p);
    mesh.current.visible = !!spec && p.actionTime >= spec.impact - 0.06 && p.actionTime <= spec.impact + spec.active + 0.09;
    if (!spec || !mesh.current.visible) return;
    const mat = mesh.current.material as THREE.MeshBasicMaterial; mat.color.set(spec.color);
    mat.opacity = 0.32 * Math.min(1, (spec.impact + spec.active + 0.09 - p.actionTime) / 0.09);
    const point = (t: number, radius: number) => {
      const pose = combatPose({ ...p, actionTime: t })!;
      data.q.setFromEuler(data.e.set(pose.lean, p.facing + pose.twist, 0));
      data.body.compose(data.v.set(0, p.jumpHeight + pose.crouch, 0), data.q, data.scale);
      data.q.setFromEuler(data.e.set(pose.ax, pose.ay, pose.az));
      data.arm.compose(data.v.set(0.36, 1.24, 0), data.q, new THREE.Vector3(1, 1, 1));
      return new THREE.Vector3(0, -0.46, 0.07 + radius).applyMatrix4(data.arm).applyMatrix4(data.body);
    };
    let cursor = 0;
    const finish = Math.min(p.actionTime, spec.impact + spec.active); const start = Math.max(spec.impact - 0.07, finish - 0.075);
    for (let i = 0; i < 18; i += 1) {
      const a = start + (finish - start) * (i / 18); const b = start + (finish - start) * ((i + 1) / 18);
      const a0 = point(a, 0.93); const a1 = point(a, 1.25); const b0 = point(b, 0.93); const b1 = point(b, 1.25);
      for (const v of [a0, a1, b1, a0, b1, b0]) { data.positions[cursor++] = v.x; data.positions[cursor++] = v.y; data.positions[cursor++] = v.z; }
    }
    data.geometry.attributes.position.needsUpdate = true;
  });
  return <mesh ref={mesh} geometry={data.geometry} frustumCulled={false} visible={false}><meshBasicMaterial transparent opacity={0.55} side={THREE.DoubleSide} depthWrite={false} blending={THREE.AdditiveBlending} /></mesh>;
}
