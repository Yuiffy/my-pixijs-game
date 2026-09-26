import { useRef, type MutableRefObject } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { GameState } from './types';
import type { Companion } from './companion';

function Face({ otter = false }: { otter?: boolean }) {
  return (
    <group position={[0, 0, 0.21]}>
      {[-1, 1].map(side => (
        <group key={side}>
          <mesh position={[side * 0.115, 0.085, 0]} scale={[1, 1.3, 0.55]}><sphereGeometry args={[0.056, 12, 10]} /><meshStandardMaterial color={otter ? '#372f49' : '#5d3525'} /></mesh>
          <mesh position={[side * 0.102, 0.105, 0.029]}><sphereGeometry args={[0.018, 8, 8]} /><meshBasicMaterial color="#fff8db" /></mesh>
          <mesh position={[side * 0.2, -0.015, -0.012]} scale={[1.4, 0.6, 0.35]}><sphereGeometry args={[0.055, 12, 8]} /><meshStandardMaterial color="#f39399" /></mesh>
        </group>
      ))}
      <mesh position={[0, -0.03, 0.035]}><sphereGeometry args={[0.036, 12, 8]} /><meshStandardMaterial color="#75404e" /></mesh>
    </group>
  );
}
export default function CompanionView({ stateRef, companionRef }: { stateRef: MutableRefObject<GameState>; companionRef: MutableRefObject<Companion> }) {
  const root = useRef<THREE.Group>(null); const cookie = useRef<THREE.Group>(null); const otter = useRef<THREE.Group>(null);
  const ring = useRef<THREE.Mesh>(null);
  useFrame(({ camera }) => {
    const c = companionRef.current; const s = stateRef.current;
    if (!root.current) return;
    root.current.visible = c.enabled;
    root.current.position.set(c.position.x, c.position.y + 1.7 + Math.sin(s.time * 2.5) * 0.12, c.position.z);
    root.current.rotation.y = Math.atan2(camera.position.x - c.position.x, camera.position.z - c.position.z);
    if (cookie.current) cookie.current.visible = c.skin === 'biscuit';
    if (otter.current) otter.current.visible = c.skin === 'otter';
    if (ring.current) { ring.current.rotation.z = s.time * 0.5; ring.current.scale.setScalar(c.targetId ? 1.2 : 1); }
  });
  return (
    <group ref={root} name="travel-companion">
      <group ref={cookie}>
        <mesh rotation={[Math.PI / 2, 0, 0]} castShadow><cylinderGeometry args={[0.36, 0.36, 0.18, 16]} /><meshStandardMaterial color="#d89554" roughness={0.92} /></mesh>
        <mesh position={[0, 0, 0.095]} rotation={[Math.PI / 2, 0, 0]}><cylinderGeometry args={[0.31, 0.31, 0.035, 16]} /><meshStandardMaterial color="#f2c37e" /></mesh>
        {[-1, 1].map(side => <mesh key={side} position={[side * 0.22, 0.31, 0]} rotation={[0, 0, side * -0.3]}><coneGeometry args={[0.13, 0.27, 3]} /><meshStandardMaterial color="#6f4d43" /></mesh>)}
        <Face />
        {[-1, 1].map(side => <mesh key={side} position={[side * 0.39, -0.07, 0]} rotation={[0, 0, side * -0.6]} scale={[0.6, 1, 0.6]}><sphereGeometry args={[0.13, 10, 8]} /><meshStandardMaterial color="#efbc78" /></mesh>)}
        <mesh position={[0, -0.31, 0.03]} rotation={[0, 0, Math.PI]}><coneGeometry args={[0.17, 0.25, 3]} /><meshStandardMaterial color="#b55969" side={THREE.DoubleSide} /></mesh>
      </group>
      <group ref={otter} visible={false}>
        <mesh scale={[0.85, 1.1, 0.65]} castShadow><sphereGeometry args={[0.34, 16, 12]} /><meshStandardMaterial color="#94718d" /></mesh>
        <mesh position={[0, 0, 0.12]} scale={[0.8, 0.88, 0.45]}><sphereGeometry args={[0.29, 16, 12]} /><meshStandardMaterial color="#f2dace" /></mesh>
        {[-1, 1].map(side => <mesh key={side} position={[side * 0.25, 0.25, 0]}><sphereGeometry args={[0.115, 12, 8]} /><meshStandardMaterial color="#94718d" /></mesh>)}
        <Face otter />
        <mesh position={[0, -0.38, -0.08]} rotation={[0.65, 0, 0]} scale={[0.55, 1.4, 0.5]}><sphereGeometry args={[0.18, 12, 8]} /><meshStandardMaterial color="#94718d" /></mesh>
        <mesh position={[0, -0.22, 0.2]} rotation={[0, 0, -0.3]}><octahedronGeometry args={[0.13]} /><meshStandardMaterial color="#79c6ba" emissive="#408779" emissiveIntensity={0.5} /></mesh>
      </group>
      <mesh ref={ring} position={[0, 0.56, 0]} rotation={[Math.PI / 2, 0, 0]}><torusGeometry args={[0.25, 0.017, 8, 32]} /><meshBasicMaterial color="#ffe3a4" /></mesh>
      {[-1, 1].map(side => <mesh key={side} position={[side * 0.47, 0.12, -0.08]} rotation={[0, 0, side * -0.5]} scale={[1.5, 0.6, 0.16]}><sphereGeometry args={[0.2, 12, 8]} /><meshStandardMaterial color="#fff4dc" transparent opacity={0.75} emissive="#e6b75f" emissiveIntensity={0.4} /></mesh>)}
      <pointLight color="#ffdf9c" intensity={1.3} distance={3} />
    </group>
  );
}
