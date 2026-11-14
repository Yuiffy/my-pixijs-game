"use client";

/** R3F canvas: lighting, camera rig, asset loading and scene assembly. */

import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { memo, useEffect, useMemo, useRef, useState, type MutableRefObject } from "react";
import * as THREE from "three";
// Three's ESM export paths require the .js suffix.
// eslint-disable-next-line import/extensions
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
// eslint-disable-next-line import/extensions
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import City from "./City";
import Effects from "./Effects";
import EnemyActors from "./EnemyActor";
import ShioriActor from "./ShioriActor";
import SuiActor from "./SuiActor";
import type { GameState } from "./types";

type Props = {
  stateRef: MutableRefObject<GameState>;
  onReady: () => void;
  onError: (message: string) => void;
};

type Pose = { pos: [number, number, number]; look: [number, number, number] };
// The station canopy sits at y≈5.1 over z∈[8.5, 23.5]. Every keyframe stays
// underneath it (or past its north edge) so the boulevard, the character and
// the neon signs stay in frame instead of a flat roof.
const KEYS: { t: number; pose: Pose }[] = [
  { t: 0, pose: { pos: [-2.9, 2.9, 22.9], look: [0, 1.45, 12] } },
  { t: 3.4, pose: { pos: [3.5, 2.35, 21.7], look: [-0.2, 1.35, 11] } },
  { t: 6.8, pose: { pos: [2.3, 1.95, 20.5], look: [0.3, 1.45, 8.5] } },
  { t: 9.8, pose: { pos: [-2.2, 1.85, 20.6], look: [-0.2, 1.4, 9.5] } },
  { t: 12.8, pose: { pos: [0, 3.1, 24.2], look: [0, 1.35, 14] } },
];

function cinematicPose(t: number): Pose {
  const time = Math.max(0, Math.min(12.8, t));
  for (let i = 1; i < KEYS.length; i += 1) {
    if (time <= KEYS[i].t) {
      const a = KEYS[i - 1];
      const b = KEYS[i];
      const raw = (time - a.t) / (b.t - a.t);
      const k = raw * raw * (3 - 2 * raw);
      const mix = (u: number, v: number) => u + (v - u) * k;
      return {
        pos: [0, 1, 2].map(j => mix(a.pose.pos[j], b.pose.pos[j])) as [number, number, number],
        look: [0, 1, 2].map(j => mix(a.pose.look[j], b.pose.look[j])) as [number, number, number],
      };
    }
  }
  return KEYS[KEYS.length - 1].pose;
}

function CameraRig({ stateRef }: { stateRef: MutableRefObject<GameState> }) {
  const { camera } = useThree();
  const target = useRef(new THREE.Vector3(0, 1.35, 16));
  const position = useRef(new THREE.Vector3(0, 3.2, 24.8));
  const blend = useRef(1);
  const scratch = useMemo(() => ({
    follow: { pos: new THREE.Vector3(), look: new THREE.Vector3() },
    cinePos: new THREE.Vector3(),
cineLook: new THREE.Vector3(),
  }), []);
  useFrame((_, dt) => {
    const s = stateRef.current;
    const p = s.player;
    const c = s.camera;
    const d = Math.min(0.05, dt);
    const cp = Math.cos(c.pitch);
    const sp = Math.sin(c.pitch);
    scratch.follow.pos.set(
      p.x - Math.sin(c.yaw) * c.distance * cp,
      1.9 + sp * c.distance,
      p.z + Math.cos(c.yaw) * c.distance * cp,
    );
    scratch.follow.look.set(p.x + Math.sin(c.yaw) * 0.8, 1.35, p.z - Math.cos(c.yaw) * 0.8);
    if (s.lockId !== null) {
      const e = s.enemies.find(en => en.id === s.lockId);
      if (e) {
        scratch.follow.look.x += (e.x - scratch.follow.look.x) * 0.36;
        scratch.follow.look.z += (e.z - scratch.follow.look.z) * 0.36;
        scratch.follow.look.y += (e.kind === 'boss' ? 1.9 : 1.3 - scratch.follow.look.y) * 0.3;
      }
    }
    if (p.action === 'deathblow') {
      scratch.follow.pos.set(p.x - Math.sin(c.yaw) * 3.1, 2.25, p.z + Math.cos(c.yaw) * 3.1);
      scratch.follow.look.set(p.x + Math.sin(c.yaw) * 1.6, 1.4, p.z - Math.cos(c.yaw) * 1.6);
    }
    const wantCinematic = s.phase === 'opening' || s.phase === 'title';
    const wantBlend = wantCinematic ? 1 : 0;
    blend.current += (wantBlend - blend.current) * Math.min(1, d * (wantCinematic ? 5 : 3.2));
    if (blend.current > 0.002) {
      const t = s.phase === 'title' ? 1.4 + Math.sin(s.time * 0.16) * 1.1 : s.time;
      const cine = cinematicPose(t);
      const k = blend.current;
      scratch.cinePos.set(...cine.pos);
      scratch.cineLook.set(...cine.look);
      scratch.follow.pos.lerp(scratch.cinePos, k);
      scratch.follow.look.lerp(scratch.cineLook, k);
    }
    const ease = Math.min(1, d * (s.phase === 'opening' ? 7 : 11));
    position.current.lerp(scratch.follow.pos, ease);
    target.current.lerp(scratch.follow.look, ease);
    const { shake } = c;
    const jx = shake > 0 ? (Math.random() - 0.5) * shake * 0.16 : 0;
    const jy = shake > 0 ? (Math.random() - 0.5) * shake * 0.12 : 0;
    camera.position.set(position.current.x + jx, position.current.y + jy, position.current.z);
    camera.lookAt(target.current);
    const perspective = camera as THREE.PerspectiveCamera;
    if (Math.abs(perspective.fov - c.fov) > 0.06) {
      perspective.fov = c.fov;
      perspective.updateProjectionMatrix();
    }
  });
  return null;
}

function Moonlight({ stateRef }: { stateRef: MutableRefObject<GameState> }) {
  const light = useRef<THREE.DirectionalLight>(null);
  const { scene } = useThree();
  useEffect(() => {
    if (!light.current) return undefined;
    const l = light.current;
    scene.add(l.target);
    return () => { scene.remove(l.target); };
  }, [scene]);
  useFrame(() => {
    const p = stateRef.current.player;
    if (!light.current) return;
    light.current.position.set(p.x + 18, 32, p.z + 14);
    light.current.target.position.set(p.x, 0, p.z);
    light.current.target.updateMatrixWorld();
  });
  return (
    <directionalLight
      ref={light}
      color="#9cb9e6"
      intensity={1.35}
      castShadow
      shadow-mapSize={[2048, 2048]}
      shadow-camera-left={-30}
      shadow-camera-right={30}
      shadow-camera-top={30}
      shadow-camera-bottom={-30}
      shadow-camera-near={1}
      shadow-camera-far={90}
      shadow-bias={-0.0008}
      shadow-normalBias={0.035}
    />
  );
}

function RimLight({ stateRef }: { stateRef: MutableRefObject<GameState> }) {
  const light = useRef<THREE.PointLight>(null);
  useFrame(() => {
    if (!light.current) return;
    const p = stateRef.current.player;
    light.current.position.set(p.x - 1.4, 2.6, p.z + 1.6);
  });
  return <pointLight ref={light} color="#67c8e8" intensity={5.5} distance={8} decay={2} />;
}

function Environment({ onReady }: { onReady: () => void }) {
  const { gl, scene } = useThree();
  const readyRef = useRef(onReady);
  readyRef.current = onReady;
  useEffect(() => {
    const pmrem = new THREE.PMREMGenerator(gl);
    const room = new RoomEnvironment();
    const { texture } = pmrem.fromScene(room, 0.04);
    scene.environment = texture;
    scene.environmentIntensity = 0.55;
    readyRef.current();
    return () => {
      scene.environment = null;
      texture.dispose();
      pmrem.dispose();
    };
  }, [gl, scene]);
  return null;
}

function AssetLoader({ onAsset, onError }: { onAsset: (g: THREE.Group) => void; onError: (m: string) => void }) {
  const assetRef = useRef(onAsset);
  const errorRef = useRef(onError);
  assetRef.current = onAsset;
  errorRef.current = onError;
  useEffect(() => {
    let alive = true;
    new GLTFLoader().loadAsync('/games/echo-zero/sui.glb')
      .then(gltf => { if (alive) assetRef.current(gltf.scene); })
      .catch(error => { if (alive) errorRef.current(`角色模型加载失败：${String(error)}`); });
    return () => { alive = false; };
  }, []);
  return null;
}

function FallbackActor({ stateRef }: { stateRef: MutableRefObject<GameState> }) {
  const root = useRef<THREE.Group>(null);
  useFrame(() => {
    if (!root.current) return;
    const p = stateRef.current.player;
    root.current.position.set(p.x, 0, p.z);
    root.current.rotation.y = Math.PI - p.yaw;
  });
  return (
    <group ref={root}>
      <mesh position={[0, 1, 0]} castShadow>
        <capsuleGeometry args={[0.28, 0.9, 4, 10]} />
        <meshStandardMaterial color="#a28ac7" roughness={0.7} />
      </mesh>
      <mesh position={[0, 1.65, 0]} castShadow>
        <sphereGeometry args={[0.22, 14, 12]} />
        <meshStandardMaterial color="#d9dbe8" roughness={0.8} />
      </mesh>
    </group>
  );
}

function SceneContent({ stateRef, onReady, onError }: Props) {
  const [asset, setAsset] = useState<THREE.Group | null>(null);
  return (
    <>
      <color attach="background" args={['#0c1420']} />
      <fogExp2 attach="fog" args={['#182434', 0.0165]} />
      <hemisphereLight args={['#8fb3d6', '#1b2029', 1.15]} />
      <ambientLight intensity={0.22} color="#91a9c4" />
      <Moonlight stateRef={stateRef} />
      <RimLight stateRef={stateRef} />
      <Environment onReady={onReady} />
      <AssetLoader onAsset={setAsset} onError={onError} />
      <City stateRef={stateRef} />
      {asset ? <SuiActor asset={asset} stateRef={stateRef} /> : <FallbackActor stateRef={stateRef} />}
      <ShioriActor stateRef={stateRef} variant="memory" />
      <ShioriActor stateRef={stateRef} variant="hologram" />
      <EnemyActors stateRef={stateRef} />
      <Effects stateRef={stateRef} />
      <CameraRig stateRef={stateRef} />
    </>
  );
}

function WorldView({ stateRef, onReady, onError }: Props) {
  return (
    <Canvas
      shadows
      dpr={[1, 1.5]}
      camera={{ fov: 54, near: 0.08, far: 520, position: [0, 3.2, 24.8] }}
      gl={{ antialias: true, alpha: false, powerPreference: 'high-performance' }}
      onCreated={({ gl }) => {
        gl.toneMapping = THREE.ACESFilmicToneMapping;
        gl.toneMappingExposure = 1.12;
        gl.shadowMap.type = THREE.PCFSoftShadowMap;
      }}
      style={{ width: '100%', height: '100%', touchAction: 'none' }}
    >
      <SceneContent stateRef={stateRef} onReady={onReady} onError={onError} />
    </Canvas>
  );
}

export default memo(WorldView);
