'use client';

import { useFrame } from '@react-three/fiber';
import { useRef, type MutableRefObject } from 'react';
import * as THREE from 'three';
import type { GameState } from './types';

export function Katana() {
  return (
<group name="rain-katana">
    <mesh position={[0.025, 0.61, 0]} rotation={[0, 0, -0.045]} castShadow><boxGeometry args={[0.055, 1.12, 0.025]} /><meshStandardMaterial color="#dbeaf0" metalness={0.85} roughness={0.23} /></mesh>
    <mesh position={[0.05, 1.19, 0]} rotation={[0, 0, -0.15]}><coneGeometry args={[0.03, 0.15, 3]} /><meshStandardMaterial color="#eaf6ff" metalness={0.85} roughness={0.23} /></mesh>
    <mesh position={[0, 0.06, 0]}><cylinderGeometry args={[0.12, 0.12, 0.045, 12]} /><meshStandardMaterial color="#b69562" metalness={0.65} /></mesh>
    <mesh position={[0, -0.13, 0]}><cylinderGeometry args={[0.038, 0.038, 0.34, 8]} /><meshStandardMaterial color="#323849" /></mesh>
    {[-0.24, -0.17, -0.1, -0.03].map(y => <mesh key={y} position={[0, y, 0]}><torusGeometry args={[0.038, 0.009, 4, 8]} /><meshStandardMaterial color="#c7ad84" /></mesh>)}
  </group>
);
}

export function RainUmbrella({ iron = false }: { iron?: boolean }) {
  return (
<group name={iron ? 'iron-umbrella' : 'folded-umbrella'}>
    <mesh position={[0, 0.45, 0]}><cylinderGeometry args={[0.024, 0.024, 1.45, 8]} /><meshStandardMaterial color={iron ? '#afc8cf' : '#91877b'} metalness={0.6} /></mesh>
    <mesh position={[0, 0.58, 0]} castShadow><coneGeometry args={[iron ? 0.17 : 0.115, 1.03, 8]} /><meshStandardMaterial color={iron ? '#607b83' : '#b7a58d'} metalness={iron ? 0.65 : 0.25} roughness={0.4} /></mesh>
    {iron && Array.from({ length: 8 }, (_, i) => <mesh key={i} position={[Math.sin((i * Math.PI) / 4) * 0.1, 0.43, Math.cos((i * Math.PI) / 4) * 0.1]}><boxGeometry args={[0.022, 0.64, 0.022]} /><meshStandardMaterial color="#c7dddd" metalness={0.75} /></mesh>)}
  </group>
);
}

export default function WeaponView({ stateRef }: { stateRef: MutableRefObject<GameState> }) {
  const groups = useRef<(THREE.Group | null)[]>([]);
  useFrame(() => {
    const choice = ['umbrella', 'ironUmbrella', 'katana', 'graveSpear', 'reedDaggers', 'stoneMaul'].indexOf(stateRef.current.weapon);
    groups.current.forEach((g, i) => { if (g) g.visible = i === choice && stateRef.current.mode !== 'interlude'; });
  });
  return <group>{[<RainUmbrella key="folded" />, <RainUmbrella iron key="iron" />, <Katana key="blade" />, <group key="spear"><mesh position={[0, 0.9, 0]}><cylinderGeometry args={[0.035, 0.045, 2.8, 8]} /><meshStandardMaterial color="#8a7267" /></mesh><mesh position={[0, 2.3, 0]}><coneGeometry args={[0.1, 0.42, 5]} /><meshStandardMaterial color="#d0b3ff" metalness={0.6} /></mesh></group>, <group key="daggers">{[-1, 1].map(n => <mesh key={n} position={[n * 0.09, 0.24, 0]}><boxGeometry args={[0.04, 0.62, 0.035]} /><meshStandardMaterial color="#a4e7cf" metalness={0.6} /></mesh>)}</group>, <group key="maul"><mesh position={[0, 0.55, 0]}><cylinderGeometry args={[0.055, 0.065, 1.7, 8]} /><meshStandardMaterial color="#8b7669" /></mesh><mesh position={[0, 1.25, 0]}><boxGeometry args={[0.62, 0.48, 0.45]} /><meshStandardMaterial color="#e0c593" roughness={0.85} /></mesh></group>].map((weapon, i) => <group key={i} ref={el => { groups.current[i] = el; }} visible={i === 0}>{weapon}</group>)}</group>;
}

export function ShioriBloom({ stateRef, enemyId }: { stateRef: MutableRefObject<GameState>; enemyId: string }) {
  const petals = useRef<THREE.Group>(null);
  useFrame(() => {
    const e = stateRef.current.enemies.find(v => v.id === enemyId);
    if (!petals.current || !e) return;
    petals.current.visible = e.hp > 0 && e.phase === 2;
    petals.current.rotation.y = stateRef.current.time * 0.65;
    const attack = e.attackIndex % 3 === 2 && ['windup', 'attack', 'recover'].includes(e.action);
    petals.current.scale.setScalar(attack ? 1.7 : 0.8);
  });
  return <group ref={petals} position={[0, 0.25, 0]} visible={false}>{Array.from({ length: 8 }, (_, i) => <mesh key={i} position={[Math.sin((i * Math.PI) / 4) * 0.85, (i % 2) * 0.12, Math.cos((i * Math.PI) / 4) * 0.85]} scale={[0.065, 0.16, 0.065]} rotation={[0.5, i, 0.5]}><octahedronGeometry /><meshBasicMaterial color="#ffe3ce" transparent opacity={0.7} depthWrite={false} blending={THREE.AdditiveBlending} /></mesh>)}</group>;
}
