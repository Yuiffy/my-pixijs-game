'use client';

import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef, type MutableRefObject } from 'react';
import * as THREE from 'three';
import { enemyMotion, enemyTell, enemyWeaponLength, ENEMY_STRIKE_TIME, ENEMY_CONTACT_TIME } from './enemyCombat';
import type { GameState } from './types';

type Props = { stateRef: MutableRefObject<GameState>; enemyId: string };

/** A dim loaded weapon, then one bright glint immediately before contact. No new lights. */
export function EnemyWeaponTell({ stateRef, enemyId }: Props) {
  const glow = useRef<THREE.Mesh>(null);
  const rays = useRef<THREE.Group>(null);
  const enemy = stateRef.current.enemies.find(e => e.id === enemyId)!;
  useFrame(() => {
    const e = stateRef.current.enemies.find(actor => actor.id === enemyId);
    if (!e || !glow.current || !rays.current) return;
    const tell = enemyTell(e);
    const showing = e.action === 'windup' || (e.action === 'attack' && !e.hitDone);
    glow.current.visible = showing; rays.current.visible = showing && (tell.parryNow || (tell.dangerous && tell.committed));
    const mat = glow.current.material as THREE.MeshBasicMaterial;
    mat.color.set(tell.dangerous ? '#ff7168' : tell.parryNow ? '#fff7cf' : '#dfa66a');
    mat.opacity = tell.parryNow || (tell.dangerous && tell.committed) ? 0.95 : 0.38;
    glow.current.scale.setScalar(tell.parryNow ? 1.7 : tell.committed ? 1.35 : 0.85);
    rays.current.scale.setScalar(tell.toImpact === null ? 1 : 1 + Math.max(0, 0.21 - tell.toImpact) * 2);
    for (const ray of rays.current.children) ((ray as THREE.Mesh).material as THREE.MeshBasicMaterial).color.set(tell.dangerous ? '#ff8a80' : '#ffe3b1');
  });
  return (
<group name="enemy-weapon-tell" position={[0, enemyWeaponLength(enemy), 0]}>
    <mesh ref={glow} visible={false}><octahedronGeometry args={[0.1]} /><meshBasicMaterial transparent opacity={0.4} depthWrite={false} blending={THREE.AdditiveBlending} /></mesh>
    <group ref={rays} visible={false}>{[0, Math.PI / 2].map(a => <mesh key={a} rotation={[0, a, Math.PI / 4]}><boxGeometry args={[0.035, 0.5, 0.035]} /><meshBasicMaterial color="#ffe3b1" transparent opacity={0.8} depthWrite={false} blending={THREE.AdditiveBlending} /></mesh>)}</group>
  </group>
);
}

/** Trace the actual shoulder, elbow and weapon joints; never spin a separate attack ring. */
export default function EnemyStrike({ stateRef, enemyId, size }: Props & { size: number }) {
  const mesh = useRef<THREE.Mesh>(null);
  const data = useMemo(() => {
    const positions = new Float32Array(12 * 6 * 3);
    const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    return { geometry, positions, matrix: new THREE.Matrix4(), joint: new THREE.Matrix4(), q: new THREE.Quaternion(), euler: new THREE.Euler(), v: new THREE.Vector3(), scale: new THREE.Vector3(size, size, size), unit: new THREE.Vector3(1, 1, 1), a: new THREE.Vector3(), b: new THREE.Vector3(), c: new THREE.Vector3(), d: new THREE.Vector3() };
  }, [size]);
  useEffect(() => () => data.geometry.dispose(), [data]);
  useFrame(() => {
    if (!mesh.current) return;
    const e = stateRef.current.enemies.find(actor => actor.id === enemyId);
    const elapsed = e ? ENEMY_STRIKE_TIME - e.timer : 0;
    mesh.current.visible = !!e && e.action === 'attack' && elapsed > 0 && elapsed < ENEMY_CONTACT_TIME + 0.2;
    if (!e || !mesh.current.visible) return;
    const mat = mesh.current.material as THREE.MeshBasicMaterial;
    mat.color.set(enemyTell(e).dangerous ? '#ff756b' : '#ffdca0');
    mat.opacity = 0.65 * Math.min(1, (ENEMY_CONTACT_TIME + 0.2 - elapsed) / 0.09);
    const length = enemyWeaponLength(e);
    const start = Math.max(0, elapsed - 0.09);
    let cursor = 0;
    for (let i = 0; i <= 12; i += 1) {
      const t = start + (elapsed - start) * (i / 12);
      const pose = enemyMotion({ ...e, action: 'attack', timer: ENEMY_STRIKE_TIME - t })!;
      data.q.setFromEuler(data.euler.set(pose.lean, e.facing + pose.twist, 0));
      data.matrix.compose(data.v.set(pose.side, pose.crouch, pose.advance), data.q, data.scale);
      data.q.setFromEuler(data.euler.set(pose.ax, pose.ay, pose.az));
      data.joint.compose(data.v.set(0.36, 1.24, 0), data.q, data.unit); data.matrix.multiply(data.joint);
      data.q.setFromEuler(data.euler.set(pose.elbow, 0, 0));
      data.joint.compose(data.v.set(0, -0.24, 0), data.q, data.unit); data.matrix.multiply(data.joint);
      data.q.setFromEuler(data.euler.set(pose.weaponPitch, 0, 0));
      data.joint.compose(data.v.set(0, -0.22, 0.07), data.q, data.unit); data.matrix.multiply(data.joint);
      data.c.set(0, length * 0.6, 0).applyMatrix4(data.matrix); data.d.set(0, length * 1.08, 0).applyMatrix4(data.matrix);
      if (i > 0) for (const vertex of [data.a, data.b, data.d, data.a, data.d, data.c]) { data.positions[cursor++] = vertex.x; data.positions[cursor++] = vertex.y; data.positions[cursor++] = vertex.z; }
      data.a.copy(data.c); data.b.copy(data.d);
    }
    data.geometry.attributes.position.needsUpdate = true;
  });
  return <mesh name="enemy-weapon-trail" ref={mesh} geometry={data.geometry} visible={false} frustumCulled={false}><meshBasicMaterial transparent opacity={0.65} side={THREE.DoubleSide} depthWrite={false} blending={THREE.AdditiveBlending} /></mesh>;
}
