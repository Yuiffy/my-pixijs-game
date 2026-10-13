"use client";

import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { memo, useEffect, useMemo, useRef, useState } from "react";
import type { MutableRefObject } from "react";
import * as THREE from "three";
import type { Game } from "./engine";
import { edgeId, FLOOR_HEIGHT, GAP, ROAD } from "./world";
import type { Place, World } from "./world";
import {
  BridgeScene,
  CaveWorld,
  ChalkMarks,
  DistantRegions,
} from "./ExplorationScene";

type Props = {
  game: MutableRefObject<Game>;
  world: World;
  reduced: boolean;
  onReady: () => void;
  onError: (message: string) => void;
};
const cream = "#f2dfb7";
const terracotta = "#ba6851";
const blue = "#3f7d88";
function Box({
  position,
  scale,
  color,
  rotation = 0,
}: {
  position: [number, number, number];
  scale: [number, number, number];
  color: string;
  rotation?: number;
}) {
  return (
    <mesh position={position} rotation-y={rotation} castShadow receiveShadow>
      <boxGeometry args={scale} />
      <meshStandardMaterial color={color} roughness={0.84} />
    </mesh>
  );
}
function Ball({
  position,
  scale,
  color,
}: {
  position: [number, number, number];
  scale: [number, number, number];
  color: string;
}) {
  return (
    <mesh position={position} scale={scale} castShadow>
      <sphereGeometry args={[1, 12, 8]} />
      <meshStandardMaterial color={color} roughness={0.9} />
    </mesh>
  );
}
function Roof({
  width = 6,
  height = 2,
  color = terracotta,
  y = 4,
}: {
  width?: number;
  height?: number;
  color?: string;
  y?: number;
}) {
  return (
    <mesh position={[0, y, 0]} rotation-y={Math.PI / 4} castShadow>
      <coneGeometry args={[width * 0.73, height, 4]} />
      <meshStandardMaterial color={color} roughness={0.85} />
    </mesh>
  );
}
function Tree({
  x,
  z,
  y = 0,
  small = false,
}: {
  x: number;
  z: number;
  y?: number;
  small?: boolean;
}) {
  return (
    <group position={[x, y, z]} scale={small ? 0.66 : 1}>
      <mesh position={[0, 1.15, 0]} castShadow>
        <cylinderGeometry args={[0.16, 0.25, 2.3, 7]} />
        <meshStandardMaterial color="#886b4a" />
      </mesh>
      <Ball position={[0, 3.2, 0]} scale={[1.5, 2.1, 1.5]} color="#71947a" />
      <Ball position={[0.6, 2.8, 0.2]} scale={[1, 1.3, 1]} color="#8baa84" />
    </group>
  );
}
function useSign(title: string, sub: string, background: string) {
  const texture = useMemo(() => {
    const c = document.createElement("canvas");
    c.width = 640;
    c.height = 192;
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.strokeStyle = "#efe2c3";
    ctx.lineWidth = 3;
    ctx.strokeRect(9, 9, 622, 174);
    ctx.textAlign = "center";
    ctx.fillStyle = "#fff6dd";
    ctx.font = 'bold 60px "Microsoft YaHei", sans-serif';
    ctx.fillText(title, 320, 85);
    ctx.font = '28px "Microsoft YaHei", sans-serif';
    ctx.fillText(sub, 320, 142);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }, [title, sub, background]);
  useEffect(() => () => texture.dispose(), [texture]);
  return texture;
}
function Sign({
  title,
  sub,
  color,
  y = 2.1,
}: {
  title: string;
  sub: string;
  color: string;
  y?: number;
}) {
  const texture = useSign(title, sub, color);
  return (
    <sprite position={[0, y, 4.1]} scale={[3.6, 1.08, 1]}>
      <spriteMaterial map={texture} toneMapped={false} />
    </sprite>
  );
}
function Windows({
  width = 5.8,
  height = 3.6,
}: {
  width?: number;
  height?: number;
}) {
  return (
    <group>
      {[-1, 1].map((side) => (
        <group key={side}>
          <Box
            position={[side * (width / 3.2), height * 0.62, width / 2 + 0.015]}
            scale={[1.1, 1.25, 0.07]}
            color="#476f73"
          />
          <Box
            position={[side * (width / 3.2), height * 0.62, width / 2 + 0.06]}
            scale={[0.07, 1.27, 0.06]}
            color={cream}
          />
          <Box
            position={[width / 2 + 0.015, height * 0.62, side * (width / 3.2)]}
            scale={[0.07, 1.25, 1.1]}
            color="#476f73"
          />
          <Box
            position={[width / 2 + 0.06, height * 0.62, side * (width / 3.2)]}
            scale={[0.06, 1.27, 0.07]}
            color={cream}
          />
        </group>
      ))}
    </group>
  );
}
function House({
  color = cream,
  roof = terracotta,
  height = 4.2,
}: {
  color?: string;
  roof?: string;
  height?: number;
}) {
  return (
    <group>
      <Box
        position={[0, height / 2, 0]}
        scale={[5.8, height, 5.8]}
        color={color}
      />
      <Box position={[0, 0.16, 0]} scale={[6.15, 0.3, 6.15]} color="#b8ab94" />
      <Roof y={height + 1} width={6.25} color={roof} />
      <Windows height={height} />
      <Box position={[0, 1.1, 2.93]} scale={[1.1, 2.2, 0.08]} color="#7c624d" />
    </group>
  );
}
function Resident({ color = blue }: { color?: string }) {
  return (
    <group position={[3.2, 0, 2.5]}>
      <Ball position={[0, 0.82, 0]} scale={[0.34, 0.65, 0.26]} color={color} />
      <Ball
        position={[0, 1.58, 0]}
        scale={[0.29, 0.31, 0.28]}
        color="#e5bc90"
      />
      <Ball
        position={[-0.1, 1.61, 0.257]}
        scale={[0.035, 0.047, 0.035]}
        color="#3e4b43"
      />
      <Ball
        position={[0.1, 1.61, 0.257]}
        scale={[0.035, 0.047, 0.035]}
        color="#3e4b43"
      />
      <Ball
        position={[-0.17, 1.5, 0.225]}
        scale={[0.058, 0.025, 0.02]}
        color="#c4826a"
      />
      <Ball
        position={[0.17, 1.5, 0.225]}
        scale={[0.058, 0.025, 0.02]}
        color="#c4826a"
      />
      <Box
        position={[0, 1.25, 0.2]}
        scale={[0.45, 0.15, 0.15]}
        color="#eddbb0"
      />
      <Ball
        position={[-0.34, 0.83, 0.15]}
        scale={[0.12, 0.2, 0.12]}
        color="#e5bc90"
      />
      <Ball
        position={[0.3, 0.89, 0.24]}
        scale={[0.12, 0.17, 0.12]}
        color="#e5bc90"
      />
      <mesh position={[0, 1.82, 0]}>
        <cylinderGeometry args={[0.36, 0.39, 0.12, 14]} />
        <meshStandardMaterial color={cream} />
      </mesh>
      <Box
        position={[-0.15, 0.2, 0]}
        scale={[0.16, 0.4, 0.2]}
        color="#4f5755"
      />
      <Box position={[0.15, 0.2, 0]} scale={[0.16, 0.4, 0.2]} color="#4f5755" />
      <Box
        position={[0.42, 0.95, 0.15]}
        scale={[0.5, 0.35, 0.05]}
        color="#fff2ce"
      />
    </group>
  );
}
const Landmark = memo(({ place, world }: { place: Place; world: World }) => {
  const n = world.nodes[place.node];
  return (
    <group position={[n.x - 5.5, n.floor * FLOOR_HEIGHT, n.z - 5.5]}>
      <Box
        position={[0, -0.1, 0]}
        scale={[8, 0.25, 8]}
        color={world.theme === "arcade" ? "#e2d3b8" : "#bcbfa1"}
      />
      {place.kind === "clock" ? (
        <group>
          <Box position={[0, 5.1, 0]} scale={[3.7, 10.2, 3.7]} color={cream} />
          <Box position={[0, 9.9, 0]} scale={[4.3, 0.5, 4.3]} color={blue} />
          <Roof width={4.6} height={4.3} y={12.1} color={blue} />
          {[0, Math.PI / 2].map((r) => (
            <group key={r} rotation-y={r}>
              <mesh position={[0, 8, 1.88]}>
                <circleGeometry args={[1.25, 32]} />
                <meshStandardMaterial color="#f7edcf" />
              </mesh>
              <Box
                position={[0, 8.35, 1.93]}
                scale={[0.12, 0.85, 0.04]}
                color="#365964"
              />
              <Box
                position={[0.33, 8, 1.93]}
                scale={[0.7, 0.12, 0.04]}
                color="#365964"
              />
            </group>
          ))}
        </group>
      ) : place.kind === "fountain" ? (
        <group>
          <mesh position={[0, 0.42, 0]} receiveShadow>
            <cylinderGeometry args={[3, 3.3, 0.8, 32]} />
            <meshStandardMaterial color="#d8d5c0" />
          </mesh>
          <mesh position={[0, 0.84, 0]} rotation-x={-Math.PI / 2}>
            <circleGeometry args={[2.7, 32]} />
            <meshStandardMaterial
              color="#70b5c0"
              metalness={0.25}
              roughness={0.2}
            />
          </mesh>
          <Ball position={[0, 1.8, 0]} scale={[0.6, 1.4, 0.6]} color={blue} />
          <group rotation-z={-0.55}>
            <Ball
              position={[-0.8, 2.8, 0]}
              scale={[1.3, 0.45, 0.55]}
              color={blue}
            />
          </group>
          <group rotation-z={0.55}>
            <Ball
              position={[0.8, 2.8, 0]}
              scale={[1.3, 0.45, 0.55]}
              color={blue}
            />
          </group>
        </group>
      ) : place.kind === "garden" ? (
        <group>
          <mesh position={[0, 2, 0]}>
            <boxGeometry args={[5.8, 4, 5.8]} />
            <meshStandardMaterial
              color="#94c7b9"
              transparent
              opacity={0.58}
              roughness={0.2}
            />
          </mesh>
          <Roof y={5} width={6} color="#80a68f" />
          {[-2.9, 0, 2.9].map((x) => (
            <Box
              key={x}
              position={[x, 2.1, 2.94]}
              scale={[0.12, 4.2, 0.12]}
              color={cream}
            />
          ))}
          <Tree x={-1.4} z={0} small />
          <Tree x={1.4} z={0} small />
        </group>
      ) : place.kind === "harbor" ? (
        <group>
          <Box position={[0, 0.25, 0]} scale={[7, 0.5, 5]} color="#73979a" />
          <Box position={[0, 0.8, 0]} scale={[4.8, 0.8, 2.5]} color="#bc7558" />
          <Box
            position={[0, 3.5, 0]}
            scale={[0.16, 6.1, 0.16]}
            color="#806b51"
          />
          <mesh position={[1, 4.2, 0]} rotation-y={Math.PI / 2}>
            <coneGeometry args={[1.9, 3.8, 3]} />
            <meshStandardMaterial color="#fff2d5" />
          </mesh>
        </group>
      ) : (
        <group>
          <House
            color={place.kind === "tea" ? "#dcae9d" : cream}
            roof={place.color}
          />
          {place.kind === "bakery" && (
            <group>
              {[-2, -1, 0, 1, 2].map((x, i) => (
                <Box
                  key={x}
                  position={[x, 2.85, 3.3]}
                  scale={[1, 0.22, 1.6]}
                  color={i % 2 === 0 ? "#f2d990" : "#b98a43"}
                  rotation={0}
                />
              ))}
              <mesh position={[0, 6.5, 0]} rotation-x={Math.PI / 2}>
                <torusGeometry args={[1.3, 0.48, 10, 18, Math.PI * 1.5]} />
                <meshStandardMaterial color="#e4aa52" />
              </mesh>
            </group>
          )}
          {place.kind === "tea" && (
            <mesh position={[0, 7.2, 0]}>
              <torusGeometry args={[1.2, 0.18, 8, 24, Math.PI * 1.55]} />
              <meshStandardMaterial color="#eedda1" />
            </mesh>
          )}
          {place.kind === "post" && (
            <group>
              <Box
                position={[0, 6.8, 0]}
                scale={[0.1, 2.5, 0.1]}
                color={cream}
              />
              <Box
                position={[0.6, 7.5, 0]}
                scale={[1.3, 0.65, 0.07]}
                color="#bd563d"
              />
              <Box
                position={[2.1, 0.8, 3.5]}
                scale={[0.7, 1.6, 0.7]}
                color="#bd563d"
              />
              <Box
                position={[2.1, 1.2, 3.86]}
                scale={[0.45, 0.12, 0.025]}
                color="#4a493e"
              />
            </group>
          )}
          {place.kind === "books" &&
            [-1, 0, 1].map((x, i) => (
              <Box
                key={x}
                position={[x, 6.2 + i * 0.18, 0]}
                scale={[0.7, 2.1, 1.6]}
                color={["#798e76", "#bd7352", "#4c7c86"][i]}
                rotation={x * 0.14}
              />
            ))}
        </group>
      )}
      <Sign
        title={place.name}
        sub={
          world.theme === "arcade"
            ? `风庭商场 · ${n.floor + 1}F`
            : "WINDPOST · 风邮小镇"
        }
        color={place.color}
      />
      <Resident color={place.color} />
    </group>
  );
});
function StairTower({ x, z, label }: { x: number; z: number; label: string }) {
  return (
    <group position={[x, 0, z]}>
      <mesh position={[0, 3.3, 0]}>
        <cylinderGeometry args={[0.12, 0.12, 6.6, 10]} />
        <meshStandardMaterial color="#8b9486" />
      </mesh>
      {Array.from({ length: 20 }, (_, i) => (
        <group
          key={i}
          rotation-y={i * (Math.PI / 10)}
          position={[0, i * (FLOOR_HEIGHT / 20), 0]}
        >
          <Box
            position={[1.1, 0.1, 0]}
            scale={[2.2, 0.15, 0.8]}
            color={i % 2 ? "#bcbaa3" : "#dcd5ba"}
          />
        </group>
      ))}
      <Sign title={label} sub="1F ↕ 2F · 两层互通" color={blue} y={2.5} />
    </group>
  );
}
function Street({ world }: { world: World }) {
  const road = world.theme === "arcade" ? "#e9d9b9" : "#e0d0ae";
  return (
    <group>
      {world.edges
        .filter((e) => !e.stair && !e.bridge)
        .map((e) => {
          const a = world.nodes[e.a];
          const b = world.nodes[e.b];
          const horizontal = a.z === b.z;
          return (
            <group key={edgeId(e.a, e.b)}>
              <Box
                position={[
                  (a.x + b.x) / 2,
                  a.floor * FLOOR_HEIGHT - 0.18,
                  (a.z + b.z) / 2,
                ]}
                scale={[
                  horizontal ? GAP + ROAD : ROAD,
                  0.35,
                  horizontal ? ROAD : GAP + ROAD,
                ]}
                color={road}
              />
              {[-1, 1].map((side) => (
                <Box
                  key={side}
                  position={[
                    (a.x + b.x) / 2 +
                      (horizontal ? 0 : side * (ROAD / 2 - 0.1)),
                    a.floor * FLOOR_HEIGHT + 0.03,
                    (a.z + b.z) / 2 +
                      (horizontal ? side * (ROAD / 2 - 0.1) : 0),
                  ]}
                  scale={[
                    horizontal ? GAP : 0.13,
                    0.09,
                    horizontal ? 0.13 : GAP,
                  ]}
                  color="#f3e7c9"
                />
              ))}
              {a.floor > 0 &&
                [-1, 1].map((side) => (
                  <group key={side}>
                    <Box
                      position={[
                        (a.x + b.x) / 2 + (horizontal ? 0 : side * 2.9),
                        FLOOR_HEIGHT + 0.9,
                        (a.z + b.z) / 2 + (horizontal ? side * 2.9 : 0),
                      ]}
                      scale={[
                        horizontal ? GAP - ROAD : 0.08,
                        0.1,
                        horizontal ? 0.08 : GAP - ROAD,
                      ]}
                      color="#a18d68"
                    />
                    {[-4, 0, 4].map((t) => (
                      <Box
                        key={t}
                        position={[
                          (a.x + b.x) / 2 + (horizontal ? t : side * 2.9),
                          FLOOR_HEIGHT + 0.45,
                          (a.z + b.z) / 2 + (horizontal ? side * 2.9 : t),
                        ]}
                        scale={[0.1, 0.9, 0.1]}
                        color="#a18d68"
                      />
                    ))}
                  </group>
                ))}
            </group>
          );
        })}
      {world.nodes.map((n) => (
        <group key={n.id} position={[n.x, n.floor * FLOOR_HEIGHT, n.z]}>
          <mesh rotation-x={-Math.PI / 2} position-y={0.02}>
            <circleGeometry args={[ROAD / 2, 20]} />
            <meshStandardMaterial color={road} />
          </mesh>
          <mesh rotation-x={-Math.PI / 2} position-y={0.035}>
            <ringGeometry args={[0.9, 1, 24]} />
            <meshStandardMaterial color="#b9ad8f" />
          </mesh>
          {n.floor === 1 && (
            <Box
              position={[3.5, -3.5, 3.5]}
              scale={[0.55, 7, 0.55]}
              color="#b6b7a2"
            />
          )}
        </group>
      ))}
    </group>
  );
}
const Scenery = memo(({ world }: { world: World }) => {
  const half = (world.size - 1) * (GAP / 2);
  return (
    <group>
      <Box
        position={[0, -0.7, 0]}
        scale={[half * 2 + 28, 0.9, half * 2 + 28]}
        color={world.theme === "arcade" ? "#c6c5ac" : "#acc3a0"}
      />
      <Box
        position={[0, -1.7, 0]}
        scale={[half * 2 + 30, 1.2, half * 2 + 30]}
        color="#b9a88b"
      />
      <Street world={world} />
      {world.theme === "harbor" &&
        world.nodes
          .filter(
            (n) => n.id % world.size < world.size - 1 &&
              n.id < world.size * (world.size - 1) &&
              !world.places.some((p) => p.node === n.id + world.size + 1),
          )
          .map((n) => (
            <group key={n.id} position={[n.x + GAP / 2, 0, n.z + GAP / 2]}>
              <House
                height={3.8 + (n.id % 3) * 0.6}
                color={["#ead6b1", "#d5c5a1", "#d7b29b"][n.id % 3]}
                roof={["#bd7358", "#718f86", "#b49a69"][n.id % 3]}
              />
              <Tree x={4.1} z={-3.9} small />
            </group>
          ))}
      {world.theme === "harbor" && (
        <group>
          <DistantRegions />
          <group position={[70, 5, 4]}>
            <Sign
              title="风庭商场"
              sub="独立岛屿 · 两层空中回廊"
              color="#527e81"
              y={4}
            />
          </group>
          <group position={[-56, 2, -17]}>
            <Sign
              title="回声洞窟"
              sub="弯道 · 环路 · 被岩壁藏起的路"
              color="#666f63"
              y={4}
            />
          </group>
        </group>
      )}
      {world.places.map((p) => (
        <Landmark key={p.id} place={p} world={world} />
      ))}
      {world.edges
        .filter((e) => e.stair)
        .map((e, i) => (
          <StairTower
            key={e.a}
            x={world.nodes[e.a].x}
            z={world.nodes[e.a].z}
            label={i === 0 ? "西北楼梯" : "东南楼梯"}
          />
        ))}
      {world.theme === "arcade" && (
        <group>
          <Box
            position={[0, 9.5, -27]}
            scale={[57, 0.35, 0.45]}
            color="#628e8e"
          />
          {[-27, 27].map((x) => (
            <group key={x}>
              <Box
                position={[x, 9.5, 0]}
                scale={[0.4, 0.35, 54]}
                color="#628e8e"
              />
              {[-27, 0, 27].map((z) => (
                <Box
                  key={z}
                  position={[x, 4.7, z]}
                  scale={[0.5, 9.4, 0.5]}
                  color="#b4b49b"
                />
              ))}
            </group>
          ))}
          <Tree x={9} z={9} />
          <Tree x={-9} z={9} />
        </group>
      )}
      {Array.from({ length: 11 }, (_, i) => (
        <group key={i}>
          <Tree
            x={-half - 10}
            z={-half + i * (half * (2 / 10))}
            small={i % 2 === 0}
          />
          <Tree
            x={-half + i * (half * (2 / 10))}
            z={half + 10}
            small={i % 2 === 1}
          />
        </group>
      ))}
      {[-1, 1].map((side) => (
        <Box
          key={side}
          position={[side * (half + 13), 0.1, 0]}
          scale={[0.4, 0.6, half * 2 + 27]}
          color="#d2c4a6"
        />
      ))}
    </group>
  );
});
function Animated({
  game,
  reduced,
}: {
  game: MutableRefObject<Game>;
  reduced: boolean;
}) {
  const water = useRef<THREE.Mesh>(null);
  const lamp = useRef<THREE.PointLight>(null);
  const { camera, gl } = useThree();
  const [blocked, setBlocked] = useState<string[]>([]);
  const previous = useRef("");
  useFrame(({ clock }) => {
    const g = game.current;
    const p = g.player;
    if (g.mode === "title") {
      const t = reduced ? 0 : Math.sin(clock.elapsedTime * 0.06) * 3;
      camera.position.set(80 + t, 62, 110);
      camera.lookAt(12, 1, -10);
    } else {
      let height = p.floor * FLOOR_HEIGHT;
      if (g.transition) {
        const a = g.world.nodes[g.transition.from];
        const b = g.world.nodes[g.transition.to];
        height =
          (a.floor + (b.floor - a.floor) * g.transition.t) * FLOOR_HEIGHT;
      }
      camera.position.set(p.x, height + 1.75, p.z);
      camera.rotation.order = "YXZ";
      camera.rotation.set(p.pitch, -p.yaw, 0);
    }
    if (lamp.current) lamp.current.position.copy(camera.position);
    if (water.current && !reduced) water.current.position.y =
        -1.32 + Math.sin(clock.elapsedTime * 0.4) * 0.055;
    const key = g.blocked.join(",");
    if (previous.current !== key) {
      previous.current = key;
      setBlocked([...g.blocked]);
    }
    gl.info.autoReset = true;
  });
  return (
    <group>
      {game.current.world.theme === "cave" && (
        <pointLight
          ref={lamp}
          color="#ffd9a2"
          intensity={24}
          distance={15}
          decay={1.5}
        />
      )}
      <mesh ref={water} rotation-x={-Math.PI / 2} position={[0, -1.3, 0]}>
        <planeGeometry args={[900, 900]} />
        <meshStandardMaterial
          color="#619b9e"
          metalness={0.15}
          roughness={0.55}
        />
      </mesh>
      {blocked
        .filter((id) => game.current.blocked.includes(id))
        .map((id) => {
          const e = game.current.world.edges.find(
            (v) => edgeId(v.a, v.b) === id,
          );
          if (!e || e.bridge) return null;
          const a = game.current.world.nodes[e.a];
          const b = game.current.world.nodes[e.b];
          return (
            <group
              key={id}
              position={[
                (a.x + b.x) / 2,
                (e.stair ? game.current.player.floor : a.floor) * FLOOR_HEIGHT,
                (a.z + b.z) / 2,
              ]}
              rotation-y={a.x === b.x ? 0 : Math.PI / 2}
            >
              <Box
                position={[0, 0.8, 0]}
                scale={[5.4, 0.8, 0.22]}
                color="#d38a46"
              />
              {[-2, -1, 0, 1, 2].map((x) => (
                <Box
                  key={x}
                  position={[x, 0.8, 0.13]}
                  scale={[0.3, 0.75, 0.025]}
                  color="#f9ecc8"
                  rotation={0.2}
                />
              ))}
              <Sign
                title="道路维护"
                sub={e.stair ? "请走另一座楼梯" : "试试另一条街"}
                color="#9d653b"
                y={1.85}
              />
            </group>
          );
        })}
    </group>
  );
}
function Lifecycle({ onReady, onError }: Pick<Props, "onReady" | "onError">) {
  const { gl } = useThree();
  useEffect(() => {
    const canvas = gl.domElement;
    const lost = (event: Event) => {
      event.preventDefault();
      onError("画面暂时失去了连接。你的路程已保存，可以重新载入继续。");
    };
    canvas.addEventListener("webglcontextlost", lost);
    onReady();
    return () => canvas.removeEventListener("webglcontextlost", lost);
  }, [gl, onReady, onError]);
  return null;
}
export default function Scene({
  game,
  world,
  reduced,
  onReady,
  onError,
}: Props) {
  return (
    <Canvas
      shadows
      dpr={[1, 1.6]}
      camera={{ fov: 65, near: 0.1, far: 240 }}
      gl={{ antialias: true, powerPreference: "high-performance" }}
      onCreated={({ gl }) => {
        gl.setClearColor("#ecd5af");
        gl.toneMapping = THREE.ACESFilmicToneMapping;
        gl.toneMappingExposure = 1.1;
      }}
    >
      <color
        attach="background"
        args={[world.theme === "cave" ? "#636c69" : "#ecd5af"]}
      />
      <fog
        attach="fog"
        args={
          world.theme === "cave" ? ["#636c69", 9, 27] : ["#ecd5af", 90, 230]
        }
      />
      <ambientLight
        intensity={world.theme === "cave" ? 0.65 : 1.35}
        color="#fff0da"
      />
      <hemisphereLight
        args={["#f7edd3", "#668f7c", world.theme === "cave" ? 0.4 : 1.2]}
      />
      <directionalLight
        castShadow
        position={[-30, 60, 30]}
        intensity={world.theme === "cave" ? 0.2 : 2.7}
        color="#fff0d2"
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-62}
        shadow-camera-right={62}
        shadow-camera-top={62}
        shadow-camera-bottom={-62}
        shadow-camera-near={1}
        shadow-camera-far={160}
        shadow-bias={-0.0006}
      />
      {world.theme === "cave" ? (
        <group>
          <CaveWorld world={world} />
          {world.places.map((p) => (
            <group
              key={p.id}
              position={[world.nodes[p.node].x, 0, world.nodes[p.node].z - 3.6]}
            >
              <Sign
                title={p.name}
                sub="回声洞窟 · 认清来路"
                color={p.color}
                y={2}
              />
            </group>
          ))}
          <ChalkMarks
            key={`${world.seed}:${world.theme}`}
            game={game}
            world={world}
          />
        </group>
      ) : (
        <Scenery world={world} />
      )}
      {world.edges.some((e) => e.bridge) && (
        <BridgeScene key={`${world.seed}:${world.theme}`} game={game} />
      )}
      <Animated
        key={`${world.theme}:${world.seed}`}
        game={game}
        reduced={reduced}
      />
      <Lifecycle onReady={onReady} onError={onError} />
    </Canvas>
  );
}
