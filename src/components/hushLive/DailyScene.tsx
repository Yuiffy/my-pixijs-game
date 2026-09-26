"use client";

import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { MEALS, offAir } from "./daily";
import type { Runtime3D } from "./runtime3d";

function Cube({
  p,
  size,
  color,
}: {
  p: [number, number, number];
  size: [number, number, number];
  color: string;
}) {
  return (
    <mesh position={p} castShadow receiveShadow>
      <boxGeometry args={size} />
      <meshStandardMaterial color={color} />
    </mesh>
  );
}
export function MealModels({ runtime: r }: { runtime: Runtime3D }) {
  const group = useRef<THREE.Group>(null);
  useFrame(() => {
    group.current?.children.forEach((child) => {
      child.visible = child.name === (r.game.daily?.meal ?? "rice");
    });
  });
  return (
    <group ref={group}>
      {MEALS.map((m) => (
        <group name={m.id} key={m.id}>
          {m.id === "tea" || m.id === "dq" ? (
            <>
              <mesh position={[0, 0.14, 0]} castShadow>
                <cylinderGeometry args={[0.095, 0.065, 0.27, 20]} />
                <meshStandardMaterial
                  color={m.id === "tea" ? "#e5ad60" : "#ba383f"}
                />
              </mesh>
              <mesh position={[0, 0.28, 0]}>
                <cylinderGeometry args={[0.1, 0.1, 0.025, 20]} />
                <meshStandardMaterial color="#f4e5c6" />
              </mesh>
              {m.id === "dq" ? (
                <>
                  <mesh position={[0, 0.33, 0]} castShadow>
                    <sphereGeometry args={[0.084, 16, 12]} />
                    <meshStandardMaterial color="#f5e5c9" />
                  </mesh>
                  <Cube
                    p={[0.045, 0.41, 0]}
                    size={[0.016, 0.2, 0.032]}
                    color="#d83e42"
                  />
                </>
              ) : (
                <>
                  <Cube
                    p={[0.03, 0.35, 0]}
                    size={[0.012, 0.2, 0.012]}
                    color="#faf0dc"
                  />
                  {[-1, 1].map((i) => (
                    <mesh
                      key={i}
                      position={[i * 0.034, 0.19, 0.085]}
                      rotation={[Math.PI / 2, 0, 0]}
                    >
                      <cylinderGeometry args={[0.03, 0.03, 0.008, 12]} />
                      <meshStandardMaterial color="#f4ce73" />
                    </mesh>
                  ))}
                </>
              )}
            </>
          ) : (
            <>
              <mesh position={[0, 0.04, 0]} castShadow>
                <cylinderGeometry
                  args={[0.23, 0.18, m.id === "noodles" ? 0.14 : 0.07, 24]}
                />
                <meshStandardMaterial
                  color={m.id === "noodles" ? "#cf785b" : "#e9e0c9"}
                />
              </mesh>
              {(m.id === "rice" || m.id === "plain") && (
                <>
                  <mesh position={[0, 0.065, 0]} scale={[1, 0.33, 1]}>
                    <sphereGeometry args={[0.18, 20, 12]} />
                    <meshStandardMaterial color={m.color} />
                  </mesh>
                  {Array.from({ length: 64 }, (_, i) => {
                    const radius = Math.sqrt(i / 64) * 0.17;
                    return (
                      <mesh
                        key={i}
                        position={[
                          Math.sin(i * 2.4) * radius,
                          0.08 +
                            Math.sqrt(Math.max(0, 0.0324 - radius * radius)) *
                              0.32,
                          Math.cos(i * 2.4) * radius,
                        ]}
                        rotation={[0, i, 0]}
                        scale={[1.8, 0.7, 0.65]}
                      >
                        <sphereGeometry args={[0.009, 6, 4]} />
                        <meshStandardMaterial
                          color={
                            m.id === "rice" && i % 7 === 0
                              ? "#649451"
                              : m.id === "rice" && i % 3 === 0
                                ? "#edbd42"
                                : "#eddeb3"
                          }
                        />
                      </mesh>
                    );
                  })}
                </>
              )}
              {m.id === "bbq" &&
                [0, 1, 2].map((i) => (
                  <group key={i} position={[0, 0.08, -0.11 + i * 0.11]}>
                    <Cube
                      p={[0, 0, 0]}
                      size={[0.46, 0.008, 0.008]}
                      color="#b58a58"
                    />
                    {[-1, 0, 1].map((j) => (
                      <group key={j}>
                        <Cube
                          p={[j * 0.1, 0.016, 0]}
                          size={[0.063, 0.04, 0.055]}
                          color={j === 0 ? "#708749" : "#985233"}
                        />
                        <Cube
                          p={[j * 0.1, 0.039, 0]}
                          size={[0.008, 0.003, 0.05]}
                          color="#633e2b"
                        />
                      </group>
                    ))}
                  </group>
                ))}
              {m.id === "crayfish" &&
                [0, 1, 2, 3, 4].map((i) => (
                  <group
                    key={i}
                    position={[
                      Math.sin(i * 2.4) * 0.1,
                      0.08 + (i % 2) * 0.02,
                      Math.cos(i * 2.4) * 0.1,
                    ]}
                    rotation={[0, i * 1.2, 0]}
                  >
                    {[0, 1, 2, 3].map((j) => (
                      <mesh
                        key={j}
                        position={[0, 0, j * 0.025]}
                        scale={[1 - j * 0.15, 0.6, 0.9]}
                      >
                        <sphereGeometry args={[0.028, 8, 6]} />
                        <meshStandardMaterial
                          color={j % 2 ? "#b53f2c" : "#d75936"}
                        />
                      </mesh>
                    ))}
                    {[-1, 1].map((j) => (
                      <group key={j}>
                        <Cube
                          p={[j * 0.032, 0, -0.024]}
                          size={[0.015, 0.012, 0.04]}
                          color="#b53f2c"
                        />
                        <mesh
                          position={[j * 0.034, 0, -0.054]}
                          rotation={[Math.PI / 2, 0, j * 0.35]}
                        >
                          <torusGeometry
                            args={[0.016, 0.008, 6, 8, Math.PI * 1.5]}
                          />
                          <meshStandardMaterial color="#d75936" />
                        </mesh>
                      </group>
                    ))}
                  </group>
                ))}
              {m.id === "noodles" && (
                <>
                  <mesh position={[0, 0.115, 0]}>
                    <cylinderGeometry args={[0.2, 0.2, 0.009, 24]} />
                    <meshStandardMaterial color="#ae7547" />
                  </mesh>
                  {Array.from({ length: 12 }, (_, i) => (
                    <mesh
                      key={i}
                      position={[
                        Math.sin(i) * 0.065,
                        0.128 + (i % 3) * 0.006,
                        Math.cos(i) * 0.065,
                      ]}
                      rotation={[Math.PI / 2, 0, i]}
                    >
                      <torusGeometry
                        args={[
                          0.065 + (i % 3) * 0.012,
                          0.006,
                          5,
                          16,
                          Math.PI * 1.8,
                        ]}
                      />
                      <meshStandardMaterial color="#edc77b" />
                    </mesh>
                  ))}
                </>
              )}
              <Cube
                p={[0.29, 0.07, 0]}
                size={[0.015, 0.012, 0.34]}
                color="#8b6d47"
              />
              <Cube
                p={[0.32, 0.07, 0]}
                size={[0.015, 0.012, 0.34]}
                color="#8b6d47"
              />
            </>
          )}
        </group>
      ))}
    </group>
  );
}
export default function DailyScene({ runtime: r }: { runtime: Runtime3D }) {
  const spatula = useRef<THREE.Group>(null);
  const lamp = useRef<THREE.PointLight>(null);
  const steam = useRef<THREE.Group>(null);
  useFrame(() => {
    const cooking =
      r.game.daily?.panel === "cook" ||
      (offAir(r.game) && r.game.daily?.after === "rice");
    const t = r.game.daily?.clock ?? 0;
    if (spatula.current) spatula.current.rotation.z = cooking ? Math.sin(t * 4) * 0.3 : 0.3;
    if (steam.current) {
      steam.current.visible = cooking;
      steam.current.children.forEach((p, i) => {
        p.position.y = 0.99 + ((t * 0.13 + i * 0.12) % 0.45);
        p.scale.setScalar(0.6 + ((t + i) % 2) * 0.4);
      });
    }
    if (lamp.current) lamp.current.intensity = offAir(r.game) ? 1.2 : 0.5;
  });
  return (
    <group position={[-0.86, 0, -2.32]} userData={{ spot: "kitchen" }}>
      <Cube p={[0, 0.4, 0]} size={[1.57, 0.8, 0.71]} color="#9aab94" />
      <Cube p={[0, 0.83, 0]} size={[1.63, 0.06, 0.76]} color="#d3bd9b" />
      <Cube p={[0.2, 0.87, 0]} size={[0.64, 0.035, 0.53]} color="#454d47" />
      <mesh position={[0.2, 0.915, 0]} castShadow>
        <cylinderGeometry args={[0.23, 0.19, 0.06, 24]} />
        <meshStandardMaterial color="#343d36" />
      </mesh>
      <Cube p={[0.56, 0.93, 0]} size={[0.32, 0.03, 0.045]} color="#92714e" />
      <group ref={spatula} position={[0.23, 0.95, 0]}>
        <Cube p={[0, 0.12, 0]} size={[0.03, 0.28, 0.025]} color="#c69e6e" />
        <Cube p={[0, -0.01, 0]} size={[0.09, 0.075, 0.02]} color="#c69e6e" />
      </group>
      <mesh position={[-0.4, 0.91, 0]}>
        <sphereGeometry args={[0.065, 12, 10]} />
        <meshStandardMaterial color="#f0dcc0" />
      </mesh>
      <mesh position={[-0.57, 0.91, 0.08]}>
        <sphereGeometry args={[0.065, 12, 10]} />
        <meshStandardMaterial color="#f0dcc0" />
      </mesh>
      <Cube p={[-0.4, 0.87, 0.08]} size={[0.5, 0.025, 0.4]} color="#b99260" />
      <group ref={steam}>
        {[0, 1, 2].map((i) => (
          <mesh key={i} position={[0.14 + i * 0.05, 1, 0]}>
            <sphereGeometry args={[0.045, 8, 6]} />
            <meshStandardMaterial
              color="#eee4cd"
              transparent
              opacity={0.2}
              depthWrite={false}
            />
          </mesh>
        ))}
      </group>
      <pointLight
        ref={lamp}
        position={[0, 1.65, 0.2]}
        color="#ffd693"
        intensity={0.5}
        distance={4}
      />
      <Cube p={[0, 1.88, -0.27]} size={[1.5, 0.12, 0.14]} color="#b89770" />
    </group>
  );
}
