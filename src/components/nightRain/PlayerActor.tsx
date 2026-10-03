'use client';

import { useFrame } from '@react-three/fiber';
import { useMemo, useRef, useState, type MutableRefObject } from 'react';
import * as THREE from 'three';
import type { GameState } from './types';
import { CharacterStyle, PLAYER_SKINS } from './CharacterStyle';
import { ARMORS } from './equipment';
import WeaponView from './WeaponView';
import CombatTrail from './CombatTrail';
import { rollPose } from './combat';
import { chargeTime } from './weapons';
import { blendPlayerPose, PLAYER_NEUTRAL, samplePlayerMotion, supportingHand } from './playerMotion';

function Segment({ length, radius, color }: { length: number; radius: number; color: string }) {
  return <mesh position={[0, -length / 2, 0]} castShadow><capsuleGeometry args={[radius, Math.max(0.01, length - radius * 2), 3, 8]} /><meshStandardMaterial color={color} roughness={0.8} /></mesh>;
}

/** Player-only articulated rig. The enemy rigs retain their authored tells. */
export default function PlayerActor({ stateRef }: { stateRef: MutableRefObject<GameState> }) {
  const root = useRef<THREE.Group>(null); const rig = useRef<THREE.Group>(null); const chest = useRef<THREE.Group>(null); const head = useRef<THREE.Group>(null);
  const arms = useRef<(THREE.Group | null)[]>([]); const elbows = useRef<(THREE.Group | null)[]>([]);
  const thighs = useRef<(THREE.Group | null)[]>([]); const knees = useRef<(THREE.Group | null)[]>([]); const feet = useRef<(THREE.Group | null)[]>([]);
  const held = useRef<THREE.Group>(null); const bottle = useRef<THREE.Group>(null); const glow = useRef<THREE.Mesh>(null);
  const [skin, setSkin] = useState(stateRef.current.playerSkin); const [armor, setArmor] = useState(stateRef.current.gear.armor);
  const palette = PLAYER_SKINS[skin];
  const motion = useRef({ time: -1, x: 0, z: 0, speed: 0, stride: 0, localX: 0, localZ: 1, key: '', changed: 0, previous: PLAYER_NEUTRAL, shown: PLAYER_NEUTRAL });
  const mealTime = useRef(0);
  const math = useMemo(() => ({ down: new THREE.Vector3(0, -1, 0), up: new THREE.Vector3(0, 1, 0), start: new THREE.Vector3(), end: new THREE.Vector3(), direction: new THREE.Vector3(), bend: new THREE.Vector3(), joint: new THREE.Vector3(), v: new THREE.Vector3(), inverse: new THREE.Quaternion(), lower: new THREE.Quaternion(), torso: new THREE.Matrix4(), box: new THREE.Box3(), meshBox: new THREE.Box3() }), []);
  useFrame((_, frameDt) => {
    const s = stateRef.current; const p = s.player; const m = motion.current;
    if (!root.current || !rig.current || !chest.current || !head.current || !held.current || !bottle.current) return;
    if (skin !== s.playerSkin) setSkin(s.playerSkin); if (armor !== s.gear.armor) setArmor(s.gear.armor);
    const dt = m.time < 0 ? 0 : Math.max(0, s.time - m.time);
    const dx = p.x - m.x; const dz = p.z - m.z;
    if (dt > 0) {
      const distance = Math.hypot(dx, dz); const speed = distance < 3 ? Math.min(6, distance / dt) : 0;
      m.speed += (speed - m.speed) * Math.min(1, dt * 12);
      if (speed > 0.12 && p.action === 'idle') {
        m.stride += distance * 7.4;
        m.localX = (Math.cos(p.facing) * dx - Math.sin(p.facing) * dz) / Math.max(distance, 0.001);
        m.localZ = (Math.sin(p.facing) * dx + Math.cos(p.facing) * dz) / Math.max(distance, 0.001);
      }
    }
    m.time = s.time; m.x = p.x; m.z = p.z;
    const key = `${p.action}:${p.attack ?? ''}:${s.weapon}`;
    if (key !== m.key) { m.previous = m.shown; m.changed = s.time - (p.action === 'idle' ? 0 : Math.min(0.085, p.actionTime)); m.key = key; }
    const target = samplePlayerMotion(s, p.action === 'idle' ? m.speed : 0, m.stride, m.localX, m.localZ);
    const eating = s.mode === 'interlude' && !s.chapterComplete;
    if (eating) {
      if (!s.paused) mealTime.current += Math.min(frameDt, 0.05);
      const sip = (Math.sin(mealTime.current * 1.6) + 1) / 2;
      Object.assign(target, { waistY: -0.09, chestX: 0.06, handX: 0.12, handY: 1.08 + sip * 0.32, handZ: 0.4 - sip * 0.13, leftX: -0.2, leftY: 1.08, leftZ: 0.29 });
    } else mealTime.current = 0;
    // Blend action boundaries only; the contact key itself never trails behind damage.
    const pose = blendPlayerPose(m.previous, target, (s.time - m.changed) / 0.085); m.shown = pose;
    root.current.position.set(p.x, p.y, p.z);
    rig.current.position.set(0, p.jumpHeight, 0); rig.current.scale.setScalar(1.05); rig.current.rotation.set(0, p.facing, 0, 'YXZ');
    chest.current.position.set(pose.waistX, 1 + pose.waistY, pose.waistZ); chest.current.rotation.set(pose.chestX, pose.chestY, pose.chestZ);
    head.current.rotation.set(pose.headX, pose.headY, 0);
    math.torso.compose(chest.current.position, chest.current.quaternion, math.v.set(1, 1, 1)).invert();
    const solve = (upper: THREE.Group | null, lower: THREE.Group | null, a: number, b: number, bendZ: number, tip?: THREE.Group | null) => {
      if (!upper || !lower) return;
      math.direction.copy(math.end).sub(math.start); const distance = Math.min(a + b - 0.001, Math.max(Math.abs(a - b) + 0.001, math.direction.length())); math.direction.normalize();
      math.bend.set(0, 0, bendZ); math.bend.addScaledVector(math.direction, -math.bend.dot(math.direction)).normalize();
      const along = (a * a - b * b + distance * distance) / (2 * distance); const height = Math.sqrt(Math.max(0, a * a - along * along));
      math.joint.copy(math.start).addScaledVector(math.direction, along).addScaledVector(math.bend, height);
      upper.quaternion.setFromUnitVectors(math.down, math.v.copy(math.joint).sub(math.start).normalize());
      math.lower.setFromUnitVectors(math.down, math.v.copy(math.end).sub(math.joint).normalize());
      lower.quaternion.copy(math.inverse.copy(upper.quaternion).invert()).multiply(math.lower);
      if (tip) tip.quaternion.copy(math.lower).invert();
    };
    const left = supportingHand(pose);
    [-1, 1].forEach((side, i) => {
      const thigh = thighs.current[i]; if (thigh) thigh.position.set(side * 0.16 + pose.waistX, 0.8 + pose.waistY, pose.waistZ);
      math.start.set(side * 0.16 + pose.waistX, 0.8 + pose.waistY, pose.waistZ);
      math.end.set(i === 0 ? pose.footLX : pose.footRX, i === 0 ? pose.footLY : pose.footRY, i === 0 ? pose.footLZ : pose.footRZ);
      solve(thigh, knees.current[i], 0.35, 0.35, 1, feet.current[i]);
      math.start.set(side * 0.34, 0.25, 0);
      math.end.set(i === 0 ? left[0] : pose.handX, i === 0 ? left[1] : pose.handY, i === 0 ? left[2] : pose.handZ).applyMatrix4(math.torso);
      solve(arms.current[i], elbows.current[i], 0.28, 0.29, -1);
    });
    held.current.position.set(pose.handX, pose.handY, pose.handZ); held.current.rotation.set(pose.weaponX, pose.weaponY, pose.weaponZ); held.current.visible = p.action !== 'heal';
    bottle.current.position.copy(held.current.position); bottle.current.visible = p.action === 'heal';
    math.direction.set(0, 0.465, 0.245).applyQuaternion(chest.current.quaternion).add(chest.current.position).sub(bottle.current.position)
.normalize();
    bottle.current.quaternion.setFromUnitVectors(math.up, math.direction);
    if (glow.current) { glow.current.visible = p.action === 'charge'; glow.current.scale.setScalar(0.5 + (p.charge / chargeTime(s)) * 0.7); }
    if (p.action === 'dodge') {
      const roll = rollPose(p.actionTime); rig.current.rotation.set(roll.angle, Math.atan2(p.dodgeX, p.dodgeZ), 0, 'YXZ');
      rig.current.scale.y *= 1 - 0.22 * roll.tuck;
      math.v.set(0, 0.97 * rig.current.scale.y, 0).applyEuler(rig.current.rotation);
      rig.current.position.set(-math.v.x, roll.height * 1.05 - math.v.y + p.jumpHeight, -math.v.z);
      thighs.current.forEach((g, i) => { if (g) g.rotation.x = -(i === 0 ? 1.25 : 1.05) * roll.tuck; });
      knees.current.forEach(g => { if (g) g.rotation.x = 1.5 * roll.tuck; });
      held.current.rotation.x = -0.55 * roll.tuck + pose.weaponX * (1 - roll.tuck);
      rig.current.updateWorldMatrix(true, true); math.box.makeEmpty();
      rig.current.traverseVisible(object => { if (!(object instanceof THREE.Mesh)) return; if (!object.geometry.boundingBox) object.geometry.computeBoundingBox(); if (object.geometry.boundingBox) math.box.union(math.meshBox.copy(object.geometry.boundingBox).applyMatrix4(object.matrixWorld)); });
      rig.current.position.y += Math.max(0, p.y + p.jumpHeight + 0.015 - math.box.min.y);
    } else if (p.action === 'dead') { rig.current.rotation.x = -1.45; rig.current.position.y = 0.2; }
    if (eating) held.current.visible = false;
  });
  return (
<group ref={root} name="player-rig"><group ref={rig} name="player-articulated-rig">
    {[-1, 1].map((side, i) => <group key={side} ref={el => { thighs.current[i] = el; }} name={`player-hip-${i}`} position={[side * 0.16, 0.8, 0]}><Segment length={0.35} radius={0.09} color={skin === 'sui' ? '#c7b7ce' : '#f2eadd'} /><group ref={el => { knees.current[i] = el; }} name={`player-knee-${i}`} position={[0, -0.35, 0]}><Segment length={0.35} radius={0.08} color={skin === 'sui' ? '#c7b7ce' : '#f2eadd'} /><group ref={el => { feet.current[i] = el; }} name={`player-foot-${i}`} position={[0, -0.35, 0]}><mesh position={[0, 0, 0.06]} castShadow><boxGeometry args={[0.18, 0.25, 0.31]} /><meshStandardMaterial color={palette.boots} /></mesh></group></group></group>)}
    <group ref={chest} name="player-chest" position={[0, 1, 0]}><group position={[0, -1, 0]}>
      <mesh position={[0, 0.96, 0]} castShadow><cylinderGeometry args={[0.27, 0.37, 0.72, 7]} /><meshStandardMaterial color={palette.coat} roughness={0.85} /></mesh>
      <mesh position={[0, 1.08, 0.24]}><boxGeometry args={[0.07, 0.52, 0.035]} /><meshStandardMaterial color={palette.trim} /></mesh>
      <group ref={head} name="player-head" position={[0, 1.5, 0]}>
        {skin !== 'sui' && <group position={[0, -1.5, 0]}><CharacterStyle skin={skin} part="head" /></group>}
        <mesh castShadow><sphereGeometry args={[0.245, 12, 10]} /><meshStandardMaterial color="#ead0bd" /></mesh>
        {[-1, 1].map(n => <group key={n} position={[n * 0.088, 0.02, 0.225]}><mesh scale={[0.027, 0.038, 0.013]}><sphereGeometry args={[1, 12, 10]} /><meshStandardMaterial color={palette.eye} /></mesh><mesh position={[-0.007, 0.012, 0.012]}><sphereGeometry args={[0.009, 8, 6]} /><meshBasicMaterial color="#fff8e9" /></mesh></group>)}
        {skin === 'sui' && <group name="outfit-sui"><mesh position={[0, 0.1, -0.035]} castShadow><sphereGeometry args={[0.27, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.6]} /><meshStandardMaterial color="#d9dbe2" /></mesh>{[-1, 1].map(n => <group key={n}><mesh position={[n * 0.195, -0.12, -0.06]} castShadow><capsuleGeometry args={[0.075, 0.35, 3, 6]} /><meshStandardMaterial color="#c9d0dd" /></mesh><mesh position={[n * 0.195, 0.44, -0.02]} rotation={[0.15, 0, -n * 0.2]}><coneGeometry args={[0.12, 0.32, 4]} /><meshStandardMaterial color="#77718d" /></mesh><mesh position={[n * 0.195, 0.44, 0.06]} rotation={[0.15, 0, -n * 0.2]}><coneGeometry args={[0.063, 0.19, 3]} /><meshStandardMaterial color="#c1a0af" /></mesh></group>)}<mesh position={[0, 0.28, -0.02]} castShadow><sphereGeometry args={[0.27, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.5]} /><meshStandardMaterial color="#716b87" /></mesh></group>}
      </group>
      {skin !== 'sui' ? <CharacterStyle skin={skin} part="body" /> : <group><mesh position={[0, 0.88, 0]}><boxGeometry args={[0.57, 0.09, 0.48]} /><meshStandardMaterial color="#745344" /></mesh><mesh position={[0, 1.08, -0.3]}><boxGeometry args={[0.4, 0.48, 0.22]} /><meshStandardMaterial color="#b5a38c" /></mesh><mesh position={[0, 1.06, -0.42]}><boxGeometry args={[0.22, 0.19, 0.04]} /><meshStandardMaterial color="#665371" /></mesh></group>}
      {armor !== 'traveler' && <group><mesh position={[0, 1.02, -0.3]}><boxGeometry args={[0.62, 0.9, 0.08]} /><meshStandardMaterial color={ARMORS[armor].color} /></mesh><mesh position={[0, 1.14, 0.25]}><boxGeometry args={[0.45, 0.43, 0.065]} /><meshStandardMaterial color={ARMORS[armor].color} /></mesh></group>}
    </group>
    {[-1, 1].map((side, i) => <group key={side} ref={el => { arms.current[i] = el; }} name={`player-shoulder-${i}`} position={[side * 0.34, 0.25, 0]}><Segment length={0.28} radius={0.09} color={palette.coat} /><group ref={el => { elbows.current[i] = el; }} name={`player-elbow-${i}`} position={[0, -0.28, 0]}><Segment length={0.29} radius={0.08} color={palette.coat} /><mesh position={[0, -0.29, 0]}><sphereGeometry args={[0.075, 8, 6]} /><meshStandardMaterial color="#ead0bd" /></mesh></group></group>)}
    </group>
    <group ref={held} name="player-weapon-grip"><WeaponView stateRef={stateRef} /><mesh ref={glow} position={[0, 1.05, 0]} visible={false}><sphereGeometry args={[0.1, 10, 8]} /><meshBasicMaterial color="#ffe5a8" transparent opacity={0.45} depthWrite={false} /></mesh></group>
    <group ref={bottle} visible={false}><mesh><cylinderGeometry args={[0.09, 0.12, 0.28, 10]} /><meshStandardMaterial color="#76cbb2" roughness={0.2} /></mesh><mesh position={[0, 0.2, 0]}><cylinderGeometry args={[0.045, 0.055, 0.13, 8]} /><meshStandardMaterial color="#dcc698" /></mesh></group>
  </group><CombatTrail stateRef={stateRef} /></group>
);
}
