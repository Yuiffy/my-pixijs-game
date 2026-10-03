"use client";

import { useFrame } from "@react-three/fiber";
import { useMemo, useRef, type MutableRefObject } from "react";
import * as THREE from "three";
import { friendlyStage } from "./world";
import type { Game } from "./types";
import type { RenderStats } from "./Scene";

export default function SuiActor({
  asset,
  game,
  stats,
}: {
  asset: THREE.Group;
  game: MutableRefObject<Game>;
  stats: MutableRefObject<RenderStats>;
}) {
  const root = useRef<THREE.Group>(null);
  const previous = useRef({ x: -4.15, z: 1.15 });
  const lastShadow = useRef<boolean | null>(null);
  const rig = useMemo(() => {
    const joints: Record<string, THREE.Object3D> = {};
    const meshes: THREE.Mesh[] = [];
    let mouth: THREE.Mesh | null = null;
    asset.traverse((o) => {
      if (/^Sui_/.test(o.name) && !(o instanceof THREE.Mesh)) joints[o.name] = o;
      if (o instanceof THREE.Mesh) meshes.push(o);
      if (
        o instanceof THREE.Mesh &&
        o.morphTargetDictionary?.Smile !== undefined
      ) mouth = o;
    });
    return { joints, meshes, mouth: mouth as THREE.Mesh | null };
  }, [asset]);

  useFrame(({ clock }, dt) => {
    const g = game.current;
    if (!root.current) return;
    const friendly = friendlyStage(g);
    const actor = friendly ? g.sui : g.echo;
    const frozen = ["paused", "dead", "ending"].includes(g.mode);
    const t = frozen
      ? g.time
      : g.panel !== "none" || g.mode === "title"
        ? clock.elapsedTime
        : g.time;
    const walking =
      Math.hypot(actor.x - previous.current.x, actor.z - previous.current.z) >
      0.00015;
    previous.current = { x: actor.x, z: actor.z };
    root.current.position.set(actor.x, 0, actor.z);
    root.current.rotation.y = actor.yaw;
    root.current.visible = g.stage !== "power";
    const gesture = !friendly
      ? "worried"
      : g.panel === "photo"
        ? "heart"
        : g.evening.gestureUntil > g.time || g.mode === "title"
          ? g.evening.gesture
          : "idle";
    const wave = walking && !frozen ? Math.sin(t * 7) * 0.23 : 0;
    const ease = Math.min(1, dt * 7);
    const targets: Record<string, number[]> = {};
    const pose = (name: string, x: number, y = 0, z = 0) => {
      targets[name] = [x, y, z];
    };
    pose("Body", Math.sin(t * 1.8) * 0.008, 0, Math.sin(t * 1.2) * 0.008);
    pose(
      "Head",
      gesture === "shy" ? 0.045 : -0.015,
      0,
      gesture === "shy"
        ? 0.075
        : !friendly
          ? Math.sin(t * 0.5) * 0.06
          : Math.sin(t * 0.8) * 0.016,
    );
    pose("LeftLeg", wave);
    pose("RightLeg", -wave);
    pose("LeftShin", Math.max(0, -wave) * 0.65);
    pose("RightShin", Math.max(0, wave) * 0.65);
    pose("LeftArm", -wave * 0.7, 0, 0.045);
    pose("RightArm", wave * 0.7, 0, -0.045);
    pose("LeftForearm", -0.12);
    pose("RightForearm", -0.12);
    pose("LeftHand", 0);
    pose("RightHand", 0);
    if (gesture === "wave" && !walking) {
      pose("RightArm", -0.65, 0, -0.45);
      pose("RightForearm", -1.65, 0, Math.sin(t * 5) * 0.12);
    } else if (gesture === "heart") {
      pose("LeftArm", -0.58, 0, 0.47);
      pose("RightArm", -0.58, 0, -0.47);
      pose("LeftForearm", -1.39, 0, 0.43);
      pose("RightForearm", -1.39, 0, -0.43);
      pose("LeftHand", 0, 0, 0.65);
      pose("RightHand", 0, 0, -0.65);
    } else if (
      gesture === "offer" ||
      (friendly && g.evening.served && g.stage === "photo")
    ) {
      pose("RightArm", -0.5, 0, -0.05);
      pose("RightForearm", -0.85);
    } else if (gesture === "shy") {
      pose("LeftArm", -0.08, 0, 0.13);
      pose("RightArm", -0.08, 0, -0.13);
      pose("LeftForearm", -0.25);
      pose("RightForearm", -0.25);
    }
    pose(
      "LeftHair",
      wave * 0.11,
      Math.sin(t * 1.2) * 0.025,
      Math.sin(t * 1.4) * 0.018,
    );
    pose(
      "RightHair",
      -wave * 0.11,
      -Math.sin(t * 1.2) * 0.025,
      -Math.sin(t * 1.4) * 0.018,
    );
    pose("LeftWing", 0, Math.sin(t * 1.1) * 0.03);
    pose("RightWing", 0, -Math.sin(t * 1.1) * 0.03);
    Object.entries(targets).forEach(([name, [x, y, z]]) => {
      const joint = rig.joints[`Sui_${name}`];
      if (!joint) return;
      joint.rotation.x = THREE.MathUtils.lerp(joint.rotation.x, x, ease);
      joint.rotation.y = THREE.MathUtils.lerp(joint.rotation.y, y, ease);
      joint.rotation.z = THREE.MathUtils.lerp(joint.rotation.z, z, ease);
    });
    const blinkPhase = (t + 0.8) % 4.3;
    const blink =
      friendly && blinkPhase < 0.16
        ? Math.sin((blinkPhase / 0.16) * Math.PI)
        : 0;
    for (const side of ["Left", "Right"]) {
      const eye = rig.joints[`Sui_${side}Eye`];
      if (eye) eye.scale.y = Math.max(
          0.04,
          (gesture === "shy" ? 0.9 : 1) * (1 - blink),
        );
    }
    const { mouth } = rig;
    const speaking =
      friendly &&
      g.mode !== "paused" &&
      (g.panel === "dialogue" ||
        (g.subtitle.speaker === "岁己" && g.subtitle.until > g.time));
    const smile = friendly && gesture !== "worried" ? 0.82 : 0;
    if (mouth?.morphTargetInfluences && mouth.morphTargetDictionary) {
      const weights = mouth.morphTargetInfluences;
      const keys = mouth.morphTargetDictionary;
      weights[keys.Smile] = smile;
      weights[keys.Talk] = speaking ? Math.max(0, Math.sin(t * 9)) * 0.65 : 0;
      weights[keys.Worry] = gesture === "worried" ? 0.8 : 0;
    }
    // A real companion casts a shadow. Her repeating copy does not.
    if (lastShadow.current !== friendly) {
      rig.meshes.forEach((mesh) => {
        mesh.castShadow = friendly;
      });
      lastShadow.current = friendly;
    }
    stats.current.character = {
      revision: 2,
      actor: friendly ? "sui" : "echo",
      gesture,
      joints: Object.keys(rig.joints).length,
      morphs: Object.keys(mouth?.morphTargetDictionary || {}),
      blink,
      smile,
    };
  });
  return (
    <group ref={root}>
      <primitive object={asset} />
    </group>
  );
}
