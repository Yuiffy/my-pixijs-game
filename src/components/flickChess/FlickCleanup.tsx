"use client";

import { useFrame } from "@react-three/fiber";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import * as THREE from "three";
import type { FlickSnapshot } from "./engine";

type FlickPiece = FlickSnapshot["pieces"][number];
type FallenPhase = "flying" | "landed" | "carried" | "basket";
export type CleanupPhase = "idle" | "flying" | "seeking" | "collecting" | "carrying" | "dropping" | "returning";
export type CleanupStatus = { phase: CleanupPhase; pieceId: string | null; collected: number; pending: number };

type Fallen = {
  piece: FlickPiece;
  landing: THREE.Vector3;
  phase: FallenPhase;
  elapsed: number;
  slot: number;
  route: THREE.Vector3[];
};
type Collector = {
  phase: Exclude<CleanupPhase, "idle" | "flying"> | "idle";
  position: THREE.Vector3;
  route: THREE.Vector3[];
  targetId: string | null;
  elapsed: number;
};

const FLOOR = -0.6;
const BASKET = new THREE.Vector3(5.55, FLOOR, 9.8);
const DROP_OFF = new THREE.Vector3(4.2, FLOOR, 10.1);
const DOCK = new THREE.Vector3(3.7, FLOOR, 10.25);
const FRONT_LANE = 9.65;
const SIDE_LANE = 6.76;
const FLIGHT_SECONDS = 0.8;
const COLLECT_SECONDS = 0.36;
const DROP_SECONDS = 0.48;
const ROBOT_SPEED = 9.5;

function usePortrait(path: string) {
  const [texture, setTexture] = useState<THREE.Texture | null>(null);
  useEffect(() => {
    let active = true;
    const loaded = new THREE.TextureLoader().load(path, (value) => {
      value.colorSpace = THREE.SRGBColorSpace;
      if (active) setTexture(value);
    });
    return () => {
      active = false;
      loaded.dispose();
    };
  }, [path]);
  return texture;
}

function FallenPiece({ piece, register }: { piece: FlickPiece; register: (group: THREE.Group | null) => void }) {
  const texture = usePortrait(piece.portrait);
  const color = piece.side === "red" ? "#665554" : "#4d625f";
  return (
    <group ref={register} position={[piece.x, piece.y, piece.z]} rotation={[0, piece.angle, 0]}>
      <mesh receiveShadow>
        <cylinderGeometry args={[piece.radius, piece.radius * 0.94, piece.height, 32]} />
        <meshStandardMaterial color={color} metalness={0.02} roughness={0.91} />
      </mesh>
      <mesh position={[0, piece.height / 2 + 0.002, 0]}>
        <cylinderGeometry args={[piece.radius * 0.91, piece.radius * 0.91, 0.013, 32]} />
        <meshStandardMaterial color="#666d67" roughness={0.91} />
      </mesh>
      <mesh position={[0, piece.height / 2 + 0.02, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[piece.radius * 0.88, 0.037, 8, 32]} />
        <meshStandardMaterial color={color} metalness={0.02} roughness={0.91} />
      </mesh>
      {texture && (
        <mesh position={[0, piece.height / 2 + 0.018, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[piece.radius * 1.73, piece.radius * 1.73]} />
          <meshBasicMaterial map={texture} color="#848d87" transparent opacity={0.78} alphaTest={0.04} depthWrite={false} side={THREE.DoubleSide} toneMapped />
        </mesh>
      )}
    </group>
  );
}

function CollectorRobot({ register, brushRef }: { register: (group: THREE.Group | null) => void; brushRef: React.RefObject<THREE.Group> }) {
  const portrait = usePortrait("/images/autochess/portraits/minimal/sui_blue.png");
  return (
    <group ref={register} position={DOCK.toArray()}>
      <mesh position={[0, 0.2, 0]} receiveShadow>
        <cylinderGeometry args={[0.54, 0.56, 0.27, 40]} />
        <meshStandardMaterial color="#4b5552" metalness={0.02} roughness={0.92} />
      </mesh>
      <mesh position={[0, 0.32, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.45, 0.055, 10, 40]} />
        <meshStandardMaterial color="#345753" metalness={0.03} roughness={0.9} />
      </mesh>
      <mesh position={[0, 0.34, 0.07]}>
        <cylinderGeometry args={[0.42, 0.42, 0.035, 36]} />
        <meshStandardMaterial color="#293231" metalness={0.02} roughness={0.92} />
      </mesh>
      <mesh position={[0, 0.23, -0.51]}>
        <boxGeometry args={[0.54, 0.14, 0.19]} />
        <meshStandardMaterial color="#57584d" metalness={0.02} roughness={0.92} />
      </mesh>
      <group ref={brushRef} position={[0, 0.075, -0.45]}>
        {[-0.43, 0.43].map((x) => (
          <group key={x} position={[x, 0, 0]}>
            <mesh rotation={[-Math.PI / 2, 0, 0]}>
              <circleGeometry args={[0.19, 16]} />
              <meshStandardMaterial color="#55584e" side={THREE.DoubleSide} roughness={0.92} />
            </mesh>
            {[0, Math.PI / 2].map((angle) => (
              <mesh key={angle} rotation={[0, angle, 0]} position={[0, -0.005, 0]}>
                <boxGeometry args={[0.48, 0.025, 0.045]} />
                <meshStandardMaterial color="#61655a" roughness={0.92} />
              </mesh>
            ))}
          </group>
        ))}
      </group>
      <mesh position={[0, 0.56, 0]}>
        <cylinderGeometry args={[0.1, 0.12, 0.42, 16]} />
        <meshStandardMaterial color="#4b5552" metalness={0.02} roughness={0.92} />
      </mesh>
      {portrait && (
        <sprite position={[0, 0.94, 0]} scale={[1.12, 1.12, 1]}>
          <spriteMaterial map={portrait} color="#848d87" transparent opacity={0.78} alphaTest={0.04} depthWrite={false} toneMapped />
        </sprite>
      )}
      <mesh position={[0, 1.53, 0]}>
        <sphereGeometry args={[0.085, 12, 8]} />
        <meshStandardMaterial color="#60604f" roughness={0.92} />
      </mesh>
    </group>
  );
}

function PieceBasket() {
  return (
    <group position={BASKET.toArray()}>
      <mesh position={[0, 0.34, 0]} receiveShadow>
        <cylinderGeometry args={[0.88, 0.68, 0.66, 32, 1, true]} />
        <meshStandardMaterial color="#4e5149" side={THREE.DoubleSide} metalness={0.02} roughness={0.93} />
      </mesh>
      <mesh position={[0, 0.035, 0]} receiveShadow>
        <cylinderGeometry args={[0.68, 0.68, 0.06, 32]} />
        <meshStandardMaterial color="#343d3b" roughness={0.94} />
      </mesh>
      <mesh position={[0, 0.67, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.88, 0.085, 10, 40]} />
        <meshStandardMaterial color="#5c6054" metalness={0.02} roughness={0.92} />
      </mesh>
      {[0.12, 0.36, 0.58].map((height) => (
        <mesh key={height} position={[0, height, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[0.72 + height * 0.23, 0.026, 6, 36]} />
          <meshStandardMaterial color="#575e54" roughness={0.92} />
        </mesh>
      ))}
      {Array.from({ length: 12 }, (_, index) => {
        const angle = (index / 12) * Math.PI * 2;
        return (
          <mesh key={index} position={[Math.cos(angle) * 0.76, 0.34, Math.sin(angle) * 0.76]} rotation={[0, -angle, 0]}>
            <boxGeometry args={[0.055, 0.58, 0.04]} />
            <meshStandardMaterial color="#555b50" roughness={0.93} />
          </mesh>
        );
      })}
    </group>
  );
}

function landingFor(piece: FlickPiece, board: FlickSnapshot["board"]) {
  const exit = piece.exit!;
  const xEdge = Math.abs(exit.x) - board.width / 2;
  const zEdge = Math.abs(exit.z) - board.length / 2;
  if (xEdge >= zEdge) {
    return new THREE.Vector3(Math.sign(exit.x || exit.vx || 1) * SIDE_LANE, FLOOR + piece.height / 2, THREE.MathUtils.clamp(exit.z + exit.vz * 0.12, -9.3, 9.2));
  }
  const z = Math.sign(exit.z || exit.vz || 1) * (board.length / 2 + 1.48);
  let x = THREE.MathUtils.clamp(exit.x + exit.vx * 0.12, -5.2, 5.2);
  if (z > 0 && x > 3.6) x = 3.5;
  return new THREE.Vector3(x, FLOOR + piece.height / 2, z);
}

function routeTo(landing: THREE.Vector3): THREE.Vector3[] {
  if (landing.z > 9.2 && Math.abs(landing.x) < 5.6) {
    return [new THREE.Vector3(landing.x, FLOOR, FRONT_LANE), landing.clone().setY(FLOOR)];
  }
  const side = landing.x < -5.6 ? -SIDE_LANE : SIDE_LANE;
  const route = [new THREE.Vector3(side, FLOOR, FRONT_LANE)];
  if (landing.z < -9.2) route.push(new THREE.Vector3(side, FLOOR, landing.z));
  else route.push(new THREE.Vector3(side, FLOOR, landing.z));
  route.push(landing.clone().setY(FLOOR));
  return route;
}

function moveAlong(collector: Collector, distance: number) {
  let remaining = distance;
  while (collector.route.length && remaining > 0) {
    const next = collector.route[0];
    const gap = collector.position.distanceTo(next);
    if (gap <= remaining) {
      collector.position.copy(next);
      collector.route.shift();
      remaining -= gap;
    } else {
      collector.position.lerp(next, remaining / gap);
      remaining = 0;
    }
  }
  return collector.route.length === 0;
}

export default function FlickCleanup({ snapshot, onStatus }: {
  snapshot: FlickSnapshot;
  onStatus: (status: CleanupStatus) => void;
}) {
  const [renderItems, setRenderItems] = useState<Fallen[]>([]);
  const fallen = useRef<Fallen[]>([]);
  const known = useRef(new Set<string>());
  const groups = useRef(new Map<string, THREE.Group>());
  const robotGroup = useRef<THREE.Group | null>(null);
  const brushGroup = useRef<THREE.Group | null>(null);
  const collector = useRef<Collector>({ phase: "idle", position: DOCK.clone(), route: [], targetId: null, elapsed: 0 });
  const lastStatus = useRef("");

  useLayoutEffect(() => {
    if (snapshot.shotCount === 0 && fallen.current.length) {
      fallen.current = [];
      known.current.clear();
      groups.current.clear();
      collector.current = { phase: "idle", position: DOCK.clone(), route: [], targetId: null, elapsed: 0 };
      robotGroup.current?.position.copy(DOCK);
      setRenderItems([]);
      lastStatus.current = "";
      onStatus({ phase: "idle", pieceId: null, collected: 0, pending: 0 });
    }
    const added = snapshot.pieces.filter((piece) => !piece.inPlay && piece.exit && !known.current.has(piece.id));
    if (!added.length) return;
    added.forEach((piece) => {
      known.current.add(piece.id);
      fallen.current.push({ piece, landing: landingFor(piece, snapshot.board), phase: "flying", elapsed: 0, slot: -1, route: [] });
    });
    setRenderItems([...fallen.current]);
  }, [snapshot, onStatus]);

  useFrame((_, rawDelta) => {
    const delta = Math.min(rawDelta, 0.05);
    const items = fallen.current;
    const robot = collector.current;

    items.forEach((item) => {
      if (item.phase !== "flying") return;
      const group = groups.current.get(item.piece.id);
      if (!group || !item.piece.exit) return;
      item.elapsed += delta;
      const t = Math.min(1, item.elapsed / FLIGHT_SECONDS);
      const { exit } = item.piece;
      const ease = 1 - (1 - t) ** 2;
      group.position.set(
        THREE.MathUtils.lerp(exit.x, item.landing.x, ease),
        THREE.MathUtils.lerp(exit.y, item.landing.y, t) + Math.sin(Math.PI * t) * (0.6 + Math.min(0.55, Math.hypot(exit.vx, exit.vz) * 0.045)),
        THREE.MathUtils.lerp(exit.z, item.landing.z, ease),
      );
      group.rotation.set(Math.sin(Math.PI * t) * 0.8, exit.angle + t * (1.8 + Math.hypot(exit.vx, exit.vz) * 0.2), Math.sin(Math.PI * t) * 0.48);
      if (t >= 1) {
        item.phase = "landed";
        group.position.copy(item.landing);
        group.rotation.set(0, exit.angle + 1.8, 0);
      }
    });

    const current = items.find((item) => item.piece.id === robot.targetId);
    if (robot.phase === "idle") {
      const next = items.find((item) => item.phase === "landed");
      if (next) {
        robot.phase = "seeking";
        robot.targetId = next.piece.id;
        next.route = routeTo(next.landing);
        robot.route = next.route.map((point) => point.clone());
      }
    } else if (robot.phase === "seeking" && current) {
      if (moveAlong(robot, ROBOT_SPEED * delta)) {
        robot.phase = "collecting";
        robot.elapsed = 0;
      }
    } else if (robot.phase === "collecting" && current) {
      robot.elapsed += delta;
      const t = Math.min(1, robot.elapsed / COLLECT_SECONDS);
      const group = groups.current.get(current.piece.id);
      if (group) {
        group.position.set(
          THREE.MathUtils.lerp(current.landing.x, robot.position.x, t),
          THREE.MathUtils.lerp(current.landing.y, FLOOR + 1.4, t) + Math.sin(Math.PI * t) * 0.22,
          THREE.MathUtils.lerp(current.landing.z, robot.position.z, t),
        );
        group.scale.setScalar(1 - t * 0.28);
      }
      if (t >= 1) {
        current.phase = "carried";
        robot.phase = "carrying";
        robot.route = [...current.route.slice(0, -1).reverse().map((point) => point.clone()), DROP_OFF.clone()];
      }
    } else if (robot.phase === "carrying" && current) {
      const arrived = moveAlong(robot, ROBOT_SPEED * delta);
      const group = groups.current.get(current.piece.id);
      if (group) group.position.set(robot.position.x, FLOOR + 1.4, robot.position.z);
      if (arrived) {
        robot.phase = "dropping";
        robot.elapsed = 0;
      }
    } else if (robot.phase === "dropping" && current) {
      robot.elapsed += delta;
      const t = Math.min(1, robot.elapsed / DROP_SECONDS);
      const group = groups.current.get(current.piece.id);
      if (group) {
        group.position.set(
          THREE.MathUtils.lerp(DROP_OFF.x, BASKET.x, t),
          FLOOR + 1.4 + Math.sin(Math.PI * t) * 0.55 - t * 1.1,
          THREE.MathUtils.lerp(DROP_OFF.z, BASKET.z, t),
        );
        group.scale.setScalar(0.72 - t * 0.2);
        group.rotation.y += delta * 6;
      }
      if (t >= 1) {
        current.phase = "basket";
        current.slot = items.filter((item) => item.phase === "basket").length - 1;
        if (group) {
          const layer = Math.floor(current.slot / 8);
          const place = current.slot % 8;
          const angle = ((place - 1) / 7) * Math.PI * 2 + layer * 0.35;
          const radius = place === 0 ? 0 : 0.42;
          group.position.set(BASKET.x + Math.cos(angle) * radius, FLOOR + 0.22 + layer * 0.1, BASKET.z + Math.sin(angle) * radius);
          group.rotation.set(0, angle, 0);
          group.scale.setScalar(0.43);
        }
        robot.phase = "returning";
        robot.targetId = null;
        robot.route = [DOCK.clone()];
      }
    } else if (robot.phase === "returning") {
      if (moveAlong(robot, ROBOT_SPEED * delta)) robot.phase = "idle";
    }

    if (robotGroup.current) {
      robotGroup.current.position.copy(robot.position);
      if (robot.route.length) {
        const next = robot.route[0];
        const angle = Math.atan2(next.x - robot.position.x, next.z - robot.position.z);
        robotGroup.current.rotation.y = THREE.MathUtils.lerp(robotGroup.current.rotation.y, angle, Math.min(1, delta * 8));
      }
      robotGroup.current.position.y = FLOOR + (robot.phase === "idle" ? 0 : Math.sin(performance.now() * 0.024) * 0.018);
    }
    if (brushGroup.current && robot.phase !== "idle") brushGroup.current.rotation.y += delta * 14;

    const pending = items.filter((item) => item.phase !== "basket").length;
    const collected = items.length - pending;
    const phase: CleanupPhase = robot.phase === "idle"
      ? items.some((item) => item.phase === "flying") ? "flying" : "idle"
      : robot.phase;
    const status: CleanupStatus = { phase, pieceId: robot.targetId ?? items.find((item) => item.phase === "flying")?.piece.id ?? null, collected, pending };
    const key = `${status.phase}:${status.pieceId}:${collected}:${pending}`;
    if (key !== lastStatus.current) {
      lastStatus.current = key;
      onStatus(status);
    }
  });

  return (
    <group>
      <PieceBasket />
      <CollectorRobot register={(group) => { robotGroup.current = group; }} brushRef={brushGroup} />
      {renderItems.map(({ piece }) => (
        <FallenPiece
          key={piece.id}
          piece={piece}
          register={(group) => {
            if (group) groups.current.set(piece.id, group);
            else groups.current.delete(piece.id);
          }} />
      ))}
    </group>
  );
}
