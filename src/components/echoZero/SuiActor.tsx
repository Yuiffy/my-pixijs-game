"use client";

/** Sui, driven through the named joints of the authored GLB (no skinned mesh / mixer). */

import { useFrame } from "@react-three/fiber";
import { useMemo, useRef, type MutableRefObject } from "react";
import * as THREE from "three";
import type { GameState } from "./types";

type Rig = {
  joints: Record<string, THREE.Object3D>;
  meshes: THREE.Mesh[];
  mouth: THREE.Mesh | null;
  eyes: THREE.Mesh[];
};

function buildRig(asset: THREE.Group): Rig {
  const joints: Record<string, THREE.Object3D> = {};
  const meshes: THREE.Mesh[] = [];
  const eyes: THREE.Mesh[] = [];
  let mouth: THREE.Mesh | null = null;
  asset.traverse(o => {
    if (/^Sui_[A-Za-z]+$/.test(o.name) && !(o instanceof THREE.Mesh)) joints[o.name] = o;
    if (o instanceof THREE.Mesh) {
      meshes.push(o);
      o.castShadow = true;
      o.receiveShadow = true;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      if (mats.some(m => /eye whites|iris/i.test(m.name))) eyes.push(o);
      if (o.morphTargetDictionary?.Worry !== undefined) mouth = o;
    }
  });
  return { joints, meshes, mouth: mouth as THREE.Mesh | null, eyes };
}

function Blade() {
  const shape = useMemo(() => {
    const s = new THREE.Shape();
    s.moveTo(-0.055, 0);
    s.lineTo(0.055, 0);
    s.lineTo(0.045, 1.02);
    s.lineTo(0.0, 1.22);
    s.lineTo(-0.035, 1.0);
    s.closePath();
    return new THREE.ExtrudeGeometry(s, { depth: 0.018, bevelEnabled: false });
  }, []);
  return (
    <group>
      <mesh position={[0, -0.2, 0]}>
        <cylinderGeometry args={[0.032, 0.038, 0.42, 10]} />
        <meshStandardMaterial color="#171a22" metalness={0.55} roughness={0.6} />
      </mesh>
      <mesh position={[0, 0.015, 0]}>
        <boxGeometry args={[0.22, 0.035, 0.075]} />
        <meshStandardMaterial color="#b89a62" metalness={0.85} roughness={0.32} />
      </mesh>
      <mesh geometry={shape} position={[0, 0.03, -0.009]}>
        <meshStandardMaterial color="#c9dbe7" metalness={0.94} roughness={0.14} emissive="#2d6c86" emissiveIntensity={0.5} />
      </mesh>
      <mesh position={[0.0, 0.64, 0.022]}>
        <planeGeometry args={[0.016, 1.05]} />
        <meshBasicMaterial color="#9ff0ff" transparent opacity={0.85} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
      </mesh>
      <pointLight position={[0, 0.55, 0]} color="#5fd8f0" intensity={1.6} distance={2.4} />
    </group>
  );
}

export default function SuiActor({ asset, stateRef }: { asset: THREE.Group; stateRef: MutableRefObject<GameState> }) {
  const root = useRef<THREE.Group>(null);
  const roll = useRef<THREE.Group>(null);
  const blade = useRef<THREE.Group>(null);
  const rig = useMemo(() => buildRig(asset), [asset]);
  const pose = useRef<Record<string, [number, number, number]>>({});
  const clock = useRef(0);

  useFrame((_, dt) => {
    const s = stateRef.current;
    const p = s.player;
    if (!root.current || !roll.current || !blade.current) return;
    const d = Math.min(0.05, dt);
    clock.current += d;
    const t = clock.current;
    const T: Record<string, [number, number, number]> = {};
    const at = (name: string, x: number, y = 0, z = 0) => { T[name] = [x, y, z]; };
    const phase = p.actionDuration > 0 ? Math.min(1, p.actionTime / p.actionDuration) : 0;
    const gait = Math.sin(t * (p.action === 'sprint' ? 15 : 10));
    const swing = Math.min(1, Math.abs(p.speed) / 5);

    // Neutral stance.
    at('Body', 0, 0, 0);
    at('Head', 0, 0, 0);
    at('LeftArm', -0.1, 0, 0.13);
    at('RightArm', -0.14, 0, -0.15);
    at('LeftForearm', -0.28);
    at('RightForearm', -0.42);
    at('LeftHand', 0);
    at('RightHand', 0);
    at('LeftLeg', 0);
    at('RightLeg', 0);
    at('LeftShin', 0);
    at('RightShin', 0);
    at('LeftWing', 0, 0, 0.04);
    at('RightWing', 0, 0, -0.04);
    at('LeftHair', 0);
    at('RightHair', 0);
    let bodyHeight = 0;
    let bladePos: [number, number, number] = [0.38, 0.98, 0.28];
    let bladeRot: [number, number, number] = [-0.35, 0, -0.55];
    let rollX = 0;
    let rollZ = 0;

    const { action } = p;
    if (action === 'run' || action === 'sprint') {
      const amp = (action === 'sprint' ? 0.78 : 0.52) * (0.35 + 0.65 * swing);
      at('LeftLeg', gait * amp);
      at('RightLeg', -gait * amp);
      at('LeftShin', Math.max(0, -gait) * 0.55);
      at('RightShin', Math.max(0, gait) * 0.55);
      at('LeftArm', -gait * amp * 0.75 - 0.1, 0, 0.13);
      at('RightArm', gait * amp * 0.75 - 0.14, 0, -0.15);
      at('Body', action === 'sprint' ? 0.16 : 0.07, 0, Math.sin(t * 6) * 0.025);
      at('LeftHair', gait * 0.1, 0, 0.06);
      at('RightHair', -gait * 0.1, 0, -0.06);
      bodyHeight = Math.abs(Math.sin(t * (action === 'sprint' ? 15 : 10))) * 0.045;
    } else if (action === 'idle' || action === 'guard') {
      at('Body', Math.sin(t * 1.7) * 0.014, 0, 0);
      at('Head', Math.sin(t * 0.9) * 0.03, Math.sin(t * 0.55) * 0.05, 0);
      at('LeftHair', Math.sin(t * 1.4) * 0.035);
      at('RightHair', -Math.sin(t * 1.2) * 0.035);
      at('LeftWing', 0, Math.sin(t * 1.3) * 0.04, 0.04);
      at('RightWing', 0, -Math.sin(t * 1.3) * 0.04, -0.04);
      bodyHeight = Math.sin(t * 1.7) * 0.012;
    }
    if (action === 'guard') {
      at('LeftArm', -0.95, 0, 0.32);
      at('RightArm', -0.78, 0, -0.34);
      at('LeftForearm', -1.05);
      at('RightForearm', -1.15);
      bladeRot = [-1.15, 0.25, -0.15];
      bladePos = [0.18, 1.28, 0.52];
    }
    if (action.startsWith('light') || action === 'heavy' || action === 'dashSlash') {
      const heavy = action === 'heavy';
      const dash = action === 'dashSlash';
      const idx = action === 'light1' ? 0 : action === 'light2' ? 1 : 2;
      const wind = Math.min(1, phase / 0.42);
      const strike = Math.max(0, Math.min(1, (phase - 0.35) / 0.34));
      const relax = Math.max(0, (phase - 0.68) / 0.32);
      const angle = heavy ? -2.25 + strike * 3.4 : (idx === 1 ? -1.5 + strike * 3.0 : -1.25 - strike * 2.6);
      at('RightArm', angle, 0, (idx === 1 ? 0.42 : -0.42) * strike);
      at('RightForearm', -0.2 - strike * 0.75);
      at('LeftArm', -0.55, 0, 0.28);
      at('LeftForearm', -0.85);
      at('Body', dash ? 0.42 : 0.14 + strike * 0.18, (idx === 1 ? -1 : 1) * wind * 0.42 - strike * 0.3, 0);
      at('Head', 0.08, 0, 0);
      at('LeftLeg', dash ? 0.55 : 0.2 * strike);
      at('RightLeg', dash ? -0.45 : -0.25 * strike);
      at('LeftWing', 0, 0, 0.16 + strike * 0.15);
      at('RightWing', 0, 0, -0.16 - strike * 0.15);
      const sweep = heavy ? -0.4 + strike * 2.4 : (idx === 1 ? 1.1 - strike * 2.4 : -1.0 + strike * 2.3);
      bladeRot = [-0.5 + strike * 1.4, 0, sweep - relax * 0.35];
      bladePos = [0.32 + strike * 0.16, 1.05 + (heavy ? wind * 0.5 : 0.04), 0.32 + strike * 0.35];
      if (heavy && phase < 0.4) {
        at('LeftArm', -2.0 * wind, 0, 0.3);
        at('RightArm', -2.1 * wind, 0, -0.3);
        bladePos = [0.1, 1.35 + wind * 0.4, 0.1];
        bladeRot = [-2.0 + wind * 0.5, 0, -0.1];
      }
    }
    if (action === 'dodge') {
      rollX = -Math.PI * 2 * Math.min(1, phase * 1.06);
      bodyHeight = -0.32 * Math.sin(Math.PI * phase);
      at('Body', 0.55);
      at('LeftArm', -1.3, 0, 0.55);
      at('RightArm', -1.3, 0, -0.55);
      at('LeftLeg', 0.9);
      at('RightLeg', 0.9);
      at('LeftShin', -1.2);
      at('RightShin', -1.2);
      bladeRot = [-0.9, 0, -1.2];
      bladePos = [0.36, 0.7, -0.2];
    }
    if (action === 'deflect') {
      at('RightArm', -1.12, 0, -0.62);
      at('RightForearm', -0.95);
      at('LeftArm', -0.72, 0, 0.38);
      at('LeftForearm', -1.1);
      at('Body', -0.12, 0.32, 0);
      at('LeftLeg', 0.28);
      at('RightLeg', -0.28);
      bladeRot = [-1.45, 0.1, 0.28];
      bladePos = [0.12, 1.36, 0.6];
    }
    if (action === 'hit') {
      const k = 1 - phase;
      at('Body', -0.28 * k, 0, 0.12 * k);
      at('Head', -0.25 * k);
      at('LeftArm', -0.5 * k);
      at('RightArm', -0.55 * k);
      bladeRot = [-0.2, 0, -1.1];
    }
    if (action === 'heal') {
      at('LeftArm', -1.05, 0, 0.62);
      at('LeftForearm', -1.25);
      at('Body', 0.09);
      bladeRot = [-0.3, 0, -0.9];
      bladePos = [0.44, 0.82, 0.1];
    }
    if (action === 'deathblow') {
      const strike = Math.min(1, phase / 0.42);
      at('Body', 0.28 + strike * 0.26, -0.4, 0);
      at('RightArm', -0.5 - strike * 1.5, 0, -0.25);
      at('RightForearm', -0.15);
      at('LeftArm', -0.8, 0, 0.5);
      at('LeftLeg', 0.42);
      at('RightLeg', -0.42);
      bladeRot = [-1.15 + strike * 0.7, 0, -0.2];
      bladePos = [0.28, 1.15, 0.35 + strike * 0.95];
    }
    if (action === 'getup') {
      const k = 1 - phase;
      rollZ = 0.65 * k;
      bodyHeight = -0.55 * k;
      at('Body', 0.5 * k);
      at('LeftLeg', -0.8 * k);
      at('RightLeg', -0.4 * k);
    }
    if (action === 'dead') {
      rollZ = Math.PI * 0.46;
      bodyHeight = -0.2;
      at('Body', 0.2);
      at('LeftArm', 0.5);
      at('RightArm', 0.4);
    }

    root.current.position.set(p.x, bodyHeight, p.z);
    root.current.rotation.y = Math.PI - p.yaw;
    roll.current.rotation.x = rollX;
    roll.current.rotation.z = rollZ;
    roll.current.position.y = 0;
    blade.current.position.set(...bladePos);
    blade.current.rotation.set(...bladeRot);
    blade.current.visible = s.phase !== 'title' && action !== 'dead';

    const ease = Math.min(1, dt * 17);
    Object.entries(T).forEach(([name, v]) => {
      const j = rig.joints[`Sui_${name}`];
      if (!j) return;
      const previous = pose.current[name] || [j.rotation.x, j.rotation.y, j.rotation.z];
      const next: [number, number, number] = [
        previous[0] + (v[0] - previous[0]) * ease,
        previous[1] + (v[1] - previous[1]) * ease,
        previous[2] + (v[2] - previous[2]) * ease,
      ];
      j.rotation.set(...next);
      pose.current[name] = next;
    });
    const blink = (t + 0.6) % 4.1 < 0.13 ? 0.08 : 1;
    for (const side of ['Left', 'Right']) {
      const eye = rig.joints[`Sui_${side}Eye`];
      if (eye) eye.scale.y = blink;
    }
    if (rig.mouth?.morphTargetInfluences && rig.mouth.morphTargetDictionary) {
      const keys = rig.mouth.morphTargetDictionary;
      rig.mouth.morphTargetInfluences[keys.Worry] = p.hp < p.maxHp * 0.35 ? 0.55 : 0.1;
      rig.mouth.morphTargetInfluences[keys.Smile] = s.bossDefeated ? 0.5 : 0;
    }
    rig.meshes.forEach(m => {
      const mats = Array.isArray(m.material) ? m.material : [m.material];
      for (const mat of mats) {
        if (mat instanceof THREE.MeshStandardMaterial) {
          mat.emissive.setRGB(p.hurtFlash * 0.42, 0, 0);
        }
      }
    });
  });

  return (
    <group ref={root}>
      <group ref={roll}>
        <primitive object={asset} />
      </group>
      <group ref={blade} scale={0.92}>
        <Blade />
      </group>
      {/* Contact shadow keeps the character grounded even on the wet asphalt. */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.012, 0]}>
        <circleGeometry args={[0.52, 24]} />
        <meshBasicMaterial color="#04070c" transparent opacity={0.36} depthWrite={false} />
      </mesh>
    </group>
  );
}
