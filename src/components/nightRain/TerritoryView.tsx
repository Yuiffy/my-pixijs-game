'use client';

import { useFrame } from '@react-three/fiber';
import { useRef, type MutableRefObject } from 'react';
import * as THREE from 'three';
import { REMOTE_LEVERS } from './overhaulWorld';
import { GuestWeapon } from './CharacterStyle';
import type { GameState } from './types';

function Lever({ id, stateRef }: { id: string; stateRef: MutableRefObject<GameState> }) {
  const wheel = useRef<THREE.Mesh>(null); const light = useRef<THREE.Mesh>(null);
  const p = REMOTE_LEVERS[id];
  useFrame(() => {
    const s = stateRef.current;
    const open = id === 'shortcut' ? s.shortcut : id === 'harbor-gate' ? s.harborGate : s.chapterGates.includes(id) || s.valleyGates.includes(id);
    if (wheel.current) wheel.current.rotation.z = open ? Math.PI / 3 : 0;
    if (light.current) (light.current.material as THREE.MeshBasicMaterial).color.set(open ? '#82dcb0' : '#ffcf75');
  });
  return (
<group position={[p.x, p.y, p.z]} name={`remote-lever-${id}`}>
    <mesh position={[0, 0.35, 0]}><boxGeometry args={[0.55, 0.7, 0.45]} /><meshStandardMaterial color="#6c7973" /></mesh>
    <mesh ref={wheel} position={[0, 0.9, 0.15]}><torusGeometry args={[0.35, 0.065, 6, 16]} /><meshStandardMaterial color="#c2a270" metalness={0.5} />
      {[0, Math.PI / 2].map(angle => <mesh key={angle} rotation={[0, 0, angle]}><boxGeometry args={[0.6, 0.06, 0.06]} /><meshStandardMaterial color="#c2a270" /></mesh>)}
    </mesh>
    <mesh ref={light} position={[0, 1.55, 0]}><octahedronGeometry args={[0.1]} /><meshBasicMaterial color="#ffcf75" /></mesh>
  </group>
);
}

export default function TerritoryView({ stateRef }: { stateRef: MutableRefObject<GameState> }) {
  return (
    <group name="character-territories">
      {Object.keys(REMOTE_LEVERS).map(id => <Lever key={id} id={id} stateRef={stateRef} />)}
      {/* Tall square windows, gold cornices and pick racks make the builder's court readable from the approach. */}
      {[-399.5, -407].map((z, i) => (
<group key={z} position={[-194.02, 2, z]}>
        <mesh position={[0, 1.7, 0]}><boxGeometry args={[0.06, 1.5, 2.2]} /><meshStandardMaterial color="#73bfd0" emissive="#4c8f98" emissiveIntensity={0.55} /></mesh>
        {[-1, 1].map(side => <mesh key={side} position={[-0.02, 1.7, side * 1.16]}><boxGeometry args={[0.1, 1.9, 0.16]} /><meshStandardMaterial color="#f1cf78" metalness={0.35} /></mesh>)}
        <mesh position={[0, i ? 3.5 : 2.7, 0]}><boxGeometry args={[0.25, 0.16, i ? 6 : 5]} /><meshStandardMaterial color="#efd387" metalness={0.4} /></mesh>
      </group>
))}
      {[-396, -409].map(z => <group key={z} position={[-213.8, 2, z]} rotation={[0, Math.PI / 2, 0]}><GuestWeapon kind="nana" /><group rotation={[0, 0, Math.PI / 4]}><GuestWeapon kind="nana" /></group></group>)}
      {/* Harei's welcome pines and badge stand sit outside the combat lane. */}
      {[-4, 12].map(x => <group key={x} position={[x, 0, -38]}><mesh position={[0, 0.4, 0]}><cylinderGeometry args={[0.08, 0.12, 0.8, 6]} /><meshStandardMaterial color="#82654b" /></mesh><mesh position={[0, 1.2, 0]}><coneGeometry args={[0.65, 1.5, 7]} /><meshStandardMaterial color="#759f65" /></mesh><mesh position={[0, 0.15, 0]}><boxGeometry args={[0.9, 0.3, 0.9]} /><meshStandardMaterial color="#a48964" /></mesh></group>)}
      {/* Workbench twin barrels, not the previous frog concert decoration. */}
      {[51, 60].map(x => <group key={x} position={[x, 3, -52.5]}><mesh position={[0, 0.5, 0]}><boxGeometry args={[1.5, 1, 0.8]} /><meshStandardMaterial color="#6e657c" /></mesh>{[-1, 1].map(side => <mesh key={side} position={[side * 0.35, 1.3, 0]}><boxGeometry args={[0.18, 0.8, 0.3]} /><meshStandardMaterial color="#dac7f4" metalness={0.6} /></mesh>)}</group>)}
      {/* The eastern court becomes Azi's listening garden. */}
      {[-103, -89].map(x => <group key={x} position={[x, 18, -423]}><mesh position={[0, 0.25, 0]}><boxGeometry args={[2.5, 0.5, 1.1]} /><meshStandardMaterial color="#b3a574" /></mesh><mesh position={[0, 1, 0]} scale={[1, 0.6, 0.8]}><sphereGeometry args={[0.4, 12, 8]} /><meshStandardMaterial color="#9cb465" /></mesh>{[-1, 1].map(side => <mesh key={side} position={[side * 0.23, 1.28, 0.1]}><sphereGeometry args={[0.14, 8, 6]} /><meshStandardMaterial color="#e0daa0" /></mesh>)}</group>)}
      {/* Warm paired lamps line the unobstructed main route through the new court. */}
      {[-390, -398, -412].flatMap(z => [-206, -199].map(x => <group key={`${x},${z}`} position={[x, 2, z]}><mesh position={[0, 0.7, 0]}><cylinderGeometry args={[0.035, 0.05, 1.4, 6]} /><meshStandardMaterial color="#b8a365" /></mesh><mesh position={[0, 1.45, 0]}><boxGeometry args={[0.25, 0.35, 0.25]} /><meshBasicMaterial color="#ffdb91" /></mesh></group>))}
    </group>
  );
}
