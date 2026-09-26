"use client";

import { memo, useEffect, useMemo, useRef } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import {
  distance,
  Save,
  Spot,
  partnerPose,
  partnerBehavior,
  interactionPoint,
} from "./engine";
import { FURNITURE, SCALE, worldPoint } from "./navigation";
import { objective } from "./guide";
import { AIM_POINTS, lookPoint, Runtime3D } from "./runtime3d";
import {
  avatarTexture,
  labelTexture,
  woodTexture,
  paintTactical,
  paintAvatar,
} from "./textures3d";

import { skinOf } from "./skins";
import { SkinDetails } from "./SkinDetails";
import DailyScene, { MealModels } from "./DailyScene";
import { offAir } from "./daily";
import { onBreak } from "./household";
import HouseholdScene from "./HouseholdScene";

type Vec = [number, number, number];
type BoxProps = {
  at: Vec;
  size: Vec;
  color?: string;
  rotation?: Vec;
  map?: THREE.Texture;
  glow?: string;
  metal?: number;
  shadow?: boolean;
};
function Box({
  at,
  size,
  color = "#c8ae88",
  rotation = [0, 0, 0],
  map,
  glow = "#000000",
  metal = 0,
  shadow = true,
}: BoxProps) {
  return (
    <mesh position={at} rotation={rotation} castShadow={shadow} receiveShadow>
      <boxGeometry args={size} />
      <meshStandardMaterial
        color={color}
        map={map}
        emissive={glow}
        emissiveIntensity={0.25}
        roughness={0.76}
        metalness={metal}
      />
    </mesh>
  );
}
function Ball({
  at,
  scale = [1, 1, 1],
  color,
  radius = 0.1,
}: {
  at: Vec;
  scale?: Vec;
  color: string;
  radius?: number;
}) {
  return (
    <mesh position={at} scale={scale} castShadow receiveShadow>
      <sphereGeometry args={[radius, 16, 12]} />
      <meshStandardMaterial color={color} roughness={0.84} />
    </mesh>
  );
}
function Rod({
  from,
  to,
  radius = 0.025,
  color,
}: {
  from: Vec;
  to: Vec;
  radius?: number;
  color: string;
}) {
  const a = new THREE.Vector3(...from);
  const b = new THREE.Vector3(...to);
  const direction = b.clone().sub(a);
  const quaternion = new THREE.Quaternion().setFromUnitVectors(
    new THREE.Vector3(0, 1, 0),
    direction.clone().normalize(),
  );
  return (
    <mesh
      position={a.add(b).multiplyScalar(0.5)}
      quaternion={quaternion}
      castShadow
    >
      <cylinderGeometry args={[radius, radius, direction.length(), 10]} />
      <meshStandardMaterial color={color} roughness={0.7} />
    </mesh>
  );
}
function Plant({ at, size = 1 }: { at: Vec; size?: number }) {
  return (
    <group position={at} scale={size}>
      <mesh position={[0, 0.16, 0]} castShadow>
        <cylinderGeometry args={[0.2, 0.15, 0.32, 14]} />
        <meshStandardMaterial color="#bc856a" roughness={1} />
      </mesh>
      <Rod
        from={[0, 0.28, 0]}
        to={[0, 0.8, 0]}
        radius={0.025}
        color="#5d7450"
      />
      {Array.from({ length: 7 }, (_, i) => (
        <group key={i} rotation={[0.15, i * 2.39, 0.35]}>
          <Ball
            at={[0.13, 0.42 + i * 0.04, 0]}
            radius={0.15}
            scale={[1.1, 0.45, 1.7]}
            color={i % 2 ? "#6f8b61" : "#829c70"}
          />
        </group>
      ))}
    </group>
  );
}
function FoodBag({
  at = [0, 0, 0],
  texture,
}: {
  at?: Vec;
  texture: THREE.Texture;
}) {
  return (
    <group position={at}>
      <Box at={[0, 0.145, 0]} size={[0.25, 0.29, 0.19]} color="#d2a36e" />
      <mesh position={[0, 0.32, 0]}>
        <torusGeometry args={[0.075, 0.01, 6, 16, Math.PI]} />
        <meshStandardMaterial color="#af784b" />
      </mesh>
      <mesh position={[0, 0.155, 0.097]}>
        <planeGeometry args={[0.2, 0.13]} />
        <meshStandardMaterial map={texture} roughness={1} />
      </mesh>
    </group>
  );
}
function Charger({ at = [0, 0, 0] }: { at?: Vec }) {
  return (
    <group position={at}>
      <Box at={[0, 0.045, 0]} size={[0.12, 0.08, 0.085]} color="#f8efdd" />
      <Box
        at={[0.036, 0.045, -0.055]}
        size={[0.014, 0.02, 0.04]}
        color="#a3a19a"
      />
      <Box
        at={[-0.036, 0.045, -0.055]}
        size={[0.014, 0.02, 0.04]}
        color="#a3a19a"
      />
      <mesh position={[0.11, 0.01, 0.02]} rotation={[-Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.065, 0.008, 6, 22]} />
        <meshStandardMaterial color="#e8dfcd" />
      </mesh>
    </group>
  );
}
function Monitor({
  at,
  texture,
  width = 1,
  live = false,
}: {
  at: Vec;
  texture: THREE.Texture;
  width?: number;
  live?: boolean;
}) {
  return (
    <group position={at}>
      <Box at={[0, 0, 0]} size={[width, width * 0.65, 0.065]} color="#444e4c" />
      <mesh position={[0, 0.015, 0.036]}>
        <planeGeometry args={[width - 0.06, width * 0.65 - 0.07]} />
        <meshStandardMaterial
          map={texture}
          emissiveMap={texture}
          emissive="#ffffff"
          emissiveIntensity={0.35}
          roughness={0.4}
        />
      </mesh>
      <Rod
        from={[0, -0.2, -0.01]}
        to={[0, -width * 0.46, -0.01]}
        radius={0.034}
        color="#555b54"
      />
      <Box
        at={[0, -width * 0.46, 0.025]}
        size={[0.35, 0.025, 0.25]}
        color="#555b54"
      />
      {live && (
        <Ball
          at={[width * 0.43, -width * 0.28, 0.04]}
          color="#d9766d"
          radius={0.014}
        />
      )}
    </group>
  );
}
function Partner({
  runtime: r,
  appearance,
  player = false,
}: {
  runtime: Runtime3D;
  appearance: Save;
  player?: boolean;
}) {
  const rig = useRef<THREE.Group>(null);
  const head = useRef<THREE.Group>(null);
  const left = useRef<THREE.Group>(null);
  const right = useRef<THREE.Group>(null);
  const eyes = useRef<THREE.Group>(null);
  const headphones = useRef<THREE.Group>(null);
  const towel = useRef<THREE.Group>(null);
  const smile = useRef<THREE.Mesh>(null);
  const mouth = useRef<THREE.Mesh>(null);
  const seatedLegs = useRef<THREE.Group>(null);
  const standingLegs = useRef<THREE.Group>(null);
  const lastAnimationTime = useRef(r.elapsedFrame);
  const skin = skinOf(appearance.skin);
  const longHair = player
    ? appearance.player === "女友"
    : skin.id === "host" && appearance.partner === "她";
  const sweater = player ? "#6f9283" : skin.outfit;
  const hair = player ? "#63513f" : skin.hair;
  useFrame((_, dt) => {
    if (!rig.current) return;
    const motionDt = r.game.phase === 'paused' ? 0 :
      r.manual && r.game.phase !== "ready"
        ? Math.min(0.5, Math.max(0, r.elapsedFrame - lastAnimationTime.current))
        : dt;
    lastAnimationTime.current = r.elapsedFrame;
    if (headphones.current) headphones.current.visible = !offAir(r.game) && !onBreak(r.game);
    if (towel.current) towel.current.visible = !player && offAir(r.game) && r.game.daily?.after === "shower";
    rig.current.visible = (!player || r.game.won) && (r.game.won || !onBreak(r.game) || r.game.daily?.household.rest.stage !== "inside");
    const pos = r.game.won
      ? { x: player ? 209 : 259, y: 327 }
      : partnerPose(r.game);
    const [x, z] = worldPoint(pos);
    const stand = player || r.game.won ? 0 : partnerPose(r.game).stand;
    rig.current.position.set(x, stand * 0.24, z);
    if (seatedLegs.current) seatedLegs.current.visible = stand < 0.1;
    if (standingLegs.current) {
      standingLegs.current.visible = stand >= 0.1;
      standingLegs.current.position.y = -stand * 0.24;
      standingLegs.current.scale.y = (0.61 + stand * 0.24) / 0.85;
      standingLegs.current.children.forEach((leg, i) => {
        leg.rotation.x =
          (stand > 0.1 && stand < 0.95) || onBreak(r.game)
            ? Math.sin(r.game.elapsed * 9 + i * Math.PI) * 0.12
            : 0;
      });
    }
    const [px, pz] = worldPoint(r.game.player);
    const near = Math.hypot(px - x, pz - z) < 2.2;
    const behavior = partnerBehavior(r.game);
    const romantic =
      ["hug", "kiss", "bonus"].includes(r.game.actionKey) &&
      r.game.actionProgress > 0 &&
      !r.game.busy;
    const wanted = r.game.won
      ? Math.atan2(-2.7 - x, 1.74 - z)
      : onBreak(r.game) && r.game.daily ? r.game.daily.household.rest.yaw
      : near && (behavior.peek || romantic || offAir(r.game))
        ? Math.atan2(px - x, pz - z)
        : Math.PI;
    if (mouth.current && smile.current) {
      mouth.current.visible = !player && behavior.speaking && !romantic;
      mouth.current.scale.set(1, 0.2 + behavior.mouth, 0.14);
      smile.current.visible = !mouth.current.visible;
    }
    rig.current.rotation.y +=
      Math.atan2(
        Math.sin(wanted - rig.current.rotation.y),
        Math.cos(wanted - rig.current.rotation.y),
      ) * Math.min(1, motionDt * 4);
    if (head.current) {
      head.current.rotation.z =
        r.game.won && !player
          ? 0.14
          : near
            ? Math.sin(r.game.pulse * 0.25) * 0.055
            : 0.02;
      head.current.rotation.x = near ? -0.08 : 0.04;
    }
    const hugging =
      ["hug", "kiss", "bonus"].includes(r.game.actionKey) &&
      r.game.actionProgress > 0;
    const invitation =
      near &&
      (r.game.tasks.some(
        (t) => ["hug", "kiss"].includes(t) && !r.game.done.includes(t),
      ) ||
        r.game.affection > 0);
    for (const arm of [left.current, right.current]) if (arm) arm.rotation.x +=
          ((offAir(r.game) && r.game.daily?.after === "rice" ? -0.6 + Math.sin(r.game.daily.clock * 4) * 0.2 : hugging ? -1.45 : invitation ? -0.8 : -0.3) - arm.rotation.x) *
          Math.min(1, motionDt * 6);
    if (eyes.current) eyes.current.scale.y = Math.sin(r.game.pulse * 0.37) > 0.99 ? 0.15 : 1;
    if (!player) {
      r.tracking.yaw = rig.current.rotation.y;
      r.tracking.pitch = head.current?.rotation.x ?? 0;
      r.tracking.roll = head.current?.rotation.z ?? 0;
      r.tracking.mouth = mouth.current?.visible ? 0.2 + behavior.mouth : 0;
      r.tracking.blink = eyes.current?.scale.y ?? 1;
      r.tracking.stand = stand;
    }
  });
  return (
    <group
      ref={rig}
      rotation={[0, Math.PI, 0]}
      userData={player ? { ignoreRay: true } : { spot: "partner" }}
    >
      <Ball
        at={[0, 0.85, 0]}
        radius={0.25}
        scale={[0.82, 1.03, 0.62]}
        color={sweater}
      />
      {!player && <SkinDetails id={skin.id} part="body" />}
      <Box at={[0, 0.61, 0.02]} size={[0.34, 0.15, 0.3]} color="#6a625e" />
      <group ref={seatedLegs}>
        {[-1, 1].map((sign) => (
          <group key={sign}>
            <Rod
              from={[sign * 0.11, 0.6, 0.07]}
              to={[sign * 0.11, 0.47, 0.44]}
              radius={0.08}
              color="#6a625e"
            />
            <Rod
              from={[sign * 0.11, 0.47, 0.44]}
              to={[sign * 0.11, 0.13, 0.49]}
              radius={0.065}
              color="#756d63"
            />
            <Ball
              at={[sign * 0.11, 0.1, 0.56]}
              scale={[0.85, 0.52, 1.45]}
              color="#e5d5bd"
              radius={0.1}
            />
          </group>
        ))}
      </group>
      <group ref={standingLegs}>
        {[-1, 1].map((sign) => (
          <group key={sign}>
            <Rod
              from={[sign * 0.11, 0.85, 0.03]}
              to={[sign * 0.11, 0.44, 0.07]}
              radius={0.073}
              color="#6a625e"
            />
            <Rod
              from={[sign * 0.11, 0.44, 0.07]}
              to={[sign * 0.11, 0.1, 0.08]}
              radius={0.065}
              color="#756d63"
            />
            <Ball
              at={[sign * 0.11, 0.065, 0.14]}
              radius={0.1}
              scale={[0.85, 0.52, 1.4]}
              color="#e5d5bd"
            />
          </group>
        ))}
      </group>
      <Rod
        from={[0, 1.01, 0]}
        to={[0, 1.18, 0]}
        radius={0.065}
        color="#eec3a5"
      />
      <group ref={towel}>
        <Box at={[0, 1.03, -0.045]} size={[0.47, 0.085, 0.18]} color="#d3ddd0" />
        <Box at={[-0.15, 0.91, 0.15]} size={[0.1, 0.3, 0.035]} color="#d3ddd0" />
        <Box at={[0.15, 0.91, 0.15]} size={[0.1, 0.3, 0.035]} color="#d3ddd0" />
      </group>
      <group ref={head} position={[0, 1.29, 0]}>
        {!player && <SkinDetails id={skin.id} part="head" />}
        <Ball
          at={[0, 0, -0.025]}
          radius={0.205}
          scale={[1, 1.15, 0.9]}
          color={hair}
        />
        {longHair && (
          <>
            <Ball
              at={[-0.155, -0.15, -0.075]}
              radius={0.115}
              scale={[0.65, 2.1, 0.9]}
              color={hair}
            />
            <Ball
              at={[0.155, -0.15, -0.075]}
              radius={0.115}
              scale={[0.65, 2.1, 0.9]}
              color={hair}
            />
          </>
        )}
        <Ball
          at={[0, -0.025, 0.065]}
          radius={0.171}
          scale={[1, 1.1, 0.8]}
          color="#f1c9ac"
        />
        <Ball
          at={[-0.045, 0.115, 0.075]}
          radius={0.16}
          scale={[1.13, 0.47, 0.75]}
          color={hair}
        />
        <Ball
          at={[0.14, 0.06, 0.065]}
          radius={0.075}
          scale={[0.55, 1.4, 0.8]}
          color={hair}
        />
        <group ref={eyes} position={[0, -0.01, 0.192]}>
          {[-1, 1].map((sign) => (
            <group key={sign}>
              {!player && skin.id !== "host" && <Ball at={[sign * 0.064, 0, -0.003]} radius={0.023} scale={[1, 1.28, 0.3]} color="#fff2e7" />}
              <Ball
                at={[sign * 0.064, 0, 0]}
                radius={!player && skin.id !== "host" ? 0.015 : 0.019}
                scale={[1, 1.25, 0.3]}
                color={player ? "#4f4344" : skin.eyes}
              />
              {!player && skin.id !== "host" && <Ball at={[sign * 0.064, 0, 0.005]} radius={0.008} scale={[0.8, 1.3, 0.22]} color="#392a39" />}
              <Ball
                at={[sign * 0.064 - 0.004, 0.006, 0.011]}
                radius={0.005}
                color="#fff9e8"
              />
            </group>
          ))}
        </group>
        <Ball
          at={[0, -0.055, 0.203]}
          radius={0.017}
          scale={[0.7, 0.8, 0.7]}
          color="#e8b597"
        />
        <mesh
          ref={smile}
          position={[0, -0.088, 0.188]}
          rotation={[0, 0, Math.PI]}
        >
          <torusGeometry args={[0.022, 0.0035, 5, 12, Math.PI]} />
          <meshStandardMaterial color="#a96965" />
        </mesh>
        <mesh ref={mouth} position={[0, -0.09, 0.19]}>
          <sphereGeometry args={[0.021, 12, 10]} />
          <meshStandardMaterial color="#713e3d" roughness={1} />
        </mesh>
        {[-1, 1].map((sign) => (
          <Ball
            key={sign}
            at={[sign * 0.105, -0.06, 0.166]}
            radius={0.027}
            scale={[1, 0.42, 0.13]}
            color="#dd9c95"
          />
        ))}
        {!player && (
          <group ref={headphones}>
            <mesh rotation={[0, 0, 0]}>
              <torusGeometry args={[0.222, 0.018, 8, 22, Math.PI]} />
              <meshStandardMaterial color={skin.id === "host" ? skin.accent : skin.dark} />
            </mesh>
            <Ball
              at={[-0.216, 0, 0]}
              radius={0.067}
              scale={[0.44, 1.3, 0.8]}
              color={skin.id === "host" ? skin.accent : skin.dark}
            />
            <Ball
              at={[0.216, 0, 0]}
              radius={0.067}
              scale={[0.44, 1.3, 0.8]}
              color={skin.id === "host" ? skin.accent : skin.dark}
            />
          </group>
        )}
      </group>
      {[-1, 1].map((sign) => (
        <group
          key={sign}
          ref={sign < 0 ? left : right}
          position={[sign * 0.21, 1, 0]}
          rotation={[-0.3, 0, sign * 0.15]}
        >
          <Rod
            from={[0, 0, 0]}
            to={[0, -0.25, 0]}
            radius={0.065}
            color={sweater}
          />
          <Rod
            from={[0, -0.25, 0]}
            to={[0, -0.46, 0.035]}
            radius={0.05}
            color="#edc4a5"
          />
          <Ball
            at={[0, -0.48, 0.035]}
            radius={0.058}
            scale={[0.75, 1.08, 0.5]}
            color="#f1c9ac"
          />
        </group>
      ))}
    </group>
  );
}

function Room({
  runtime: r,
  appearance,
}: {
  runtime: Runtime3D;
  appearance: Save;
}) {
  const textures = useMemo(
    () => ({
      wood: woodTexture(),
      avatar: avatarTexture(),
      game: labelTexture("DELTA", "NORTH BRIDGE  /  SQUAD ONLINE", "#3e665b"),
      poster: labelTexture(
        "今夜的月亮",
        "STAY A LITTLE LONGER",
        "#9eaaa0",
        "#394f43",
      ),
      door: labelTexture("ON AIR", "轻一点，我们的小秘密", "#a26a67"),
      food: labelTexture("热乎的晚饭", "给我最喜欢的人", "#e5c18e", "#806044"),
      book: labelTexture(
        "OUR LITTLE HOME",
        "一屋 · 两人 · 无数句悄悄话",
        "#d2b490",
        "#735941",
      ),
    }),
    [],
  );
  const door = useRef<THREE.Group>(null);
  const bag = useRef<THREE.Group>(null);
  const charger = useRef<THREE.Group>(null);
  const delivered = useRef<THREE.Group>(null);
  const onSofa = useRef<THREE.Group>(null);
  const led = useRef<THREE.MeshStandardMaterial>(null);
  const chair = useRef<THREE.Group>(null);
  const roomLight = useRef<THREE.HemisphereLight>(null);
  const lastOffAir = useRef<boolean | null>(null);
  const avatarSignature = useRef('');
  const lastAnimationTime = useRef(r.elapsedFrame);
  const lastMonitorFrame = useRef(-1);
  useEffect(
    () => () => Object.values(textures).forEach((t) => t.dispose()),
    [textures],
  );
  useFrame((_, dt) => {
    const { tracking } = r;
    const offline = offAir(r.game);
    if (roomLight.current) roomLight.current.intensity = offline ? 0.72 : 1.15;
    if (lastOffAir.current !== offline) {
      lastOffAir.current = offline;
      const c = (textures.door.image as HTMLCanvasElement).getContext("2d");
      if (c) { c.fillStyle = offline ? "#567564" : "#a26a67"; c.fillRect(0, 0, 512, 320); c.fillStyle = "#f5e8cc"; c.textAlign = "center"; c.font = "bold 44px sans-serif"; c.fillText(offline ? "OFF AIR" : "ON AIR", 256, 155); textures.door.needsUpdate = true; }
    }
    // The swivel seat follows the seated body. It stays behind when the partner stands up.
    if (chair.current && tracking.stand < 0.1 && !r.game.won) {
      chair.current.rotation.y = tracking.yaw;
      tracking.chairYaw = tracking.yaw;
    }
    const signature = [tracking.yaw, tracking.pitch, tracking.roll, tracking.mouth, tracking.blink, tracking.stand, r.game.won, offline, appearance.skin].join('|');
    if (signature !== avatarSignature.current) {
      paintAvatar(textures.avatar, tracking, r.game.won || offline, appearance.skin);
      avatarSignature.current = signature;
      tracking.avatarYaw = Math.atan2(Math.sin(tracking.yaw - Math.PI), Math.cos(tracking.yaw - Math.PI));
      tracking.avatarMouth = tracking.mouth;
      tracking.avatarBlink = tracking.blink;
      tracking.avatarUpdates++;
    }
    const motionDt = r.game.phase === 'paused' ? 0 :
      r.manual && r.game.phase !== "ready"
        ? Math.min(0.5, Math.max(0, r.elapsedFrame - lastAnimationTime.current))
        : dt;
    lastAnimationTime.current = r.elapsedFrame;
    if (door.current) door.current.rotation.y = THREE.MathUtils.damp(
        door.current.rotation.y,
        r.game.doorClosed ? 0 : Math.PI / 2,
        10,
        motionDt,
      );
    const monitorFrame = Math.floor(r.game.elapsed * 8);
    if (monitorFrame !== lastMonitorFrame.current) {
      lastMonitorFrame.current = monitorFrame;
      paintTactical(
        textures.game,
        r.game.elapsed,
        r.game.delta?.active ? r.game.delta.hits / 8 : 0,
        r.game.quiet,
      );
    }
    if (bag.current) bag.current.visible =
        !r.game.daily?.homemade && (r.game.daily?.meal !== "noodles" || r.game.daily.household.noodles === "delivery") && r.game.carry !== "food" &&
        !r.game.done.includes("food") &&
        r.game.busy?.key !== "pickup-food";
    if (charger.current) charger.current.visible =
        r.game.carry !== "charger" &&
        !r.game.done.includes("charger") &&
        r.game.busy?.key !== "pickup-charger";
    if (delivered.current) {
      const p =
        r.game.busy?.key === "food"
          ? r.game.busy.elapsed / r.game.busy.duration
          : 0;
      const growth = r.game.done.includes("food")
        ? 1
        : Math.max(0, Math.min(1, (p - 0.45) / 0.5));
      delivered.current.visible = growth > 0;
      delivered.current.scale.setScalar(Math.max(0.01, growth));
      delivered.current.position.y = 0.825 + (1 - growth) * 0.12;
    }
    if (onSofa.current) onSofa.current.visible = r.game.done.includes("charger");
    if (led.current) {
      led.current.color.set(
        r.game.muted > 0 || r.game.won || offAir(r.game) ? "#80b18a" : "#d87067",
      );
      led.current.emissive.copy(led.current.color);
    }
  });
  const furniture = (name: string) => {
    const o = FURNITURE.find((f) => f.name === name)!;
    const [x, z] = worldPoint({ x: o.x + o.w / 2, y: o.y + o.h / 2 });
    return { at: [x, 0, z] as Vec, w: o.w / SCALE, d: o.h / SCALE };
  };
  const sofa = furniture("sofa");
  const desk = furniture("desk");
  const studio = furniture("studioDesk");
  const bed = furniture("bed");
  const drawer = furniture("drawer");
  const coffee = furniture("coffee");
  const entry = furniture("entryTable");
  return (
    <>
      <color attach="background" args={["#b9c3bd"]} />
      <hemisphereLight ref={roomLight} args={["#fff4dc", "#b6b5a0", 1.15]} />
      <ambientLight intensity={0.5} />
      <directionalLight
        position={[-4, 7, 2]}
        color="#fff0d1"
        intensity={2.1}
        castShadow
        shadow-mapSize={[1024, 1024]}
        shadow-camera-left={-8}
        shadow-camera-right={8}
        shadow-camera-top={8}
        shadow-camera-bottom={-8}
        shadow-normalBias={0.035}
      />
      <pointLight
        position={[3.5, 2.4, -0.9]}
        color="#ffd2bd"
        intensity={10}
        distance={6}
        decay={2}
      />
      <pointLight
        position={[-4.7, 1.6, 0.8]}
        color="#ffdaa0"
        intensity={8}
        distance={4}
        decay={2}
      />
      <Box
        at={[0, -0.1, 0]}
        size={[12.25, 0.2, 6]}
        color="#ffffff"
        map={textures.wood}
      />
      <Box at={[0, 1.4, -2.94]} size={[12.3, 2.8, 0.18]} color="#ebe3cf" />
      <Box at={[0, 1.4, 2.97]} size={[12.3, 2.8, 0.15]} color="#e9dec7" />
      <Box at={[-6.08, 1.4, 0]} size={[0.16, 2.8, 6]} color="#d8ddcb" />
      <Box at={[6.02, 1.4, 0]} size={[0.16, 2.8, 6]} color="#e1c9bb" />
      <Box
        at={[0, 2.88, 0]}
        size={[12.3, 0.12, 6]}
        color="#efe7d4"
        shadow={false}
      />
      {[-2.81, 2.82].map((z) => (
        <Box key={z} at={[0, 0.1, z]} size={[12, 0.18, 0.08]} color="#bdab8b" />
      ))}
      <Box at={[0.571, 1.4, -1.071]} size={[0.4, 2.8, 3.715]} color="#e7dac2" />
      <Box at={[0.571, 1.4, 2.4]} size={[0.4, 2.8, 1.2]} color="#e7dac2" />
      <Box at={[0.571, 2.5, 1.31]} size={[0.4, 0.6, 1.05]} color="#e7dac2" />
      <group
        ref={door}
        position={[0.571, 0, 0.786]}
        rotation={[0, Math.PI / 2, 0]}
        userData={{ spot: "door" }}
      >
        <Box
          at={[0, 1.075, 0.515]}
          size={[0.075, 2.15, 1.03]}
          color="#ac9575"
        />
        <Box
          at={[-0.047, 1.09, 0.5]}
          size={[0.02, 1.73, 0.76]}
          color="#bda889"
        />
        <Ball at={[-0.09, 1, 0.87]} radius={0.042} color="#c1aa74" />
        <Ball at={[0.09, 1, 0.87]} radius={0.042} color="#c1aa74" />
      </group>
      <mesh position={[0.345, 2.38, 1.3]} rotation={[0, -Math.PI / 2, 0]}>
        <planeGeometry args={[0.78, 0.28]} />
        <meshStandardMaterial
          map={textures.door}
          emissive="#aa6f61"
          emissiveIntensity={0.15}
        />
      </mesh>
      {/* Window, curtains and quiet city lights. */}
      <Box at={[-1.2, 1.72, -2.82]} size={[2.15, 1.26, 0.13]} color="#a18e75" />
      <Box
        at={[-1.2, 1.72, -2.74]}
        size={[2.02, 1.13, 0.035]}
        color="#718b9a"
      />
      <Ball
        at={[-0.6, 2.03, -2.7]}
        radius={0.13}
        scale={[1, 1, 0.1]}
        color="#ffedb4"
      />
      {Array.from({ length: 6 }, (_, i) => (
        <Box
          key={i}
          at={[-2.04 + i * 0.31, 1.39, -2.7]}
          size={[0.22, 0.25 + (i % 3) * 0.13, 0.02]}
          color={i % 2 ? "#667c86" : "#536f7d"}
        />
      ))}
      <Box
        at={[-1.2, 1.72, -2.65]}
        size={[0.045, 1.23, 0.06]}
        color="#e0d6bd"
      />
      <Box
        at={[-1.2, 1.73, -2.64]}
        size={[2.13, 0.045, 0.06]}
        color="#e0d6bd"
      />
      {[-2.44, 0.01].map((x) => (
        <Box
          key={x}
          at={[x, 1.63, -2.62]}
          size={[0.38, 1.8, 0.1]}
          color="#e7d8b9"
        />
      ))}
      {/* Personal desk. */}
      <group position={desk.at} userData={{ spot: "desk" }}>
        <Box at={[0, 0.76, 0]} size={[desk.w, 0.09, desk.d]} color="#c29c73" />
        {[-1, 1].map((sign) => (
          <Box
            key={sign}
            at={[sign * (desk.w / 2 - 0.12), 0.36, 0]}
            size={[0.08, 0.72, 0.56]}
            color="#776e5d"
          />
        ))}
        <Monitor
          at={[0.32, 1.18, -0.035]}
          texture={textures.game}
          width={1.02}
        />
        <Box
          at={[0.32, 0.82, 0.21]}
          size={[0.66, 0.035, 0.19]}
          color="#65685e"
        />
        <Ball
          at={[0.82, 0.83, 0.18]}
          radius={0.06}
          scale={[0.65, 0.4, 1]}
          color="#dad9c7"
        />
        <Box at={[-1.06, 1.02, 0]} size={[0.25, 0.49, 0.4]} color="#526b61" />
      </group>
      {/* Sofa, cushions, coffee table and shared books. */}
      <group position={sofa.at} userData={{ spot: "sofa" }}>
        <Box at={[0, 0.29, 0]} size={[sofa.w, 0.42, sofa.d]} color="#78917c" />
        <Box
          at={[0, 0.65, -0.44]}
          size={[sofa.w, 0.66, 0.28]}
          color="#8fa58c"
        />
        {[-1, 1].map((sign) => (
          <group key={sign}>
            <Box
              at={[sign * (sofa.w / 2 - 0.12), 0.5, 0.02]}
              size={[0.27, 0.53, 1.08]}
              color="#8fa58c"
            />
            <Box
              at={[sign * 0.64, 0.535, 0.05]}
              size={[1.13, 0.17, 0.8]}
              color="#a6b69a"
            />
            <Box
              at={[sign * 0.82, 0.76, -0.23]}
              size={[0.47, 0.45, 0.17]}
              color={sign < 0 ? "#d6a58c" : "#e5dcc4"}
              rotation={[-0.12, 0, sign * 0.1]}
            />
          </group>
        ))}

      </group>
      <group position={[worldPoint(AIM_POINTS.charging)[0], AIM_POINTS.charging.height, worldPoint(AIM_POINTS.charging)[1]]} userData={{ spot: "charging" }}>
        <Box at={[0, -0.005, 0]} size={[0.46, 0.045, 0.6]} color="#b98b60" />
        <Box at={[0, 0.023, 0.24]} size={[0.39, 0.015, 0.035]} color="#ead6ad" />
        <group ref={onSofa} position={[0, 0.04, 0]}><Charger /></group>
      </group>
      <mesh
        position={[-3, 0.006, 0.88]}
        rotation={[-Math.PI / 2, 0, 0]}
        receiveShadow
        userData={{ ignoreRay: true }}
      >
        <circleGeometry args={[1.9, 48]} />
        <meshStandardMaterial color="#d7cbb0" roughness={1} />
      </mesh>
      <group position={coffee.at}>
        <mesh position={[0, 0.48, 0]} castShadow receiveShadow>
          <cylinderGeometry args={[0.5, 0.49, 0.075, 24]} />
          <meshStandardMaterial color="#c69f75" />
        </mesh>
        <Box at={[0, 0.23, 0]} size={[0.09, 0.46, 0.55]} color="#977a5c" />
        <mesh position={[-0.13, 0.59, 0.03]} castShadow>
          <cylinderGeometry args={[0.085, 0.065, 0.15, 16]} />
          <meshStandardMaterial color="#ede5cf" />
        </mesh>
        <Box
          at={[0.2, 0.54, -0.08]}
          size={[0.24, 0.025, 0.31]}
          color="#a9b69a"
          map={textures.book}
          rotation={[0, 0.14, 0]}
        />
      </group>
      <Plant at={[-0.4, 0, -0.65]} size={1.15} />
      <Plant at={[5.65, 0, 0.15]} size={1.2} />
      <Plant at={[-5.45, 0, -0.9]} size={0.65} />
      <Rod
        from={[-5.2, 0, 1]}
        to={[-5.2, 1.65, 1]}
        radius={0.025}
        color="#84755b"
      />
      <mesh position={[-5.2, 1.65, 1]}>
        <coneGeometry args={[0.3, 0.32, 20, 1, true]} />
        <meshStandardMaterial color="#ead6a7" side={THREE.DoubleSide} />
      </mesh>
      <mesh position={[-5.985, 1.78, -0.03]} rotation={[0, Math.PI / 2, 0]}>
        <planeGeometry args={[1.12, 0.72]} />
        <meshStandardMaterial map={textures.poster} />
      </mesh>
      {/* Stream setup, acoustic panels and equipment. */}
      <group position={studio.at}>
        <Box
          at={[0, 0.76, 0]}
          size={[studio.w, 0.095, studio.d]}
          color="#c6977e"
        />
        {[-1, 1].map((sign) => (
          <Box
            key={sign}
            at={[sign * (studio.w / 2 - 0.14), 0.36, 0]}
            size={[0.12, 0.72, 0.95]}
            color="#a98571"
          />
        ))}
        <Monitor
          at={[-0.34, 1.24, -0.13]}
          texture={textures.avatar}
          width={1.32}
          live
        />
        <Monitor at={[0.91, 1.15, -0.1]} texture={textures.door} width={0.86} />
        <Box
          at={[-0.27, 0.83, 0.29]}
          size={[0.72, 0.035, 0.2]}
          color="#e2d2bf"
        />
        <Rod
          from={[0.92, 0.84, 0.24]}
          to={[0.84, 1.45, 0.44]}
          radius={0.022}
          color="#555b53"
        />
        <Rod
          from={[0.84, 1.45, 0.44]}
          to={[0.46, 1.37, 0.66]}
          radius={0.022}
          color="#555b53"
        />
        <mesh position={[0.46, 1.23, 0.66]} castShadow>
          <capsuleGeometry args={[0.06, 0.15, 4, 12]} />
          <meshStandardMaterial color="#525b54" />
        </mesh>
        <mesh position={[0.46, 1.12, 0.714]}>
          <sphereGeometry args={[0.019, 10, 8]} />
          <meshStandardMaterial
            ref={led}
            color="#d87067"
            emissive="#d87067"
            emissiveIntensity={1.2}
          />
        </mesh>
        <group userData={{ spot: "table" }}>
        <Box
          at={[-1.2, 0.818, 0.3]}
          size={[0.62, 0.008, 0.42]}
          color="#dcd9bb"
        />
        <group ref={delivered} position={[-1.2, 0.825, 0.3]}>
          <MealModels runtime={r} />
        </group>
        </group>
      </group>
      {Array.from({ length: 9 }, (_, i) => (
        <Box
          key={i}
          at={[1.6 + i * 0.46, 1.85, -2.8]}
          size={[0.35, 0.72, 0.08]}
          color={i % 2 ? "#b69c96" : "#c6ada3"}
        />
      ))}
      <group ref={chair} position={[3.7714285714, 0, -0.4714285714]} rotation={[0, Math.PI, 0]}>
        <Box at={[0, 0.49, 0]} size={[0.61, 0.13, 0.53]} color="#a08b95" />
        <Box at={[0, 0.88, -0.21]} size={[0.57, 0.7, 0.12]} color="#b8a2aa" />
        <Rod
          from={[0, 0.46, 0]}
          to={[0, 0.14, 0]}
          radius={0.045}
          color="#6a6961"
        />
        {[-1, 1].map((sign) => (
          <Rod
            key={sign}
            from={[0, 0.13, 0]}
            to={[sign * 0.3, 0.06, 0.21]}
            radius={0.025}
            color="#6a6961"
          />
        ))}
      </group>
      <Partner runtime={r} appearance={appearance} />
      <Partner runtime={r} appearance={appearance} player />
      {/* Bed and the charger drawer at its foot. */}
      <group position={bed.at} userData={{ spot: "bed" }}>
        <Box at={[0, 0.22, 0]} size={[bed.w, 0.4, bed.d]} color="#b59d85" />
        <Box
          at={[0, 0.46, 0]}
          size={[bed.w - 0.1, 0.17, bed.d - 0.08]}
          color="#e9ddcb"
        />
        <Box at={[-0.78, 0.59, 0]} size={[0.51, 0.17, 0.88]} color="#e6d4c9" />
        <Box
          at={[0.5, 0.58, 0]}
          size={[1.39, 0.09, bed.d - 0.07]}
          color="#a7b69b"
        />
      </group>
      <group position={drawer.at} userData={{ spot: "shelf" }}>
        <Box
          at={[0, 0.27, 0]}
          size={[drawer.w, 0.54, drawer.d]}
          color="#b78f6d"
        />
        <Box
          at={[0, 0.38, drawer.d / 2 + 0.02]}
          size={[drawer.w - 0.07, 0.18, 0.025]}
          color="#cda57e"
        />
        <Box
          at={[0, 0.38, drawer.d / 2 + 0.045]}
          size={[0.16, 0.025, 0.025]}
          color="#8b7557"
        />
        <group ref={charger} position={[0, 0.55, 0]}>
          <Charger />
        </group>
      </group>
      <group position={entry.at} userData={{ spot: "entry" }}>
        <Box
          at={[0, 0.29, 0]}
          size={[entry.w, 0.58, entry.d]}
          color="#bba07d"
        />
        <group ref={bag} position={[0, 0.59, 0]}>
          <FoodBag texture={textures.food} />
        </group>
      </group>
      <Box
        at={[-5.95, 1.07, 2.05]}
        size={[0.065, 2.13, 1.18]}
        color="#9a8b73"
      />
      <Ball at={[-5.89, 1.0, 1.64]} radius={0.045} color="#c5b085" />
      <DailyScene runtime={r} />
      <HouseholdScene runtime={r} />
      <Hands runtime={r} />
      <GoalMarker runtime={r} />
    </>
  );
}
function Hands({
  runtime: r,
}: {
  runtime: Runtime3D;
}) {
  const group = useRef<THREE.Group>(null);
  const food = useRef<THREE.Group>(null);
  const charger = useRef<THREE.Group>(null);
  const arm = useRef<THREE.Mesh>(null);
  const { camera } = useThree();
  useFrame(() => {
    if (!group.current || !arm.current) return;
    const { busy } = r.game;
    const pickup =
      busy?.key === "pickup-food" || busy?.key === "pickup-charger" || busy?.key === "take-noodles";
    const placing = busy?.key === "food" || busy?.key === "charger" || busy?.key === "boil-water";
    const chore = busy && ["cat-food", "cat-litter", "pet-cat", "pour-noodles"].includes(busy.key);
    const item = pickup
      ? busy.key === "pickup-food" || busy.key === "take-noodles"
        ? "food"
        : "charger"
      : chore ? "chore" : r.game.carry;
    const p = busy ? Math.min(1, busy.elapsed / busy.duration) : 0;
    group.current.visible =
      r.game.phase === "playing" &&
      !!item &&
      !(busy?.key === "food" && p > 0.58);
    arm.current.visible = group.current.visible;
    const hold = new THREE.Vector3(
      0.28,
      -0.43 + Math.sin(r.game.pulse) * 0.009,
      -0.49,
    )
      .applyQuaternion(camera.quaternion)
      .add(camera.position);
    const position = hold.clone();
    const rotation = camera.quaternion.clone();
    if (pickup) {
      const spot = busy.key === "take-noodles" ? "kitchen" : busy.key === "pickup-food" ? "entry" : "shelf";
      const point = lookPoint(r, spot);
      const source = new THREE.Vector3(
        spot === "kitchen" ? -1.02 : point.x,
        spot === "kitchen" ? 0.865 : spot === "entry" ? 0.58 : 0.55,
        spot === "kitchen" ? -2.08 : point.z,
      );
      const t = p * p * (3 - 2 * p);
      position.copy(source).lerp(hold, t);
      position.y += Math.sin(p * Math.PI) * 0.09;
      rotation.copy(new THREE.Quaternion()).slerp(camera.quaternion, t);
    } else if (chore) {
      const spot = busy.key === "cat-food" ? "cat-bowl" : busy.key === "cat-litter" ? "cat-litter" : busy.key === "pet-cat" ? "cat" : "kitchen";
      const point = lookPoint(r, spot);
      const target = new THREE.Vector3(point.x + 0.13, point.y + 0.16, point.z);
      position.lerp(target, Math.sin(p * Math.PI) * 0.95);
    } else if (placing) {
      const point = lookPoint(r, busy.key === "boil-water" ? "kitchen" : busy.key === "food" ? "table" : "charging");
      const target = new THREE.Vector3(point.x, point.y, point.z);
      if (busy.key === "boil-water") target.set(-1.02, 0.865, -2.08);
      const t = Math.min(1, p / (busy.key === "food" ? 0.58 : 1));
      position.lerp(target, t * t * (3 - 2 * t));
      rotation.slerp(new THREE.Quaternion(), t);
    }
    group.current.position.copy(position);
    group.current.quaternion.copy(rotation);
    if (food.current) food.current.visible = item === "food";
    if (charger.current) charger.current.visible = item === "charger";
    const origin = new THREE.Vector3(0.38, -0.57, -0.07)
      .applyQuaternion(camera.quaternion)
      .add(camera.position);
    const target = position.clone().add(new THREE.Vector3(0, 0.025, 0));
    const direction = target.clone().sub(origin);
    arm.current.position.copy(origin).add(target).multiplyScalar(0.5);
    arm.current.quaternion.setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      direction.clone().normalize(),
    );
    arm.current.scale.set(1, direction.length(), 1);
  });
  return (
    <group userData={{ ignoreRay: true }}>
      <mesh ref={arm}>
        <cylinderGeometry args={[0.043, 0.056, 1, 12]} />
        <meshStandardMaterial color="#779484" />
      </mesh>
      <group ref={group}>
        <Ball at={[0, 0.025, 0]} radius={0.06} color="#efc7a7" />
        <group ref={food}>
          <MealModels runtime={r} />
        </group>
        <group ref={charger}>
          <Charger />
        </group>
      </group>
    </group>
  );
}
function GoalMarker({ runtime: r }: { runtime: Runtime3D }) {
  const ref = useRef<THREE.Mesh>(null);
  useFrame(() => {
    if (!ref.current) return;
    const goal = objective(r.game);
    const p = lookPoint(r, goal.spot);
    ref.current.visible = r.game.phase === "playing" && r.focus !== goal.spot;
    ref.current.position.set(
      p.x,
      p.y + 0.3 + Math.sin(r.game.pulse * 0.4) * 0.03,
      p.z,
    );
    ref.current.rotation.y = r.game.pulse * 0.3;
  });
  return (
    <mesh ref={ref} userData={{ ignoreRay: true }}>
      <octahedronGeometry args={[0.065]} />
      <meshStandardMaterial
        color="#e5c47d"
        emissive="#d9b463"
        emissiveIntensity={0.55}
        depthTest={false}
      />
    </mesh>
  );
}
function CameraRig({
  runtime: r,
  onTick,
  onReady,
  onLost,
}: {
  runtime: Runtime3D;
  onTick: (dt: number) => void;
  onReady: () => void;
  onLost: () => void;
}) {
  const { camera, scene, gl, size } = useThree();
  const ray = useMemo(() => new THREE.Raycaster(), []);
  const center = useMemo(() => new THREE.Vector2(), []);
  useEffect(() => {
    if (camera instanceof THREE.PerspectiveCamera) {
      camera.fov = size.width < size.height ? 78 : 68;
      camera.updateProjectionMatrix();
    }
  }, [camera, size.width, size.height]);
  const probe = () => {
    const [x, z] = worldPoint(r.game.player);
    if (r.game.won) {
      camera.position.set(-2.7, 1.33, 1.74);
      camera.lookAt(-3.5, 1.0, 0.14);
    } else {
      const intimate =
        ["hug", "kiss", "bonus"].includes(r.game.actionKey) &&
        r.game.actionProgress > 0;
      const amount = intimate
        ? Math.sin((Math.min(1, r.game.actionProgress * 2) * Math.PI) / 2)
        : 0;
      const goal = lookPoint(r, "partner");
      const dx = goal.x - x;
      const dz = goal.z - z;
      const len = Math.hypot(dx, dz) || 1;
      camera.position.set(
        x + (dx / len) * amount * 0.18,
        1.55 -
          amount * 0.12 +
          (r.game.path.length ? Math.sin(r.game.pulse) * 0.008 : 0),
        z + (dz / len) * amount * 0.18,
      );
      camera.rotation.set(r.pitch, r.yaw, 0, "YXZ");
    }
    camera.updateMatrixWorld();
    scene.updateMatrixWorld(true);
    ray.setFromCamera(center, camera);
    ray.far = 1.75;
    r.focus = null;
    for (const hit of ray.intersectObjects(scene.children, true)) {
      let cursor: THREE.Object3D | null = null;
      cursor = hit.object;
      let ignore = false;
      let spot: Spot | null = null;
      while (cursor) {
        if (cursor.userData.ignoreRay || !cursor.visible) ignore = true;
        if (!spot && cursor.userData.spot) spot = cursor.userData.spot as Spot;
        cursor = cursor.parent;
      }
      if (ignore || !hit.object.visible) continue;
      if (
        spot &&
        distance(r.game.player, interactionPoint(r.game, spot)) <
          (spot === "door" ? 110 : 135)
      ) r.focus = spot;
      break;
    }
  };
  useEffect(() => {
    r.probe = probe;
    r.webglReady = true;
    r.renderer.type =
      gl.getContext() instanceof WebGL2RenderingContext
        ? "WebGL2 / Three.js"
        : "WebGL / Three.js";
    onReady();
    const lost = (event: Event) => {
      event.preventDefault();
      r.webglReady = false;
      onLost();
    };
    gl.domElement.addEventListener("webglcontextlost", lost);
    return () => {
      r.probe = undefined;
      r.webglReady = false;
      gl.domElement.removeEventListener("webglcontextlost", lost);
    };
    // This probe intentionally reads the single mutable runtime, never a render snapshot.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [r, gl, onReady, onLost]);
  useFrame((_, dt) => {
    if (!r.manual) onTick(dt);
    probe();
    r.fps = r.fps * 0.95 + Math.min(120, 1 / Math.max(0.001, dt)) * 0.05;
    r.renderer.calls = gl.info.render.calls;
    r.renderer.triangles = gl.info.render.triangles;
    r.renderer.width = size.width;
    r.renderer.height = size.height;
  });
  return null;
}
type ApartmentProps = {
  runtime: Runtime3D;
  appearance: Save;
  onTick: (dt: number) => void;
  onReady: () => void;
  onLost: () => void;
};
function Apartment({
  runtime,
  appearance,
  onTick,
  onReady,
  onLost,
}: ApartmentProps) {
  return (
    <Canvas
      shadows
      dpr={[1, 1.5]}
      camera={{ fov: 68, near: 0.04, far: 35 }}
      gl={{
        antialias: true,
        alpha: false,
        powerPreference: "high-performance",
      }}
      fallback={<div>浏览器暂时无法显示3D场景，请开启硬件加速后重试。</div>}
    >
      <CameraRig
        runtime={runtime}
        onTick={onTick}
        onReady={onReady}
        onLost={onLost}
      />
      <Room runtime={runtime} appearance={appearance} />
    </Canvas>
  );
}
export default memo(Apartment);
