'use client';

import { useFrame, useThree } from '@react-three/fiber';
import { useMemo, useRef, type MutableRefObject } from 'react';
import * as THREE from 'three';
import type { GameState } from './types';
import { SKY_SURFACES } from './skyplain';

export const skyBlend = (z: number) => THREE.MathUtils.smoothstep(-z, 525, 590);

/** Atmosphere follows metres travelled, including walking backwards and lamp travel. */
export function SkyAtmosphere({ stateRef }: { stateRef: MutableRefObject<GameState> }) {
  const { scene } = useThree();
  const colors = useMemo(() => ({ rain: new THREE.Color('#334d5c'), dusk: new THREE.Color('#9d8d9e'), morning: new THREE.Color('#819e9b') }), []);
  useFrame(() => {
    const { z } = stateRef.current.player; const t = skyBlend(z);
    const abbey = THREE.MathUtils.smoothstep(-z, 735, 790);
    if (scene.background instanceof THREE.Color) scene.background.copy(colors.rain).lerp(colors.dusk, t).lerp(colors.morning, abbey);
    if (scene.fog instanceof THREE.Fog) {
      scene.fog.color.copy(colors.rain).lerp(colors.dusk, t).lerp(colors.morning, abbey);
      // Long-distance silhouettes become readable at the confluence, before arrival.
      const vista = THREE.MathUtils.smoothstep(-z, 420, 495);
      scene.fog.near = 48 + 62 * vista - 65 * abbey; scene.fog.far = 165 + 315 * vista - 220 * abbey;
    }
  });
  return null;
}

function Stone({ at, size, color }: { at: [number, number, number]; size: [number, number, number]; color: string }) {
  return <mesh position={at} castShadow receiveShadow><boxGeometry args={size} /><meshStandardMaterial color={color} roughness={0.82} /></mesh>;
}
function Lamp({ at }: { at: [number, number, number] }) {
  return <group position={at}><Stone at={[0, 0.9, 0]} size={[0.12, 1.8, 0.12]} color="#756d6a" /><mesh position={[0, 1.9, 0]}><octahedronGeometry args={[0.25]} /><meshStandardMaterial color="#ffe2a1" emissive="#ffbe66" emissiveIntensity={2} /></mesh><Stone at={[0, 2.2, 0]} size={[0.6, 0.08, 0.6]} color="#8b7964" /></group>;
}
function SaltSky({ stateRef }: { stateRef: MutableRefObject<GameState> }) {
  const sky = useRef<THREE.Mesh>(null);
  const dawn = useMemo(() => ({ nightTop: new THREE.Color('#676883'), nightLow: new THREE.Color('#d6b8ab'), top: new THREE.Color('#547b80'), low: new THREE.Color('#c9d7c0') }), []);
  const uniforms = useMemo(() => ({ opacity: { value: 0 }, zenith: { value: new THREE.Color('#676883') }, horizon: { value: new THREE.Color('#d6b8ab') } }), []);
  useFrame(({ camera }) => {
    uniforms.opacity.value = skyBlend(stateRef.current.player.z);
    const t = THREE.MathUtils.smoothstep(-stateRef.current.player.z, 735, 790);
    uniforms.zenith.value.copy(dawn.nightTop).lerp(dawn.top, t); uniforms.horizon.value.copy(dawn.nightLow).lerp(dawn.low, t);
    if (sky.current) { sky.current.position.copy(camera.position); sky.current.visible = uniforms.opacity.value > 0; }
  });
  return <mesh ref={sky} renderOrder={-100}><sphereGeometry args={[450, 24, 12]} /><shaderMaterial uniforms={uniforms} side={THREE.BackSide} depthWrite={false} transparent vertexShader="varying vec3 direction; void main(){direction=normalize(position);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}" fragmentShader="varying vec3 direction; uniform vec3 zenith; uniform vec3 horizon; uniform float opacity; void main(){float t=smoothstep(-0.12,0.65,direction.y);gl_FragColor=vec4(mix(horizon,zenith,t),opacity);}" /></mesh>;
}

function Foundations() {
  const platforms = SKY_SURFACES.filter(s => s.endY === undefined && !['sky-channel', 'sky-return-bridge', 'sky-pool-link'].includes(s.id));
  return (
<group name="sky-rock-foundations">
    {platforms.map(s => {
      const height = s.y + 11; const w = s.x2 - s.x1; const d = s.z2 - s.z1;
      return (
<group key={s.id} position={[(s.x1 + s.x2) / 2, (s.y - 13) / 2, (s.z1 + s.z2) / 2]}>
        <Stone at={[0, 0, 0]} size={[w - 0.4, height, d - 0.4]} color={s.id.includes('pool') ? '#b898a1' : '#a19c9c'} />
        {[-1, 1].map(side => <mesh key={side} position={[side * w * 0.34, -3.5, 0]} scale={[w * 0.32, height * 0.8, d * 0.51]} rotation={[0, 0.2 * side, 0]}><cylinderGeometry args={[0.7, 1, 1, 7]} /><meshStandardMaterial color={side === 1 ? '#9b9299' : '#b7a7a2'} roughness={1} /></mesh>)}
        <Stone at={[0, height / 2 - 1.4, 0]} size={[w, 0.45, d]} color="#d0bcb0" />
      </group>
);
    })}
    {Array.from({ length: 13 }, (_, i) => {
      const east = i % 2 === 0; const x = east ? 22 + (i % 3) * 20 : -193 - (i % 3) * 20;
      return <mesh key={i} position={[x, -4, -574 - i * 13]} scale={[18 + (i % 3) * 5, 28 + (i % 4) * 9, 22]} rotation={[0, i * 0.3, 0]}><sphereGeometry args={[1, 7, 5]} /><meshStandardMaterial color={east ? '#9c8e9c' : '#8b8796'} roughness={1} /></mesh>;
    })}
  </group>
);
}
function Prism({ at, id, stateRef }: { at: [number, number, number]; id: string; stateRef: MutableRefObject<GameState> }) {
  const mirror = useRef<THREE.Group>(null); const ray = useRef<THREE.Mesh>(null);
  useFrame(() => {
    const lit = stateRef.current.collected.includes(id);
    if (mirror.current) mirror.current.rotation.y = lit ? -0.4 : 0.65;
    if (ray.current) ray.current.visible = lit;
  });
  const end = new THREE.Vector3(-40, 65, -697).sub(new THREE.Vector3(...at));
  const rotation = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), end.clone().normalize());
  return <group position={at}><Stone at={[0, 0.65, 0]} size={[0.7, 1.3, 0.7]} color="#a49985" /><group ref={mirror} position={[0, 1.8, 0]}><mesh><torusGeometry args={[0.85, 0.09, 8, 32]} /><meshStandardMaterial color="#e7c78d" metalness={0.6} roughness={0.3} /></mesh><mesh rotation={[0.2, 0, 0]}><circleGeometry args={[0.8, 32]} /><meshStandardMaterial color={id.endsWith('rose') ? '#efb8bd' : '#c9e8f6'} side={THREE.DoubleSide} metalness={0.7} roughness={0.12} /></mesh></group><mesh ref={ray} position={end.clone().multiplyScalar(0.5)} quaternion={rotation} visible={false}><cylinderGeometry args={[0.06, 0.06, end.length(), 6]} /><meshBasicMaterial color="#ffe3ab" transparent opacity={0.32} depthWrite={false} /></mesh></group>;
}

export default function SkyplainView({ stateRef }: { stateRef: MutableRefObject<GameState> }) {
  const root = useRef<THREE.Group>(null);
  const ring = useRef<THREE.Group>(null); const lantern = useRef<THREE.Mesh>(null);
  useFrame(() => {
    const s = stateRef.current;
    if (root.current) root.current.visible = s.player.z < -385;
    if (ring.current) ring.current.rotation.z = Math.sin(s.time * 0.045) * 0.06;
    if (lantern.current) { lantern.current.visible = s.skyComplete; lantern.current.position.y = 44 + (Math.sin(s.time * 0.3) + 1) * 0.6; }
  });
  return (
<group name="skyplain-scenery" ref={root}>
    <SaltSky stateRef={stateRef} />
    <Foundations />
    {/* Continuous landmass below the raised route, rose shallows and pale salt rims. */}
    <mesh position={[-93, -10, -634]} scale={[109, 18, 110]}><sphereGeometry args={[1, 24, 8, 0, Math.PI * 2, 0, Math.PI / 2]} /><meshStandardMaterial color="#8a7d87" roughness={1} /></mesh>
    {Array.from({ length: 16 }, (_, i) => {
      const x = -169 + (i % 4) * 41; const z = -566 - Math.floor(i / 4) * 40;
      return <group key={i} position={[x, 9 + Math.floor(i / 4) * 2, z]}><mesh rotation={[-Math.PI / 2, 0, 0]} scale={[1.7, 1, 1]}><circleGeometry args={[13 + (i % 3), 24]} /><meshStandardMaterial color={i % 2 ? '#c8a4b4' : '#9d9bab'} metalness={0.5} roughness={0.22} /></mesh><mesh rotation={[-Math.PI / 2, 0, 0]} scale={[1.7, 1, 1]}><ringGeometry args={[13 + (i % 3), 14 + (i % 3), 24]} /><meshStandardMaterial color="#e4d0c6" /></mesh></group>;
    })}
    {/* Aqueduct piers give a physical explanation for every high bridge. */}
    {[-130, -119].map(x => <Stone key={x} at={[x, 2.5, -533]} size={[2, 11, 5]} color="#778b85" />)}
    {[-604, -618].map(z => { const top = 18 + ((-592 - z) * 14) / 38 - 1; return <Stone key={z} at={[-66, top / 2 - 3, z]} size={[5, top + 6, 2.5]} color="#a89999" />; })}
    {[-119, -105].map(x => <Stone key={x} at={[x, 12, -633]} size={[2, 27, 5]} color="#a89892" />)}
    {[[-125, 2, -533, 0], [-112, 19, -633, 0], [-66, 11, -610, Math.PI / 2]].map(([x, y, z, yaw], i) => <group key={i} position={[x, y, z]} rotation={[0, yaw, 0]}><mesh><torusGeometry args={[5.8, 0.5, 6, 24, Math.PI]} /><meshStandardMaterial color="#b9aaa1" roughness={0.8} /></mesh><Stone at={[-5.8, -3, 0]} size={[1, 6, 1]} color="#a4948e" /><Stone at={[5.8, -3, 0]} size={[1, 6, 1]} color="#a4948e" /></group>)}
    {/* Quiet colonnades make the observatory a place rather than a flat arena. */}
    {[-60, -20].flatMap(x => [-663, -674, -685, -696].map(z => <group key={`${x}-${z}`} position={[x, 32, z]}><Stone at={[0, 6.2, 0]} size={[2.5, 12.4, 1.2]} color="#b8c8cc" /><Stone at={[0, 11.8, 0]} size={[3, 0.6, 2.2]} color="#e1d2b1" /><mesh position={[x === -60 ? 1.3 : -1.3, 7.7, 0]} rotation={[0, Math.PI / 2, 0]}><circleGeometry args={[0.7, 12]} /><meshStandardMaterial color="#d9bd8b" side={THREE.DoubleSide} /></mesh></group>))}
    {[-60, -20].map(x => <Stone key={x} at={[x, 44.8, -679]} size={[3.2, 0.6, 44]} color="#cfbd9c" />)}
    {/* Salt beds are below the playable surface, never fake walkable water. */}
    {Array.from({ length: 7 }, (_, i) => <Stone key={i} at={[-111 + i * 7, 18.015, -580]} size={[0.12, 0.025, 23]} color="#e6cfc2" />)}
    {[-588, -574].map(z => <Stone key={z} at={[-88, 18.02, z]} size={[44, 0.025, 0.14]} color="#ebd7bc" />)}
    {/* Wind-bent reeds mark the corridor without obstructing the traversable centre. */}
    {Array.from({ length: 36 }, (_, i) => <group key={i} position={[-112.6 - (i % 3) * 0.28, 10 + Math.floor(i / 3) * 0.6, -536 - Math.floor(i / 3) * 2.5]} rotation={[0.15, 0, -0.2]}><mesh position={[0, 1.1, 0]}><cylinderGeometry args={[0.018, 0.03, 2.2, 4]} /><meshStandardMaterial color="#a1a88c" /></mesh><mesh position={[0, 2.2, 0]}><capsuleGeometry args={[0.08, 0.5, 2, 5]} /><meshStandardMaterial color="#ded8b5" /></mesh></group>)}
    {[[-130, 8, -530.4], [-109, 17.9, -568.5], [-104, 18, -571], [-86, 18, -590], [-65, 18.5, -593.5], [-63, 25.4, -612], [-67, 32, -631], [-39, 32, -651], [-45, 40, -717]].map((at, i) => <Lamp key={i} at={at as [number, number, number]} />)}
    <Prism at={[-76, 18, -588]} id="sky-prism-rose" stateRef={stateRef} />
    <Prism at={[-22, 32, -646]} id="sky-prism-moon" stateRef={stateRef} />
    {/* The abandoned instrument foreshadows the monumental ring in miniature. */}
    <group position={[-148, 28.5, -627]} rotation={[0.3, 0.2, 0.35]}><mesh><torusGeometry args={[2, 0.16, 8, 40]} /><meshStandardMaterial color="#b89f7e" metalness={0.5} roughness={0.5} /></mesh><mesh rotation={[Math.PI / 2, 0, 0]}><torusGeometry args={[1.8, 0.1, 8, 32]} /><meshStandardMaterial color="#aebbc3" /></mesh></group>
    {/* Reachable observatory: the same ring seen above the river, with no backdrop copy. */}
    <group position={[-40, 64, -697]} ref={ring}>
      {[0, 1].map(i => <mesh key={i} rotation={[i * 0.42, i * 0.3, 0]}><torusGeometry args={[17 - i * 2.5, i ? 0.22 : 0.48, 10, 96]} /><meshStandardMaterial color={i ? '#c5d6dc' : '#e4c08a'} metalness={0.65} roughness={0.28} emissive="#d9aa66" emissiveIntensity={0.18} /></mesh>)}
      {Array.from({ length: 12 }, (_, i) => <mesh key={i} position={[Math.sin((i * Math.PI) / 6) * 17, Math.cos((i * Math.PI) / 6) * 17, 0]} rotation={[0, 0, -(i * Math.PI) / 6]}><boxGeometry args={[0.4, 1.8, 0.6]} /><meshStandardMaterial color="#fff2c9" emissive="#ffd993" emissiveIntensity={0.6} /></mesh>)}
      <mesh><octahedronGeometry args={[1.1]} /><meshStandardMaterial color="#e6f2ff" emissive="#b4e5ff" emissiveIntensity={1.3} /></mesh>
    </group>
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[-40, 32.025, -679]}><ringGeometry args={[9.7, 10, 64]} /><meshStandardMaterial color="#ddc9a1" /></mesh>
    {Array.from({ length: 12 }, (_, i) => <Stone key={i} at={[-40 + Math.sin((i * Math.PI) / 6) * 10, 32.03, -679 + Math.cos((i * Math.PI) / 6) * 10]} size={[0.35, 0.03, 0.8]} color="#f2d8ac" />)}
    <mesh ref={lantern} position={[-43, 44, -724]} visible={false}><octahedronGeometry args={[0.48]} /><meshStandardMaterial color="#fff0ae" emissive="#ffd37c" emissiveIntensity={2} /></mesh>
  </group>
);
}
