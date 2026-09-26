import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { CompanionSkin } from "./companion";

type Point = [number, number, number];
type Pose = { time: number; talking: boolean; leading: boolean };
const SIDES = [-1, 1];
const COCOA = "#603d2b";

function Pebble({
  at = [0, 0, 0],
  size,
  color,
  shine = false,
}: {
  at?: Point;
  size: Point;
  color: string;
  shine?: boolean;
}) {
  return (
    <mesh position={at} scale={size} castShadow>
      <sphereGeometry args={[1, 20, 14]} />
      <meshStandardMaterial color={color} roughness={shine ? 0.3 : 0.88} />
    </mesh>
  );
}

function Stroke({
  points,
  radius = 0.012,
  color = COCOA,
}: {
  points: Point[];
  radius?: number;
  color?: string;
}) {
  const curve = useMemo(
    () => new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p))),
    [points],
  );
  return (
    <mesh>
      <tubeGeometry args={[curve, 16, radius, 6, false]} />
      <meshStandardMaterial color={color} roughness={0.85} />
    </mesh>
  );
}

function Eyes({
  y,
  z,
  gap,
  color,
  pose,
}: {
  y: number;
  z: number;
  gap: number;
  color: string;
  pose: () => Pose;
}) {
  const eyes = useRef<THREE.Group>(null);
  useFrame(() => {
    const t = pose().time % 4.8;
    if (eyes.current) eyes.current.scale.y = t > 4.57 ? 0.12 + Math.abs(t - 4.685) * 7.65 : 1;
  });
  return (
    <group position={[0, y, z]} ref={eyes}>
      {SIDES.map((side) => (
        <group key={side} position={[side * gap, 0, 0]}>
          <Pebble size={[0.029, 0.037, 0.018]} color={color} shine />
          <Pebble
            at={[-0.008, 0.012, 0.016]}
            size={[0.008, 0.009, 0.005]}
            color="#fff6dd"
          />
        </group>
      ))}
    </group>
  );
}

function Crown() {
  const shape = useMemo(() => {
    const s = new THREE.Shape();
    s.moveTo(-0.19, 0);
    s.lineTo(-0.22, 0.2);
    s.lineTo(-0.105, 0.135);
    s.lineTo(0, 0.25);
    s.lineTo(0.105, 0.135);
    s.lineTo(0.22, 0.2);
    s.lineTo(0.19, 0);
    s.closePath();
    return s;
  }, []);
  return (
    <group position={[0.025, 0.33, 0]} rotation={[0.03, -0.1, -0.12]}>
      <mesh>
        <extrudeGeometry
          args={[
            shape,
            {
              depth: 0.055,
              bevelEnabled: true,
              bevelSegments: 2,
              steps: 1,
              bevelSize: 0.015,
              bevelThickness: 0.014,
            },
          ]}
        />
        <meshStandardMaterial
          color="#edbc59"
          metalness={0.18}
          roughness={0.5}
        />
      </mesh>
      <Stroke
        points={[
          [-0.17, 0.035, 0.082],
          [0, 0.025, 0.086],
          [0.17, 0.035, 0.082],
        ]}
        radius={0.016}
        color="#ffe3a0"
      />
    </group>
  );
}

function Biscuit({ pose }: { pose: () => Pose }) {
  const leftArm = useRef<THREE.Group>(null);
  const rightArm = useRef<THREE.Group>(null);
  const feet = useRef<THREE.Group>(null);
  const mouth = useRef<THREE.Mesh>(null);
  const profile = useMemo(
    () => [
        [0, -0.1],
        [0.29, -0.1],
        [0.365, -0.075],
        [0.399, -0.025],
        [0.402, 0.025],
        [0.375, 0.08],
        [0.31, 0.11],
        [0, 0.12],
      ].map(([r, y]) => new THREE.Vector2(r, y)),
    [],
  );
  useFrame(() => {
    const p = pose();
    if (leftArm.current) leftArm.current.rotation.z = -0.12 + Math.sin(p.time * 3.1) * 0.12;
    if (rightArm.current) rightArm.current.rotation.z = p.leading
        ? 0.55 + Math.sin(p.time * 5) * 0.18
        : 0.12 + Math.sin(p.time * 3.1 + 1) * 0.15;
    if (feet.current) feet.current.rotation.z = Math.sin(p.time * 2.7) * 0.09;
    if (mouth.current) mouth.current.scale.y = p.talking
        ? 0.85 + Math.sin(p.time * 10) * 0.18
        : 0.7;
  });
  return (
    <group name="biscuit-sui-model">
      <mesh rotation={[Math.PI / 2, 0, 0]} castShadow>
        <latheGeometry args={[profile, 48]} />
        <meshStandardMaterial color="#eab576" roughness={0.94} />
      </mesh>
      <Pebble at={[0, 0, 0.105]} size={[0.355, 0.355, 0.035]} color="#f8cf90" />
      {/* Chocolate patches follow the reference's irregular baked rim. */}
      {[
        [-0.15, 0.3, 0.121, 0.09, 0.065],
        [0.315, 0.14, 0.117, 0.055, 0.092],
        [-0.29, -0.12, 0.123, 0.069, 0.086],
        [0.16, -0.305, 0.117, 0.076, 0.054],
        [-0.115, -0.335, 0.08, 0.033, 0.045],
        [0.22, -0.155, 0.138, 0.026, 0.032],
      ].map(([x, y, z, w, h], i) => (
        <group key={i}>
          <Pebble at={[x, y, z]} size={[w, h, 0.025]} color="#966044" />
          <Pebble
            at={[x + w * 0.35, y + h * 0.42, z - 0.001]}
            size={[w * 0.7, h * 0.65, 0.025]}
            color="#966044"
          />
        </group>
      ))}
      <Crown />
      <Eyes y={0.05} z={0.151} gap={0.135} color={COCOA} pose={pose} />
      {SIDES.map((side) => (
        <group key={side}>
          <Pebble
            at={[side * 0.21, -0.029, 0.14]}
            size={[0.057, 0.026, 0.008]}
            color="#eca386"
          />
          <group
            position={[side * 0.106, 0.155, 0.146]}
            rotation={[0, 0, side * 0.34]}
          >
            <Pebble size={[0.012, 0.031, 0.008]} color="#9b6947" />
          </group>
          <group
            position={[side * 0.355, -0.035, 0]}
            ref={side < 0 ? leftArm : rightArm}
          >
            <Stroke
              points={[
                [0, 0, 0],
                [side * 0.11, 0.055, 0.005],
                [side * 0.2, 0.17, 0.02],
              ]}
              radius={0.019}
              color="#ac774e"
            />
            <Pebble
              at={[side * 0.2, 0.18, 0.02]}
              size={[0.032, 0.046, 0.026]}
              color="#f7d198"
            />
          </group>
        </group>
      ))}
      <mesh ref={mouth} position={[0, -0.075, 0.146]} scale={[1, 0.7, 0.3]}>
        <sphereGeometry args={[0.054, 20, 14]} />
        <meshStandardMaterial color="#895046" />
      </mesh>
      <Pebble
        at={[0.002, -0.089, 0.162]}
        size={[0.028, 0.015, 0.003]}
        color="#e9a18f"
      />
      <group ref={feet}>
        {SIDES.map((side) => (
          <group key={side}>
            <Stroke
              points={[
                [side * 0.18, -0.305, 0],
                [side * 0.2, -0.43, 0.025],
                [side * 0.245, -0.48, 0.06],
              ]}
              radius={0.02}
              color="#ac774e"
            />
            <Pebble
              at={[side * 0.267, -0.478, 0.066]}
              size={[0.057, 0.024, 0.032]}
              color="#f3c98e"
            />
          </group>
        ))}
      </group>
    </group>
  );
}

function Shell() {
  const shape = useMemo(() => {
    const s = new THREE.Shape();
    s.moveTo(-0.045, -0.105);
    s.lineTo(-0.13, 0.018);
    s.bezierCurveTo(-0.175, 0.075, -0.14, 0.15, -0.083, 0.14);
    s.bezierCurveTo(-0.06, 0.19, -0.015, 0.2, 0, 0.169);
    s.bezierCurveTo(0.04, 0.21, 0.088, 0.175, 0.09, 0.148);
    s.bezierCurveTo(0.151, 0.16, 0.174, 0.086, 0.13, 0.029);
    s.lineTo(0.046, -0.105);
    s.closePath();
    return s;
  }, []);
  return (
    <group position={[0, -0.18, 0.275]} rotation={[-0.15, 0, -0.08]}>
      <mesh>
        <extrudeGeometry
          args={[
            shape,
            {
              depth: 0.025,
              bevelEnabled: true,
              bevelSize: 0.012,
              bevelThickness: 0.013,
              bevelSegments: 2,
              curveSegments: 12,
            },
          ]}
        />
        <meshStandardMaterial color="#edb3c8" roughness={0.55} />
      </mesh>
      {[-0.085, -0.03, 0.035, 0.09].map((x, i) => (
        <Stroke
          key={i}
          points={[
            [x * 0.25, -0.067, 0.053],
            [x * 0.66, 0.035, 0.058],
            [x, 0.125, 0.053],
          ]}
          radius={0.006}
          color="#c77eaa"
        />
      ))}
      <Pebble
        at={[0, -0.099, 0.021]}
        size={[0.059, 0.027, 0.032]}
        color="#e0a0bc"
      />
    </group>
  );
}

function Otter({ pose }: { pose: () => Pose }) {
  const paws = useRef<THREE.Group>(null);
  const tail = useRef<THREE.Group>(null);
  useFrame(() => {
    const p = pose();
    if (paws.current) paws.current.rotation.z =
        Math.sin(p.time * 2.4) * (p.talking ? 0.07 : 0.025);
    if (tail.current) tail.current.rotation.z = Math.sin(p.time * 2.2) * 0.17;
  });
  return (
    <group name="tata-shiori-model" position={[0, 0.035, 0]}>
      <group ref={tail} position={[0, -0.32, -0.12]} rotation={[-0.3, 0, 0]}>
        <Pebble
          at={[0, -0.13, -0.03]}
          size={[0.105, 0.23, 0.09]}
          color="#aa9078"
        />
      </group>
      <Pebble at={[0, -0.14, 0]} size={[0.29, 0.37, 0.215]} color="#c4b29a" />
      <Pebble
        at={[0, -0.16, 0.156]}
        size={[0.205, 0.25, 0.078]}
        color="#e5dac5"
      />
      {SIDES.map((side) => (
        <group key={side}>
          <Pebble
            at={[side * 0.28, 0.27, -0.015]}
            size={[0.08, 0.055, 0.055]}
            color="#806650"
          />
          <Pebble
            at={[side * 0.175, -0.432, 0.095]}
            size={[0.092, 0.055, 0.113]}
            color="#a99277"
          />
        </group>
      ))}
      <Pebble at={[0, 0.17, 0]} size={[0.337, 0.29, 0.24]} color="#c7b69e" />
      <Pebble
        at={[0, 0.183, 0.125]}
        size={[0.297, 0.245, 0.132]}
        color="#faf2dd"
      />
      {/* Forehead tuft, cream face and held pink shell identify Tata. */}
      <Stroke
        points={[
          [-0.13, 0.409, 0.087],
          [-0.075, 0.426, 0.07],
          [-0.015, 0.411, 0.075],
        ]}
        radius={0.018}
        color="#806650"
      />
      <Eyes y={0.206} z={0.249} gap={0.121} color="#3c3126" pose={pose} />
      <Pebble
        at={[0, 0.154, 0.265]}
        size={[0.045, 0.037, 0.027]}
        color="#493725"
        shine
      />
      <Stroke
        points={[
          [0, 0.125, 0.267],
          [0, 0.103, 0.264],
          [-0.026, 0.09, 0.258],
          [-0.045, 0.103, 0.252],
        ]}
        radius={0.008}
        color="#735b45"
      />
      <Stroke
        points={[
          [0, 0.103, 0.264],
          [0.026, 0.09, 0.258],
          [0.045, 0.103, 0.252],
        ]}
        radius={0.008}
        color="#735b45"
      />
      {SIDES.map((side) => (
        <group key={side}>
          <Pebble
            at={[side * 0.203, 0.116, 0.222]}
            size={[0.046, 0.028, 0.009]}
            color="#eac1af"
          />
          {[0, 1, 2].map((i) => (
            <group
              key={i}
              position={[side * (0.176 + i * 0.024), 0.117, 0.235 - i * 0.008]}
              rotation={[0, 0, -0.18]}
            >
              <Pebble size={[0.005, 0.017, 0.005]} color="#c68f81" />
            </group>
          ))}
        </group>
      ))}
      <group ref={paws}>
        <Shell />
        {SIDES.map((side) => (
          <group
            key={side}
            position={[side * 0.17, -0.152, 0.236]}
            rotation={[0, 0, side * 0.5]}
          >
            <Pebble size={[0.075, 0.105, 0.078]} color="#b4a28b" />
            <Pebble
              at={[-side * 0.018, 0.022, 0.065]}
              size={[0.051, 0.053, 0.02]}
              color="#d0bfaa"
            />
          </group>
        ))}
      </group>
    </group>
  );
}

export default function CompanionModel({
  skin,
  pose,
}: {
  skin: CompanionSkin;
  pose: () => Pose;
}) {
  return skin === "otter" ? <Otter pose={pose} /> : <Biscuit pose={pose} />;
}
