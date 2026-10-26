'use client';

import { useEffect, useMemo, useRef } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { ApartmentTextures, makeApartmentTextures } from './sceneTextures';

type Vec3 = [number, number, number];
export type ScenePose = { x: number; z: number; yaw: number };
export type RemainingSeatSceneProps = {
  chapter: 0 | 1 | 2;
  phase: 'title' | 'playing' | 'ending';
  paused: boolean;
  reducedMotion: boolean;
  interacted: string[];
  onFocus: (id: string | null) => void;
  onInteract: (id: string) => void;
  onPose?: (pose: ScenePose) => void;
  movement?: { forward: number; strafe: number; turn: number };
  qa?: boolean;
};

export const HOTSPOTS: { id: string; title: string; position: Vec3 }[] = [
  { id: 'letter', title: '未署名的家书', position: [0.2, 1.05, 3.8] },
  { id: 'table', title: '留着的位子', position: [0, 1, -0.6] },
  { id: 'clock', title: '停住的挂钟', position: [-4.7, 2, -1] },
  { id: 'desk', title: '仍亮着的屏幕', position: [-3.8, 1, -4.4] },
  { id: 'cradle', title: '空摇篮', position: [3.5, 0.8, -4] },
  { id: 'portrait', title: '旧合影', position: [4.7, 1.9, -1] },
  { id: 'door', title: '回家的门', position: [0, 1.4, -6.7] },
  { id: 'window', title: '雨里的窗', position: [-4.7, 1.6, 3] },
];

type SceneQa = {
  getPose: () => ScenePose;
  getStats: () => { calls: number; triangles: number; geometries: number; textures: number };
  lookAt: (id: string) => void;
  approach: (id: string) => void;
  teleport: (x: number, z: number, yaw?: number) => void;
};

declare global {
  interface Window { __remainingSeatScene?: SceneQa }
}

function Box({ position, scale, color, map, rotation, emissive, metalness = 0, roughness = 0.82 }: {
  position: Vec3; scale: Vec3; color?: string; map?: THREE.Texture; rotation?: Vec3;
  emissive?: string; metalness?: number; roughness?: number;
}) {
  return (
    <mesh position={position} scale={scale} rotation={rotation} castShadow receiveShadow>
      <boxGeometry />
      <meshStandardMaterial color={color ?? '#ffffff'} map={map} emissive={emissive} roughness={roughness} metalness={metalness} />
    </mesh>
  );
}

function Decal({ position, size, map, rotation = [0, 0, 0], emissive = false, opacity = 1 }: {
  position: Vec3; size: [number, number]; map: THREE.Texture; rotation?: Vec3; emissive?: boolean; opacity?: number;
}) {
  return (
    <mesh position={position} rotation={rotation}>
      <planeGeometry args={size} />
      {emissive
        ? <meshBasicMaterial map={map} transparent={opacity < 1} opacity={opacity} side={THREE.DoubleSide} />
        : <meshStandardMaterial map={map} transparent opacity={opacity} roughness={0.9} side={THREE.DoubleSide} />}
    </mesh>
  );
}

function Thread({ from, to }: { from: Vec3; to: Vec3 }) {
  const direction = useMemo(() => new THREE.Vector3(...to).sub(new THREE.Vector3(...from)), [from, to]);
  const quaternion = useMemo(() => new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.clone().normalize()), [direction]);
  return (
    <mesh position={new THREE.Vector3(...from).addScaledVector(direction, 0.5)} quaternion={quaternion}>
      <cylinderGeometry args={[0.009, 0.009, direction.length(), 5]} />
      <meshStandardMaterial color="#942c2b" roughness={0.8} />
    </mesh>
  );
}

function Chair({ position, rotation, wood, child = false, badge }: { position: Vec3; rotation: number; wood: THREE.Texture; child?: boolean; badge?: THREE.Texture }) {
  return (
    <group position={position} rotation={[0, rotation, 0]} scale={child ? [0.68, 0.88, 0.68] : [1, 1, 1]}>
      <Box position={[0, 0.49, 0]} scale={[0.64, 0.1, 0.64]} map={wood} />
      {[-0.26, 0.26].flatMap(x => [-0.26, 0.26].map(z => <Box key={`${x}-${z}`} position={[x, 0.25, z]} scale={[0.075, 0.5, 0.075]} map={wood} />))}
      {[-0.27, 0.27].map(x => <Box key={x} position={[x, 0.94, 0.27]} scale={[0.075, 0.95, 0.08]} map={wood} />)}
      <Box position={[0, 1.35, 0.27]} scale={[0.64, 0.11, 0.09]} map={wood} />
      <Box position={[0, 0.93, 0.27]} scale={[0.56, 0.09, 0.075]} map={wood} />
      {[-0.15, 0, 0.15].map(x => <Box key={x} position={[x, 1.13, 0.27]} scale={[0.037, 0.4, 0.05]} map={wood} />)}
      <Box position={[0, 0.2, 0.27]} scale={[0.55, 0.04, 0.05]} map={wood} />
      {badge && (
        <>
          <Decal position={[0, 1.1, 0.322]} size={[0.2, 0.29]} map={badge} />
          <Decal position={[0, 1.1, 0.218]} size={[0.2, 0.29]} map={badge} rotation={[0, Math.PI, 0]} />
          <Box position={[0, 1.285, 0.27]} scale={[0.055, 0.11, 0.065]} color="#34483d" />
        </>
      )}
    </group>
  );
}

function Bowl({ position }: { position: Vec3 }) {
  return (
    <group position={position}>
      <mesh castShadow rotation={[Math.PI, 0, 0]}>
        <sphereGeometry args={[0.17, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <meshStandardMaterial color="#b8c5ae" roughness={0.3} side={THREE.DoubleSide} />
      </mesh>
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.17, 0.012, 6, 24]} />
        <meshStandardMaterial color="#486776" roughness={0.4} />
      </mesh>
      <mesh position={[0, -0.025, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.14, 24]} />
        <meshStandardMaterial color="#302b21" roughness={0.15} />
      </mesh>
    </group>
  );
}

function DiningRoom({ textures, chapter, reducedMotion, interacted }: { textures: ApartmentTextures; chapter: number; reducedMotion: boolean; interacted: string[] }) {
  const tableRef = useRef<THREE.PointLight>(null);
  const ceilingHeight = [3.65, 3.33, 3.03][chapter];
  const pendantIntensity = [31, 23, 26][chapter];
  useFrame(({ clock }) => {
    if (tableRef.current) tableRef.current.intensity = pendantIntensity + (reducedMotion ? 0 : Math.sin(clock.elapsedTime * 0.7) * (chapter === 0 ? 1.2 : 0.7));
  });
  return (
    <group position={[0, 0, -0.6]}>
      <mesh position={[0, 0.92, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[1.33, 1.35, 0.12, 64]} />
        <meshStandardMaterial map={textures.wood} />
      </mesh>
      <mesh position={[0, 0.995, 0]} receiveShadow>
        <cylinderGeometry args={[1.36, 1.4, 0.05, 64]} />
        <meshStandardMaterial map={textures.cloth} color="#c0a39a" roughness={1} />
      </mesh>
      <mesh position={[0, 0.78, 0]}>
        <cylinderGeometry args={[1.4, 1.37, 0.4, 64, 1, true]} />
        <meshStandardMaterial map={textures.cloth} color="#9c746b" side={THREE.DoubleSide} roughness={1} />
      </mesh>
      {[-0.65, 0.65].flatMap(x => [-0.65, 0.65].map(z => <Box key={`${x}-${z}`} position={[x, 0.45, z]} scale={[0.12, 0.9, 0.12]} map={textures.wood} />))}
      {[0, 1, 2, 3, 4, 5].map(i => {
        const angle = (i * Math.PI) / 3;
        return (
          <group key={i}>
            {(i < 5 || chapter > 0) && <Chair position={[Math.sin(angle) * 1.93, 0, Math.cos(angle) * 1.93]} rotation={angle} wood={textures.wood} badge={chapter === 1 && !interacted.includes('table') ? textures.badge : undefined} />}
            <Bowl position={[Math.sin(angle) * 0.99, 1.17, Math.cos(angle) * 0.99]} />
            <Box position={[Math.sin(angle) * 0.93 + 0.23, 1.035, Math.cos(angle) * 0.93]} scale={[0.018, 0.018, 0.42]} color="#b0a078" rotation={[0, angle, 0]} />
            <Box position={[Math.sin(angle) * 0.93 + 0.27, 1.035, Math.cos(angle) * 0.93]} scale={[0.018, 0.018, 0.42]} color="#b0a078" rotation={[0, angle, 0]} />
          </group>
        );
      })}
      {chapter > 0 && <Chair position={[1.57, 0, 1.6]} rotation={0.8} wood={textures.wood} child />}
      <mesh position={[0, 1.055, 0]} receiveShadow>
        <cylinderGeometry args={[0.39, 0.34, 0.055, 32]} />
        <meshStandardMaterial color="#bdc3a7" roughness={0.4} />
      </mesh>
      {[0, 1, 2, 3, 4, 5].map(i => <mesh key={i} position={[Math.cos(i) * 0.18, 1.11, Math.sin(i) * 0.18]} scale={[0.13, 0.065, 0.1]} castShadow><sphereGeometry args={[1, 12, 8]} /><meshStandardMaterial color={i % 2 ? '#746640' : '#65563a'} roughness={1} /></mesh>)}
      <Box position={[0, chapter === 0 ? 3.19 : (ceilingHeight + 2.86) / 2, 0]} scale={[0.025, chapter === 0 ? 0.8 : ceilingHeight - 2.86, 0.025]} color="#292b24" />
      <mesh position={[0, 2.71, 0]} castShadow>
        <coneGeometry args={[0.53, 0.35, 48, 1, true]} />
        <meshStandardMaterial color="#748572" side={THREE.DoubleSide} roughness={0.4} metalness={0.35} />
      </mesh>
      <mesh position={[0, 2.59, 0]}>
        <sphereGeometry args={[0.095, 16, 12]} />
        <meshBasicMaterial color="#fff1bf" />
      </mesh>
      <pointLight ref={tableRef} position={[0, 2.5, 0]} color={['#ffcb82', '#b6c6bd', '#eaa16e'][chapter]} intensity={pendantIntensity} distance={11} decay={2} castShadow shadow-mapSize={[1024, 1024]} shadow-bias={-0.001} shadow-normalBias={0.025} />
      <Decal position={[0, 0.011, 0]} size={[4.8, 4.8]} map={textures.shadow} rotation={[-Math.PI / 2, 0, 0]} opacity={0.6} />
    </group>
  );
}

function WindowRain({ reducedMotion }: { reducedMotion: boolean }) {
  const rain = useRef<THREE.InstancedMesh>(null);
  const dropTransform = useMemo(() => new THREE.Object3D(), []);
  const drops = useMemo(() => Array.from({ length: 44 }, (_, i) => ({ x: -1.08 + ((i * 37) % 216) / 100, y: -0.89 + ((i * 29) % 180) / 100 })), []);
  useFrame((_, delta) => {
    if (!rain.current) return;
    drops.forEach((drop, i) => {
      if (!reducedMotion) drop.y -= Math.min(delta, 0.05) * (0.6 + (i % 5) * 0.17);
      if (drop.y < -0.89) drop.y = 0.89;
      dropTransform.position.set(drop.x, drop.y, 0.1);
      dropTransform.scale.set(0.006, 0.08 + (i % 5) * 0.025, 0.004);
      dropTransform.updateMatrix();
      rain.current?.setMatrixAt(i, dropTransform.matrix);
    });
    rain.current.instanceMatrix.needsUpdate = true;
  });
  return (
    <group position={[-4.89, 1.98, 2.8]} rotation={[0, Math.PI / 2, 0]}>
      <Box position={[0, 0, -0.025]} scale={[2.55, 2.05, 0.12]} color="#354d51" />
      <Box position={[0, 0, 0.06]} scale={[2.28, 1.81, 0.03]} color="#4b727b" emissive="#395c6e" roughness={0.2} />
      {[-0.81, 0, 0.81].map(x => <Box key={x} position={[x, -0.08, 0.083]} scale={[0.52, 1.08 + x * 0.3, 0.012]} color="#2b454e" />)}
      <instancedMesh ref={rain} args={[undefined, undefined, 44]} frustumCulled={false}>
        <boxGeometry />
        <meshBasicMaterial color="#91b8b7" transparent opacity={0.27} />
      </instancedMesh>
      {[-1.22, 0, 1.22].map(x => <Box key={x} position={[x, 0, 0.15]} scale={[0.07, 2.04, 0.1]} color="#78877a" />)}
      {[-0.97, 0.08, 0.97].map(y => <Box key={y} position={[0, y, 0.15]} scale={[2.5, 0.07, 0.1]} color="#78877a" />)}
      <Box position={[0, -1.04, 0.25]} scale={[2.86, 0.13, 0.46]} color="#7b8372" />
      <Box position={[0, 1.17, 0.2]} scale={[3.25, 0.045, 0.045]} color="#292c25" />
      {[-1, 1].map(side => Array.from({ length: 6 }, (_, i) => <mesh key={`${side}-${i}`} position={[side * (1.15 + i * 0.085), -0.2, 0.2]} castShadow><cylinderGeometry args={[0.08, 0.11, 2.53, 9, 1, true]} /><meshStandardMaterial color={i % 2 ? '#918d71' : '#777b65'} side={THREE.DoubleSide} roughness={1} /></mesh>))}
      <pointLight position={[0, 0.4, 0.65]} color="#83acbf" intensity={16} distance={10} decay={2} />
    </group>
  );
}

function Desk({ textures, chapter }: { textures: ApartmentTextures; chapter: number }) {
  return (
    <group position={[-3.85, 0, -4.55]}>
      <Box position={[0, 0.84, 0]} scale={[1.85, 0.11, 1.02]} map={textures.wood} />
      {[-0.78, 0.78].map(x => <Box key={x} position={[x, 0.4, 0]} scale={[0.11, 0.8, 0.8]} map={textures.wood} />)}
      <Box position={[0, 0.67, 0.34]} scale={[1.6, 0.22, 0.14]} map={textures.wood} />
      <Box position={[0, 0.68, 0.43]} scale={[0.18, 0.03, 0.04]} color="#afa17b" metalness={0.7} />
      <Box position={[-0.3, 1.29, -0.15]} scale={[0.74, 0.68, 0.67]} color="#8f9984" />
      <Box position={[-0.3, 1.28, 0.2]} scale={[0.62, 0.51, 0.06]} color="#3b4e45" />
      {chapter < 2 && <Decal position={[-0.3, 1.29, 0.237]} size={[0.53, 0.4]} map={textures.screen} emissive />}
      <Box position={[-0.3, 0.96, -0.1]} scale={[0.53, 0.14, 0.47]} color="#7b8574" />
      <Box position={[-0.25, 0.93, 0.34]} scale={[0.79, 0.08, 0.24]} color="#929580" rotation={[0.1, 0, 0]} />
      {Array.from({ length: 11 }, (_, i) => <Box key={i} position={[-0.57 + i * 0.061, 0.975, 0.34]} scale={[0.045, 0.015, 0.14]} color="#696f60" />)}
      <group position={[0.58, 0.95, 0.14]} rotation={[0, -0.3, 0]}>
        <Box position={[0, 0, 0]} scale={[0.34, 0.12, 0.31]} color="#253a35" />
        <mesh position={[0, 0.073, 0.03]} rotation={[-Math.PI / 2, 0, 0]}><torusGeometry args={[0.07, 0.017, 6, 18]} /><meshStandardMaterial color="#adad8a" /></mesh>
        <Box position={[0, 0.11, -0.07]} scale={[0.4, 0.07, 0.09]} color="#1d302d" />
      </group>
      <Decal position={[0.53, 0.905, -0.22]} size={[0.35, 0.4]} map={textures.paper} rotation={[-Math.PI / 2, 0, -0.2]} />
      {chapter > 0 && Array.from({ length: 6 }, (_, i) => <Box key={`salary-${i}`} position={[0.57 + Math.sin(i) * 0.025, 0.917 + i * 0.012, -0.28]} scale={[0.48, 0.01, 0.38]} color={i % 2 ? '#b4b7a0' : '#909d88'} rotation={[0, Math.sin(i) * 0.04, 0]} />)}
      {chapter > 0 && <Decal position={[0.57, 0.985, -0.28]} size={[0.46, 0.36]} map={textures.salary} rotation={[-Math.PI / 2, 0, 0.03]} />}
      <pointLight position={[-0.3, 1.4, 0.6]} color="#79b6a5" intensity={chapter < 2 ? 2.5 : 0} distance={3} />
      <Chair position={[0, 0, 1.05]} rotation={0.25} wood={textures.wood} />
      <Box position={[0.7, 0.36, -0.3]} scale={[0.35, 0.71, 0.49]} color="#858a75" />
    </group>
  );
}

function Cradle({ textures, chapter, interacted, reducedMotion }: { textures: ApartmentTextures; chapter: number; interacted: string[]; reducedMotion: boolean }) {
  const group = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    if (group.current) group.current.rotation.z = chapter > 0 && !reducedMotion && !interacted.includes('cradle') ? Math.sin(clock.elapsedTime * 1.2) * 0.024 : 0;
  });
  return (
    <group position={[3.5, 0, -4]}>
      <group ref={group}>
        <Box position={[0, 0.58, 0]} scale={[1.02, 0.09, 1.55]} map={textures.wood} />
        <Box position={[0, 0.65, 0]} scale={[0.91, 0.1, 1.44]} color="#aaa38b" />
        {[-0.49, 0.49].map(x => (
          <group key={x}>
          <Box position={[x, 1.14, 0]} scale={[0.06, 0.07, 1.62]} map={textures.wood} />
          {Array.from({ length: 8 }, (_, i) => <Box key={i} position={[x, 0.87, -0.7 + i * 0.2]} scale={[0.027, 0.53, 0.027]} map={textures.wood} />)}
          </group>
        ))}
        {[-0.76, 0.76].map(z => (
          <group key={z}>
          <Box position={[0, 1.16, z]} scale={[1.06, 0.08, 0.06]} map={textures.wood} />
          <Box position={[0, 0.25, z]} scale={[1.32, 0.1, 0.13]} map={textures.wood} rotation={[0, 0, 0.02]} />
          {[-0.48, 0.48].map(x => <Box key={x} position={[x, 0.72, z]} scale={[0.075, 1.08, 0.075]} map={textures.wood} />)}
          </group>
        ))}
        <Box position={[0, 0.725, -0.47]} scale={[0.58, 0.08, 0.32]} color="#c0b6a0" />
        {!interacted.includes('cradle') && [0, 1, 2, 3, 4].map(i => <Thread key={i} from={[-0.49, 1.19, -0.65 + i * 0.3]} to={[0.49, 1.19, 0.65 - i * 0.3]} />)}
      </group>
      <Decal position={[0, 0.012, 0]} size={[2.6, 3]} map={textures.shadow} rotation={[-Math.PI / 2, 0, 0]} opacity={0.5} />
    </group>
  );
}

function Apartment({ chapter, interacted, reducedMotion }: Pick<RemainingSeatSceneProps, 'chapter' | 'interacted' | 'reducedMotion'>) {
  const textures = useMemo(makeApartmentTextures, []);
  const atmosphereColor = ['#142021', '#12272d', '#241b1b'][chapter];
  useEffect(() => () => Object.values(textures).forEach(texture => texture.dispose()), [textures]);
  return (
    <>
      <color attach="background" args={[atmosphereColor]} />
      <fog attach="fog" args={[atmosphereColor, 8, 23]} />
      <ambientLight intensity={chapter === 0 ? 0.53 : 0.42} color={['#adb9a4', '#93a8b2', '#ae8c7b'][chapter]} />
      <hemisphereLight intensity={chapter === 0 ? 0.68 : 0.56} color={['#b0beb0', '#9ab3bd', '#a6a293'][chapter]} groundColor={['#536157', '#3b5055', '#4a3c37'][chapter]} />
      <Box position={[0, -0.1, 0]} scale={[10.15, 0.2, 14.15]} map={textures.floor} roughness={0.47} metalness={0.12} />
      <Box position={[0, [3.65, 3.33, 3.03][chapter], 0]} scale={[10.15, 0.15, 14.15]} map={textures.wall} color={chapter === 2 ? '#9a8e7c' : '#a5a690'} />
      {[-1, 1].map(side => (
        <group key={side}>
        <Box position={[side * 5.05, 2.39, 0]} scale={[0.15, 2.42, 14]} map={textures.wall} />
        <Box position={[side * 5.04, 0.6, 0]} scale={[0.17, 1.2, 14]} color="#719d87" map={textures.wall} />
        <Box position={[side * 4.94, 1.21, 0]} scale={[0.045, 0.045, 14]} color="#324b40" />
        <Box position={[side * 4.94, 0.09, 0]} scale={[0.045, 0.18, 14]} color="#354b40" />
        <Box position={[0, 2.39, side * 7.05]} scale={[10, 2.42, 0.15]} map={textures.wall} />
        <Box position={[0, 0.6, side * 7.04]} scale={[10, 1.2, 0.17]} color="#719d87" map={textures.wall} />
        <Box position={[0, 1.21, side * 6.94]} scale={[10, 0.045, 0.045]} color="#324b40" />
        <Box position={[0, 0.09, side * 6.94]} scale={[10, 0.18, 0.045]} color="#354b40" />
        </group>
      ))}
      <Box position={[0, 1.47, -6.91]} scale={[2.1, 3.02, 0.16]} color="#323e35" />
      <Box position={[0, 1.43, -6.78]} scale={[1.8, 2.84, 0.12]} map={textures.wood} color="#818c72" />
      {[0.58, 1.85].map(y => <Box key={y} position={[0, y, -6.705]} scale={[1.42, 0.82, 0.025]} map={textures.wood} color="#9b9f81" />)}
      <Decal position={[0, 1.91, -6.68]} size={[0.68, 0.68]} map={textures.doorSign} />
      <Box position={[0.68, 1.22, -6.65]} scale={[0.04, 0.24, 0.045]} color="#b2a16e" metalness={0.75} />
      <Box position={[1.4, 1.28, -6.91]} scale={[0.13, 0.17, 0.055]} color="#b7b9a1" />
      <Box position={[1.4, 1.29, -6.875]} scale={[0.065, 0.09, 0.015]} color="#858e77" />
      <Box position={[0, 0.035, -6.66]} scale={[1.75, 0.018, 0.2]} color={chapter === 2 ? '#d2b16d' : '#465954'} emissive={chapter === 2 ? '#685129' : '#24342e'} />
      <Box position={[0, 3.18, -6.88]} scale={[0.55, 0.24, 0.045]} color="#244545" />
      <Decal position={[0, 3.183, -6.85]} size={[0.43, 0.16]} map={textures.screen} />
      <WindowRain reducedMotion={reducedMotion} />
      <DiningRoom textures={textures} chapter={chapter} reducedMotion={reducedMotion} interacted={interacted} />
      {chapter === 2 && <pointLight position={[2.3, 2.1, -5.6]} color="#bc5545" intensity={5} distance={7} decay={2} />}
      <Desk textures={textures} chapter={chapter} />
      <Cradle textures={textures} chapter={chapter} interacted={interacted} reducedMotion={reducedMotion} />
      <group position={[4.91, 2.02, -1]} rotation={[0, -Math.PI / 2, 0]}>
        <Box position={[0, 0, 0]} scale={[1.32, 1.52, 0.12]} map={textures.wood} color="#8a8167" />
        <Box position={[0, 0, 0.07]} scale={[1.13, 1.32, 0.035]} color="#b1a581" />
        <Decal position={[0, 0, 0.095]} size={[1.02, 1.2]} map={textures.photograph} />
        {chapter === 2 && <Decal position={[0, -0.3, 0.102]} size={[0.55, 0.9]} map={textures.shadow} opacity={0.9} />}
        <Box position={[0, -1.11, 0.25]} scale={[1.8, 0.08, 0.58]} map={textures.wood} />
        {[-0.6, 0.6].map(x => <group key={x}><Box position={[x, -0.9, 0.21]} scale={[0.07, 0.38, 0.07]} color="#a33c2d" /><mesh position={[x, -0.69, 0.21]}><sphereGeometry args={[0.025, 8, 6]} /><meshBasicMaterial color="#ffbd70" /></mesh></group>)}
        <pointLight position={[0, -0.5, 0.5]} intensity={2.5} color="#df9870" distance={3.8} />
      </group>
      <group position={[-4.91, 2.05, -1]} rotation={[0, Math.PI / 2, 0]}>
        <Box position={[0, 0, 0]} scale={[0.65, 0.94, 0.12]} map={textures.wood} />
        <mesh position={[0, 0.1, 0.085]} rotation={[Math.PI / 2, 0, 0]}><cylinderGeometry args={[0.27, 0.27, 0.025, 40]} /><meshStandardMaterial color="#c6c2a3" /></mesh>
        {Array.from({ length: 12 }, (_, i) => <Box key={i} position={[Math.sin((i * Math.PI) / 6) * 0.218, 0.1 + Math.cos((i * Math.PI) / 6) * 0.218, 0.108]} scale={[0.012, 0.03, 0.006]} color="#3d4d40" rotation={[0, 0, (-i * Math.PI) / 6]} />)}
        <Box position={[-0.0085, 0.1745, 0.12]} scale={[0.018, 0.15, 0.01]} color="#263b30" rotation={[0, 0, 0.1134]} />
        <Box position={[-0.1, 0.121, 0.125]} scale={[0.012, 0.205, 0.01]} color="#263b30" rotation={[0, 0, 1.3614]} />
        <Box position={[0, -0.29, 0.08]} scale={[0.25, 0.16, 0.02]} color="#253b32" />
      </group>
      <group position={[-4.9, 1.8, -2.65]} rotation={[0, Math.PI / 2, 0]}>
        <Decal position={[0, 0, 0]} size={[0.64, 0.8]} map={textures.calendar} />
        <Box position={[0, 0.41, 0]} scale={[0.67, 0.035, 0.04]} color="#804a38" />
      </group>
      <group position={[0.2, 0, 3.8]}>
        <Box position={[0, 0.82, 0]} scale={[1.18, 0.08, 0.53]} map={textures.wood} />
        {[-0.49, 0.49].flatMap(x => [-0.19, 0.19].map(z => <Box key={`${x}-${z}`} position={[x, 0.4, z]} scale={[0.055, 0.8, 0.055]} map={textures.wood} />))}
        <Decal position={[0, 0.868, 0]} size={[0.48, 0.34]} map={textures.paper} rotation={[-Math.PI / 2, 0, 0.12]} />
        <Box position={[-0.36, 0.9, -0.06]} scale={[0.12, 0.08, 0.15]} color="#45645a" />
      </group>
      <Box position={[4.67, 0.9, 4.4]} scale={[0.53, 1.8, 2.4]} map={textures.wood} />
      {[0.38, 1, 1.58].map(y => <Box key={y} position={[4.37, y, 4.4]} scale={[0.06, 0.025, 2.3]} color="#9e946b" />)}
      {Array.from({ length: 12 }, (_, i) => <Box key={i} position={[4.34, 1.34, 3.48 + i * 0.13]} scale={[0.16, 0.41 + (i % 3) * 0.045, 0.09]} color={['#727d68', '#887952', '#7c4c3e'][i % 3]} />)}
      <group position={[3.1, 0, 5.7]}>
        <mesh position={[0, 0.25, 0]} castShadow><cylinderGeometry args={[0.25, 0.2, 0.5, 18]} /><meshStandardMaterial color="#675c46" roughness={1} /></mesh>
        {Array.from({ length: 5 }, (_, i) => <Box key={i} position={[Math.sin(i) * 0.13, 0.8, Math.cos(i) * 0.13]} scale={[0.02, 0.8, 0.02]} color="#666b47" rotation={[0.1 * i, 0, -0.1 * i]} />)}
      </group>
      <Box position={[-4.91, 3.28, -3.8]} scale={[0.08, 0.06, 6.3]} color="#343e31" />
      <Box position={[-4.91, 2.9, -6.87]} scale={[0.07, 0.76, 0.07]} color="#343e31" />
      {chapter > 0 && !interacted.includes('table') && <Thread from={[0.25, 0.04, 3.6]} to={[1.2, 0.04, 0.7]} />}
      {chapter === 2 && <Decal position={[3.9, 1.72, -6.94]} size={[1.8, 3.3]} map={textures.shadow} opacity={0.7} />}
    </>
  );
}

function isClear(x: number, z: number) {
  if (Math.abs(x) > 4.52 || z < -6.4 || z > 6.5) return false;
  if (x * x + (z + 0.6) * (z + 0.6) < 1.7 * 1.7) return false;
  if (x < -2.7 && z < -3.85 && z > -5.4) return false;
  if (x > 2.62 && x < 4.38 && z < -2.85 && z > -5.15) return false;
  if (Math.abs(x - 0.2) < 0.84 && Math.abs(z - 3.8) < 0.5) return false;
  if (x > 3.95 && z > 3 && z < 5.9) return false;
  return true;
}

function FirstPersonRig(props: RemainingSeatSceneProps) {
  const { chapter, phase, paused, reducedMotion, interacted, onFocus, onInteract, onPose, movement, qa } = props;
  const { camera, gl } = useThree();
  const latest = useRef(props);
  latest.current = { chapter, phase, paused, reducedMotion, interacted, onFocus, onInteract, onPose, movement, qa };
  const keys = useRef(new Set<string>());
  const externalInputBlocked = useRef(false);
  const view = useRef({ x: 0, z: 5.6, yaw: 0, pitch: 0, focus: null as string | null, report: 0, stride: 0 });
  const drag = useRef({ active: false, x: 0, y: 0, pointerId: -1 });
  const direction = useMemo(() => new THREE.Vector3(), []);
  const target = useMemo(() => new THREE.Vector3(), []);

  useEffect(() => {
    view.current.x = phase === 'title' ? 3.1 : 0;
    view.current.z = 5.6;
    view.current.yaw = phase === 'title' ? 0.38 : 0;
    view.current.pitch = phase === 'title' ? -0.05 : 0;
    keys.current.clear();
  }, [chapter, phase]);

  useEffect(() => {
    if (paused || phase !== 'playing') {
      keys.current.clear();
      externalInputBlocked.current = true;
      drag.current.active = false;
      view.current.focus = null;
      latest.current.onFocus(null);
      if (document.pointerLockElement === gl.domElement) document.exitPointerLock();
    }
  }, [gl, paused, phase]);

  useEffect(() => {
    const active = () => latest.current.phase === 'playing' && !latest.current.paused;
    const keyDown = (event: KeyboardEvent) => {
      if (!active() || event.ctrlKey || event.metaKey || event.altKey) return;
      const element = event.target as HTMLElement | null;
      if (element && /INPUT|TEXTAREA|SELECT/.test(element.tagName)) return;
      const key = event.code;
      if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'KeyE'].includes(key)) event.preventDefault();
      if (key === 'KeyE' && !event.repeat && view.current.focus) latest.current.onInteract(view.current.focus);
      keys.current.add(key);
    };
    const keyUp = (event: KeyboardEvent) => keys.current.delete(event.code);
    const clear = () => {
      keys.current.clear();
      drag.current.active = false;
      externalInputBlocked.current = true;
    };
    const down = (event: PointerEvent) => {
      if (!active() || event.button !== 0) return;
      drag.current = { active: true, x: event.clientX, y: event.clientY, pointerId: event.pointerId };
      if (event.pointerType === 'mouse' && document.pointerLockElement !== gl.domElement) {
        try {
          const promise = gl.domElement.requestPointerLock();
          if (promise) promise.catch(() => { /* Drag look remains available when pointer lock is denied. */ });
        } catch { /* Drag look remains available. */ }
      }
    };
    const move = (event: PointerEvent) => {
      if (!active()) return;
      const locked = document.pointerLockElement === gl.domElement;
      if (!locked && (!drag.current.active || event.pointerId !== drag.current.pointerId)) return;
      const dx = locked ? event.movementX : event.clientX - drag.current.x;
      const dy = locked ? event.movementY : event.clientY - drag.current.y;
      view.current.yaw -= dx * 0.0024;
      view.current.pitch = THREE.MathUtils.clamp(view.current.pitch - dy * 0.0022, -1.05, 0.85);
      drag.current.x = event.clientX;
      drag.current.y = event.clientY;
    };
    const up = (event: PointerEvent) => {
      if (event.pointerId === drag.current.pointerId) drag.current.active = false;
    };
    window.addEventListener('keydown', keyDown);
    window.addEventListener('keyup', keyUp);
    window.addEventListener('blur', clear);
    document.addEventListener('visibilitychange', clear);
    gl.domElement.addEventListener('pointerdown', down);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    return () => {
      window.removeEventListener('keydown', keyDown);
      window.removeEventListener('keyup', keyUp);
      window.removeEventListener('blur', clear);
      document.removeEventListener('visibilitychange', clear);
      gl.domElement.removeEventListener('pointerdown', down);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      if (document.pointerLockElement === gl.domElement) document.exitPointerLock();
    };
  }, [gl]);

  useEffect(() => {
    if (!qa) return undefined;
    const lookAt = (id: string) => {
      const hotspot = HOTSPOTS.find(item => item.id === id);
      if (!hotspot) return;
      const [x, y, z] = hotspot.position;
      const dx = x - view.current.x;
      const dz = z - view.current.z;
      view.current.yaw = Math.atan2(-dx, -dz);
      view.current.pitch = Math.atan2(y - 1.65, Math.hypot(dx, dz));
    };
    const api: SceneQa = {
      getPose: () => ({ x: view.current.x, z: view.current.z, yaw: view.current.yaw }),
      getStats: () => ({ calls: gl.info.render.calls, triangles: gl.info.render.triangles, geometries: gl.info.memory.geometries, textures: gl.info.memory.textures }),
      lookAt,
      approach: id => {
        const positions: Record<string, [number, number]> = { letter: [0.2, 5.5], table: [0, 1.55], clock: [-3.1, -1], desk: [-3.4, -2.9], cradle: [2, -3.7], portrait: [3.1, -1], door: [0, -5.1], window: [-3.2, 3] };
        const position = positions[id];
        if (position) [view.current.x, view.current.z] = position;
        lookAt(id);
      },
      teleport: (x, z, yaw = 0) => {
        if (!isClear(x, z)) return;
        Object.assign(view.current, { x, z, yaw, pitch: 0 });
      },
    };
    // The QA-only browser hook is never installed without an explicit test query.
    // eslint-disable-next-line no-underscore-dangle
    window.__remainingSeatScene = api;
    return () => {
      // eslint-disable-next-line no-underscore-dangle
      if (window.__remainingSeatScene === api) delete window.__remainingSeatScene;
    };
  }, [gl, qa]);

  useFrame((state, delta) => {
    const { current } = view;
    const settings = latest.current;
    const dt = Math.min(delta, 0.05);
    if (!settings.movement?.forward && !settings.movement?.strafe && !settings.movement?.turn) externalInputBlocked.current = false;
    if (settings.phase === 'playing' && !settings.paused) {
      const touch = externalInputBlocked.current ? undefined : settings.movement;
      const forward = Number(keys.current.has('KeyW')) - Number(keys.current.has('KeyS')) + (touch?.forward ?? 0);
      const strafe = Number(keys.current.has('KeyD')) - Number(keys.current.has('KeyA')) + (touch?.strafe ?? 0);
      const turn = Number(keys.current.has('ArrowLeft')) - Number(keys.current.has('ArrowRight')) + (touch?.turn ?? 0);
      current.yaw += turn * dt * 1.55;
      current.pitch = THREE.MathUtils.clamp(current.pitch + (Number(keys.current.has('ArrowUp')) - Number(keys.current.has('ArrowDown'))) * dt, -1.05, 0.85);
      const norm = Math.max(1, Math.hypot(forward, strafe));
      const speed = (dt * 2.1) / norm;
      const dx = (-Math.sin(current.yaw) * forward + Math.cos(current.yaw) * strafe) * speed;
      const dz = (-Math.cos(current.yaw) * forward - Math.sin(current.yaw) * strafe) * speed;
      if (isClear(current.x + dx, current.z)) current.x += dx;
      if (isClear(current.x, current.z + dz)) current.z += dz;
      if (forward || strafe) current.stride += dt * 9;
      camera.position.set(current.x, 1.65 + (settings.reducedMotion ? 0 : Math.sin(current.stride) * (forward || strafe ? 0.016 : 0)), current.z);
      camera.rotation.set(current.pitch, current.yaw, 0, 'YXZ');
      camera.getWorldDirection(direction);
      let focused: string | null = null;
      let best = -1;
      HOTSPOTS.forEach(hotspot => {
        target.set(...hotspot.position).sub(camera.position);
        const distance = target.length();
        const dot = target.normalize().dot(direction);
        if (distance < 2.65 && dot > 0.78 && dot > best) { best = dot; focused = hotspot.id; }
      });
      if (focused !== current.focus) { current.focus = focused; settings.onFocus(focused); }
    } else if (settings.phase === 'title') {
      const offset = settings.reducedMotion ? 0 : Math.sin(state.clock.elapsedTime * 0.12) * 0.07;
      camera.position.set(3.1 + offset, 1.83, 5.6);
      camera.lookAt(-0.1, 1.3, -1.3);
    } else if (settings.phase === 'ending') {
      camera.position.lerp(target.set(0, 1.65, -4.2), settings.reducedMotion ? 1 : dt * 0.35);
      camera.lookAt(0, 1.5, -6.7);
    }
    current.report += dt;
    if (current.report > 0.2) {
      current.report = 0;
      settings.onPose?.({ x: current.x, z: current.z, yaw: current.yaw });
    }
  });
  return null;
}

export default function RemainingSeatScene(props: RemainingSeatSceneProps) {
  const { chapter, phase, paused, reducedMotion, interacted, onFocus, onInteract, onPose, movement, qa } = props;
  return (
    <Canvas shadows dpr={[1, 1.5]} camera={{ position: [0, 1.65, 5.6], fov: 68, near: 0.07, far: 45 }} gl={{ antialias: true, powerPreference: 'high-performance', toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.24 }} style={{ width: '100%', height: '100%', touchAction: 'none' }}>
      <Apartment chapter={chapter} interacted={interacted} reducedMotion={reducedMotion} />
      <FirstPersonRig chapter={chapter} phase={phase} paused={paused} reducedMotion={reducedMotion} interacted={interacted} onFocus={onFocus} onInteract={onInteract} onPose={onPose} movement={movement} qa={qa} />
    </Canvas>
  );
}
