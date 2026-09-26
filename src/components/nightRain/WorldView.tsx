"use client";

import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { memo, useEffect, useMemo, useRef, type MutableRefObject } from "react";
import * as THREE from "three";
import type { CameraControl, EnemyKind, GameState, Surface } from "./types";
import { enemyAttack, enemyMotion } from "./enemyCombat";
import CompanionView from './CompanionView';
import CombatTrail from './CombatTrail';
import { combatPose, rollPose, CHARGE_TIME } from './combat';
import type { Companion } from './companion';
import {
  ENEMY_SPAWNS,
  LANDMARKS,
  OBSTACLES,
  SURFACES,
  gateOpen,
  heightAt,
} from "./world";

type Triple = [number, number, number];
type StateRef = MutableRefObject<GameState>;
type WorldProps = {
  stateRef: StateRef;
  cameraControl: MutableRefObject<CameraControl>;
  onReady?: () => void;
  onError?: (message: string) => void;
  companionRef?: MutableRefObject<Companion>;
};

const COLORS = {
  stone: "#4c686b",
  trim: "#a19b80",
  wood: "#684438",
  brass: "#be9854",
  teal: "#347f7e",
  dark: "#172e3b",
};
const pseudoRandom = (n: number) => {
  const v = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return v - Math.floor(v);
};
// Decorative buildings stand outside the walkable graph, but the camera boom
// can leave that graph. Keep it on the player's side of their solid facades.
const CAMERA_BUILDINGS = [
  { x: -24, z: 7, w: 6, d: 9, top: 9 },
  { x: -22, z: -14, w: 6, d: 10, top: 10.3 },
  { x: -5, z: -18.4, w: 7, d: 3, top: 5.5 },
  { x: 3.2, z: -10.4, w: 8, d: 6, top: 8.8 },
  { x: -10, z: -43, w: 6, d: 9, top: 10.3 },
  { x: 17.5, z: -44, w: 5, d: 9, top: 9.3 },
  { x: -3, z: -53, w: 7, d: 6, top: 9.3 },
  { x: 6, z: -53, w: 10, d: 6, top: 11.3 },
  { x: -17, z: 11.5, w: 8, d: 6, top: 9 },
  { x: 18.5, z: 5, w: 7, d: 8, top: 10.3 },
];

function Block({
  position,
  size,
  color,
  rotation,
  emissive,
  roughness = 0.78,
}: {
  position: Triple;
  size: Triple;
  color: string;
  rotation?: Triple;
  emissive?: string;
  roughness?: number;
}) {
  return (
    <mesh position={position} rotation={rotation} castShadow receiveShadow>
      <boxGeometry args={size} />
      <meshStandardMaterial
        color={color}
        roughness={roughness}
        emissive={emissive}
        emissiveIntensity={emissive ? 1.4 : 0}
      />
    </mesh>
  );
}

function Pole({
  position,
  radius = 0.06,
  height = 1,
  color = COLORS.dark,
}: {
  position: Triple;
  radius?: number;
  height?: number;
  color?: string;
}) {
  return (
    <mesh position={position} castShadow receiveShadow>
      <cylinderGeometry args={[radius, radius, height, 7]} />
      <meshStandardMaterial color={color} roughness={0.65} />
    </mesh>
  );
}

function Sign({
  text,
  subtext = "",
  position,
  rotation = [0, 0, 0],
  width = 3.5,
  color = "#ffe3a1",
  background = "#194d53",
}: {
  text: string;
  subtext?: string;
  position: Triple;
  rotation?: Triple;
  width?: number;
  color?: string;
  background?: string;
}) {
  const texture = useMemo(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 768;
    canvas.height = 256;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.fillStyle = background;
      ctx.fillRect(0, 0, 768, 256);
      ctx.strokeStyle = color;
      ctx.lineWidth = 5;
      ctx.strokeRect(12, 12, 744, 232);
      ctx.font = '700 88px "Microsoft YaHei", sans-serif';
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = color;
      ctx.fillText(text, 384, subtext ? 108 : 130, 700);
      if (subtext) {
        ctx.font = "25px sans-serif";
        ctx.fillText(subtext, 384, 200, 680);
      }
    }
    const result = new THREE.CanvasTexture(canvas);
    result.colorSpace = THREE.SRGBColorSpace;
    result.anisotropy = 4;
    return result;
  }, [text, subtext, background, color]);
  useEffect(() => () => texture.dispose(), [texture]);
  return (
    <group position={position} rotation={rotation}>
      <Block
        position={[0, 0, -0.05]}
        size={[width + 0.14, width / 3 + 0.14, 0.15]}
        color={COLORS.dark}
      />
      <mesh position={[0, 0, 0.04]}>
        <planeGeometry args={[width, width / 3]} />
        <meshBasicMaterial map={texture} toneMapped={false} />
      </mesh>
    </group>
  );
}

function Lantern({
  position,
  large = false,
  blue = false,
}: {
  position: Triple;
  large?: boolean;
  blue?: boolean;
}) {
  const s = large ? 1.3 : 0.6;
  const color = blue ? "#73eef0" : "#ffcf85";
  return (
    <group position={position}>
      <Pole position={[0, 1.45 * s, 0]} height={2.9 * s} radius={0.055 * s} />
      <Block
        position={[0, 2.45 * s, 0]}
        size={[0.5 * s, 0.68 * s, 0.5 * s]}
        color={color}
        emissive={color}
      />
      <Block
        position={[0, 2.05 * s, 0]}
        size={[0.7 * s, 0.12 * s, 0.7 * s]}
        color={COLORS.dark}
      />
      <mesh
        position={[0, 2.93 * s, 0]}
        rotation={[0, Math.PI / 4, 0]}
        castShadow
      >
        <coneGeometry args={[0.55 * s, 0.35 * s, 4]} />
        <meshStandardMaterial color={COLORS.dark} />
      </mesh>
      {[-1, 1].flatMap((x) => [-1, 1].map((z) => (
          <Pole
            key={`${x},${z}`}
            position={[x * 0.27 * s, 2.45 * s, z * 0.27 * s]}
            radius={0.035 * s}
            height={0.8 * s}
          />
        )),)}
      <pointLight
        position={[0, 2.35 * s, 0]}
        color={color}
        intensity={large ? 16 : 4}
        distance={large ? 9 : 5}
        decay={2}
      />
    </group>
  );
}

function Deck({ surface }: { surface: Surface }) {
  const { x1, x2, z1, z2, y, endY = y } = surface;
  const geometry = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(
        [x1, y, z1, x2, y, z1, x1, endY, z2, x2, endY, z2],
        3,
      ),
    );
    g.setIndex([0, 2, 1, 1, 2, 3]);
    g.computeVertexNormals();
    return g;
  }, [x1, x2, z1, z2, y, endY]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  const railing = useMemo(() => {
    const segments: { position: Triple; size: Triple; rotation: Triple }[] = [];
    const h = (z: number) => y + (endY - y) * ((z - z1) / (z2 - z1));
    for (let edge = 0; edge < 4; edge += 1) {
      const vertical = edge < 2;
      const span = vertical ? z2 - z1 : x2 - x1;
      const count = Math.ceil(span / 1.25);
      for (let i = 0; i < count; i += 1) {
        const x = vertical
          ? edge === 0
            ? x1
            : x2
          : x1 + (i + 0.5) * (span / count);
        const z = vertical
          ? z1 + (i + 0.5) * (span / count)
          : edge === 2
            ? z1
            : z2;
        const dx = vertical ? (edge === 0 ? -0.15 : 0.15) : 0;
        const dz = vertical ? 0 : edge === 2 ? -0.15 : 0.15;
        const current = h(z);
        const neighbor = heightAt(x + dx, z + dz);
        const inside = heightAt(x - dx, z - dz);
        if (
          (inside !== null && inside > current + 0.4) ||
          (neighbor !== null && Math.abs(neighbor - current) < 0.5)
        ) continue;
        segments.push({
          position: [x, current + 0.35, z],
          size: vertical
            ? [0.2, 0.65, span / count + 0.02]
            : [span / count + 0.02, 0.65, 0.2],
          rotation: vertical
            ? [-Math.atan2(endY - y, z2 - z1), 0, 0]
            : [0, 0, 0],
        });
      }
    }
    return segments;
  }, [x1, x2, z1, z2, y, endY]);
  const steps = endY !== y ? Math.round(Math.abs(endY - y) / 0.22) : 0;
  return (
    <group>
      {steps === 0 && (
        <Block
          position={[(x1 + x2) / 2, y - 0.3, (z1 + z2) / 2]}
          size={[x2 - x1, 0.58, z2 - z1]}
          color={COLORS.stone}
        />
      )}
      <mesh geometry={geometry} receiveShadow>
        <meshStandardMaterial
          color={surface.color}
          roughness={0.48}
          metalness={0.12}
          side={THREE.DoubleSide}
        />
      </mesh>
      {steps > 0 &&
        Array.from({ length: steps }, (_, i) => {
          const z = z1 + (i + 0.5) * ((z2 - z1) / steps);
          const yy = y + (endY - y) * ((i + 0.5) / steps);
          return (
            <Block
              key={i}
              position={[(x1 + x2) / 2, yy - 0.055, z]}
              size={[x2 - x1, 0.11, (z2 - z1) / steps - 0.04]}
              color={i % 3 === 0 ? "#a6a393" : surface.color}
            />
          );
        })}
      {steps === 0 &&
        Array.from({ length: Math.floor((z2 - z1) / 1.2) }, (_, i) => (
          <Block
            key={`line${i}`}
            position={[(x1 + x2) / 2, y + 0.006, z1 + i * 1.2 + 0.5]}
            size={[x2 - x1 - 0.15, 0.008, 0.018]}
            color="#384f52"
          />
        ))}
      {railing.map((rail, i) => (
        <group key={`rail${i}`}>
          <Block
            {...rail}
            color={surface.id === "room" ? "#738382" : "#7f8b7e"}
          />
          <Block
            position={[
              rail.position[0],
              rail.position[1] + 0.35,
              rail.position[2],
            ]}
            size={[rail.size[0] + 0.1, 0.07, rail.size[2] + 0.02]}
            rotation={rail.rotation}
            color="#b4ad96"
          />
        </group>
      ))}
    </group>
  );
}

function ShopHouse({
  position,
  width = 5,
  depth = 5,
  height = 7,
  color = "#8b7566",
  rotation = 0,
  sign,
  terrace = false,
}: {
  position: Triple;
  width?: number;
  depth?: number;
  height?: number;
  color?: string;
  rotation?: number;
  sign?: string;
  terrace?: boolean;
}) {
  return (
    <group position={position} rotation={[0, rotation, 0]}>
      <Block
        position={[0, height / 2 - 0.8, 0]}
        size={[width, height, depth]}
        color={color}
      />
      <Block
        position={[0, height - 0.7, 0]}
        size={[width + 0.2, 0.26, depth + 0.3]}
        color={COLORS.trim}
      />
      <Block
        position={[0, 2.7, depth / 2 + 0.08]}
        size={[width, 0.18, 0.2]}
        color={COLORS.trim}
      />
      <Block
        position={[0, 0.65, depth / 2 + 0.03]}
        size={[width - 0.7, 2.65, 0.1]}
        color="#365957"
      />
      {Array.from({ length: 7 }, (_, i) => (
        <Block
          key={`shutter${i}`}
          position={[0, -0.25 + i * 0.31, depth / 2 + 0.1]}
          size={[width - 0.7, 0.025, 0.04]}
          color="#56746a"
        />
      ))}
      {[-1, 1].map((side) => (
        <group
          key={side}
          position={[side * width * 0.26, 4.6, depth / 2 + 0.06]}
        >
          <Block
            position={[0, 0, 0]}
            size={[width * 0.28, 1.7, 0.16]}
            color="#293b43"
          />
          <Block
            position={[0, 0, 0.1]}
            size={[width * 0.23, 1.45, 0.04]}
            color={side === 1 ? "#d0a05a" : "#2f6671"}
            emissive={side === 1 ? "#604624" : undefined}
          />
          <Block
            position={[0, 0, 0.14]}
            size={[0.08, 1.48, 0.05]}
            color={COLORS.wood}
          />
          <Block
            position={[0, 0, 0.14]}
            size={[width * 0.25, 0.08, 0.05]}
            color={COLORS.wood}
          />
          <Block
            position={[0, -0.95, 0.13]}
            size={[width * 0.32, 0.14, 0.4]}
            color={COLORS.trim}
          />
        </group>
      ))}
      {!terrace &&
        [-1, 1].map((side) => (
          <Block
            key={`roof${side}`}
            position={[side * width * 0.245, height - 0.25, 0]}
            size={[width * 0.57, 0.22, depth + 0.8]}
            rotation={[0, 0, -side * 0.32]}
            color={side === 1 ? "#8e5345" : "#a66b4e"}
          />
        ))}
      {!terrace && (
        <Block
          position={[0, height + 0.23, 0]}
          size={[0.25, 0.2, depth + 0.8]}
          color="#cea16c"
        />
      )}
      {sign && (
        <Sign
          position={[0, 2.5, depth / 2 + 0.3]}
          text={sign}
          width={width * 0.78}
        />
      )}
      <Block
        position={[-width * 0.3, 3.15, depth / 2 + 0.35]}
        size={[1.2, 0.65, 0.5]}
        color="#b4b5a0"
      />
      <mesh
        position={[-width * 0.3, 3.15, depth / 2 + 0.61]}
        rotation={[Math.PI / 2, 0, 0]}
      >
        <cylinderGeometry args={[0.22, 0.22, 0.04, 12]} />
        <meshStandardMaterial color="#47585a" />
      </mesh>
    </group>
  );
}

function Cable({
  from,
  to,
  flags = false,
}: {
  from: Triple;
  to: Triple;
  flags?: boolean;
}) {
  const points = useMemo(
    () => Array.from({ length: 17 }, (_, i) => {
        const t = i / 16;
        return new THREE.Vector3(
          from[0] + (to[0] - from[0]) * t,
          from[1] + (to[1] - from[1]) * t - Math.sin(t * Math.PI) * 0.9,
          from[2] + (to[2] - from[2]) * t,
        );
      }),
    [from, to],
  );
  const curve = useMemo(() => new THREE.CatmullRomCurve3(points), [points]);
  return (
    <group>
      <mesh>
        <tubeGeometry args={[curve, 20, 0.019, 4, false]} />
        <meshStandardMaterial color="#172c33" />
      </mesh>
      {flags &&
        [2, 4, 6, 8, 10, 12, 14].map((index, i) => (
          <mesh
            key={i}
            position={[
              points[index].x,
              points[index].y - 0.22,
              points[index].z,
            ]}
            rotation={[0, 0, Math.PI]}
          >
            <coneGeometry args={[0.25, 0.5, 3]} />
            <meshStandardMaterial
              color={["#d7b968", "#bb7365", "#68a1a0"][i % 3]}
              side={THREE.DoubleSide}
            />
          </mesh>
        ))}
    </group>
  );
}

function Palm({ position, scale = 1 }: { position: Triple; scale?: number }) {
  const leaf = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(
        [
          0, 0, 0, -0.38, 0.12, 0.8, 0.38, 0.12, 0.8, -0.3, -0.1, 1.6, 0.3,
          -0.1, 1.6, 0, -0.9, 2.6,
        ],
        3,
      ),
    );
    g.setIndex([0, 1, 2, 1, 3, 2, 2, 3, 4, 3, 5, 4]);
    g.computeVertexNormals();
    return g;
  }, []);
  useEffect(() => () => leaf.dispose(), [leaf]);
  return (
    <group position={position} scale={scale}>
      <Pole position={[0, 2.8, 0]} height={5.6} radius={0.15} color="#8f8367" />
      {Array.from({ length: 9 }, (_, i) => (
        <group key={i} rotation={[0, i * ((Math.PI * 2) / 9), 0]}>
          <mesh
            position={[0, 5.6, 0]}
            rotation={[i % 2 ? 0.13 : -0.15, 0, 0]}
            geometry={leaf}
            castShadow
          >
            <meshStandardMaterial
              color={i % 2 ? "#42766a" : "#63806a"}
              side={THREE.DoubleSide}
            />
          </mesh>
        </group>
      ))}
    </group>
  );
}

function FoodStall() {
  return (
    <group position={[4, 0, -48]}>
      <Block position={[0, 0.6, 0]} size={[5.8, 1.2, 1.5]} color="#365d61" />
      <Block position={[0, 1.24, 0]} size={[6, 0.13, 1.65]} color="#bb9974" />
      {[-1, 1].map((s) => (
        <Pole
          key={s}
          position={[s * 2.7, 1.7, 0]}
          height={3.4}
          color={COLORS.brass}
        />
      ))}
      <Block
        position={[0, 3.1, 0]}
        size={[6.3, 0.13, 2.6]}
        rotation={[-0.1, 0, 0]}
        color="#aa654c"
      />
      {[-2, -1, 0, 1, 2].map((x) => (
        <Block
          key={x}
          position={[x * 1.05, 3.14, 0]}
          size={[0.4, 0.14, 2.6]}
          rotation={[-0.1, 0, 0]}
          color="#caa974"
        />
      ))}
      <Sign
        position={[0, 2.65, 0.86]}
        text="打抛饭 · 还热着"
        subtext="กะเพรา    KAPRAO AFTER HOURS    50 ฿"
        width={4.9}
        background="#665330"
      />
      {[-1.5, -0.65, 0.3].map((x, i) => (
        <mesh key={x} position={[x, 1.4, 0.2]}>
          <cylinderGeometry args={[0.29, 0.18, 0.25, 10]} />
          <meshStandardMaterial color={i === 1 ? "#ca9152" : "#dde1c4"} />
        </mesh>
      ))}
      <mesh position={[1.7, 1.36, 0.1]}>
        <sphereGeometry args={[0.48, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <meshStandardMaterial color="#344c50" metalness={0.7} roughness={0.3} />
      </mesh>
      <pointLight
        position={[0, 2.4, 1.5]}
        color="#ffce84"
        intensity={22}
        distance={10}
      />
    </group>
  );
}

function CityContent() {
  return (
    <group name="night-city">
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, -1.25, -12]}
        receiveShadow
      >
        <planeGeometry args={[220, 220]} />
        <meshStandardMaterial
          color="#213f49"
          roughness={0.42}
          metalness={0.15}
        />
      </mesh>
      {SURFACES.map((s) => (
        <Deck key={s.id} surface={s} />
      ))}
      <Block position={[4, 2.8, 15.6]} size={[16, 5.6, 4.8]} color="#59706c" />
      <Block
        position={[-0.9, 6.01, 15.7]}
        size={[4.8, 0.035, 3.3]}
        color="#ad8071"
      />
      <Block
        position={[-3.75, 7.2, 15]}
        size={[0.25, 2.4, 5.8]}
        color="#adab92"
      />
      <Sign
        position={[-3.57, 8, 15]}
        rotation={[0, Math.PI / 2, 0]}
        text="晚风旅馆"
        subtext="LAST STREAM  ·  23:48"
        width={2.6}
      />
      <Block position={[0, 6.72, 15]} size={[1.5, 0.14, 0.9]} color="#aa8d6c" />
      {[-0.6, 0.6].map((x) => (
        <Block
          key={x}
          position={[x, 6.35, 15]}
          size={[0.1, 0.7, 0.65]}
          color={COLORS.wood}
        />
      ))}
      <Block
        position={[-1.3, 6.3, 16.2]}
        size={[0.8, 0.55, 0.8]}
        color="#826784"
      />
      <Lantern position={[-3.2, 6, 12.8]} />
      <Lantern position={[11.35, 6, 17.3]} />
      <Sign
        position={[4, 4.3, 18.07]}
        text="晚风 · STAY A LITTLE"
        width={6}
        background="#42565d"
      />
      {[-14.5, -7.5, -0.5].map((x, i) => (
        <ShopHouse
          key={`roofbase${x}`}
          position={[x, -0.05, -23]}
          width={i === 0 ? 7 : 6.8}
          depth={4}
          height={6.2}
          terrace
          color={["#648386", "#9a8975", "#657d71"][i]}
          sign={["旧城裁缝", "泰茶 · 茶", "นวด · 古法"][i]}
        />
      ))}
      <ShopHouse
        position={[-24, 0, 7]}
        width={9}
        depth={6}
        height={8.7}
        rotation={Math.PI / 2}
        color="#9b8b75"
        sign="ฝน · 雨巷"
      />
      <ShopHouse
        position={[-22, 0, -14]}
        width={10}
        depth={6}
        height={10}
        rotation={Math.PI / 2}
        color="#708f8c"
      />
      <ShopHouse
        position={[-5, 0, -18.4]}
        width={7}
        depth={3}
        height={5.2}
        color="#849892"
        sign="旧城商行"
      />
      <ShopHouse
        position={[3.2, 0, -10.4]}
        width={8}
        depth={6}
        height={8.5}
        color="#a69a7d"
        sign="慢慢来 · SLOW SLOW"
      />
      <ShopHouse
        position={[-10, 0, -43]}
        width={9}
        depth={6}
        height={10}
        rotation={Math.PI / 2}
        color="#967b77"
        sign="夜食"
      />
      <ShopHouse
        position={[17.5, 0, -44]}
        width={9}
        depth={5}
        height={9}
        rotation={-Math.PI / 2}
        color="#728b82"
        sign="ตลาด · MARKET"
      />
      <ShopHouse
        position={[-3, 0, -53]}
        width={7}
        depth={6}
        height={9}
        color="#a3937b"
      />
      <ShopHouse
        position={[6, 0, -53]}
        width={10}
        depth={6}
        height={11}
        color="#809089"
      />
      <ShopHouse
        position={[-17, 0, 11.5]}
        width={8}
        depth={6}
        height={8.7}
        color="#74897e"
      />
      <ShopHouse
        position={[18.5, 0, 5]}
        width={8}
        depth={7}
        height={10}
        rotation={-Math.PI / 2}
        color="#738b91"
      />
      {Array.from({ length: 13 }, (_, i) => (
        <ShopHouse
          key={`distant${i}`}
          position={[-45 + i * 7, 0, -68 - pseudoRandom(i) * 7]}
          width={6 + pseudoRandom(i + 1) * 2}
          height={6 + pseudoRandom(i + 2) * 12}
          color={["#506e78", "#6f8182", "#597980"][i % 3]}
        />
      ))}
      <group position={[-21, 0, -48]}>
        {[0, 1, 2].map((i) => (
          <Block
            key={i}
            position={[0, i * 0.8, 0]}
            size={[9 - i * 1.2, 0.8, 9 - i * 1.2]}
            color="#928869"
          />
        ))}
        <mesh position={[0, 4.5, 0]}>
          <cylinderGeometry args={[1.9, 3.1, 4.5, 12]} />
          <meshStandardMaterial
            color="#c4a262"
            roughness={0.52}
            metalness={0.38}
          />
        </mesh>
        <mesh position={[0, 8.3, 0]}>
          <coneGeometry args={[2.35, 4, 12]} />
          <meshStandardMaterial
            color="#d4af68"
            metalness={0.5}
            roughness={0.4}
          />
        </mesh>
        {Array.from({ length: 6 }, (_, i) => (
          <mesh key={i} position={[0, 10.7 + i * 0.45, 0]}>
            <cylinderGeometry
              args={[0.6 - i * 0.08, 0.7 - i * 0.08, 0.18, 12]}
            />
            <meshStandardMaterial
              color="#e0bb6a"
              metalness={0.4}
              roughness={0.4}
            />
          </mesh>
        ))}
        <mesh position={[0, 13.3, 0]}>
          <coneGeometry args={[0.24, 2.8, 10]} />
          <meshStandardMaterial color="#efca7b" />
        </mesh>
        <pointLight
          position={[0, 7, 5]}
          color="#ffcb75"
          intensity={95}
          distance={20}
        />
      </group>
      <Cable from={[-19, 9, -4]} to={[13, 9, -4]} flags />
      <Cable from={[-18, 8, 5]} to={[15, 9, 6]} />
      <Cable from={[-17, 11, -20]} to={[7, 12, -24]} flags />
      <Cable from={[-8, 7, -39]} to={[15, 8, -40]} flags />
      <Cable from={[-8, 7.5, -45]} to={[15, 7.5, -45]} />
      {[-7, -3, 1, 5, 9, 13].map((x, i) => (
        <group
          key={`hanging${x}`}
          position={[x, 6.55 - Math.sin(i * 0.6) * 0.7, -39.5]}
        >
          <mesh>
            <sphereGeometry args={[0.25, 8, 8]} />
            <meshStandardMaterial
              color="#ffb77c"
              emissive="#ff9d56"
              emissiveIntensity={1.5}
            />
          </mesh>
          <Pole position={[0, 0.35, 0]} height={0.45} radius={0.02} />
        </group>
      ))}
      <Cable from={[-19, 5.8, -2]} to={[-10, 6.2, -5]} />
      {Array.from({ length: 6 }, (_, i) => (
        <Block
          key={`laundry${i}`}
          position={[
            -18 + i * 1.3,
            4.9 - Math.sin(i * 0.5) * 0.4,
            -2.35 - i * 0.42,
          ]}
          size={[0.8, 1, 0.045]}
          rotation={[0.04, -0.32, 0.08]}
          color={["#b7af98", "#829c9f", "#ab7c7b"][i % 3]}
        />
      ))}
      <Lantern position={[-8.2, 0, 8.8]} large />
      <Lantern position={[7.2, 0, -4.7]} large />
      <Lantern position={[-17.2, 6, -20.8]} />
      <Lantern position={[4.3, 6, -24.2]} />
      <Lantern position={[13.25, 0, -16]} large />
      <Lantern position={[13.25, 0, -32]} large />
      <Lantern position={[-5, 0, -36.8]} large />
      <Palm position={[19, -1, -26]} scale={1.8} />
      <Palm position={[-24, 0, -30]} scale={1.8} />
      <Palm position={[19, -1, -12]} scale={1.5} />
      <FoodStall />
      <group position={[-31.5, 6, -32.5]}>
        <Block position={[0, 1.6, -0.3]} size={[6.8, 3.2, 0.35]} color="#8b7462" />
        <Block position={[0, 3.2, -0.8]} size={[7.8, 0.22, 3.8]} color="#647977" />
        {[0, 1].map(tier => (
<group key={tier} position={[0, 3.65 + tier * 1.05, -1]}>
          <mesh rotation={[0, Math.PI / 4, 0]} scale={[1.5, 1, 0.8]} castShadow><coneGeometry args={[3 - tier * 0.65, 1.25, 4]} /><meshStandardMaterial color={tier ? '#5c716b' : '#536862'} roughness={0.85} /></mesh>
          <Block position={[0, 0.65, 0]} size={[4.5 - tier, 0.12, 0.18]} color="#c4a56a" />
        </group>
))}
        {[-2.85, 2.85].map(x => <Pole key={x} position={[x, 1.6, -0.05]} height={3.2} radius={0.16} color="#9e7758" />)}
        <Sign position={[0, 2.25, -0.08]} text="残钟雨寺" subtext="空瓶承露 · 百灯渡雨" width={3.5} background="#665b4c" />
      </group>
      <group position={[-22.5, 6, -27]}>
        {[-1, 1].map(side => <Pole key={side} position={[0, 1.6, side * 1.9]} height={3.2} radius={0.12} color="#806951" />)}
        <Block position={[0, 3.3, 0]} size={[0.35, 0.3, 4.4]} color="#947854" />
        <mesh position={[0, 2.6, 0]}><cylinderGeometry args={[0.25, 0.42, 0.6, 10, 1, true]} /><meshStandardMaterial color="#ae8e50" metalness={0.6} roughness={0.45} side={THREE.DoubleSide} /></mesh>
      </group>
      {[-20.5, -24.5, -28.5].map(z => <Lantern key={`templelight${z}`} position={[-34.45, heightAt(-34.45, z) ?? 6, z]} />)}
      <Lantern position={[-26, 6, -28.5]} />
      <Sign position={[-26.2, 1.9, -3.7]} text="水门" width={1.6} />
      <group position={[-36.3, 0, -10]}>
        <Block position={[0, -0.16, 0]} size={[1.9, 0.2, 8]} color="#315958" roughness={0.15} />
        {[-1, 1].map(side => <Block key={side} position={[side * 1.05, 0.06, 0]} size={[0.22, 0.4, 8.4]} color="#7a887b" />)}
        {[-3.5, -1.7, 0.7, 2.8].map((z, i) => (
<group key={z} position={[i % 2 ? 0.35 : -0.35, -0.03, z]}>
          <mesh rotation={[-Math.PI / 2, 0, 0]}><circleGeometry args={[0.33, 10]} /><meshStandardMaterial color="#69806a" side={THREE.DoubleSide} /></mesh>
          <mesh position={[0.06, 0.08, 0]}><octahedronGeometry args={[0.1]} /><meshStandardMaterial color="#d1b5a4" /></mesh>
        </group>
))}
      </group>
      <group position={[18, 0, -30]}>
        <Block position={[0, 4.8, 0]} size={[6.7, 0.25, 5.7]} color="#665547" />
        <Block position={[2.7, 2.35, 0]} size={[0.18, 4.7, 5.6]} color="#8e7c63" />
        <Sign position={[0, 4.15, 2.5]} text="摆渡庵" subtext="灯不渡水 · 人可归岸" width={2.6} />
        <Block position={[0, 0.24, -2.2]} size={[3.3, 0.48, 0.6]} color="#796449" />
      </group>
      <Sign position={[-12.5, 4.4, -12.5]} text="铃兰回廊 →" subtext="雨灯近道" width={2.3} />
      <Sign position={[-16.85, 7.3, -26]} rotation={[0, Math.PI / 2, 0]} text="望台 · 夜市灯火" width={2.6} />
      <Lantern position={[-8.6, 3, -15.4]} />
      <Lantern position={[-16.2, 6, -29]} />
      <Sign
        position={[10.8, 3.7, -36.1]}
        text="夜市 →"
        width={3.3}
        color="#b6f2de"
      />
      <Sign
        position={[-9.9, 2.5, -6.7]}
        text="↑ 金塔高阶"
        width={2.6}
        color="#f8d89f"
      />
      <Block
        position={[18, -0.55, -25]}
        size={[6, 0.12, 44]}
        color="#234957"
        roughness={0.1}
      />
      {Array.from({ length: 14 }, (_, i) => (
        <Block
          key={`canal${i}`}
          position={[16 + pseudoRandom(i) * 3, -0.48, -46 + i * 3]}
          size={[0.018, 0.008, 0.6 + pseudoRandom(i + 4) * 2]}
          color={i % 4 ? "#477b83" : "#baac72"}
        />
      ))}
    </group>
  );
}

const City = memo(CityContent);

function TreasureChest({ stateRef, id, position }: { stateRef: StateRef; id: string; position: Triple }) {
  const lid = useRef<THREE.Group>(null);
  useFrame(() => { if (lid.current) lid.current.rotation.x = stateRef.current.collected.includes(id) ? -1.1 : 0; });
  return (
    <group position={position}>
      <Block position={[0, 0.23, 0]} size={[0.95, 0.46, 0.65]} color="#5c4240" />
      {[-0.33, 0.33].map(x => <Block key={x} position={[x, 0.25, 0.01]} size={[0.07, 0.5, 0.68]} color="#b99b5c" />)}
      <group ref={lid} position={[0, 0.48, -0.32]}>
        <Block position={[0, 0.08, 0.32]} size={[1.01, 0.18, 0.71]} color="#875b47" />
        {[-0.33, 0.33].map(x => <Block key={x} position={[x, 0.12, 0.32]} size={[0.09, 0.18, 0.73]} color="#d3b16f" />)}
        <Block position={[0, -0.01, 0.69]} size={[0.12, 0.23, 0.04]} color="#ebc57d" />
      </group>
    </group>
  );
}

function GateWinch({ stateRef, temple, height, width }: { stateRef: StateRef; temple: boolean; height: number; width: number }) {
  const wheel = useRef<THREE.Group>(null); const pawl = useRef<THREE.Group>(null);
  useFrame((_, dt) => {
    if (stateRef.current.paused) return;
    const open = temple ? stateRef.current.templeGate : stateRef.current.shortcut;
    if (wheel.current) wheel.current.rotation.z = THREE.MathUtils.damp(wheel.current.rotation.z, open ? Math.PI * 2.3 : 0, 4, dt);
    if (pawl.current) pawl.current.rotation.z = THREE.MathUtils.damp(pawl.current.rotation.z, open ? -1.2 : 0.2, 7, dt);
  });
  return (
    <group name={temple ? 'temple-gate-winch' : 'canal-gate-winch'} position={[width / 2, 0, 0]}>
      <Block position={[0, height / 2, 0]} size={[0.8, height + 0.2, 0.8]} color="#7e8980" />
      {/* Gearbox and handle face north, the same side as the interaction point. */}
      <Block position={[0, 1.02, -0.45]} size={[0.72, 0.72, 0.18]} color="#544a38" />
      <group ref={wheel} position={[0, 1.07, -0.69]}>
        <mesh><torusGeometry args={[0.36, 0.046, 8, 24]} /><meshStandardMaterial color="#d5aa60" metalness={0.6} roughness={0.45} /></mesh>
        {[0, Math.PI / 3, (Math.PI * 2) / 3].map(angle => <Block key={angle} position={[0, 0, 0]} size={[0.67, 0.045, 0.05]} rotation={[0, 0, angle]} color="#b48a4d" />)}
        <Block position={[0.32, 0, -0.14]} size={[0.08, 0.1, 0.29]} color="#e5c381" />
      </group>
      <group ref={pawl} position={[0.38, 1.43, -0.54]}><Block position={[-0.11, -0.09, 0]} size={[0.31, 0.085, 0.09]} rotation={[0, 0, 0.6]} color="#e3b569" /></group>
      {[-0.2, 0.2].map(side => (
<group key={side}>
        {Array.from({ length: 14 }, (_, i) => (
<mesh key={i} position={[side, 1.5 + i * ((height - 1.3) / 14), -0.51]} rotation={[0, i % 2 ? Math.PI / 2 : 0, 0]}>
          <torusGeometry args={[0.055, 0.014, 5, 8]} /><meshStandardMaterial color="#b9a477" metalness={0.7} roughness={0.55} />
        </mesh>
))}
      </group>
))}
      <mesh position={[0, height + 0.08, -0.52]}><torusGeometry args={[0.28, 0.04, 8, 20]} /><meshStandardMaterial color="#9c895b" /></mesh>
      {/* Outside has only a riveted backplate: no magical handle through the bars. */}
      <Block position={[0, 1.03, 0.42]} size={[0.74, 0.74, 0.055]} color="#405153" />
      {[-1, 1].map(x => [-1, 1].map(y => <mesh key={`${x}-${y}`} position={[x * 0.28, 1.03 + y * 0.28, 0.47]}><sphereGeometry args={[0.035, 8, 8]} /><meshStandardMaterial color="#8f9588" /></mesh>))}
    </group>
  );
}

function ObstacleArt({ stateRef }: { stateRef: StateRef }) {
  const gates = useRef<(THREE.Group | null)[]>([]);
  useFrame((_, dt) => {
    if (stateRef.current.paused) return;
    OBSTACLES.forEach((o, i) => { const gate = gates.current[i]; if (gate) gate.position.y = THREE.MathUtils.damp(gate.position.y, gateOpen(o, stateRef.current) ? 3.5 : 0, 5, dt); });
  });
  return (
    <group>
      {OBSTACLES.map((o, i) => {
        if (o.kind === 'chest' || o.kind === 'shrine') return null;
        if (o.kind === "gate") return (
            <group key={i} position={[o.x, o.y, o.z]}>
              {[-1, 1].map((s) => (
                <Block
                  key={s}
                  position={[s * (o.w / 2 + 0.11), o.h / 2, 0]}
                  size={[0.25, o.h + 0.2, 0.8]}
                  color="#7e8980"
                />
              ))}
              <Block
                position={[0, o.h + 0.12, 0]}
                size={[o.w + 0.7, 0.3, 1]}
                color="#aa9d80"
              />
              <GateWinch stateRef={stateRef} temple={o.gateId === "temple"} height={o.h} width={o.w} />
              <group ref={el => { gates.current[i] = el; }}>
                <Block
                  position={[0, 1.5, 0]}
                  size={[o.w, 0.12, o.d]}
                  color="#42585b"
                />
                <Block
                  position={[0, 0.35, 0]}
                  size={[o.w, 0.12, o.d]}
                  color="#42585b"
                />
                {Array.from({ length: 13 }, (_, n) => (
                  <Pole
                    key={n}
                    position={[-o.w / 2 + n * (o.w / 12), o.h / 2, 0]}
                    height={o.h}
                    radius={0.045}
                  />
                ))}
              </group>
            </group>
          );
        if (o.kind === "planter") return (
            <group key={i} position={[o.x, o.y, o.z]}>
              <Block
                position={[0, o.h * 0.48, 0]}
                size={[o.w, o.h * 0.96, o.d]}
                color="#949b87"
              />
              <Block
                position={[0, o.h, 0]}
                size={[o.w + 0.1, 0.12, o.d + 0.1]}
                color="#bbb59a"
              />
              <mesh position={[0, o.h + 0.3, 0]}>
                <icosahedronGeometry args={[1, 0]} />
                <meshStandardMaterial color="#637c51" />
              </mesh>
              <Palm position={[0, o.h, 0]} scale={0.8} />
            </group>
          );
        if (o.kind === "pillar") return (
            <group key={i} position={[o.x, o.y, o.z]}>
              <Block
                position={[0, 0.15, 0]}
                size={[o.w + 0.2, 0.3, o.d + 0.2]}
                color="#b1a081"
              />
              <Block
                position={[0, o.h / 2, 0]}
                size={[o.w, o.h, o.d]}
                color="#8e8470"
              />
              <Block
                position={[0, o.h, 0]}
                size={[o.w + 0.3, 0.2, o.d + 0.3]}
                color="#c0a16b"
              />
              <mesh
                position={[0, o.h + 0.32, 0]}
                rotation={[0, Math.PI / 4, 0]}
              >
                <coneGeometry args={[o.w * 0.7, 0.5, 4]} />
                <meshStandardMaterial color="#9f6250" />
              </mesh>
            </group>
          );
        return (
          <group key={i} position={[o.x, o.y, o.z]}>
            <Block
              position={[0, o.h / 2, 0]}
              size={[o.w, o.h, o.d]}
              color="#8c684a"
            />
            {[-0.35, 0.35].map((n) => (
              <Block
                key={n}
                position={[n * o.w, o.h / 2, 0]}
                size={[0.1, o.h + 0.025, o.d + 0.04]}
                color="#b08c60"
              />
            ))}
            <Block
              position={[0, o.h / 2, o.d / 2 + 0.03]}
              size={[o.w * 1.1, 0.1, 0.06]}
              rotation={[0, 0, 0.6]}
              color="#b08c60"
            />
          </group>
        );
      })}
    </group>
  );
}

function RainShrine({ stateRef, id, position }: { stateRef: StateRef; id: string; position: Triple }) {
  const glow = useRef<THREE.Mesh>(null); const flame = useRef<THREE.Mesh>(null); const light = useRef<THREE.PointLight>(null);
  useFrame(() => {
    const s = stateRef.current; const lit = s.litLamps.includes(id); const current = s.checkpoint === id;
    if (glow.current) { glow.current.rotation.z = s.time * 0.12; const mat = glow.current.material as THREE.MeshBasicMaterial; mat.color.set(current ? '#ffda89' : lit ? '#86dacc' : '#6f9caa'); mat.opacity = (lit ? 0.45 : 0.2) + Math.sin(s.time * 2) * 0.08; }
    if (flame.current) { flame.current.visible = lit; flame.current.scale.setScalar((lit ? 1 : 0.65) + Math.sin(s.time * 4) * 0.08); (flame.current.material as THREE.MeshBasicMaterial).color.set(lit ? '#ffe4a0' : '#83c4d5'); }
    if (light.current) { light.current.intensity = lit ? 8 : 0; light.current.color.set(lit ? '#ffce82' : '#8cd5e5'); }
  });
  return (
<group position={position}>
    <mesh ref={glow} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.035, 0]}><ringGeometry args={[0.7, 1, 48]} /><meshBasicMaterial transparent opacity={0.4} depthWrite={false} /></mesh>
    <Block position={[0, 0.15, 0]} size={[0.8, 0.3, 0.8]} color="#827d69" />
    <Pole position={[0, 0.85, 0]} height={1.4} radius={0.045} />
    <Block position={[0, 1.42, 0]} size={[0.42, 0.07, 0.42]} color="#514f42" />
    {[-1, 1].map(side => <Pole key={side} position={[side * 0.19, 1.66, 0]} height={0.5} radius={0.022} />)}
    <mesh position={[0, 1.99, 0]} rotation={[0, Math.PI / 4, 0]}><coneGeometry args={[0.35, 0.22, 4]} /><meshStandardMaterial color="#4b5c58" /></mesh>
    <mesh ref={flame} position={[0, 1.65, 0]}><octahedronGeometry args={[0.17]} /><meshBasicMaterial color="#ffe4a0" /></mesh>
    <Pole position={[-0.6, 1.4, 0]} height={2.8} radius={0.045} color="#ba9c65" />
    <Block position={[-0.35, 2.3, 0]} size={[0.5, 0.85, 0.04]} color="#ac714f" />
    <pointLight ref={light} position={[0, 1.7, 0]} distance={7} intensity={8} color="#ffd598" />
  </group>
);
}

function Landmarks({ stateRef }: { stateRef: StateRef }) {
  const items = useRef<(THREE.Group | null)[]>([]);
  const laptop = useRef<THREE.Group>(null);
  const stain = useRef<THREE.Group>(null);
  useFrame(() => {
    const state = stateRef.current;
    LANDMARKS.forEach((l, i) => {
      const item = items.current[i];
      if (!item) return;
      item.visible = !state.collected.includes(l.id);
      if (l.kind === "cache" || l.kind === "charm" || l.kind === "flask") {
        item.rotation.y = state.time * 0.8;
        item.position.y = l.y + 0.6 + Math.sin(state.time * 2) * 0.09;
      }
    });
    if (laptop.current) laptop.current.rotation.x = state.collected.includes("laptop")
        ? Math.PI / 2
        : 0.12;
    if (stain.current) {
      stain.current.visible = !!state.bloodstain;
      if (state.bloodstain) stain.current.position.set(
          state.bloodstain.x,
          state.bloodstain.y + 0.025,
          state.bloodstain.z,
        );
    }
  });
  return (
    <group>
      {LANDMARKS.filter(l => l.id === 'cloister-cache' || l.id === 'lookout-cache').map(l => <TreasureChest key={l.id} stateRef={stateRef} id={l.id} position={[l.x, l.y, l.z - 0.8]} />)}
      {LANDMARKS.map((l, i) => {
        if (l.id === 'temple-lamp' || l.id === 'canal-lamp') return (
          <group key={l.id} position={[l.x, l.y, l.z]} name={`spent-lamp-${l.id}`}>
            <Block position={[0, 0.14, 0]} size={[0.8, 0.28, 0.8]} color="#737267" />
            <Pole position={[0, 0.55, 0]} height={0.65} radius={0.065} color="#655d50" />
            <Block position={[0.1, 0.84, 0]} size={[0.45, 0.08, 0.38]} rotation={[0, 0, 0.24]} color="#5a5c56" />
          </group>
        );
        if (l.kind === "rest") return <RainShrine key={l.id} stateRef={stateRef} id={l.id} position={[l.x, l.y, l.z]} />;
        if (l.id === "laptop") return (
            <group key={l.id} position={[l.x, l.y + 0.83, l.z]}>
              <Block
                position={[0, 0, 0]}
                size={[0.76, 0.025, 0.5]}
                color="#b7bcca"
              />
              <group ref={laptop} position={[0, 0, -0.24]}>
                <Block
                  position={[0, 0.24, 0]}
                  size={[0.76, 0.48, 0.035]}
                  color="#a5acb9"
                />
                <Block
                  position={[0, 0.24, 0.024]}
                  size={[0.7, 0.41, 0.008]}
                  color="#4ca6b1"
                  emissive="#32697d"
                />
                <Block
                  position={[0.12, 0.24, 0.031]}
                  size={[0.4, 0.25, 0.007]}
                  color="#242e4c"
                />
                <Block
                  position={[-0.23, 0.22, 0.032]}
                  size={[0.17, 0.18, 0.007]}
                  color="#b4a0d7"
                />
              </group>
            </group>
          );
        if (l.kind === "cache" || l.kind === "charm" || l.kind === "flask") return (
            <group
              key={l.id}
              ref={(el) => {
                items.current[i] = el;
              }}
              position={[l.x, l.y + 0.6, l.z]}
            >
              <mesh castShadow>
                <octahedronGeometry args={[l.kind === "charm" ? 0.25 : 0.18]} />
                <meshStandardMaterial
                  color="#f8d98b"
                  emissive="#af742c"
                  emissiveIntensity={1.6}
                  metalness={0.5}
                  roughness={0.2}
                />
              </mesh>
              <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.53, 0]}>
                <ringGeometry args={[0.25, 0.3, 24]} />
                <meshBasicMaterial color="#ffdf8a" />
              </mesh>
              <pointLight color="#fbd079" intensity={2} distance={3} />
            </group>
          );
        if (l.kind === "note") return (
            <group key={l.id} position={[l.x, l.y + 0.04, l.z]}>
              <Block
                position={[0, 0, 0]}
                size={[0.5, 0.04, 0.35]}
                color="#e2ce9d"
                rotation={[0, 0.3, 0]}
              />
            </group>
          );
        return null;
      })}
      <group ref={stain} visible={false}>
        <mesh rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.25, 0.7, 32]} />
          <meshBasicMaterial color="#eab85b" transparent opacity={0.65} />
        </mesh>
        <mesh position={[0, 0.32, 0]}>
          <octahedronGeometry args={[0.17]} />
          <meshBasicMaterial color="#ffdd86" />
        </mesh>
      </group>
    </group>
  );
}

function Actor({
  stateRef,
  enemyId,
}: {
  stateRef: StateRef;
  enemyId?: string;
}) {
  const root = useRef<THREE.Group>(null);
  const body = useRef<THREE.Group>(null);
  const leftLeg = useRef<THREE.Group>(null);
  const rightLeg = useRef<THREE.Group>(null);
  const arm = useRef<THREE.Group>(null);
  const leftArm = useRef<THREE.Group>(null);
  const chargeGlow = useRef<THREE.Mesh>(null);
  const heldWeapon = useRef<THREE.Group>(null); const medicine = useRef<THREE.Group>(null);
  const telegraph = useRef<THREE.Mesh>(null);
  const slash = useRef<THREE.Mesh>(null);
  const marker = useRef<THREE.Group>(null);
  const health = useRef<THREE.Group>(null);
  const healthFill = useRef<THREE.Mesh>(null);
  const lastPosition = useRef(new THREE.Vector3());
  const walk = useRef(0);
  const drinkAim = useMemo(() => ({ up: new THREE.Vector3(0, 1, 0), direction: new THREE.Vector3(), inverse: new THREE.Quaternion() }), []);
  const rollBounds = useMemo(() => ({ all: new THREE.Box3(), mesh: new THREE.Box3(), pivot: new THREE.Vector3() }), []);
  const kind: EnemyKind | "player" = enemyId
    ? (ENEMY_SPAWNS.find((e) => e.id === enemyId)?.kind ?? "prowler")
    : "player";
  const boss = kind === "boss";
  const player = kind === "player";
  const guard = kind === "guard";
  const size = boss ? 1.5 : kind === "prowler" ? 0.94 : 1.05;
  const coat = player
    ? "#73618d"
    : boss
      ? "#335a63"
      : guard
        ? "#7c6653"
        : kind === "duelist"
          ? "#933e48"
          : "#697870";
  const skin = player ? "#ead0bd" : "#b0927b";
  const eye = player ? "#78549c" : "#efcda0";
  const attackShapes = useMemo(() => {
    const enemy = stateRef.current.enemies.find((e) => e.id === enemyId);
    if (!enemy) return [];
    return Array.from({ length: 6 }, (_, i) => {
      const attack = enemyAttack({
        ...enemy,
        attackIndex: i % 3,
        phase: i < 3 ? 1 : 2,
      });
      return new THREE.RingGeometry(
        0.55,
        attack.range,
        40,
        1,
        -Math.PI / 2 - attack.arc,
        attack.arc * 2,
      );
    });
  }, [stateRef, enemyId]);
  useEffect(
    () => () => attackShapes.forEach((g) => g.dispose()),
    [attackShapes],
  );
  useFrame(({ camera }, dt) => {
    const state = stateRef.current;
    const enemy = enemyId
      ? state.enemies.find((e) => e.id === enemyId)
      : undefined;
    const actor = enemy ?? state.player;
    if (!root.current || !body.current) return;
    const speed =
      Math.hypot(
        actor.x - lastPosition.current.x,
        actor.z - lastPosition.current.z,
      ) / Math.max(dt, 0.001);
    lastPosition.current.set(actor.x, actor.y, actor.z);
    walk.current += Math.min(speed, 6) * dt * 2.8;
    root.current.position.set(actor.x, actor.y, actor.z);
    body.current.position.x = 0; body.current.position.z = 0;
    body.current.scale.setScalar(size);
    body.current.rotation.order = "XYZ";
    body.current.rotation.y = actor.facing;
    const walking = speed > 0.15 && actor.action !== "dead";
    const swing = walking ? Math.sin(walk.current) * 0.7 : 0;
    body.current.position.y = walking
      ? Math.abs(Math.sin(walk.current)) * 0.045
      : Math.sin(state.time * 2) * 0.012;
    body.current.rotation.x =
      actor.action === "dead"
        ? -1.5
        : actor.action === "hurt" || actor.action === "stagger"
          ? -0.16
          : 0;
    body.current.rotation.z = 0;
    if (leftLeg.current) leftLeg.current.rotation.x = swing;
    if (rightLeg.current) rightLeg.current.rotation.x = -swing;
    if (leftArm.current) leftArm.current.rotation.set(-swing * 0.65, 0, 0);
    if (arm.current) arm.current.rotation.y = 0;
    let armX = swing * 0.6;
    let armZ = -0.08;
    if (player) {
      const p = state.player;
      body.current.position.y += p.jumpHeight - Math.sin((p.landing / 0.18) * Math.PI) * 0.13;
      if (p.jumpHeight > 0) {
        body.current.rotation.x = -0.08;
        if (leftLeg.current) leftLeg.current.rotation.x = -0.85;
        if (rightLeg.current) rightLeg.current.rotation.x = 0.5;
        if (leftArm.current) leftArm.current.rotation.z = 0.4;
      }
      const pose = combatPose(p);
      if (pose) {
        armX = pose.ax; armZ = pose.az;
        if (arm.current) arm.current.rotation.y = pose.ay;
        body.current.rotation.x = pose.lean; body.current.rotation.y += pose.twist; body.current.position.y += pose.crouch;
        if (leftArm.current) leftArm.current.rotation.set(pose.lx, 0, pose.lz);
        if (leftLeg.current) leftLeg.current.rotation.x = pose.legL;
        if (rightLeg.current) rightLeg.current.rotation.x = pose.legR;
      }
      if (chargeGlow.current) {
        chargeGlow.current.visible = p.action === 'charge';
        chargeGlow.current.scale.setScalar(0.5 + (p.charge / CHARGE_TIME) * 0.7);
        const mat = chargeGlow.current.material as THREE.MeshBasicMaterial;
        mat.color.set(p.charge >= CHARGE_TIME ? '#fff1be' : '#c69969');
        mat.opacity = p.charge >= CHARGE_TIME ? 0.8 : 0.2 + 0.35 * (p.charge / CHARGE_TIME);
      }
      if (p.action === 'execute') { armX = -2.8 + Math.min(1, p.actionTime / 0.95) * 4; armZ = -0.4; }
      if (heldWeapon.current) heldWeapon.current.visible = p.action !== 'heal';
      if (medicine.current) medicine.current.visible = p.action === 'heal';
      if (p.action === "heal") {
        const raise = Math.min(1, p.actionTime / 0.3) * Math.min(1, (1.12 - p.actionTime) / 0.25);
        armX = -2.5 * raise; armZ = -0.4 * raise;
        body.current.rotation.x = -0.07 * raise;
        if (leftArm.current) leftArm.current.rotation.x = -0.4;
      }
      if (p.action === "dodge") {
        const roll = rollPose(p.actionTime);
        body.current.rotation.set(roll.angle, Math.atan2(p.dodgeX, p.dodgeZ), 0, 'YXZ');
        body.current.scale.y = size * (1 - 0.22 * roll.tuck);
        rollBounds.pivot.set(0, 0.97 * body.current.scale.y, 0).applyEuler(body.current.rotation);
        body.current.position.set(-rollBounds.pivot.x, roll.height * size - rollBounds.pivot.y, -rollBounds.pivot.z);
        armX = -1.8 * roll.tuck; armZ = 0.5 * roll.tuck - 0.08;
        if (arm.current) arm.current.rotation.y = -1.1 * roll.tuck;
        if (leftArm.current) leftArm.current.rotation.set(-1.6 * roll.tuck, 0, -0.5 * roll.tuck);
        if (leftLeg.current) leftLeg.current.rotation.x = -1.4 * roll.tuck;
        if (rightLeg.current) rightLeg.current.rotation.x = -1.1 * roll.tuck;
      }
    } else if (enemy) {
      if (heldWeapon.current) heldWeapon.current.rotation.x = Math.PI / 2;
      const pose = enemyMotion(enemy);
      if (pose) {
        if (heldWeapon.current) heldWeapon.current.rotation.x = pose.weaponPitch;
        armX = pose.ax; armZ = pose.az;
        if (arm.current) arm.current.rotation.y = pose.ay;
        body.current.rotation.x = pose.lean; body.current.rotation.y += pose.twist; body.current.position.y += pose.crouch;
        if (leftArm.current) leftArm.current.rotation.set(pose.lx, 0, pose.lz);
        if (leftLeg.current) leftLeg.current.rotation.x = pose.legL;
        if (rightLeg.current) rightLeg.current.rotation.x = pose.legR;
      }
      if (enemy.action === "stagger") {
        armX = 0.6;
        armZ = -0.5;
      }
    }
    if (arm.current) {
      arm.current.rotation.x = armX;
      arm.current.rotation.z = armZ;
    }
    if (player && actor.action === 'heal' && medicine.current && arm.current) {
      // Aim the neck at the mouth in shoulder space as the hand rises and falls.
      drinkAim.inverse.copy(arm.current.quaternion).invert();
      drinkAim.direction.set(0, 1.44, 0.235).sub(arm.current.position).applyQuaternion(drinkAim.inverse).sub(medicine.current.position)
.normalize();
      medicine.current.quaternion.setFromUnitVectors(drinkAim.up, drinkAim.direction);
    }
    if (player && actor.action === 'dodge') {
      // Visible geometry only: hidden attack rings must never lift the character.
      if (slash.current) slash.current.visible = false;
      body.current.updateWorldMatrix(true, true);
      rollBounds.all.makeEmpty();
      body.current.traverseVisible(object => {
        if (!(object instanceof THREE.Mesh)) return;
        if (!object.geometry.boundingBox) object.geometry.computeBoundingBox();
        if (object.geometry.boundingBox) rollBounds.all.union(rollBounds.mesh.copy(object.geometry.boundingBox).applyMatrix4(object.matrixWorld));
      });
      body.current.position.y += Math.max(0, actor.y + 0.02 - rollBounds.all.min.y);
    }
    if (telegraph.current && enemy) {
      telegraph.current.visible = enemy.action === "windup";
      telegraph.current.geometry =
        attackShapes[(enemy.phase === 2 ? 3 : 0) + (enemy.attackIndex % 3)];
      telegraph.current.rotation.set(-Math.PI / 2, 0, enemy.facing);
      const attack = enemyAttack(enemy);
      const mat = telegraph.current.material as THREE.MeshBasicMaterial;
      mat.color.set(attack.parryable ? "#ffc270" : "#ef655e");
      mat.opacity = 0.18 + (1 - enemy.timer / attack.windup) * 0.25;
    }
    if (slash.current) {
      slash.current.visible = player
        ? actor.action === "execute" &&
          state.player.actionTime > 0.18 &&
          state.player.actionTime < 0.6
        : enemy?.action === "attack";
      slash.current.rotation.z = state.time * 15;
    }
    if (marker.current) {
      marker.current.visible =
        state.lockedId === enemyId && actor.action !== "dead";
      marker.current.rotation.y = state.time;
    }
    if (health.current) {
      health.current.visible = !!enemy && enemy.aggro && !boss && enemy.hp > 0;
      health.current.quaternion.copy(camera.quaternion);
    }
    if (healthFill.current && enemy) {
      healthFill.current.scale.x = Math.max(0.001, enemy.hp / enemy.maxHp);
      healthFill.current.position.x = -0.44 * (1 - enemy.hp / enemy.maxHp);
    }
  });
  return (
    <group ref={root} name={enemyId ? `enemy-${enemyId}` : "player-rig"}>
      <group ref={body} scale={size}>
        <group ref={leftLeg} position={[-0.14, 0.8, 0]}>
          <Pole
            position={[0, -0.28, 0]}
            radius={0.105}
            height={0.52}
            color={player ? "#c7b7ce" : "#33444a"}
          />
          <Block
            position={[0, -0.65, 0.05]}
            size={[0.2, 0.25, 0.35]}
            color="#263741"
          />
        </group>
        <group ref={rightLeg} position={[0.14, 0.8, 0]}>
          <Pole
            position={[0, -0.28, 0]}
            radius={0.105}
            height={0.52}
            color={player ? "#c7b7ce" : "#33444a"}
          />
          <Block
            position={[0, -0.65, 0.05]}
            size={[0.2, 0.25, 0.35]}
            color="#263741"
          />
        </group>
        <mesh position={[0, 0.96, 0]} castShadow>
          <cylinderGeometry
            args={[0.27, player || boss ? 0.38 : 0.3, 0.72, 7]}
          />
          <meshStandardMaterial color={coat} roughness={0.85} />
        </mesh>
        <Block
          position={[0, 1.08, 0.24]}
          size={[0.07, 0.52, 0.035]}
          color={player ? "#d9baa7" : "#be9d6f"}
        />
        <Block
          position={[0, 0.88, 0]}
          size={[0.57, 0.09, 0.48]}
          color={COLORS.wood}
        />
        <mesh position={[0, 1.5, 0]} castShadow>
          <sphereGeometry args={[0.245, 12, 10]} />
          <meshStandardMaterial color={skin} />
        </mesh>
        {[-1, 1].map((s) => (
          <Block
            key={s}
            position={[s * 0.088, 1.52, 0.225]}
            size={[0.047, 0.052, 0.018]}
            color={eye}
          />
        ))}
        {player ? (
          <group>
            <mesh position={[0, 1.6, -0.035]} castShadow>
              <sphereGeometry
                args={[0.27, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.6]}
              />
              <meshStandardMaterial color="#d9dbe2" />
            </mesh>
            {[-1, 1].map((s) => (
              <group key={s}>
                <mesh position={[s * 0.195, 1.38, -0.06]} castShadow>
                  <capsuleGeometry args={[0.075, 0.35, 3, 6]} />
                  <meshStandardMaterial color="#c9d0dd" />
                </mesh>
                <mesh
                  position={[s * 0.195, 1.94, -0.02]}
                  rotation={[0.15, 0, -s * 0.2]}
                  castShadow
                >
                  <coneGeometry args={[0.12, 0.32, 4]} />
                  <meshStandardMaterial color="#77718d" />
                </mesh>
                <mesh
                  position={[s * 0.195, 1.94, 0.06]}
                  rotation={[0.15, 0, -s * 0.2]}
                >
                  <coneGeometry args={[0.063, 0.19, 3]} />
                  <meshStandardMaterial color="#c1a0af" />
                </mesh>
              </group>
            ))}
            <mesh position={[0, 1.78, -0.02]} castShadow>
              <sphereGeometry
                args={[0.27, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.5]}
              />
              <meshStandardMaterial color="#716b87" />
            </mesh>
            <Block
              position={[0, 1.08, -0.3]}
              size={[0.4, 0.48, 0.22]}
              color="#b5a38c"
            />
            <Block
              position={[0, 1.06, -0.42]}
              size={[0.22, 0.19, 0.04]}
              color="#665371"
            />
            <Block
              position={[0.23, 1.15, 0.05]}
              size={[0.07, 0.43, 0.45]}
              color="#bda994"
              rotation={[0, 0, 0.08]}
            />
            <mesh position={[0.35, 0.8, -0.22]}>
              <sphereGeometry args={[0.07, 8, 6]} />
              <meshStandardMaterial
                color="#e8c781"
                metalness={0.65}
                roughness={0.3}
              />
            </mesh>
          </group>
        ) : (
          <group>
            <mesh position={[0, 1.73, 0]} castShadow>
              <coneGeometry
                args={[
                  boss ? 0.43 : guard ? 0.32 : 0.26,
                  boss ? 0.16 : 0.24,
                  8,
                ]}
              />
              <meshStandardMaterial color={boss ? "#9b977a" : "#43565a"} />
            </mesh>
            <Block
              position={[0, 1.45, 0.2]}
              size={[0.34, 0.18, 0.07]}
              color={kind === "duelist" ? "#aa5960" : "#3d5156"}
            />
            {boss && (
              <Block
                position={[0, 1.21, -0.27]}
                size={[0.72, 0.84, 0.12]}
                color="#667376"
              />
            )}
            {guard && (
              <Block
                position={[0.25, 1.25, 0]}
                size={[0.24, 0.16, 0.42]}
                color="#b6a386"
              />
            )}
          </group>
        )}
        <group ref={leftArm} position={[-0.36, 1.24, 0]}>
          <Pole
            position={[0, -0.24, 0]}
            radius={0.105}
            height={0.42}
            color={coat}
          />
          <mesh position={[0, -0.49, 0.02]}>
            <sphereGeometry args={[0.1, 8, 6]} />
            <meshStandardMaterial color={skin} />
          </mesh>
        </group>
        <group ref={arm} position={[0.36, 1.24, 0]}>
          <Pole
            position={[0, -0.24, 0]}
            radius={0.105}
            height={0.42}
            color={coat}
          />
          <mesh position={[0, -0.49, 0.02]}>
            <sphereGeometry args={[0.1, 8, 6]} />
            <meshStandardMaterial color={skin} />
          </mesh>
          {player && <group ref={medicine} visible={false} position={[0, -0.52, 0.09]} rotation={[Math.PI / 2, 0, 0]}><mesh><cylinderGeometry args={[0.09, 0.12, 0.28, 10]} /><meshStandardMaterial color="#76cbb2" metalness={0.2} roughness={0.2} emissive="#255346" /></mesh><mesh position={[0, 0.2, 0]}><cylinderGeometry args={[0.045, 0.055, 0.13, 8]} /><meshStandardMaterial color="#dcc698" /></mesh></group>}
          <group ref={heldWeapon} position={[0, -0.46, 0.07]} rotation={[Math.PI / 2, 0, 0]}>
            {player && <mesh ref={chargeGlow} position={[0, 1.05, 0]} visible={false}><sphereGeometry args={[0.14, 12, 8]} /><meshBasicMaterial color="#ffe5a8" transparent opacity={0.6} depthWrite={false} /></mesh>}
            <Pole
              position={[0, 0.45, 0]}
              radius={player ? 0.035 : 0.045}
              height={boss ? 1.8 : 1.4}
              color={guard ? "#a38a62" : "#b6c3bf"}
            />
            {(player || boss) && (
              <mesh position={[0, 0.54, 0]} castShadow>
                <coneGeometry
                  args={[boss ? 0.28 : 0.115, boss ? 1.3 : 0.95, 8]}
                />
                <meshStandardMaterial
                  color={player ? "#66608b" : "#829195"}
                  metalness={0.35}
                  roughness={0.4}
                />
              </mesh>
            )}
            {kind === "duelist" && (
              <Block
                position={[0, 0.5, 0]}
                size={[0.07, 1.25, 0.045]}
                color="#c8d1c7"
              />
            )}
            <Pole
              position={[0, -0.17, 0]}
              radius={0.055}
              height={0.3}
              color={COLORS.wood}
            />
          </group>
        </group>
        <mesh
          ref={slash}
          rotation={[-0.3, 0.15, 0]}
          position={[0, 1.05, 0.7]}
          visible={false}
        >
          <ringGeometry args={[0.85, 0.94, 32, 1, 0, Math.PI * 1.1]} />
          <meshBasicMaterial
            color={player ? "#d8e0ff" : "#ffd09a"}
            transparent
            opacity={0.68}
            side={THREE.DoubleSide}
            depthWrite={false}
          />
        </mesh>
      </group>
      {player && <CombatTrail stateRef={stateRef} />}
      {!player && (
        <mesh
          ref={telegraph}
          geometry={attackShapes[0]}
          rotation={[-Math.PI / 2, 0, 0]}
          position={[0, 0.055, 0]}
          visible={false}
        >
          <meshBasicMaterial
            color="#ffc270"
            transparent
            opacity={0.25}
            side={THREE.DoubleSide}
            depthWrite={false}
          />
        </mesh>
      )}
      <group ref={marker} position={[0, size * 2.22, 0]} visible={false}>
        <mesh>
          <octahedronGeometry args={[0.1]} />
          <meshBasicMaterial color="#fff1c3" />
        </mesh>
      </group>
      <group ref={health} position={[0, size * 2.13, 0]} visible={false}>
        <mesh position={[0, 0, -0.004]}>
          <planeGeometry args={[0.94, 0.06]} />
          <meshBasicMaterial color="#20323b" />
        </mesh>
        <mesh ref={healthFill}>
          <planeGeometry args={[0.88, 0.036]} />
          <meshBasicMaterial color="#ca8074" />
        </mesh>
      </group>
    </group>
  );
}

function Weather({ stateRef }: { stateRef: StateRef }) {
  const lines = useRef<THREE.LineSegments>(null);
  const positions = useMemo(() => new Float32Array(480 * 6), []);
  useFrame(() => {
    const p = stateRef.current.player;
    const { time } = stateRef.current;
    for (let i = 0; i < 480; i += 1) {
      const x = p.x + pseudoRandom(i + 700) * 38 - 19;
      const z = p.z + pseudoRandom(i + 1300) * 38 - 19;
      const y = p.y + 16 - ((time * 10 + pseudoRandom(i + 2400) * 20) % 20);
      const n = i * 6;
      positions[n] = x;
      positions[n + 1] = y;
      positions[n + 2] = z;
      positions[n + 3] = x - 0.075;
      positions[n + 4] = y - 0.5;
      positions[n + 5] = z + 0.045;
    }
    if (lines.current) {
      lines.current.geometry.attributes.position.needsUpdate = true;
    }
  });
  return (
    <lineSegments ref={lines} frustumCulled={false}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          args={[positions, 3]}
          usage={THREE.DynamicDrawUsage}
        />
      </bufferGeometry>
      <lineBasicMaterial
        color="#c3d8df"
        transparent
        opacity={0.21}
        depthWrite={false}
      />
    </lineSegments>
  );
}

function HitEffects({ stateRef }: { stateRef: StateRef }) {
  const groups = useRef<(THREE.Group | null)[]>([]);
  useFrame(() => {
    const { effects } = stateRef.current;
    groups.current.forEach((g, index) => {
      if (!g) return;
      const effect = effects[index];
      g.visible = !!effect;
      if (!effect) return;
      g.position.set(effect.x, effect.y + 0.9, effect.z);
      g.rotation.set(0, stateRef.current.time * 4, Math.PI / 4);
      const progress = Math.max(0, 1 - effect.life);
      const big = effect.kind === "parry" || effect.kind === "death";
      g.scale.setScalar((0.4 + progress * 2) * (big ? 1.5 : 0.8));
      g.children.forEach((child) => {
        const mat = (child as THREE.Mesh).material as THREE.MeshBasicMaterial;
        mat.color.set(
          effect.kind === "parry"
            ? "#fff0ac"
            : effect.kind === "block"
              ? "#9edaff"
            : effect.kind === "heal"
              ? "#8df6ce"
              : effect.kind === "hit"
                ? "#ffbb89"
                : "#dbe7ff",
        );
        mat.opacity = Math.min(1, effect.life * 2);
      });
    });
  });
  return (
    <group>
      {Array.from({ length: 20 }, (_, i) => (
        <group
          key={i}
          ref={(g) => {
            groups.current[i] = g;
          }}
          visible={false}
        >
          {Array.from({ length: 6 }, (__, j) => (
            <mesh
              key={j}
              position={[
                Math.sin(j * 2.4) * 0.28,
                Math.cos(j * 2.4) * 0.28,
                Math.sin(j * 1.3) * 0.2,
              ]}
              rotation={[j * 0.6, 0, j]}
            >
              <boxGeometry args={[0.024, 0.25, 0.025]} />
              <meshBasicMaterial
                color="#ffe1ab"
                transparent
                depthWrite={false}
              />
            </mesh>
          ))}
        </group>
      ))}
    </group>
  );
}

function CameraRig({
  stateRef,
  cameraControl,
}: Pick<WorldProps, "stateRef" | "cameraControl">) {
  const { camera, scene } = useThree();
  const ray = useMemo(() => new THREE.Raycaster(), []);
  const direction = useMemo(() => new THREE.Vector3(), []);
  const target = useMemo(() => new THREE.Vector3(), []);
  const desired = useMemo(() => new THREE.Vector3(), []);
  const first = useRef(true);
  const lastReset = useRef(-1);
  useFrame((_, dt) => {
    const state = stateRef.current;
    const p = state.player;
    const controls = cameraControl.current;
    const locked = state.enemies.find(
      (e) => e.id === state.lockedId && e.hp > 0,
    );
    let { yaw } = controls;
    let { distance } = controls;
    let { pitch } = controls;
    if (locked) {
      const desiredYaw = Math.atan2(p.x - locked.x, p.z - locked.z) + 0.32;
      const difference = Math.atan2(
        Math.sin(desiredYaw - yaw),
        Math.cos(desiredYaw - yaw),
      );
      controls.yaw += difference * Math.min(1, dt * 5);
      yaw = controls.yaw;
      // A raised shoulder view keeps the enemy windup clear of the player silhouette.
      distance = Math.max(5.6, distance + 0.6);
      pitch = Math.max(0.54, pitch);
    }
    if (state.mode === "title") {
      yaw = 0.08;
      distance = 9;
      pitch = 0.3;
    }
    target.set(p.x, p.y + 1.3 + p.jumpHeight * 0.35, p.z);
    if (locked) { target.x += (locked.x - p.x) * 0.24; target.z += (locked.z - p.z) * 0.24; }
    desired.set(
      p.x + Math.sin(yaw) * Math.cos(pitch) * distance,
      p.y + 1.3 + p.jumpHeight * 0.35 + Math.sin(pitch) * distance,
      p.z + Math.cos(yaw) * Math.cos(pitch) * distance,
    );
    // Keep the eye above real decks and shorten the boom before collision volumes.
    for (let t = 0.12; t <= 1; t += 0.07) {
      const x = THREE.MathUtils.lerp(target.x, desired.x, t);
      const z = THREE.MathUtils.lerp(target.z, desired.z, t);
      const y = THREE.MathUtils.lerp(target.y, desired.y, t);
      const ground = heightAt(x, z);
      const obstacle = OBSTACLES.some(
        (o) => o.kind !== 'shrine' && !gateOpen(o, state) &&
          Math.abs(x - o.x) < o.w / 2 + 0.2 &&
          Math.abs(z - o.z) < o.d / 2 + 0.2 &&
          y > o.y &&
          y < o.y + o.h + 0.3,
      );
      const wall = CAMERA_BUILDINGS.some(
        (b) => Math.abs(x - b.x) < b.w / 2 + 0.3 &&
          Math.abs(z - b.z) < b.d / 2 + 0.3 &&
          y < b.top,
      );
      if ((ground !== null && y < ground + 0.3) || obstacle || wall) {
        desired.lerpVectors(target, desired, Math.max(0.1, t - 0.08));
        break;
      }
    }
    // Also test actual static artwork: parapets, awnings and roof edges must not
    // slice through the camera when the player turns beside a ledge.
    const city = scene.getObjectByName('night-city');
    let obstructed = false;
    if (city) {
      direction.subVectors(desired, target); const length = direction.length();
      ray.set(target, direction.normalize()); ray.near = 0.15; ray.far = length;
      const hit = ray.intersectObject(city, true)[0];
      if (hit) { desired.copy(target).addScaledVector(direction, Math.max(0.65, hit.distance - 0.2)); obstructed = true; }
    }
    const reset = controls.reset !== lastReset.current;
    lastReset.current = controls.reset;
    if (first.current || reset || obstructed) {
      camera.position.copy(desired);
      first.current = false;
    } else camera.position.lerp(desired, 1 - Math.exp(-dt * 10));
    camera.lookAt(target);
  });
  return null;
}

function Scene({ stateRef, cameraControl, onReady, onError, companionRef }: WorldProps) {
  const { gl } = useThree();
  useEffect(() => {
    const canvas = gl.domElement;
    const lost = (event: Event) => {
      event.preventDefault();
      onError?.("画面连接中断，请重新加载这一晚。");
    };
    canvas.addEventListener("webglcontextlost", lost);
    onReady?.();
    return () => canvas.removeEventListener("webglcontextlost", lost);
  }, [gl, onReady, onError]);
  return (
    <>
      <color attach="background" args={["#728d9b"]} />
      <fog attach="fog" args={["#728d9b", 34, 115]} />
      <hemisphereLight args={["#c7dcf0", "#536a68", 2.1]} />
      <ambientLight intensity={0.32} color="#c1d9eb" />
      <directionalLight
        position={[-22, 32, 15]}
        intensity={2.35}
        color="#c1d8ed"
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-45}
        shadow-camera-right={45}
        shadow-camera-top={50}
        shadow-camera-bottom={-65}
        shadow-camera-near={1}
        shadow-camera-far={120}
        shadow-normalBias={0.05}
        shadow-bias={-0.0002}
      />
      <City />
      <ObstacleArt stateRef={stateRef} />
      <Landmarks stateRef={stateRef} />
      <Actor stateRef={stateRef} />
      {companionRef && <CompanionView stateRef={stateRef} companionRef={companionRef} />}
      {ENEMY_SPAWNS.map((e) => (
        <Actor key={e.id} stateRef={stateRef} enemyId={e.id} />
      ))}
      <Weather stateRef={stateRef} />
      <HitEffects stateRef={stateRef} />
      <CameraRig stateRef={stateRef} cameraControl={cameraControl} />
    </>
  );
}

function WorldView(props: WorldProps) {
  return (
    <Canvas
      shadows
      dpr={[1, 1.5]}
      camera={{ fov: 54, near: 0.08, far: 155, position: [2, 10, 24] }}
      gl={{
        antialias: true,
        alpha: false,
        powerPreference: "high-performance",
      }}
      onCreated={({ gl }) => {
        gl.toneMapping = THREE.ACESFilmicToneMapping;
        gl.toneMappingExposure = 1.07;
        gl.shadowMap.type = THREE.PCFSoftShadowMap;
      }}
      style={{ width: "100%", height: "100%", touchAction: "none" }}
    >
      <Scene {...props} />
    </Canvas>
  );
}

export default memo(WorldView);
