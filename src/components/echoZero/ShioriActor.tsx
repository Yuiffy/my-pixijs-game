"use client";

/** Shiori — the voice on the radio. Authored low-poly companion, two staged apparitions. */

import { useFrame } from "@react-three/fiber";
import { useRef, type MutableRefObject } from "react";
import * as THREE from "three";
import type { GameState } from "./types";

const HAIR = '#eee0c1';
const COAT = '#f2ead9';
const TRIM = '#705438';
const SKIN = '#f4dccd';
const EYE = '#6a9fd9';

function Beret() {
  return (
    <group position={[0, 1.52, 0]}>
      <mesh rotation={[0.15, 0, -0.16]} castShadow>
        <cylinderGeometry args={[0.25, 0.235, 0.09, 16]} />
        <meshStandardMaterial color={TRIM} roughness={0.85} />
      </mesh>
      <mesh position={[0.01, 0.06, 0]}>
        <sphereGeometry args={[0.045, 10, 8]} />
        <meshStandardMaterial color="#fff8e8" />
      </mesh>
      <mesh position={[0.19, 0.01, 0.06]} rotation={[0, 0, 0.5]}>
        <boxGeometry args={[0.16, 0.09, 0.03]} />
        <meshStandardMaterial color="#fff8e8" />
      </mesh>
      <mesh position={[-0.19, 0.01, 0.06]} rotation={[0, 0, -0.5]}>
        <boxGeometry args={[0.16, 0.09, 0.03]} />
        <meshStandardMaterial color="#fff8e8" />
      </mesh>
    </group>
  );
}

function Otter() {
  return (
    <group position={[0.22, 0.87, 0.24]} scale={0.62}>
      <mesh castShadow>
        <capsuleGeometry args={[0.16, 0.2, 4, 10]} />
        <meshStandardMaterial color="#b99a7d" roughness={0.9} />
      </mesh>
      <mesh position={[0, 0.24, 0.03]}>
        <sphereGeometry args={[0.15, 12, 10]} />
        <meshStandardMaterial color="#f0e2ce" roughness={0.9} />
      </mesh>
      {[-1, 1].map(s => (
        <mesh key={s} position={[s * 0.13, 0.34, 0]}>
          <sphereGeometry args={[0.045, 8, 6]} />
          <meshStandardMaterial color="#b99a7d" />
        </mesh>
      ))}
      {[-1, 1].map(s => (
        <mesh key={`e${s}`} position={[s * 0.055, 0.25, 0.13]}>
          <sphereGeometry args={[0.018, 8, 6]} />
          <meshBasicMaterial color="#201a16" />
        </mesh>
      ))}
      <mesh position={[0, 0.2, 0.15]}>
        <sphereGeometry args={[0.025, 8, 6]} />
        <meshBasicMaterial color="#201a16" />
      </mesh>
      <mesh position={[0.1, -0.02, 0.12]} rotation={[0, 0, 0.4]}>
        <sphereGeometry args={[0.07, 10, 8]} />
        <meshStandardMaterial color="#ff9abb" roughness={0.7} />
      </mesh>
    </group>
  );
}

function Body({ ghost }: { ghost: boolean }) {
  const mat = (color: string, emissive = '#000000') => (
    <meshStandardMaterial
      color={color}
      emissive={emissive}
      emissiveIntensity={ghost ? 0.7 : 0}
      transparent={ghost}
      opacity={ghost ? 0.72 : 1}
      roughness={0.78}
    />
  );
  return (
    <group>
      {/* Legs */}
      {[-1, 1].map(s => (
        <group key={s} position={[s * 0.11, 0, 0]}>
          <mesh position={[0, 0.38, 0]} castShadow>
            <capsuleGeometry args={[0.075, 0.48, 3, 8]} />
            {mat('#3d3542')}
          </mesh>
          <mesh position={[0, 0.06, 0.045]} castShadow>
            <boxGeometry args={[0.15, 0.11, 0.25]} />
            {mat('#41302a')}
          </mesh>
        </group>
      ))}
      {/* Skirt + sailor top */}
      <mesh position={[0, 0.77, 0]} castShadow>
        <cylinderGeometry args={[0.2, 0.31, 0.36, 12]} />
        {mat(TRIM)}
      </mesh>
      <mesh position={[0, 1.08, 0]} castShadow>
        <capsuleGeometry args={[0.22, 0.24, 4, 12]} />
        {mat(COAT)}
      </mesh>
      <mesh position={[0, 1.13, 0.21]} rotation={[0.2, 0, 0]}>
        <boxGeometry args={[0.26, 0.14, 0.03]} />
        {mat('#e6d8c2')}
      </mesh>
      <mesh position={[0, 1.22, 0.19]}>
        <boxGeometry args={[0.1, 0.1, 0.04]} />
        {mat('#8b5a3c')}
      </mesh>
      {/* Arms */}
      {[-1, 1].map(s => (
        <group key={`a${s}`} position={[s * 0.27, 1.21, 0]} rotation={[0, 0, s * 0.18]}>
          <mesh position={[0, -0.22, 0]} castShadow>
            <capsuleGeometry args={[0.062, 0.34, 3, 8]} />
            {mat(COAT)}
          </mesh>
          <mesh position={[0, -0.46, 0.01]}>
            <sphereGeometry args={[0.065, 10, 8]} />
            {mat(SKIN)}
          </mesh>
        </group>
      ))}
      {/* Head */}
      <mesh position={[0, 1.43, 0]} castShadow>
        <sphereGeometry args={[0.2, 16, 14]} />
        {mat(SKIN)}
      </mesh>
      <mesh position={[0, 1.48, -0.03]} scale={[1.06, 0.94, 1.06]}>
        <sphereGeometry args={[0.21, 16, 14]} />
        {mat(HAIR)}
      </mesh>
      {[-1, 1].map(s => (
        <mesh key={`eye${s}`} position={[s * 0.075, 1.43, 0.184]}>
          <sphereGeometry args={[0.032, 10, 8]} />
          <meshBasicMaterial color={EYE} />
        </mesh>
      ))}
      {/* Side braid */}
      {[0, 1, 2, 3].map(k => (
        <mesh key={`braid${k}`} position={[0.21 + k * 0.012, 1.32 - k * 0.13, -0.02 - k * 0.01]} rotation={[0, 0, 0.16]}>
          <sphereGeometry args={[0.072 - k * 0.008, 10, 8]} />
          {mat(HAIR)}
        </mesh>
      ))}
      <Beret />
      <Otter />
    </group>
  );
}

export default function ShioriActor({
  stateRef, variant,
}: {
  stateRef: MutableRefObject<GameState>;
  variant: 'memory' | 'hologram';
}) {
  const root = useRef<THREE.Group>(null);
  const halo = useRef<THREE.Mesh>(null);
  useFrame(({ clock, camera }) => {
    const s = stateRef.current;
    if (!root.current) return;
    const time = clock.elapsedTime;
    const ghost = variant === 'hologram';
    const visible = ghost
      ? s.checkpoint.lit && s.phase !== 'title'
      : s.phase === 'opening' && s.time < 9.5;
    root.current.visible = visible;
    if (!visible) return;
    root.current.position.set(
      ghost ? 2.7 : -0.4,
      (ghost ? 0.06 : 0) + Math.sin(time * (ghost ? 1.8 : 1.1)) * (ghost ? 0.06 : 0.012),
      ghost ? -22.5 : 5.6,
    );
    root.current.rotation.y = ghost
      ? Math.atan2(camera.position.x - 2.7, camera.position.z + 22.5)
      : Math.PI * 0.92;
    if (ghost) root.current.scale.setScalar(0.94);
    if (halo.current) halo.current.rotation.z = time * 0.6;
  });
  return (
    <group ref={root}>
      <Body ghost={variant === 'hologram'} />
      {variant === 'hologram' && (
        <>
          <mesh ref={halo} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.03, 0]}>
            <ringGeometry args={[0.62, 0.68, 40]} />
            <meshBasicMaterial color="#7fe9ff" transparent opacity={0.7} side={THREE.DoubleSide} blending={THREE.AdditiveBlending} depthWrite={false} />
          </mesh>
          <pointLight position={[0, 1.2, 0]} color="#7fe9ff" intensity={3.2} distance={5} />
          <mesh position={[0, 1.1, 0]}>
            <cylinderGeometry args={[0.36, 0.36, 2.2, 16, 1, true]} />
            <meshBasicMaterial color="#7fe9ff" transparent opacity={0.045} side={THREE.DoubleSide} blending={THREE.AdditiveBlending} depthWrite={false} />
          </mesh>
        </>
      )}
    </group>
  );
}
