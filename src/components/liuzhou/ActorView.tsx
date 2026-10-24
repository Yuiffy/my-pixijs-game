"use client";

import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef, type ReactNode } from "react";
import * as T from "three";
import { actorPose, ARM, HIP, LEG, pedalPhase, RIDER_Y, RIDER_Z } from "./actorMotion";
import { CITIZEN_PLANS } from "./citizens";
import { MARKET_APPEARANCES } from "./market";
import { STATION_APPEARANCES } from "./station";
import { ESHAN_APPEARANCES } from "./eshan";
import { SQUARE_APPEARANCES } from "./square";
import { XIHUAN_APPEARANCES } from "./xihuan";
import { WUXING_APPEARANCES } from "./wuxing";
import { CHARACTERS, type Actor, type Character, type Game, type Npc, type Vehicle } from "./simulation";

// Shared low-poly primitives. Materials are shared within each actor and released
// on appearance change; the reusable geometry stays alive with the scene module.
const box = new T.BoxGeometry(1, 1, 1);
const ball = new T.SphereGeometry(1, 12, 8);
const skirt = new T.CylinderGeometry(0.23, 0.34, 0.3, 10);
const cap = new T.SphereGeometry(1, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.57);
const cone = new T.ConeGeometry(1, 1, 4);
type XYZ = [number, number, number];
function Part({ at = [0, 0, 0], size, material, shape = box, rotation }: { at?: XYZ; size: XYZ; material: T.Material; shape?: T.BufferGeometry; rotation?: XYZ }) {
  return <mesh geometry={shape} material={material} position={at} scale={size} rotation={rotation} castShadow receiveShadow />;
}

export type AvatarSnapshot = {
  id: string; character: string; mode: string; visible: boolean;
  opacity: number;
  leftLeg: number[]; rightLeg: number[]; leftArm: number[]; rightArm: number[];
  feet: XYZ[]; hands: XYZ[]; position: XYZ;
  pedalErrors?: number[];
  gripErrors?: number[];
};
/** Read actual mounted joint transforms, only when the test page asks for them. */
export function inspectAvatars(scene: T.Scene): AvatarSnapshot[] {
  const snapshots: AvatarSnapshot[] = [];
  const point = (root: T.Object3D, name: string) => root.getObjectByName(name)!.getWorldPosition(new T.Vector3()).toArray() as XYZ;
  scene.updateMatrixWorld(true);
  scene.traverse(root => {
    if (!root.userData.liuzhouAvatar) return;
    let opacity = 0;
    root.traverse(part => {
      if (!(part instanceof T.Mesh)) return;
      for (const material of Array.isArray(part.material) ? part.material : [part.material]) if (material.userData.liuzhouAvatarBody) opacity = Math.max(opacity, material.opacity);
    });
    const angles = (a: string, b: string) => [root.getObjectByName(a)!.rotation.x, root.getObjectByName(b)!.rotation.x];
    let visible = true;
    for (let p: T.Object3D | null = root; p; p = p.parent) visible &&= p.visible;
    const pedals = ["pedal-left", "pedal-right"].map(name => (root.name.startsWith("rider-") ? root.parent?.getObjectByName(name) : undefined));
    const pedalErrors = pedals.every(Boolean) ? pedals.map((pedal, i) => root.getObjectByName(`ankle-${i ? "right" : "left"}`)!.localToWorld(new T.Vector3(0, -0.1, 0)).distanceTo(pedal!.getWorldPosition(new T.Vector3()))) : undefined;
    const gripErrors = pedalErrors ? [-1, 1].map((side, i) => root.getObjectByName(`hand-${i ? "right" : "left"}`)!.getWorldPosition(new T.Vector3()).distanceTo(root.parent!.localToWorld(new T.Vector3(side * 0.31, 1.4, 0.46)))) : undefined;
    snapshots.push({
      id: root.name,
      character: root.userData.character,
      mode: root.userData.mode,
      visible,
      opacity,
      leftLeg: angles("hip-left", "knee-left"),
      rightLeg: angles("hip-right", "knee-right"),
      leftArm: angles("shoulder-left", "elbow-left"),
      rightArm: angles("shoulder-right", "elbow-right"),
      feet: [point(root, "ankle-left"), point(root, "ankle-right")],
      hands: [point(root, "hand-left"), point(root, "hand-right")],
      position: root.getWorldPosition(new T.Vector3()).toArray() as XYZ,
      pedalErrors,
      gripErrors,
    });
  });
  return snapshots;
}

export default function ActorView({ game, actor, character, citizen, player = false, vehicle, children }: {
  game: Game; actor: Actor; character?: Character; citizen?: Npc; player?: boolean; vehicle?: Vehicle; children?: ReactNode;
}) {
  const root = useRef<T.Group>(null);
  const body = useRef<T.Group>(null);
  const head = useRef<T.Group>(null);
  const hair = useRef<T.Group>(null);
  const camera = useRef<T.Group>(null);
  const hips = useRef<(T.Group | null)[]>([]);
  const knees = useRef<(T.Group | null)[]>([]);
  const ankles = useRef<(T.Group | null)[]>([]);
  const shoulders = useRef<(T.Group | null)[]>([]);
  const elbows = useRef<(T.Group | null)[]>([]);
  const plan = citizen ? CITIZEN_PLANS[citizen.id] : undefined;
  const streetAppearance = MARKET_APPEARANCES[citizen?.id || ""] || STATION_APPEARANCES[citizen?.id || ""] || ESHAN_APPEARANCES[citizen?.id || ""] || SQUARE_APPEARANCES[citizen?.id || ""] || XIHUAN_APPEARANCES[citizen?.id || ""] || WUXING_APPEARANCES[citizen?.id || ""];
  const appearance = character ? CHARACTERS[character] : {
    hair: plan?.hair || streetAppearance?.hair || "#514e42", outfit: plan?.outfit || streetAppearance?.outfit || "#7b968b", trim: plan?.trim || streetAppearance?.trim || "#4f5e58", eyes: "#45453c",
  };
  const { hair: hairColor, outfit, trim, eyes } = appearance;
  const materials = useMemo(() => {
    const colors = { hair: hairColor, outfit, trim, eyes, skin: "#f1d4bf", white: "#fff6e7", shoe: "#33323c", sole: "#56515b", metal: "#b9b4b0", blue: "#7bb6d5", pink: "#d39eaf", green: "#789564", bag: "#b79a6f" };
    return Object.fromEntries(Object.entries(colors).map(([key, color]) => {
      const material = new T.MeshStandardMaterial({ color, roughness: 0.82, transparent: player }); material.userData.liuzhouAvatarBody = true;
      return [key, material];
    }));
  }, [hairColor, outfit, trim, eyes, player]);
  useEffect(() => () => Object.values(materials).forEach(m => m.dispose()), [materials]);
  const m = materials;
  const isSui = character === "sui";
  const isShiori = character === "shiori";
  const isNagisa = character === "nagisa";
  const isNana = character === "nana";
  const id = vehicle ? `rider-${vehicle.id}` : player ? "player" : citizen?.id || "actor";
  useFrame(state => {
    if (!root.current || !body.current || !head.current) return;
    if (player && !vehicle) {
      const gap = Math.hypot(state.camera.position.x - actor.x, state.camera.position.y - actor.y - 1.4, state.camera.position.z - actor.z);
      // Retracted stair cameras sit around 1.8m from the aim point. Hide the
      // body there so the head and hair cannot fill the whole narrow view.
      const opacity = Math.max(0, Math.min(1, (gap - 1.9) / 1.5));
      Object.values(materials).forEach(material => { material.opacity = opacity; material.depthWrite = opacity > 0.99; });
    }
    root.current.visible = vehicle ? game.vehicle === vehicle.id : !player || !game.vehicle;
    const activity = citizen?.routine && !citizen.routine.waiting && citizen.routine.remaining > 0 ? citizen.routine.action : undefined;
    const movement = game.locomotion;
    const pose = actorPose({
      time: game.time,
      phase: vehicle ? pedalPhase(vehicle.odometer || 0) : player ? movement.phase : ((citizen?.routine?.odometer || 0) * Math.PI * 2) / 1.8,
      speed: vehicle ? Math.abs(vehicle.speed) : game.dialogue ? 0 : player ? movement.speed : Math.abs(actor.speed),
      grounded: !player || movement.grounded,
      velocityY: movement.velocityY,
      landedAt: player ? movement.landedAt : undefined,
      action: activity,
      watching: game.evening.watching && (player || !!character) && Math.hypot(actor.x - 28, actor.z + 27) < 24,
      riding: !!vehicle,
      flying: player && game.flight.active,
    });
    root.current.position.set(vehicle ? 0 : actor.x, (vehicle ? RIDER_Y : actor.y) + pose.bob, vehicle ? RIDER_Z : actor.z);
    root.current.rotation.set(0, vehicle ? 0 : actor.angle, pose.roll);
    body.current.rotation.set(pose.lean, pose.twist, 0);
    head.current.rotation.set(-pose.lean * 0.55, pose.head, 0);
    if (hair.current) hair.current.rotation.x = Math.sin(game.time * 2.5) * 0.015 + pose.twist * 0.3;
    for (let i = 0; i < 2; i++) {
      const leg = i === 0 ? pose.leftLeg : pose.rightLeg;
      const arm = i === 0 ? pose.leftArm : pose.rightArm;
      hips.current[i]?.rotation.set(leg.upper, 0, leg.side);
      knees.current[i]?.rotation.set(leg.lower, 0, 0);
      ankles.current[i]?.rotation.set(-leg.upper - leg.lower, 0, 0);
      shoulders.current[i]?.rotation.set(arm.upper, 0, arm.side);
      elbows.current[i]?.rotation.set(arm.lower, 0, 0);
    }
    if (camera.current) camera.current.position.set(0, activity === "photo" ? 1.46 : 1.04, activity === "photo" ? 0.38 : 0.25);
    root.current.userData.mode = pose.mode;
  });
  return (
    <group ref={root} name={id} userData={{ liuzhouAvatar: true, character: character || citizen?.id || "resident", mode: "idle" }} dispose={null}>
      {children}
      {[-1, 1].map((side, i) => (
<group key={side} name={`hip-${i ? "right" : "left"}`} ref={el => { hips.current[i] = el; }} position={[side * 0.135, HIP, 0]}>
        <Part at={[0, -LEG / 2, 0]} size={[0.16, LEG, 0.19]} material={character ? m.skin : m.trim} />
        <group name={`knee-${i ? "right" : "left"}`} ref={el => { knees.current[i] = el; }} position={[0, -LEG, 0]}>
          <Part at={[0, -LEG / 2, 0]} size={[0.15, LEG, 0.17]} material={isNana ? m.shoe : m.trim} />
          {isSui && [0.08, 0.22].map(y => <Part key={y} at={[0, -y, 0.09]} size={[0.17, 0.025, 0.025]} material={m.metal} />)}
          <group name={`ankle-${i ? "right" : "left"}`} ref={el => { ankles.current[i] = el; }} position={[0, -LEG, 0]}>
            <Part at={[0, -0.045, 0.055]} size={[0.19, 0.11, 0.3]} material={m.shoe} />
            <Part at={[0, -0.09, 0.06]} size={[0.195, 0.025, 0.31]} material={m.sole} />
          </group>
        </group>
      </group>
))}
      <group ref={body} position={[0, HIP, 0]}>
        <Part at={[0, 0.32, 0]} size={[0.46, 0.5, 0.29]} material={m.outfit} />
        {character && !isSui ? <Part at={[0, 0.015, 0]} size={[1, 1, 1]} shape={skirt} material={m.trim} /> : <Part at={[0, 0.015, 0]} size={[0.43, 0.24, 0.3]} material={m.trim} />}
        <Part at={[0, 0.35, 0.153]} size={[isSui ? 0.22 : 0.27, 0.31, 0.026]} material={isShiori || isNagisa || isNana ? m.white : m.trim} />
        {isSui && (
<>
          <Part at={[0, 0.07, 0.16]} size={[0.44, 0.035, 0.025]} material={m.metal} />
          <Part at={[0, 0.49, 0.17]} size={[0.075, 0.065, 0.035]} shape={ball} material={m.pink} />
          <Part at={[-0.21, 0.34, 0.17]} size={[0.025, 0.28, 0.025]} material={m.white} />
          <Part at={[0.21, 0.34, 0.17]} size={[0.025, 0.28, 0.025]} material={m.white} />
        </>
)}
        {isShiori && (
<>
          {[0.15, 0.31, 0.47].map(y => <Part key={y} at={[0, y, 0.18]} size={[0.027, 0.027, 0.015]} shape={ball} material={m.trim} />)}
          {[-1, 1].map(side => <Part key={side} at={[side * 0.075, 0.51, 0.19]} size={[0.1, 0.065, 0.04]} shape={cone} rotation={[0, 0, (side * Math.PI) / 2]} material={m.trim} />)}
        </>
)}
        {(isNagisa || isNana) && (
<>
          <Part at={[0, 0.43, 0.19]} size={[0.055, 0.18, 0.025]} material={isNana ? m.blue : m.trim} />
          {[-1, 1].map(side => <Part key={side} at={[side * 0.2, 0.34, 0.17]} size={[0.055, 0.45, 0.035]} material={m.trim} />)}
        </>
)}
        {isNana && [-1, 1].map(side => <Part key={side} at={[side * 0.24, 0.56, 0.09]} size={[0.11, 0.12, 0.1]} shape={ball} material={m.shoe} />)}
        {[-1, 1].map((side, i) => (
<group key={side} name={`shoulder-${i ? "right" : "left"}`} ref={el => { shoulders.current[i] = el; }} position={[side * 0.31, 0.5, 0]}>
          <Part at={[0, -ARM / 2, 0]} size={[0.17, ARM + 0.03, 0.21]} material={m.outfit} />
          <group name={`elbow-${i ? "right" : "left"}`} ref={el => { elbows.current[i] = el; }} position={[0, -ARM, 0]}>
            <Part at={[0, -ARM / 2 + 0.02, 0]} size={[0.155, ARM - 0.035, 0.19]} material={m.outfit} />
            <group name={`hand-${i ? "right" : "left"}`} position={[0, -ARM, 0]}>
              <Part size={[0.08, 0.09, 0.075]} shape={ball} material={m.skin} />
              {i === 0 && plan?.prop === "bag" && (
<group position={[0, -0.22, 0]}>
                <Part at={[0, 0.07, 0]} size={[0.26, 0.3, 0.18]} material={m.bag} />
                <Part at={[-0.09, 0.26, 0]} size={[0.025, 0.17, 0.03]} material={m.bag} />
                <Part at={[0.09, 0.26, 0]} size={[0.025, 0.17, 0.03]} material={m.bag} />
                <Part at={[0, 0.3, 0]} size={[0.2, 0.025, 0.03]} material={m.bag} />
                <Part at={[0.04, 0.28, 0]} size={[0.065, 0.15, 0.06]} shape={ball} material={m.green} />
              </group>
)}
            </group>
          </group>
        </group>
))}
        <group ref={head} position={[0, 0.82, 0]}>
          <Part size={[0.265, 0.285, 0.235]} shape={ball} material={m.skin} />
          <Part at={[0, 0.065, -0.04]} size={[0.29, 0.285, 0.27]} shape={cap} material={m.hair} />
          {[-1, 0, 1].map(side => <Part key={side} at={[side * 0.11, 0.13 - Math.abs(side) * 0.025, 0.17]} size={[0.1, 0.16, 0.065]} shape={ball} rotation={[0, 0, side * -0.2]} material={m.hair} />)}
          {[-1, 1].map(side => (
<group key={side}>
            <Part at={[side * 0.1, 0.01, 0.218]} size={[0.057, 0.073, 0.023]} shape={ball} material={m.white} />
            <Part at={[side * 0.1, 0.006, 0.237]} size={[0.033, 0.055, 0.012]} shape={ball} material={m.eyes} />
            <Part at={[side * 0.1 - 0.009, 0.027, 0.247]} size={[0.01, 0.017, 0.006]} shape={ball} material={m.white} />
          </group>
))}
          <Part at={[0, -0.105, 0.225]} size={[0.045, 0.012, 0.008]} material={m.pink} />
          <group ref={hair}>
            {isSui && [-1, 1].map(side => (
<group key={side}>
              {[0, 1, 2].map(n => <Part key={n} at={[side * (0.28 + n * 0.015), -0.07 - n * 0.12, -0.06]} size={[0.09 - n * 0.012, 0.105, 0.09]} shape={ball} material={m.hair} />)}
              <Part at={[side * 0.28, 0.01, -0.04]} size={[0.11, 0.05, 0.1]} material={m.trim} />
            </group>
))}
            {isShiori && (
<>
              {[-1, 1].map(side => <Part key={side} at={[side * 0.235, -0.04, -0.04]} size={[0.065, 0.24, 0.09]} shape={ball} material={m.hair} />)}
              {[0, 1, 2, 3].map(n => <Part key={n} at={[0.25 + Math.sin(n * 2) * 0.02, -0.19 - n * 0.11, 0.02]} size={[0.068 - n * 0.008, 0.08, 0.065]} shape={ball} material={m.hair} />)}
              <Part at={[0.25, -0.53, 0.09]} size={[0.15, 0.05, 0.04]} material={m.white} />
            </>
)}
            {(isNagisa || isNana) && [-1, 0, 1].map(side => <Part key={side} at={[side * 0.19, isNagisa ? -0.3 : -0.18, -0.18]} size={[0.11, isNagisa ? 0.5 : 0.28, 0.11]} shape={ball} material={m.hair} />)}
          </group>
          {(isSui || isShiori || isNagisa || plan?.prop === "cap") && (
<>
            <Part at={[0, 0.265, -0.025]} size={[0.31, 0.12, 0.27]} shape={ball} material={isSui ? m.trim : isShiori ? m.trim : isNagisa ? m.white : m.bag} />
            <Part at={[0, 0.21, isSui ? 0.2 : 0.03]} size={[0.31, 0.025, isSui ? 0.18 : 0.27]} shape={ball} material={m.trim} />
          </>
)}
          {isSui && [-1, 1].map(side => (
<group key={side}>
            <Part at={[side * 0.22, 0.39, -0.02]} size={[0.11, 0.21, 0.08]} shape={cone} rotation={[0, 0, -side * 0.15]} material={m.trim} />
            <Part at={[side * 0.22, 0.39, 0.025]} size={[0.06, 0.13, 0.015]} shape={cone} material={m.outfit} />
          </group>
))}
          {isShiori && <Part at={[0.245, 0.32, 0.04]} size={[0.09, 0.13, 0.025]} shape={cone} rotation={[0, 0, -0.8]} material={m.white} />}
          {isNana && <Part at={[-0.16, 0.16, 0.2]} size={[0.09, 0.025, 0.02]} material={m.bag} />}
        </group>
      </group>
      {plan?.prop === "camera" && (
<group ref={camera}>
        <Part size={[0.34, 0.21, 0.15]} material={m.shoe} />
        <Part at={[0.035, 0, 0.11]} size={[0.085, 0.085, 0.065]} shape={ball} material={m.blue} />
        <Part at={[-0.1, 0.06, 0.09]} size={[0.06, 0.04, 0.02]} material={m.white} />
      </group>
)}
    </group>
  );
}
