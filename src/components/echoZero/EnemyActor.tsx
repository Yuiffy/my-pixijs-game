"use client";

/** Infected bodies: one pooled rig per authored spawn, animated straight from the sim state. */

import { useFrame } from "@react-three/fiber";
import { useMemo, useRef, type MutableRefObject } from "react";
import * as THREE from "three";
import type { Enemy, GameState } from "./types";
import { SPAWNS } from "./world";

function makeMaterials() {
  return {
    cloth: new THREE.MeshStandardMaterial({ color: '#26313a', roughness: 0.95, transparent: true }),
    skin: new THREE.MeshStandardMaterial({ color: '#8d9a97', roughness: 0.9, transparent: true }),
    dark: new THREE.MeshStandardMaterial({ color: '#141a20', roughness: 0.85, transparent: true }),
    bone: new THREE.MeshStandardMaterial({ color: '#cfd6cf', roughness: 0.6, metalness: 0.25, transparent: true }),
    glow: new THREE.MeshBasicMaterial({ color: '#ff3a4e', transparent: true, toneMapped: false }),
    core: new THREE.MeshBasicMaterial({ color: '#ff4a5f', transparent: true, toneMapped: false }),
  };
}

type Mats = ReturnType<typeof makeMaterials>;

function Infected({ slot, stateRef }: { slot: number; stateRef: MutableRefObject<GameState> }) {
  const root = useRef<THREE.Group>(null);
  const body = useRef<THREE.Group>(null);
  const armL = useRef<THREE.Group>(null);
  const armR = useRef<THREE.Group>(null);
  const legL = useRef<THREE.Group>(null);
  const legR = useRef<THREE.Group>(null);
  const head = useRef<THREE.Group>(null);
  const tell = useRef<THREE.Mesh>(null);
  const bar = useRef<THREE.Group>(null);
  const fill = useRef<THREE.Mesh>(null);
  const rings = useRef<THREE.Group>(null);
  const deadSince = useRef<number | null>(null);
  const localTime = useRef(0);
  const mats = useMemo<Mats>(makeMaterials, []);
  const tellMat = useMemo(() => new THREE.MeshBasicMaterial({
    color: '#ff344e',
transparent: true,
opacity: 0,
side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
depthWrite: false,
toneMapped: false,
  }), []);
  const staggerMat = useMemo(() => new THREE.MeshBasicMaterial({
    color: '#ffc95c',
transparent: true,
opacity: 0,
side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
depthWrite: false,
toneMapped: false,
  }), []);

  useFrame(({ camera }, dt) => {
    const s = stateRef.current;
    const e: Enemy | undefined = s.enemies[slot];
    if (!root.current || !body.current) return;
    if (!e) { root.current.visible = false; return; }
    root.current.visible = true;
    const d = Math.min(0.05, dt);
    localTime.current += d;
    const t = localTime.current;
    const boss = e.kind === 'boss';
    const runner = e.kind === 'runner';
    const scale = boss ? 1.62 : runner ? 0.92 : 1;
    root.current.position.set(e.x, 0, e.z);
    root.current.rotation.y = Math.PI - e.yaw;
    root.current.scale.setScalar(scale);
    if (e.dead && deadSince.current === null) deadSince.current = s.time;
    if (!e.dead) deadSince.current = null;
    const fade = e.dead ? Math.max(0.04, 1 - (s.time - (deadSince.current ?? s.time)) / 1.8) : 1;
    Object.values(mats).forEach(m => { m.opacity = fade; });

    const walking = e.state === 'chase';
    const stride = walking ? Math.sin(t * (runner ? 12 : boss ? 6 : 7)) * (runner ? 0.62 : 0.42) : 0;
    if (legL.current) legL.current.rotation.x = stride;
    if (legR.current) legR.current.rotation.x = -stride;
    if (armL.current) armL.current.rotation.x = -stride * 0.7 - 0.24;
    if (armR.current) armR.current.rotation.x = stride * 0.7 - 0.24;
    body.current.rotation.set(0, 0, Math.sin(t * 3.2) * 0.035);
    body.current.position.y = Math.abs(Math.sin(t * (runner ? 12 : 7))) * (walking ? 0.035 : 0);
    if (head.current) head.current.rotation.set(runner ? 0.18 : 0.3, Math.sin(t * 1.6) * 0.12, 0);

    const telling = e.state === 'tell';
    const striking = e.state === 'strike';
    const staggered = e.state === 'stagger';
    if (telling) {
      const wind = Math.min(1, 1 - e.timer / 1.25);
      if (armR.current) armR.current.rotation.x = -0.5 - wind * 1.75;
      if (armL.current) armL.current.rotation.x = -0.5 - wind * 0.9;
      body.current.rotation.x = -wind * 0.24;
      if (head.current) head.current.rotation.x = -wind * 0.35;
    } else if (striking) {
      if (armR.current) armR.current.rotation.x = 1.15;
      if (armL.current) armL.current.rotation.x = 0.75;
      body.current.rotation.x = 0.45;
    } else if (staggered) {
      body.current.position.y = -0.42;
      body.current.rotation.x = 0.42;
      if (armL.current) armL.current.rotation.x = 0.5;
      if (armR.current) armR.current.rotation.x = 0.5;
      if (head.current) head.current.rotation.x = 0.55;
    }
    if (e.dead) {
      body.current.rotation.x = Math.min(1.45, body.current.rotation.x + d * 2.4);
      body.current.position.y = -0.35;
    }

    const { flash } = e;
    mats.glow.color.setRGB(1, 0.22 + flash * 0.7, 0.28 + flash * 0.7);
    mats.core.color.setRGB(1, 0.28 + flash * 0.6, 0.34 + flash * 0.6);
    mats.cloth.emissive.setRGB(flash * 0.55, flash * 0.1, flash * 0.12);
    mats.skin.emissive.setRGB(flash * 0.45, flash * 0.08, flash * 0.1);

    if (tell.current) {
      tell.current.visible = telling && !e.dead;
      tellMat.opacity = telling ? (0.34 + Math.sin(t * 22) * 0.16) : 0;
      const ringScale = e.attack === 'shockwave' ? 7.1 : e.attack === 'slam' ? 3.6 : 2.5;
      const shrink = telling ? 1 + (e.timer / 1.3) * 0.55 : 1;
      tell.current.scale.setScalar(ringScale * shrink);
      tell.current.rotation.z = t * 0.4;
    }
    if (bar.current && fill.current) {
      const show = !boss && e.active && !e.dead && (e.hp < e.maxHp || s.lockId === e.id);
      bar.current.visible = show;
      if (show) {
        bar.current.quaternion.copy(camera.quaternion);
        const ratio = Math.max(0, e.hp / e.maxHp);
        fill.current.scale.x = ratio;
        fill.current.position.x = -(1 - ratio) * 0.34;
      }
    }
    if (rings.current) {
      rings.current.visible = boss && !e.dead;
      rings.current.rotation.z = t * 0.7;
      rings.current.rotation.y = t * 0.35;
      staggerMat.opacity = staggered ? 0.85 : 0.28 + Math.sin(t * 3) * 0.08;
    }
  });

  return (
    <group ref={root}>
      <group ref={body}>
        {/* Torso and ragged coat */}
        <mesh position={[0, 1.12, 0]} castShadow material={mats.cloth}>
          <capsuleGeometry args={[0.29, 0.5, 4, 10]} />
        </mesh>
        <mesh position={[0, 0.78, 0]} castShadow material={mats.dark}>
          <cylinderGeometry args={[0.26, 0.38, 0.62, 9]} />
        </mesh>
        <mesh position={[0, 1.2, 0.27]} material={mats.core}>
          <sphereGeometry args={[0.085, 12, 10]} />
        </mesh>
        {slot === 4 && <pointLight position={[0, 1.2, 0.4]} color="#ff3a4e" intensity={5} distance={5} />}
        {/* Head */}
        <group ref={head} position={[0, 1.58, 0]}>
          <mesh castShadow material={mats.skin}>
            <sphereGeometry args={[0.19, 12, 10]} />
          </mesh>
          <mesh position={[0, 0.02, 0.02]} material={mats.bone}>
            <boxGeometry args={[0.3, 0.16, 0.13]} />
          </mesh>
          {[-1, 1].map(side => (
            <mesh key={side} position={[side * 0.075, 0.02, 0.175]} material={mats.glow}>
              <sphereGeometry args={[0.032, 8, 6]} />
            </mesh>
          ))}
          {[0, 1, 2].map(k => (
            <mesh key={k} position={[-0.14 + k * 0.14, 0.15, -0.05]} rotation={[0, 0, 0.3]} material={mats.dark}>
              <coneGeometry args={[0.055, 0.24, 5]} />
            </mesh>
          ))}
        </group>
        {/* Arms with claws */}
        <group ref={armL} position={[-0.34, 1.36, 0]}>
          <mesh position={[0, -0.3, 0]} castShadow material={mats.cloth}>
            <capsuleGeometry args={[0.085, 0.46, 3, 8]} />
          </mesh>
          <mesh position={[0, -0.62, 0.04]} material={mats.skin}>
            <sphereGeometry args={[0.09, 8, 6]} />
          </mesh>
          {[-1, 0, 1].map(k => (
            <mesh key={k} position={[k * 0.055, -0.76, 0.06]} rotation={[0.4, 0, 0]} material={mats.bone}>
              <coneGeometry args={[0.022, 0.22, 5]} />
            </mesh>
          ))}
        </group>
        <group ref={armR} position={[0.34, 1.36, 0]}>
          <mesh position={[0, -0.3, 0]} castShadow material={mats.cloth}>
            <capsuleGeometry args={[0.085, 0.46, 3, 8]} />
          </mesh>
          <mesh position={[0, -0.62, 0.04]} material={mats.skin}>
            <sphereGeometry args={[0.09, 8, 6]} />
          </mesh>
          {[-1, 0, 1].map(k => (
            <mesh key={k} position={[k * 0.055, -0.76, 0.06]} rotation={[0.4, 0, 0]} material={mats.bone}>
              <coneGeometry args={[0.022, 0.22, 5]} />
            </mesh>
          ))}
          <mesh position={[0.02, -0.72, 0.12]} material={mats.glow}>
            <boxGeometry args={[0.16, 0.025, 0.02]} />
          </mesh>
        </group>
        {/* Legs */}
        <group ref={legL} position={[-0.15, 0.68, 0]}>
          <mesh position={[0, -0.32, 0]} castShadow material={mats.dark}>
            <capsuleGeometry args={[0.09, 0.46, 3, 8]} />
          </mesh>
          <mesh position={[0, -0.62, 0.06]} material={mats.dark}>
            <boxGeometry args={[0.18, 0.1, 0.28]} />
          </mesh>
        </group>
        <group ref={legR} position={[0.15, 0.68, 0]}>
          <mesh position={[0, -0.32, 0]} castShadow material={mats.dark}>
            <capsuleGeometry args={[0.09, 0.46, 3, 8]} />
          </mesh>
          <mesh position={[0, -0.62, 0.06]} material={mats.dark}>
            <boxGeometry args={[0.18, 0.1, 0.28]} />
          </mesh>
        </group>
        {/* Boss echo halos */}
        <group ref={rings} position={[0, 1.3, -0.42]}>
          {[0, 1, 2].map(k => (
            <mesh key={k} rotation={[0.2 * k, 0.4 * k, 0.25 * k]}>
              <torusGeometry args={[0.52 + k * 0.16, 0.012, 6, 40]} />
              <meshBasicMaterial color="#ff5266" transparent opacity={0.55} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
            </mesh>
          ))}
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -1.28, 0]}>
            <ringGeometry args={[1.05, 1.14, 40]} />
            <primitive object={staggerMat} attach="material" />
          </mesh>
        </group>
      </group>
      <mesh ref={tell} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.03, 0]}>
        <ringGeometry args={[0.92, 1, 48]} />
        <primitive object={tellMat} attach="material" />
      </mesh>
      <group ref={bar} position={[0, 2.12, 0]}>
        <mesh>
          <planeGeometry args={[0.72, 0.065]} />
          <meshBasicMaterial color="#10151c" transparent opacity={0.85} depthTest={false} />
        </mesh>
        <mesh ref={fill} position={[0, 0, 0.002]}>
          <planeGeometry args={[0.68, 0.04]} />
          <meshBasicMaterial color="#ff4a5f" depthTest={false} />
        </mesh>
      </group>
    </group>
  );
}

export default function EnemyActors({ stateRef }: { stateRef: MutableRefObject<GameState> }) {
  return (
    <group name="echo-enemies">
      {SPAWNS.map((spawn, i) => (
        <Infected key={spawn.id} slot={i} stateRef={stateRef} />
      ))}
    </group>
  );
}
