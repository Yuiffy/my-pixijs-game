"use client";

import { useFrame } from "@react-three/fiber";
import { useLayoutEffect, useMemo, useRef } from "react";
import type { MutableRefObject } from "react";
import * as THREE from "three";
import type { Game } from "./engine";
import { distance, edgeId, random, roadWidth, segmentDistance } from "./world";
import type { World } from "./world";

function Block({
  p,
  s,
  c,
  r = 0,
}: {
  p: [number, number, number];
  s: [number, number, number];
  c: string;
  r?: number;
}) {
  return (
    <mesh position={p} rotation-y={r} receiveShadow castShadow>
      <boxGeometry args={s} />
      <meshStandardMaterial color={c} roughness={0.95} />
    </mesh>
  );
}
function Rock({
  p,
  s,
  c,
}: {
  p: [number, number, number];
  s: [number, number, number];
  c: string;
}) {
  return (
    <mesh position={p} scale={s} castShadow receiveShadow>
      <icosahedronGeometry args={[1, 1]} />
      <meshStandardMaterial color={c} roughness={1} />
    </mesh>
  );
}
export function DistantRegions() {
  return (
    <group>
      <group position={[87, 0, -14]}>
        <Block p={[0, -1, 0]} s={[49, 2, 53]} c="#a4b5a2" />
        <Block p={[0, 0, -16]} s={[40, 1, 8]} c="#ddd0ad" />
        {[-17, 17].map((x) => (
          <group key={x}>
            <Block p={[x, 3, 0]} s={[8, 6, 36]} c="#d3c4a4" />
            <Block p={[x, 7, 0]} s={[10, 0.5, 40]} c="#f1dfb8" />
            <Block p={[x, 10, -10]} s={[9, 6, 12]} c="#91a2a0" />
            <Block p={[x, 7.9, 0]} s={[0.15, 1.3, 36]} c="#9e7d50" />
          </group>
        ))}
        {[-14, 0, 14].map((z) => (
          <Block key={z} p={[0, 7, z]} s={[38, 0.4, 5]} c="#ead8b3" />
        ))}
        <Rock p={[0, 3, -8]} s={[4, 4, 4]} c="#7c9e7b" />
        <mesh position={[0, 12, -17]} rotation-y={Math.PI / 4}>
          <coneGeometry args={[8, 4, 4]} />
          <meshStandardMaterial color="#458c8d" />
        </mesh>
        <mesh position={[-15, 3, 19]}>
          <cylinderGeometry args={[2, 2, 6, 16]} />
          <meshStandardMaterial color="#a28c68" />
        </mesh>
        <Block p={[-15, 4.8, 19]} s={[5, 0.3, 5]} c="#d6c8a5" />
      </group>
      <group position={[-66, 0, -38]}>
        {[-12, -6, 0, 6, 12].map((x, i) => (
          <Rock
            key={x}
            p={[x, 3 + (i % 3), -4]}
            s={[9, 8 + (i % 3), 10]}
            c={["#858c79", "#758a78", "#9d9e85"][i % 3]}
          />
        ))}
        <Rock p={[0, 5.6, 5]} s={[7, 3, 5]} c="#8f9583" />
        <Block p={[0, 1.8, 7]} s={[5, 3.6, 0.2]} c="#333e3e" />
        <Block p={[0, 0.04, 14]} s={[3, 0.15, 13]} c="#baa986" />
        {[-5, 5].map((x) => (
          <group key={x}>
            <Block p={[x, 2, 7]} s={[0.2, 4, 0.2]} c="#836b49" />
            <mesh position={[x, 3.5, 7]}>
              <sphereGeometry args={[0.4, 10, 8]} />
              <meshStandardMaterial
                color="#f8c478"
                emissive="#f6a946"
                emissiveIntensity={1}
              />
            </mesh>
          </group>
        ))}
      </group>
    </group>
  );
}
function RockWalls({ world }: { world: World }) {
  const mesh = useRef<THREE.InstancedMesh>(null);
  const transforms = useMemo(() => {
    const rng = random(9842);
    const result: THREE.Matrix4[] = [];
    for (let x = -40; x <= 40; x += 2) for (let z = -36; z <= 38; z += 2) {
        const p = { x, z };
        const gap = Math.min(
          ...world.edges.map((e) => segmentDistance(p, world.nodes[e.a], world.nodes[e.b]),),
        );
        if (gap < roadWidth(world) / 2 + 0.85) continue;
        const object = new THREE.Object3D();
        object.position.set(x, 2.2 + rng() * 0.3, z);
        object.rotation.set(rng() * 0.13, rng(), rng() * 0.12);
        object.scale.set(
          1.65 + rng() * 0.3,
          3.1 + rng() * 0.3,
          1.65 + rng() * 0.3,
        );
        object.updateMatrix();
        result.push(object.matrix.clone());
      }
    return result;
  }, [world]);
  useLayoutEffect(() => {
    if (!mesh.current) return;
    transforms.forEach((matrix, i) => mesh.current!.setMatrixAt(i, matrix));
    mesh.current.instanceMatrix.needsUpdate = true;
  }, [transforms]);
  return (
    <instancedMesh
      ref={mesh}
      args={[undefined, undefined, transforms.length]}
      receiveShadow
    >
      <icosahedronGeometry args={[1, 0]} />
      <meshStandardMaterial color="#777e79" roughness={1} />
    </instancedMesh>
  );
}
export function CaveWorld({ world }: { world: World }) {
  return (
    <group>
      <Block p={[0, -0.28, 0]} s={[86, 0.5, 82]} c="#625d51" />
      <Block p={[0, 4.8, 0]} s={[86, 1, 82]} c="#565e5a" />
      <RockWalls world={world} />
      {world.edges.map((e) => {
        const a = world.nodes[e.a];
        const b = world.nodes[e.b];
        return (
          <Block
            key={edgeId(e.a, e.b)}
            p={[(a.x + b.x) / 2, -0.025, (a.z + b.z) / 2]}
            s={[roadWidth(world), 0.1, distance(a, b) + 1.5]}
            r={Math.atan2(b.x - a.x, b.z - a.z)}
            c="#a1967d"
          />
        );
      })}
      {world.places.map((p, i) => {
        const n = world.nodes[p.node];
        return (
          <group key={p.id} position={[n.x, 0, n.z]}>
            <pointLight
              position={[0, 2.7, 0]}
              color={p.color}
              intensity={14}
              distance={12}
              decay={1.5}
            />
            {p.id === "post" ? (
              <group>
                <Block p={[0, 1.4, 2.3]} s={[3, 2.8, 0.5]} c="#a57852" />
                <Block p={[0, 2.8, 2.3]} s={[3.4, 0.35, 0.8]} c="#cba56b" />
                <mesh position={[0, 2.2, 1.98]}>
                  <sphereGeometry args={[0.3, 12, 8]} />
                  <meshStandardMaterial
                    color="#ffc879"
                    emissive="#e8ac59"
                    emissiveIntensity={2}
                  />
                </mesh>
              </group>
            ) : p.id === "pool" ? (
              <mesh rotation-x={-Math.PI / 2} position={[0, 0.08, -0.2]}>
                <circleGeometry args={[1.35, 24]} />
                <meshStandardMaterial
                  color="#366774"
                  metalness={0.3}
                  roughness={0.25}
                />
              </mesh>
            ) : p.id === "roots" ? (
              <group>
                {[-0.8, 0, 0.8].map((x) => (
                  <mesh key={x} position={[x, 3.3, 0]} rotation-z={x * 0.4}>
                    <cylinderGeometry args={[0.13, 0.05, 2.5, 6]} />
                    <meshStandardMaterial color="#6d7150" />
                  </mesh>
                ))}
              </group>
            ) : p.id === "archive" ? (
              <group>
                <Block p={[0, 0.7, 0]} s={[1.6, 1.4, 0.8]} c="#7e6850" />
                {[0, 1, 2].map((j) => (
                  <Block
                    key={j}
                    p={[-0.5 + j * 0.5, 1.55, 0]}
                    s={[0.35, 0.5, 0.7]}
                    c="#c2a777"
                  />
                ))}
              </group>
            ) : p.id === "camp" ? (
              <group>
                <Rock p={[0, 0.3, 0]} s={[1.2, 0.35, 0.8]} c="#b27553" />
                <Block p={[0, 0.2, 1]} s={[1.8, 0.1, 0.8]} c="#8a795c" />
              </group>
            ) : (
              <group>
                {[-0.8, 0, 0.8].map((x, j) => (
                  <mesh
                    key={x}
                    position={[x, 0.65 + j * 0.15, 0]}
                    rotation-z={x * 0.35}
                  >
                    <coneGeometry args={[0.4, 1.6 + j * 0.25, 5]} />
                    <meshStandardMaterial
                      color={p.color}
                      emissive={p.color}
                      emissiveIntensity={0.4}
                    />
                  </mesh>
                ))}
              </group>
            )}
            <mesh position={[1.4, 0.2, 0.4]}>
              <sphereGeometry args={[0.13, 10, 6]} />
              <meshStandardMaterial
                color="#ecc688"
                emissive="#e6b96b"
                emissiveIntensity={1.4}
              />
            </mesh>
            {i % 2 === 0 && (
              <Rock p={[-1.9, 1, -0.8]} s={[0.8, 1.3, 0.8]} c="#84877a" />
            )}
          </group>
        );
      })}
    </group>
  );
}
export function ChalkMarks({
  game,
  world,
}: {
  game: MutableRefObject<Game>;
  world: World;
}) {
  const group = useRef<THREE.Group>(null);
  useFrame(() => {
    if (!group.current) return;
    group.current.children.forEach((child, i) => {
      child.visible =
        game.current.world === world &&
        game.current.chalk.includes(edgeId(world.edges[i].a, world.edges[i].b));
    });
  });
  return (
    <group ref={group}>
      {world.edges.map((e) => {
        const a = world.nodes[e.a];
        const b = world.nodes[e.b];
        return (
          <group key={edgeId(e.a, e.b)} visible={false}>
            {[a, b].map((n, i) => {
              const other = i === 0 ? b : a;
              const len = distance(n, other);
              return (
                <mesh
                  key={i}
                  position={[
                    n.x + ((other.x - n.x) / len) * 2.1,
                    0.12,
                    n.z + ((other.z - n.z) / len) * 2.1,
                  ]}
                  rotation-x={-Math.PI / 2}
                >
                  <torusGeometry args={[0.43, 0.075, 5, 18, Math.PI * 1.5]} />
                  <meshBasicMaterial color="#f5e8b9" />
                </mesh>
              );
            })}
          </group>
        );
      })}
    </group>
  );
}
export function BridgeScene({ game }: { game: MutableRefObject<Game> }) {
  const fish = useRef<THREE.Group>(null);
  const debris = useRef<THREE.Group>(null);
  const splash = useRef<THREE.Group>(null);
  const intact = useRef<THREE.Group>(null);
  const broken = useRef<THREE.Group>(null);
  const bite = useRef<THREE.Group>(null);
  useFrame(() => {
    const event = game.current.bridgeEvent;
    const gone =
      event?.stage === "broken" ||
      (event?.stage === "jump" && event.t >= 1.65) ||
      game.current.blocked.includes("2-6");
    if (intact.current) intact.current.visible = !gone;
    if (broken.current) broken.current.visible = gone;
    if (fish.current) {
      fish.current.visible = event?.stage === "jump";
      const t = event?.t ?? 0;
      const height =
        t < 1
          ? -1.1 + Math.sin((t * Math.PI) / 2) * 5.1
          : t < 1.65
            ? 4 - ((t - 1) / 0.65) * 4.05
            : Math.sin(Math.min(1, (t - 1.65) / 1.75) * Math.PI) * 2.7 - 0.05;
      fish.current.position.set(-8 + t * 4.4, height, 0);
      fish.current.rotation.z = t < 1 ? 0.25 : t < 1.65 ? -0.18 : 0.15;
    }
    if (bite.current) bite.current.visible = event?.stage === "jump" && event.t >= 1.65;
    if (debris.current) {
      debris.current.visible = event?.stage === "jump" && event.t >= 1.65;
      const t = Math.max(0, (event?.t ?? 0) - 1.65);
      debris.current.children.forEach((child, i) => {
        child.position.set(
          (i - 3) * t * 0.8,
          1 + t * 1.3 - t * t * 2,
          ((i % 3) - 1) * t,
        );
        child.rotation.set(t + i, t * 0.8, 0);
      });
    }
    if (splash.current) {
      splash.current.visible = event?.stage === "jump";
      const t = event?.t ?? 0;
      splash.current.children.forEach((child, i) => {
        const a = (i * Math.PI) / 10;
        const r = 1 + (t % 1.5) * 3;
        child.position.set(
          Math.cos(a) * r,
          Math.sin((t % 1.5) * Math.PI) * 1.5 - 0.1,
          Math.sin(a) * r,
        );
      });
    }
  });
  return (
    <group position={[9, 0, -18]}>
      <Block p={[0, -0.1, 0]} s={[14, 0.12, 6.2]} c="#488b96" />
      <group ref={intact}>
        {Array.from({ length: 24 }, (_, i) => (
          <Block
            key={i}
            p={[0, -0.08, -8.7 + i * 0.75]}
            s={[5.6, 0.22, 0.63]}
            c={i % 2 ? "#ae8860" : "#bc966d"}
          />
        ))}
      </group>
      <group ref={broken} visible={false}>
        {[-1, 1].map((side) => (
          <group key={side}>
            <Block
              p={[0, -0.08, side * 5.8]}
              s={[5.6, 0.25, 6.4]}
              c="#ae8860"
            />
            {[0, 1, 2, 3, 4].map((i) => (
              <Block
                key={i}
                p={[-2.2 + i * 1.1, -0.15, side * (3 + (i % 2) * 0.35)]}
                s={[0.7, 0.3, 1.2]}
                c="#b99062"
                r={side * i * 0.08}
              />
            ))}
          </group>
        ))}
      </group>
      {[-1, 1].map((side) => (
        <group key={side}>
          {[-6, 6].map((z) => (
            <group key={z}>
              <Block
                p={[side * 2.7, 0.55, z]}
                s={[0.18, 1.2, 0.18]}
                c="#7a634d"
              />
              <Block
                p={[side * 2.7, 0.95, z]}
                s={[0.15, 0.15, 6]}
                c="#8f704f"
              />
            </group>
          ))}
        </group>
      ))}
      <group ref={fish} visible={false}>
        <group ref={bite} visible={false}>
          <Block p={[3.1, 0, 0]} s={[1.1, 0.22, 3.1]} c="#bd996b" />
          <Block p={[3.25, 0.2, 0.4]} s={[0.5, 0.2, 1.5]} c="#cca778" />
        </group>
        <Rock p={[0, 0, 0]} s={[3, 1.25, 1.25]} c="#e29c4e" />
        <Rock p={[1.9, 0.2, 0]} s={[1.3, 1, 1]} c="#e7bc6c" />
        {[-1, 1].map((side) => (
          <group key={side}>
            <mesh position={[2.15, 0.6, side * 0.83]}>
              <sphereGeometry args={[0.21, 12, 8]} />
              <meshStandardMaterial color="#212e30" />
            </mesh>
            <Rock p={[-2.6, 0, side * 0.5]} s={[1.2, 1, 0.8]} c="#c66d42" />
            <Rock p={[0, -0.15, side * 1.2]} s={[0.9, 0.2, 1.1]} c="#c77644" />
          </group>
        ))}
        <mesh position={[3, 0.1, 0]} rotation-y={Math.PI / 2}>
          <torusGeometry args={[0.53, 0.17, 8, 16]} />
          <meshStandardMaterial color="#a6603e" />
        </mesh>
        <Rock p={[-0.6, 1.2, 0]} s={[1.3, 0.6, 0.16]} c="#c87b47" />
      </group>
      <group ref={debris} visible={false}>
        {Array.from({ length: 7 }, (_, i) => (
          <Block key={i} p={[0, 0, 0]} s={[1.3, 0.15, 0.55]} c="#c09a6b" />
        ))}
      </group>
      <group ref={splash} visible={false}>
        {Array.from({ length: 20 }, (_, i) => (
          <mesh key={i}>
            <sphereGeometry args={[0.13 + (i % 3) * 0.05, 6, 5]} />
            <meshBasicMaterial color="#b3e2dc" />
          </mesh>
        ))}
      </group>
    </group>
  );
}
