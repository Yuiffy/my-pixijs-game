"use client";

/** Rain, blade arcs, impact sparks and execution flashes. Everything is pooled: zero React re-renders. */

import { useFrame, useThree } from "@react-three/fiber";
import { useMemo, useRef, type MutableRefObject } from "react";
import * as THREE from "three";
import type { Effect, EffectKind, GameState } from "./types";
import { rng } from "./world";

const RAIN_COUNT = 1100;

function Rain() {
  const mesh = useRef<THREE.InstancedMesh>(null);
  const { camera } = useThree();
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const drops = useMemo(() => {
    const random = rng(20261114);
    return Array.from({ length: RAIN_COUNT }, () => ({
      x: (random() - 0.5) * 46,
      y: random() * 22,
      z: (random() - 0.5) * 52,
      speed: 15 + random() * 13,
      len: 0.35 + random() * 0.65,
    }));
  }, []);
  useFrame((_, dt) => {
    if (!mesh.current) return;
    const d = Math.min(0.05, dt);
    const cx = camera.position.x;
    const cz = camera.position.z;
    for (let i = 0; i < RAIN_COUNT; i += 1) {
      const p = drops[i];
      p.y -= p.speed * d;
      if (p.y < -0.4) { p.y = 18 + Math.random() * 5; }
      // Keep the rain volume centred on the camera without touching the system cursor.
      dummy.position.set(cx + p.x, p.y, cz + p.z);
      dummy.rotation.set(0.12, 0, 0.08);
      dummy.scale.set(0.012, p.len, 0.012);
      dummy.updateMatrix();
      mesh.current.setMatrixAt(i, dummy.matrix);
    }
    mesh.current.instanceMatrix.needsUpdate = true;
  });
  return (
    <instancedMesh ref={mesh} args={[undefined, undefined, RAIN_COUNT]} frustumCulled={false}>
      <boxGeometry args={[1, 1, 1]} />
      <meshBasicMaterial color="#9dc4d8" transparent opacity={0.3} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
    </instancedMesh>
  );
}

function arcGeometry() {
  const geo = new THREE.BufferGeometry();
  const positions: number[] = [];
  const segments = 20;
  for (let i = 0; i < segments; i += 1) {
    const a0 = -0.85 + (i / segments) * 1.7;
    const a1 = -0.85 + ((i + 1) / segments) * 1.7;
    const inner = 0.95;
    const outer = 1.32;
    positions.push(
      Math.sin(a0) * inner,
Math.cos(a0) * inner,
0,
Math.sin(a0) * outer,
Math.cos(a0) * outer,
0,
Math.sin(a1) * outer,
Math.cos(a1) * outer,
0,
Math.sin(a0) * inner,
Math.cos(a0) * inner,
0,
Math.sin(a1) * outer,
Math.cos(a1) * outer,
0,
Math.sin(a1) * inner,
Math.cos(a1) * inner,
0,
    );
  }
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  return geo;
}

const COLORS: Record<EffectKind, string> = {
  slash: '#9ff0ff',
heavySlash: '#d8f6ff',
spark: '#ffd37a',
deflect: '#fff0b0',
  deathblow: '#ff5470',
damage: '#ff495c',
heal: '#7fffc4',
checkpoint: '#7fe9ff',
  shockwave: '#ff405f',
dust: '#8b9aa8',
bossRoar: '#ff405f',
guardBreak: '#ffc95c',
};

type SlotMaterials = {
  arc: THREE.MeshBasicMaterial;
  ring: THREE.MeshBasicMaterial;
  burst: THREE.MeshBasicMaterial;
  pillar: THREE.MeshBasicMaterial;
};

function EffectSlot({ index, stateRef, arc }: { index: number; stateRef: MutableRefObject<GameState>; arc: THREE.BufferGeometry }) {
  const group = useRef<THREE.Group>(null);
  const arcMesh = useRef<THREE.Mesh>(null);
  const ring = useRef<THREE.Mesh>(null);
  const burst = useRef<THREE.Mesh>(null);
  const pillar = useRef<THREE.Mesh>(null);
  const color = useMemo(() => new THREE.Color(), []);
  const mats = useMemo<SlotMaterials>(() => ({
    arc: new THREE.MeshBasicMaterial({ color: '#9ff0ff', transparent: true, opacity: 0, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }),
    ring: new THREE.MeshBasicMaterial({ color: '#fff0b0', transparent: true, opacity: 0, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }),
    burst: new THREE.MeshBasicMaterial({ color: '#ffd37a', transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }),
    pillar: new THREE.MeshBasicMaterial({ color: '#ff5470', transparent: true, opacity: 0, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }),
  }), []);
  useFrame(({ camera }) => {
    const s = stateRef.current;
    const e: Effect | undefined = s.effects[index];
    const g = group.current;
    if (!g) return;
    if (!e) { g.visible = false; return; }
    g.visible = true;
    const age = Math.max(0, s.time - e.at);
    const k = Math.min(1, age / e.ttl);
    const alpha = (1 - k) ** 1.4;
    g.position.set(e.x, e.y, e.z);
    g.rotation.y = Math.PI - e.yaw;
    color.set(COLORS[e.kind]);
    const showArc = e.kind === 'slash' || e.kind === 'heavySlash';
    const showRing = ['deflect', 'guardBreak', 'checkpoint', 'heal', 'shockwave', 'bossRoar'].includes(e.kind);
    const showBurst = ['spark', 'damage', 'dust', 'deathblow'].includes(e.kind);
    const showPillar = e.kind === 'deathblow' || e.kind === 'bossRoar';
    if (arcMesh.current) {
      arcMesh.current.visible = showArc;
      if (showArc) {
        arcMesh.current.scale.setScalar((0.9 + k * 0.55) * e.power);
        arcMesh.current.rotation.z = -0.8 + k * 1.9;
        mats.arc.color.copy(color);
        mats.arc.opacity = alpha * 0.9;
      }
    }
    if (ring.current) {
      ring.current.visible = showRing;
      if (showRing) {
        const radius = e.kind === 'shockwave' ? e.power * (0.35 + k * 0.85) : 0.5 + k * (e.kind === 'bossRoar' ? 5 : 1.9) * e.power;
        ring.current.scale.setScalar(radius);
        ring.current.rotation.x = -Math.PI / 2;
        mats.ring.color.copy(color);
        mats.ring.opacity = alpha * (e.kind === 'shockwave' ? 0.55 : 0.9);
      }
    }
    if (burst.current) {
      burst.current.visible = showBurst;
      if (showBurst) {
        burst.current.scale.setScalar((0.16 + k * 0.85) * e.power);
        burst.current.quaternion.copy(camera.quaternion);
        mats.burst.color.copy(color);
        mats.burst.opacity = alpha * 0.85;
      }
    }
    if (pillar.current) {
      pillar.current.visible = showPillar;
      if (showPillar) {
        pillar.current.scale.set(0.7 + k * 2.2, 1, 0.7 + k * 2.2);
        mats.pillar.color.copy(color);
        mats.pillar.opacity = alpha * 0.32;
      }
    }
  });
  return (
    <group ref={group} visible={false}>
      <mesh ref={arcMesh} geometry={arc} material={mats.arc} position={[0, 0, 0]} />
      <mesh ref={ring} material={mats.ring} position={[0, 0.06, 0]}>
        <ringGeometry args={[0.86, 1, 40]} />
      </mesh>
      <mesh ref={burst} material={mats.burst}>
        <sphereGeometry args={[0.45, 10, 8]} />
      </mesh>
      <mesh ref={pillar} material={mats.pillar} position={[0, 1.2, 0]}>
        <cylinderGeometry args={[0.55, 0.9, 3.2, 16, 1, true]} />
      </mesh>
    </group>
  );
}

function LockReticle({ stateRef }: { stateRef: MutableRefObject<GameState> }) {
  const group = useRef<THREE.Group>(null);
  const mat = useMemo(() => new THREE.MeshBasicMaterial({
    color: '#ffe3a0',
transparent: true,
opacity: 0.9,
side: THREE.DoubleSide,
    depthTest: false,
blending: THREE.AdditiveBlending,
toneMapped: false,
  }), []);
  useFrame(({ camera, clock }) => {
    const s = stateRef.current;
    if (!group.current) return;
    const e = s.enemies.find(en => en.id === s.lockId && !en.dead && en.state !== 'deathblow');
    group.current.visible = !!e && s.phase === 'play';
    if (!e) return;
    group.current.position.set(e.x, e.kind === 'boss' ? 2.7 : 1.75, e.z);
    group.current.quaternion.copy(camera.quaternion);
    group.current.rotateZ(clock.elapsedTime * 0.45);
    const pulse = 1 + Math.sin(clock.elapsedTime * 4) * 0.06;
    group.current.scale.setScalar(pulse);
  });
  return (
    <group ref={group} visible={false}>
      <mesh material={mat}>
        <ringGeometry args={[0.19, 0.215, 4]} />
      </mesh>
      {[0, 1, 2, 3].map(k => (
        <mesh key={k} material={mat} rotation={[0, 0, (k * Math.PI) / 2]} position={[0, 0, 0]}>
          <planeGeometry args={[0.5, 0.012]} />
        </mesh>
      ))}
    </group>
  );
}

export default function Effects({ stateRef }: { stateRef: MutableRefObject<GameState> }) {
  const arc = useMemo(arcGeometry, []);
  return (
    <group name="echo-effects">
      <Rain />
      {Array.from({ length: 28 }, (_, i) => (
        <EffectSlot key={i} index={i} stateRef={stateRef} arc={arc} />
      ))}
      <LockReticle stateRef={stateRef} />
    </group>
  );
}
