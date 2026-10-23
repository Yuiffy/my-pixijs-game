"use client";

import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { memo, useEffect, useMemo, useRef } from "react";
import * as T from "three";
import BridgeView from "./BridgeView";
import TerrainView from "./TerrainView";
import Skyline from "./Skyline";
import RoadView from "./RoadView";
import UrbanView from "./UrbanView";
import { treeClearsBridge } from "./bridges";
import { terrainHeight, WATER_LEVEL } from "./terrain";
import { cityTexture } from "./textures";
import { deliveryTarget } from "./life";
import { resolveCamera } from "./camera";
import { followCameraBoom } from "../gameCamera/boom";
import { conversationArea, conversationView, type ConversationArea, type ConversationView } from "./conversationCamera";
import { BENCH_BOXES, NOODLE_STALL, STALL_BOXES } from "./street";
import EveningStage from "./EveningStage";
import Dongmen from "./DongmenView";
import { eveningTarget, SOUND_SPOTS } from "./evening";
import ActorView, { inspectAvatars, type AvatarSnapshot } from "./ActorView";
import { CRANK_Y, CRANK_Z, CRANK_RADIUS, pedalPhase } from "./actorMotion";
import {
  BUILDINGS,
  URBAN_FABRIC,
  buildingElevation,
  buildingContains,
  canTraverse,
  distance,
  LANDMARKS,
  RIVER,
  ROAD_SEGMENTS,
  type Building,
  type Point,
} from "./world";
import {
  QUESTS,
  type Actor,
  type Character,
  type Game,
  type Npc,
  type Vehicle,
} from "./simulation";

export type CameraRig = {
  yaw: number;
  pitch: number;
  zoom: number;
  dragged: number;
  reset: boolean;
  avatars?: () => AvatarSnapshot[];
  dialoguePanel?: ConversationArea;
  framing?: () => { position: number[]; offset: boolean; area: ConversationArea; actors: { id: string; left: number; right: number; top: number; bottom: number }[] };
  listener?: { x: number; y: number; z: number; fx: number; fy: number; fz: number };
};
type Box = {
  at: [number, number, number];
  size: [number, number, number];
  color: string;
  angle?: number;
};
function Cube({
  at = [0, 0, 0],
  size,
  color,
  angle = 0,
}: {
  at?: [number, number, number];
  size: [number, number, number];
  color: string;
  angle?: number;
}) {
  return (
    <mesh position={at} rotation={[0, angle, 0]} castShadow receiveShadow>
      <boxGeometry args={size} />
      <meshStandardMaterial color={color} roughness={0.82} />
    </mesh>
  );
}
function Ball({
  at,
  size,
  color,
}: {
  at: [number, number, number];
  size: [number, number, number];
  color: string;
}) {
  return (
    <mesh position={at} scale={size} castShadow>
      <sphereGeometry args={[1, 10, 8]} />
      <meshStandardMaterial color={color} roughness={0.9} />
    </mesh>
  );
}
function Batch({
  boxes,
  textured = false,
}: {
  boxes: Box[];
  textured?: boolean;
}) {
  const ref = useRef<T.InstancedMesh>(null);
  const texture = useMemo(
    () => (textured ? cityTexture("wall") : null),
    [textured],
  );
  useEffect(() => () => texture?.dispose(), [texture]);
  useEffect(() => {
    if (!ref.current) return;
    const matrix = new T.Matrix4();
    const quat = new T.Quaternion();
    const color = new T.Color();
    boxes.forEach((b, i) => {
      quat.setFromAxisAngle(new T.Vector3(0, 1, 0), b.angle || 0);
      matrix.compose(new T.Vector3(...b.at), quat, new T.Vector3(...b.size));
      ref.current!.setMatrixAt(i, matrix);
      ref.current!.setColorAt(i, color.set(b.color));
    });
    ref.current.instanceMatrix.needsUpdate = true;
    if (ref.current.instanceColor) ref.current.instanceColor.needsUpdate = true;
    ref.current.computeBoundingSphere();
  }, [boxes]);
  return (
    <instancedMesh
      ref={ref}
      args={[undefined, undefined, boxes.length]}
      castShadow
      receiveShadow
    >
      <boxGeometry />
      <meshStandardMaterial roughness={0.82} map={texture} />
    </instancedMesh>
  );
}
function Sign({
  text,
  at,
  angle = 0,
  width = 6,
  color = "#eee1b9",
  ink = "#3c4d45",
}: {
  text: string;
  at: [number, number, number];
  angle?: number;
  width?: number;
  color?: string;
  ink?: string;
}) {
  const texture = useMemo(() => {
    const c = document.createElement("canvas");
    c.width = 512;
    c.height = 128;
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, 512, 128);
    ctx.strokeStyle = ink;
    ctx.lineWidth = 4;
    ctx.strokeRect(7, 7, 498, 114);
    ctx.font = 'bold 57px "Microsoft YaHei", sans-serif';
    ctx.fillStyle = ink;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, 256, 66, 475);
    const t = new T.CanvasTexture(c);
    t.colorSpace = T.SRGBColorSpace;
    return t;
  }, [text, color, ink]);
  useEffect(() => () => texture.dispose(), [texture]);
  return (
    <mesh position={at} rotation={[0, angle, 0]}>
      <planeGeometry args={[width, width / 4]} />
      <meshStandardMaterial map={texture} side={T.DoubleSide} roughness={0.8} />
    </mesh>
  );
}
const City = memo(() => {
  const {
    boxes: cityBoxes,
    trees: cityTrees,
  } = useMemo(() => {
    const boxes: Box[] = [];
    const trees: Point[] = [];
    BUILDINGS.filter(b => !b.id.startsWith("urban-wall-")).forEach((b, i) => {
      const firstBox = boxes.length;
      if (!b.footprint) boxes.push({
        at: [b.x, b.h / 2, b.z],
        size: [b.w, b.h, b.d],
        color: b.color,
        angle: b.angle,
      });
      if (!b.footprint) boxes.push({
        at: [b.x, b.h + 0.25, b.z],
        size: [b.w + 0.9, 0.6, b.d + 0.9],
        color: "#89887c",
        angle: b.angle,
      });
      const sin = Math.sin(b.angle);
      const cos = Math.cos(b.angle);
      if (b.footprint) {
        b.footprint.forEach((a, index) => {
          const c = b.footprint![(index + 1) % b.footprint!.length];
          const length = distance(a, c); const dx = (c.x - a.x) / length; const dz = (c.z - a.z) / length;
          for (let n = 2; n < length - 1; n += 3.4) for (let y = 4; y < b.h - 1; y += 3.1) {
            boxes.push({ at: [a.x + dx * n, y, a.z + dz * n], size: [1.3, 1.7, 0.15], angle: -Math.atan2(dz, dx), color: (index + Math.round(n) + i) % 4 ? "#536a68" : "#d2b77a" });
          }
        });
        for (let j = firstBox; j < boxes.length; j++) boxes[j].at[1] += buildingElevation(b);
        return;
      }
      for (const side of [-1, 1]) {
        for (let y = 4; y < b.h - 1; y += 3.1) for (let x = -b.w / 2 + 2; x < b.w / 2 - 1; x += 3) {
            const z = (b.d / 2 + 0.06) * side;
            boxes.push({
              at: [b.x + x * cos + z * sin, y, b.z - x * sin + z * cos],
              size: [1.3, 1.7, 0.12],
              angle: b.angle,
              color: Math.floor(x + y + i) % 4 === 0 ? "#d2b77a" : "#536a68",
            });
          }
        const z = (b.d / 2 + 1.2) * side;
        boxes.push({
          at: [b.x + z * sin, 2.9, b.z + z * cos],
          size: [b.w - 0.7, 0.25, 2.7],
          angle: b.angle,
          color: i % 3 ? "#507b6e" : "#b87656",
        });
      }
      for (let j = firstBox; j < boxes.length; j++) boxes[j].at[1] += buildingElevation(b);
    });
    ROAD_SEGMENTS.filter((s) => !s.road.bridge).forEach((s, i) => {
      const length = distance(s.a, s.b);
      const angle = Math.atan2(s.b.x - s.a.x, s.b.z - s.a.z);
      const x = (s.a.x + s.b.x) / 2;
      const z = (s.a.z + s.b.z) / 2;
      if (s.road.name === "滨江东路") for (let n = 0; n < length; n += 24) {
          const p = {
            x: s.a.x + Math.sin(angle) * n + Math.cos(angle) * 10,
            z: s.a.z + Math.cos(angle) * n - Math.sin(angle) * 10,
          };
          if (canTraverse(p) && treeClearsBridge(p) && !BUILDINGS.some(b => buildingContains(p, b, 3))) trees.push(p);
        }
      if (i % 4 === 0) {
        const p = {
          x: x + Math.cos(angle) * (s.road.width / 2 + 3),
          z: z - Math.sin(angle) * (s.road.width / 2 + 3),
        };
        if (canTraverse(p) && treeClearsBridge(p) && !BUILDINGS.some(b => buildingContains(p, b, 3))) trees.push(p);
      }
    });
    return { boxes, trees };
  }, []);
  return (
    <>
      <TerrainView />
      <Skyline />
      <WaterLines />
      <RoadView />
      <UrbanView fabric={URBAN_FABRIC} heightAt={terrainHeight} />
      <Batch boxes={cityBoxes} textured />
      {BUILDINGS.filter((b) => b.footprint).map((b) => <FootprintBuilding key={b.id} building={b} />)}
      <Trees points={cityTrees} />
      <Dongmen />
      <BridgeView />
      <StreetProps />
    </>
  );
});
const FootprintBuilding = memo(({ building: b }: { building: Building }) => {
  const geometry = useMemo(() => {
    const shape = new T.Shape(b.footprint!.map((p) => new T.Vector2(p.x - b.x, b.z - p.z)));
    return new T.ExtrudeGeometry(shape, { depth: b.h, bevelEnabled: false, steps: 1 }).rotateX(-Math.PI / 2);
  }, [b]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return (
<mesh position={[b.x, buildingElevation(b), b.z]} geometry={geometry} castShadow receiveShadow>
    <meshStandardMaterial color={b.color} roughness={0.95} />
  </mesh>
);
});
function WaterLines() {
  const ref = useRef<T.Group>(null);
  useFrame(({ clock }) => {
    if (ref.current) ref.current.position.z = Math.sin(clock.elapsedTime * 0.3) * 1.4;
  });
  const boxes = useMemo(
    () => Array.from({ length: 220 }, (_, i): Box => {
        const index = i % (RIVER.length - 1);
        const a = RIVER[index];
        const b = RIVER[index + 1];
        const t = ((i * 73) % 101) / 101;
        return {
          at: [
            a.x + (b.x - a.x) * t + Math.sin(i * 5) * 80,
            WATER_LEVEL + 0.04,
            a.z + (b.z - a.z) * t + Math.cos(i * 7) * 65,
          ],
          size: [2 + (i % 5) * 3, 0.01, 0.12],
          color: i % 2 ? "#79aba1" : "#b1c5a5",
        };
      }),
    [],
  );
  return (
    <group ref={ref}>
      <Batch boxes={boxes} />
    </group>
  );
}
function Trees({ points }: { points: Point[] }) {
  const trunks = useMemo(
    () => points.map(
        (p): Box => ({
          at: [p.x, terrainHeight(p) + 2, p.z],
          size: [0.45, 4, 0.45],
          color: "#6c7160",
        }),
      ),
    [points],
  );
  const ref = useRef<T.InstancedMesh>(null);
  useEffect(() => {
    if (!ref.current) return;
    const matrix = new T.Matrix4();
    points.forEach((p, i) => {
      matrix.makeScale(2.6 + (i % 2), 3.8, 2.8);
      matrix.setPosition(p.x, terrainHeight(p) + 5.4, p.z);
      ref.current!.setMatrixAt(i, matrix);
      ref.current!.setColorAt(i, new T.Color(i % 3 ? "#6e8e67" : "#93a070"));
    });
    ref.current.instanceMatrix.needsUpdate = true;
    ref.current.computeBoundingSphere();
  }, [points]);
  return (
    <>
      <Batch boxes={trunks} />
      <instancedMesh
        ref={ref}
        args={[undefined, undefined, points.length]}
        castShadow
      >
        <icosahedronGeometry args={[1, 1]} />
        <meshStandardMaterial roughness={1} />
      </instancedMesh>
    </>
  );
}
function StreetProps() {
  const pavement = useMemo(() => {
    const t = cityTexture("stone");
    t.repeat.set(24, 24);
    return t;
  }, []);
  useEffect(() => () => pavement.dispose(), [pavement]);
  const plaza = useMemo(() => {
    const g = new T.PlaneGeometry(75, 85, 15, 17).rotateX(-Math.PI / 2).translate(0, 0, -2);
    const positions = g.getAttribute("position");
    for (let i = 0; i < positions.count; i++) positions.setY(i, terrainHeight({ x: positions.getX(i), z: positions.getZ(i) }) + 0.02);
    g.computeVertexNormals(); return g;
  }, []);
  useEffect(() => () => plaza.dispose(), [plaza]);
  const streetLights = useMemo(() => {
    const b: Box[] = [];
    for (const x of [-34, 34]) for (const z of [-43, -18, 7]) {
        b.push(
          { at: [x, 3.2, z], size: [0.16, 6.4, 0.16], color: "#465e52" },
          { at: [x, 6.4, z], size: [1.5, 0.16, 0.5], color: "#637261" },
          { at: [x, 6.25, z], size: [1.3, 0.06, 0.4], color: "#e8d7a1" },
        );
      }
    return b;
  }, []);
  return (
    <>
      <mesh
        geometry={plaza}
        receiveShadow
      >
        <meshStandardMaterial map={pavement} color="#cec4a8" roughness={0.95} />
      </mesh>
      <Batch boxes={streetLights.map(b => ({ ...b, at: [b.at[0], b.at[1] + terrainHeight({ x: b.at[0], z: b.at[2] }), b.at[2]] }))} />
      <Batch boxes={BENCH_BOXES.map(b => ({ ...b, at: [b.at[0], b.at[1] + terrainHeight({ x: b.at[0], z: b.at[2] }), b.at[2]] }))} />
      <Batch boxes={STALL_BOXES.map(b => ({ ...b, at: [b.at[0], b.at[1] + terrainHeight({ x: b.at[0], z: b.at[2] }), b.at[2]] }))} />
      <group position={[NOODLE_STALL.x, terrainHeight(NOODLE_STALL), NOODLE_STALL.z]} rotation={[0, NOODLE_STALL.angle, 0]}>
        <Sign
          text="柳 州 螺 蛳 粉"
          at={[0, 3.5, -0.4]}
          width={7}
          color="#e4d7af"
          ink="#8b4e37"
        />
        {[-2, 0, 2].map((x) => (
          <group key={x} position={[x, 1.2, -2.5]}>
            <mesh position={[0, 0.18, 0]}>
              <cylinderGeometry args={[0.48, 0.43, 0.36, 16]} />
              <meshStandardMaterial color="#aab7b4" metalness={0.5} roughness={0.36} />
            </mesh>
            <mesh position={[0, 0.37, 0]} rotation={[-Math.PI / 2, 0, 0]}>
              <circleGeometry args={[0.42, 16]} />
              <meshStandardMaterial color={x === -2 ? "#936040" : x === 0 ? "#bd8e58" : "#647f4b"} />
            </mesh>
            <Cube at={[-0.55, 0.24, 0]} size={[0.22, 0.08, 0.1]} color="#374945" />
            <Cube at={[0.55, 0.24, 0]} size={[0.22, 0.08, 0.1]} color="#374945" />
          </group>
        ))}
        {[-1, 1].map(side => (
          <mesh key={side} position={[side * 2.7, 1.3, -1.9]}>
            <cylinderGeometry args={[0.22, 0.16, 0.2, 12]} />
            <meshStandardMaterial color="#f2e6c9" />
          </mesh>
        ))}
        <Sign text="热 汤 · 现 煮" at={[0, 0.7, -1.48]} width={3.7} color="#b56847" ink="#f5e5bf" />
      </group>
      <Sign
        text="滨 江 东 路"
        at={[69, terrainHeight({ x: 69, z: -20 }) + 3, -20]}
        angle={-0.7}
        width={5}
        color="#386b64"
        ink="#f3eed7"
      />
      <Cube at={[69, terrainHeight({ x: 69, z: -20 }) + 1.5, -20]} size={[0.15, 3, 0.15]} color="#555f54" />
      <group position={[253, terrainHeight({ x: 253, z: -175 }), -175]}>
        <Cube at={[0, 0.5, 5]} size={[6, 1, 0.5]} color="#bcbca7" />
        <Sign text="金 沙 角 · 柳 江" at={[0, 2, 6]} width={5} />
        <Cube at={[0, 1, 6]} size={[0.18, 2, 0.18]} color="#676d5a" />
      </group>
      {LANDMARKS.filter((l) => l.id === "street").map((l) => (
        <Sign
          key={l.id}
          text={l.name}
          at={[l.x + 10, terrainHeight(l) + 3.5, l.z + 6]}
          width={4}
        />
      ))}
    </>
  );
}

function MealBox({ game, vehicle }: { game: Game; vehicle?: Vehicle }) {
  const root = useRef<T.Group>(null);
  const material = useRef<T.MeshStandardMaterial>(null);
  useFrame(() => {
    if (root.current) root.current.visible = !!game.life.delivery && (vehicle ? game.vehicle === vehicle.id : !game.vehicle);
    material.current?.color.set(game.life.insulated ? "#66bdaa" : "#d6ac6d");
  });
  return (
    <group ref={root} position={vehicle ? vehicle.kind === "bike" ? [0, 1.38, 0.7] : [0, 1.14, -1.65] : [0, 1.05, -0.36]}>
      <mesh castShadow>
        <boxGeometry args={[0.48, 0.4, 0.4]} />
        <meshStandardMaterial ref={material} color="#d6ac6d" />
      </mesh>
      <Cube at={[0, 0.21, 0]} size={[0.5, 0.06, 0.42]} color="#f2dfae" />
      <Cube at={[0, 0, -0.21]} size={[0.08, 0.42, 0.025]} color="#f2dfae" />
    </group>
  );
}
function Person({ game, actor, character, citizen, player = false }: {
  game: Game; actor: Actor; character?: Character; citizen?: Npc; player?: boolean;
}) {
  return (
<ActorView game={game} actor={actor} character={character} citizen={citizen} player={player}>
    {player && <MealBox game={game} />}
  </ActorView>
);
}
function VehicleView({ v, game }: { v: Vehicle; game: Game }) {
  const root = useRef<T.Group>(null);
  const wheels = useRef<(T.Group | null)[]>([]);
  const steering = useRef<(T.Group | null)[]>([]);
  const tailLights = useRef<(T.MeshStandardMaterial | null)[]>([]);
  const cranks = useRef<(T.Group | null)[]>([]);
  const pedals = useRef<(T.Group | null)[]>([]);
  useFrame(() => {
    if (root.current) {
      root.current.position.set(v.x, v.y, v.z);
      root.current.rotation.y = v.angle;
      root.current.rotation.z = v.kind === "bike" ? -(v.steering || 0) * Math.min(0.15, Math.abs(v.speed) * 0.015) : 0;
      root.current.visible = distance(v, game.player) < 330;
    }
    cranks.current.forEach((crank, i) => {
      const angle = -pedalPhase(v.odometer || 0) - i * Math.PI;
      if (crank) crank.rotation.x = angle;
      if (pedals.current[i]) pedals.current[i]!.rotation.x = -angle;
    });
    wheels.current.forEach((wheel) => { if (wheel) wheel.rotation.x = (v.odometer || 0) / 0.36; });
    steering.current.forEach((wheel) => { if (wheel) wheel.rotation.y = (v.steering || 0) * 0.4; });
    tailLights.current.forEach((material) => {
      if (material) { material.color.set(v.braking ? "#ff5143" : "#9c493e"); material.emissive.set(v.braking ? "#ee2415" : "#000000"); material.emissiveIntensity = v.braking ? 1.2 : 0; }
    });
  });
  if (v.kind === "bike") return (
      <group ref={root}>
        <MealBox game={game} vehicle={v} />
        <Cube at={[0, 0.72, 0]} size={[0.1, 0.14, 1.4]} color={v.color} />
        <Cube at={[0, 0.85, 0.45]} size={[0.1, 1, 0.1]} color={v.color} />
        <Cube at={[0, 1.03, -0.2]} size={[0.12, 0.5, 0.12]} color={v.color} />
        <Cube at={[0, 1.15, -0.2]} size={[0.36, 0.08, 0.25]} color="#3a4a43" />
        <Cube at={[0, 1.4, 0.46]} size={[0.7, 0.08, 0.08]} color="#47564f" />
          {[-0.65, 0.65].map((z, i) => (
            <group key={z} position={[0, 0.38, z]} ref={(el) => { wheels.current[i] = el; }}>
            <mesh rotation={[0, Math.PI / 2, 0]}>
              <torusGeometry args={[0.36, 0.045, 6, 16]} />
              <meshStandardMaterial color="#3c4b45" />
            </mesh>
            <Cube at={[0, 0, 0]} size={[0.035, 0.65, 0.025]} color="#c0ccc0" />
            <Cube at={[0, 0, 0]} size={[0.035, 0.025, 0.65]} color="#c0ccc0" />
            </group>
          ))}
        <Cube at={[0, 1.15, 0.7]} size={[0.48, 0.35, 0.4]} color="#bea476" />
        <ActorView game={game} actor={game.player} character={game.character} player vehicle={v} />
        {[-1, 1].map((side, i) => (
<group key={side} ref={el => { cranks.current[i] = el; }} position={[side * 0.16, CRANK_Y, CRANK_Z]}>
          <Cube at={[0, 0, CRANK_RADIUS / 2]} size={[0.035, 0.035, CRANK_RADIUS]} color="#b7c0af" />
          <group name={`pedal-${i ? "right" : "left"}`} position={[0, 0, CRANK_RADIUS]} ref={el => { pedals.current[i] = el; }}>
            <Cube at={[side * 0.035, 0, 0]} size={[0.17, 0.04, 0.12]} color="#3a4a43" />
          </group>
        </group>
))}
      </group>
    );
  return (
    <group ref={root}>
      <MealBox game={game} vehicle={v} />
      <Cube at={[0, 0.65, 0]} size={[1.9, 0.68, 3.8]} color={v.color} />
      <Cube at={[0, 1.21, -0.23]} size={[1.7, 0.66, 1.8]} color={v.color} />
      <Cube at={[0, 1.25, 0.7]} size={[1.48, 0.45, 0.035]} color="#537a7b" />
      <Cube at={[0, 1.25, -1.16]} size={[1.48, 0.45, 0.035]} color="#537a7b" />
      {[-1, 1].map((x) => (
        <group key={x}>
          <Cube
            at={[x * 0.861, 1.25, -0.2]}
            size={[0.025, 0.43, 1.45]}
            color="#537a7b"
          />
          {[-1.22, 1.22].map((z, zi) => (
            <group key={z} position={[x * 0.94, 0.4, z]} ref={(el) => { if (zi === 1) steering.current[x === -1 ? 0 : 1] = el; }}>
            <group ref={(el) => { wheels.current[(x === -1 ? 0 : 2) + zi] = el; }}>
            <mesh
              rotation={[0, 0, Math.PI / 2]}
            >
              <cylinderGeometry args={[0.36, 0.36, 0.2, 12]} />
              <meshStandardMaterial color="#35423e" />
            </mesh>
            <Cube at={[x * 0.11, 0, 0]} size={[0.025, 0.5, 0.07]} color="#adb9ad" />
            </group>
            </group>
          ))}
          <Cube
            at={[x * 0.6, 0.68, 1.92]}
            size={[0.4, 0.22, 0.04]}
            color="#eee5ae"
          />
          <mesh position={[x * 0.6, 0.68, -1.92]}>
            <boxGeometry args={[0.4, 0.2, 0.04]} />
            <meshStandardMaterial ref={(el) => { tailLights.current[x === -1 ? 0 : 1] = el; }} color="#af5749" />
          </mesh>
        </group>
      ))}
      <Cube at={[0, 0.43, 1.94]} size={[1.7, 0.1, 0.08]} color="#b6c0ac" />
    </group>
  );
}
function DeliveryMarker({ game }: { game: Game }) {
  const root = useRef<T.Group>(null);
  useFrame(() => {
    const target = deliveryTarget(game.life, game.npcs);
    if (root.current) {
      root.current.visible = !!target;
      if (target) root.current.position.set(target.x, terrainHeight(target) + 0.12, target.z);
    }
  });
  return (
    <group ref={root}>
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[1.8, 2, 24]} />
        <meshBasicMaterial color="#9ee7cf" side={T.DoubleSide} />
      </mesh>
      <Cube at={[0, 3.1, 0]} size={[0.4, 0.32, 0.4]} color="#82d5be" />
      <Cube at={[0, 3.29, 0]} size={[0.44, 0.06, 0.44]} color="#f2dfae" />
    </group>
  );
}
function QuestMarker({ game }: { game: Game }) {
  const root = useRef<T.Group>(null);
  const beam = useRef<T.Mesh>(null);
  useFrame(() => {
    const q = game.stage < 6 ? QUESTS[game.stage] : eveningTarget(game);
    if (root.current) {
      root.current.visible = !!q && !game.evening.watching;
      if (q) root.current.position.set(q.x, terrainHeight(q) + 0.1, q.z);
    }
    if (beam.current) beam.current.position.y = 3 + Math.sin(game.time * 2) * 0.3;
  });
  return (
    <group ref={root}>
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[1.5, 1.7, 32]} />
        <meshBasicMaterial color="#f0cb75" side={T.DoubleSide} />
      </mesh>
      <mesh ref={beam}>
        <octahedronGeometry args={[0.35]} />
        <meshBasicMaterial color="#f4d38b" />
      </mesh>
    </group>
  );
}
function SoundMarkers({ game }: { game: Game }) {
  const markers = useRef<(T.Group | null)[]>([]);
  useFrame(() => markers.current.forEach((root, i) => {
    if (root) root.visible = game.evening.started && !game.evening.watching && !game.evening.samples.includes(SOUND_SPOTS[i].id);
  }));
  return (
<>{SOUND_SPOTS.map((s, i) => (
<group key={s.id} ref={root => { markers.current[i] = root; }} position={[s.x, terrainHeight(s) + 0.1, s.z]}>
    <mesh rotation={[-Math.PI / 2, 0, 0]}><ringGeometry args={[3.6, 3.75, 32]} /><meshBasicMaterial color="#e8ca8c" side={T.DoubleSide} /></mesh>
    <Cube at={[0, 1, 0]} size={[0.32, 0.55, 0.22]} color="#5e8073" />
    <Ball at={[0, 1.4, 0]} size={[0.16, 0.2, 0.16]} color="#dfd2a9" />
  </group>
))}</>
);
}
function Frame({
  game,
  rig,
  tick,
  ready,
}: {
  game: Game;
  rig: CameraRig;
  tick: (dt: number) => void;
  ready: () => void;
}) {
  const { camera, gl, size, scene } = useThree();
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("test") !== "1") return;
    rig.avatars = () => inspectAvatars(scene);
    return () => { delete rig.avatars; };
  }, [rig, scene]);
  const boomDistance = useRef<number>();
  const initialized = useRef(false);
  const watching = useRef(false);
  const conversation = useRef<{ key: string; view: ConversationView }>();
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("test") !== "1") return;
    rig.framing = () => {
      scene.updateMatrixWorld(true);
      const actors = ["player", game.dialogue?.speakerId].flatMap(id => {
        if (!id) return [];
        const root = scene.getObjectByName(id);
        if (!root) return [];
        const bounds = new T.Box3().setFromObject(root);
        const points = [bounds.min.x, bounds.max.x].flatMap(x => [bounds.min.y, bounds.max.y].flatMap(y => [bounds.min.z, bounds.max.z].map(z => new T.Vector3(x, y, z).project(camera))));
        return [{ id, left: Math.min(...points.map(p => ((p.x + 1) * size.width) / 2)), right: Math.max(...points.map(p => ((p.x + 1) * size.width) / 2)), top: Math.min(...points.map(p => ((1 - p.y) * size.height) / 2)), bottom: Math.max(...points.map(p => ((1 - p.y) * size.height) / 2)) }];
      });
      return { position: camera.position.toArray(), offset: !!(camera as T.PerspectiveCamera).view?.enabled, area: conversation.current?.view.area || { x: 0, y: 0, width: size.width, height: size.height }, actors };
    };
    return () => { delete rig.framing; };
  }, [camera, game, rig, scene, size]);
  const forward = useRef(new T.Vector3());
  const audioView = () => {
    camera.getWorldDirection(forward.current);
    rig.listener = { x: camera.position.x, y: camera.position.y, z: camera.position.z, fx: forward.current.x, fy: forward.current.y, fz: forward.current.z };
  };
  useEffect(() => {
    ready();
  }, [ready]);
  useFrame((_, delta) => {
    tick(Math.min(delta, 0.1));
    if (!game.dialogue && conversation.current) {
      (camera as T.PerspectiveCamera).clearViewOffset();
      conversation.current = undefined;
      rig.reset = true;
    }
    if (game.evening.watching && game.phase !== "title") {
      watching.current = true;
      // Keep the full group and screen in a narrow portrait viewport too.
      const setback = Math.max(24, (16.2 * size.height) / size.width);
      const stageGround = terrainHeight({ x: 28, z: -31 });
      camera.position.set(28, stageGround + 4.5, -31 + setback);
      camera.lookAt(28, stageGround + 2.7, -31);
      camera.updateMatrixWorld();
      audioView();
      gl.domElement.dataset.drawCalls = String(gl.info.render.calls);
      gl.domElement.dataset.screening = "true";
      gl.domElement.dataset.cameraDistance = String(Math.hypot(setback, 1.8).toFixed(2));
      return;
    }
    if (watching.current) { rig.reset = true; watching.current = false; }
    gl.domElement.dataset.screening = "false";
    if (game.phase === "title") {
      camera.position.set(290, 120, 340);
      camera.lookAt(35, 4, 50);
      camera.updateMatrixWorld();
      gl.domElement.dataset.drawCalls = String(gl.info.render.calls);
      rig.reset = true;
      return;
    }
    if (game.dialogue) {
      const speaker = game.npcs.find(n => n.id === game.dialogue?.speakerId);
      const area = conversationArea(size.width, size.height, rig.dialoguePanel);
      const key = `${game.dialogue.speakerId}:${game.player.x}:${game.player.y}:${game.player.z}:${speaker?.x}:${speaker?.y}:${speaker?.z}:${size.width}:${size.height}:${area.x}:${area.y}:${area.width}:${area.height}`;
      if (conversation.current?.key !== key) conversation.current = { key, view: conversationView(game.player, speaker, rig.yaw, area, size.height) };
      const { position, target } = conversation.current.view;
      // Shift the optical center into the free viewport; this does not change
      // the player's free-look yaw, pitch, or zoom.
      const lens = camera as T.PerspectiveCamera;
      lens.setViewOffset(size.width, size.height, size.width / 2 - area.x - area.width / 2, size.height / 2 - area.y - area.height / 2, size.width, size.height);
      camera.position.set(position.x, position.y, position.z);
      camera.lookAt(target.x, target.y, target.z);
      camera.updateMatrixWorld();
      audioView();
      gl.domElement.dataset.drawCalls = String(gl.info.render.calls);
      gl.domElement.dataset.cameraDistance = String(camera.position.distanceTo(new T.Vector3(target.x, target.y, target.z)).toFixed(2));
      return;
    }
    if (game.phase === "playing" && !game.dialogue && game.vehicle && performance.now() - rig.dragged > 2500) {
      const diff = Math.atan2(
        Math.sin(game.player.angle - rig.yaw),
        Math.cos(game.player.angle - rig.yaw),
      );
      rig.yaw += diff * Math.min(1, delta * 2);
    }
    const d = game.vehicle ? rig.zoom * 1.45 : rig.zoom;
    const target = new T.Vector3(
      game.player.x,
      game.player.y + (game.vehicle ? 1.1 : 1.4),
      game.player.z,
    );
    const view = resolveCamera(target, rig.yaw, rig.pitch, d);
    const boom = followCameraBoom(target, view, boomDistance.current, delta, !initialized.current || rig.reset);
    boomDistance.current = boom.distance;
    initialized.current = true;
    rig.reset = false;
    camera.position.set(boom.x, boom.y, boom.z);
    // Keep orientation defined even when a very tight obstruction retracts the
    // boom all the way to its target; lookAt(target) is ambiguous at zero length.
    camera.lookAt(camera.position.x + Math.sin(rig.yaw), camera.position.y - (Math.sin(rig.pitch) + 1 / d), camera.position.z + Math.cos(rig.yaw));
    camera.updateMatrixWorld();
    audioView();
    gl.domElement.dataset.drawCalls = String(gl.info.render.calls);
    gl.domElement.dataset.cameraDistance = String(camera.position.distanceTo(target).toFixed(2));
  });
  return null;
}
export default function Scene({
  game,
  rig,
  tick,
  ready,
}: {
  game: Game;
  rig: CameraRig;
  tick: (dt: number) => void;
  ready: () => void;
}) {
  return (
    <Canvas
      shadows
      dpr={[1, 1.5]}
      camera={{ fov: 58, near: 0.15, far: 18000 }}
      gl={{ antialias: true, powerPreference: "high-performance" }}
      onCreated={({ gl }) => {
        gl.toneMapping = T.ACESFilmicToneMapping;
        gl.toneMappingExposure = 1.15;
        gl.shadowMap.type = T.PCFSoftShadowMap;
      }}
    >
      <color
        attach="background"
        args={[game.evening.started ? "#929fb1" : game.stage === 6 ? "#b9beb4" : "#b3d0c6"]}
      />
      <fog
        attach="fog"
        args={[game.evening.started ? "#a3aeb3" : game.stage === 6 ? "#bdc0ac" : "#bbcec0", 900, 11000]}
      />
      <hemisphereLight args={["#e6eddf", "#78948b", 1.8]} />
      <directionalLight
        position={[-90, 120, 65]}
        color={game.stage === 6 ? "#ffc58d" : "#ffe0ad"}
        intensity={game.evening.started ? 0.9 : game.stage === 6 ? 1.7 : 2.3}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-130}
        shadow-camera-right={130}
        shadow-camera-top={130}
        shadow-camera-bottom={-130}
        shadow-camera-far={500}
        shadow-bias={-0.0003}
      />
      <City />
      <Person
        game={game}
        actor={game.player}
        character={game.character}
        player
      />
      {game.npcs.map((n) => (
        <Person key={n.id} game={game} actor={n} character={n.character} citizen={n} />
      ))}
      {game.vehicles.map((v) => (
        <VehicleView key={v.id} v={v} game={game} />
      ))}
      {game.traffic.map((v) => <VehicleView key={v.id} v={v} game={game} />)}
      <QuestMarker game={game} />
      <DeliveryMarker game={game} />
      <SoundMarkers game={game} />
      <EveningStage game={game} />
      <Frame game={game} rig={rig} tick={tick} ready={ready} />
    </Canvas>
  );
}
