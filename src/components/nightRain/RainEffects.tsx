'use client';

import { useFrame } from '@react-three/fiber';
import { useMemo, useRef, type MutableRefObject } from 'react';
import * as THREE from 'three';
import type { GameState } from './types';

type StateRef = MutableRefObject<GameState>;
const seed = (n: number) => { const v = Math.sin(n * 127.1 + 311.7) * 43758.5453; return v - Math.floor(v); };

/** One instanced draw per shrine; guiding motes never add or remove lights. */
export function ShrineWisps({ stateRef, id }: { stateRef: StateRef; id: string }) {
  const motes = useRef<THREE.InstancedMesh>(null);
  const data = useMemo(() => ({ dummy: new THREE.Object3D(), offset: id.split('').reduce((n, c) => n + c.charCodeAt(0), 0) / 20 }), [id]);
  useFrame(() => {
    if (!motes.current) return;
    const s = stateRef.current; const lit = s.litLamps.includes(id);
    for (let i = 0; i < 24; i += 1) {
      const t = (s.time * 0.17 + i / 24 + data.offset) % 1;
      const angle = i * 2.4 + t * 5; const r = (1 - t) * (lit ? 0.4 : 1.25) + 0.15;
      data.dummy.position.set(Math.sin(angle) * r, 0.2 + t * (lit ? 2.1 : 3.2), Math.cos(angle) * r);
      data.dummy.scale.setScalar((lit ? 0.65 : 1) * Math.sin(t * Math.PI));
      data.dummy.updateMatrix(); motes.current.setMatrixAt(i, data.dummy.matrix);
    }
    motes.current.instanceMatrix.needsUpdate = true;
  });
  return <instancedMesh ref={motes} args={[undefined, undefined, 24]} frustumCulled={false}><sphereGeometry args={[0.055, 6, 4]} /><meshBasicMaterial color="#ffe5ab" transparent opacity={0.88} depthWrite={false} blending={THREE.AdditiveBlending} /></instancedMesh>;
}

/** Fixed pools of shards and flashes: no material or light creation at contact. */
export default function RainEffects({ stateRef }: { stateRef: StateRef }) {
  const shards = useRef<THREE.InstancedMesh | null>(null);
  const rings = useRef<(THREE.Mesh | null)[]>([]);
  const data = useMemo(() => ({ dummy: new THREE.Object3D(), velocity: new THREE.Vector3(), color: new THREE.Color(), up: new THREE.Vector3(0, 1, 0) }), []);
  useFrame(() => {
    if (!shards.current) return;
    const { effects } = stateRef.current; let count = 0;
    for (let slot = 0; slot < 30; slot += 1) {
      const fx = effects[slot]; const ring = rings.current[slot];
      if (ring) ring.visible = !!fx && ['parry', 'block'].includes(fx.kind);
      if (!fx) continue;
      const parry = fx.kind === 'parry'; const age = Math.max(0, (fx.kind === 'reward' ? 1.8 : 0.65) - fx.life);
      const fade = Math.min(1, fx.life / 0.22); const speed = parry ? 6 : 2.3;
      const color = parry ? '#ffce61' : fx.kind === 'block' ? '#89cff4' : fx.kind === 'heal' ? '#83e6b9' : fx.kind === 'hit' ? '#ff9e68' : '#eee0ad';
      data.color.set(color);
      if (ring) {
        ring.position.set(fx.x, fx.y + 1, fx.z); ring.rotation.set(0, stateRef.current.player.facing, 0);
        ring.scale.setScalar(0.15 + age * (parry ? 4.5 : 2));
        const mat = ring.material as THREE.MeshBasicMaterial; mat.color.copy(data.color); mat.opacity = Math.max(0, 0.85 - age * 3.4);
      }
      const amount = parry ? 28 : 8;
      for (let i = 0; i < amount; i += 1) {
        const angle = i * 2.399 + fx.id * 0.73; const spread = 0.3 + seed(i + fx.id) * 0.7;
        data.velocity.set(Math.sin(angle) * speed * spread, (seed(i * 3 + fx.id) - 0.15) * speed, Math.cos(angle) * speed * spread);
        data.dummy.position.set(fx.x + data.velocity.x * age, fx.y + 1 + data.velocity.y * age - 4.5 * age * age, fx.z + data.velocity.z * age);
        data.velocity.y -= 9 * age; data.dummy.quaternion.setFromUnitVectors(data.up, data.velocity.normalize());
        data.dummy.scale.set(0.018 * fade, (parry ? 0.3 : 0.12) * fade, 0.018 * fade);
        data.dummy.updateMatrix(); shards.current.setMatrixAt(count, data.dummy.matrix); shards.current.setColorAt(count, data.color); count += 1;
      }
    }
    shards.current.count = count; shards.current.instanceMatrix.needsUpdate = true;
    if (shards.current.instanceColor) shards.current.instanceColor.needsUpdate = true;
  });
  return (
<group>
    <instancedMesh ref={el => { shards.current = el; if (el && !el.instanceColor) el.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(840 * 3).fill(1), 3); }} args={[undefined, undefined, 840]} frustumCulled={false}><boxGeometry args={[1, 1, 1]} /><meshBasicMaterial transparent opacity={0.94} depthWrite={false} blending={THREE.AdditiveBlending} /></instancedMesh>
    {Array.from({ length: 30 }, (_, i) => <mesh key={i} ref={el => { rings.current[i] = el; }} visible={false}><ringGeometry args={[0.87, 1, 32]} /><meshBasicMaterial transparent opacity={0} side={THREE.DoubleSide} depthWrite={false} blending={THREE.AdditiveBlending} /></mesh>)}
  </group>
);
}
