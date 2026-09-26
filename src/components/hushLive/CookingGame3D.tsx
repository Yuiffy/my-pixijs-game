"use client";

import { useLayoutEffect, useMemo, useRef } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { Mini, turnedRotation } from "./minigames";

function Block({
  at,
  size,
  color,
}: {
  at: [number, number, number];
  size: [number, number, number];
  color: string;
}) {
  return (
    <mesh position={at}>
      <boxGeometry args={size} />
      <meshStandardMaterial color={color} roughness={0.75} />
    </mesh>
  );
}
function Kitchen({ mini: m }: { mini: Mini }) {
  const { camera, size } = useThree();
  useLayoutEffect(() => {
    if (camera instanceof THREE.OrthographicCamera) {
      camera.zoom = Math.min(
        size.width / (size.width < 500 ? 5.8 : 7.2),
        size.height / 3.6,
      );
      camera.lookAt(0, 0.85, 0);
      camera.updateProjectionMatrix();
    }
  }, [camera, size]);
  const pan = useRef<THREE.Group>(null);
  const beef = useRef<THREE.Mesh>(null);
  const egg = useRef<THREE.Group>(null);
  const grains = useRef<THREE.Group>(null);
  const shadow = useRef<THREE.Mesh>(null);
  const panScale = size.width < 500 ? 0.026 : 0.042;
  const points = useMemo(
    () => Array.from(
        { length: 21 },
        (_, i) => new THREE.Vector2(i / 16, 0.3 * (i / 16) ** 2),
      ),
    [],
  );
  const raw = useMemo(() => new THREE.Color("#c66e68"), []);
  const cooked = useMemo(() => new THREE.Color("#75412a"), []);
  const rice = useMemo(() => new THREE.Color("#faf0d0"), []);
  const golden = useMemo(() => new THREE.Color("#ecb531"), []);
  useFrame(() => {
    if (pan.current) {
      pan.current.position.x =
        (m.pan - 50) * (m.kind === "toss" ? panScale : 0.012);
      pan.current.position.y = 0.3 + m.panHeight;
      pan.current.rotation.set(
        m.kind === "eggs" ? m.tiltZ * 0.24 : -m.panHeight,
        0,
        m.kind === "eggs" ? -m.tiltX * 0.24 : 0,
      );
    }
    if (beef.current) {
      beef.current.position.set(
        ((m.flight ? m.x : m.pan) - 50) * panScale,
        0.72 + m.y * 0.035 + (m.flight ? 0 : m.panHeight),
        0,
      );
      beef.current.quaternion.fromArray(
        m.flight
          ? turnedRotation(m.fromRotation, m.turn, m.spin * (Math.PI / 180))
          : m.rotation,
      );
      (beef.current.material as THREE.MeshStandardMaterial[]).forEach(
        (mat, i) => mat.color.copy(raw).lerp(cooked, m.faces[i]),
      );
    }
    if (shadow.current) {
      shadow.current.position.x = (m.x - 50) * panScale;
      shadow.current.visible = m.flight;
    }
    if (egg.current) egg.current.position.set(
        m.egg.x,
        0.04 + 0.3 * (m.egg.x ** 2 + m.egg.z ** 2),
        m.egg.z,
      );
    grains.current?.children.forEach((cluster, i) => {
      const g = m.grains[i];
      cluster.position.set(g.x, 0.11 + 0.3 * (g.x ** 2 + g.z ** 2), g.z);
      cluster.rotation.y = Math.atan2(g.vx, g.vz);
      cluster.children.forEach((child) => ((child as THREE.Mesh).material as THREE.MeshStandardMaterial).color
          .copy(rice)
          .lerp(golden, g.coat),);
    });
  });
  return (
    <>
      <color attach="background" args={["#ded4c0"]} />
      <hemisphereLight args={["#fff5de", "#776c5b", 2]} />
      <directionalLight position={[-3, 6, 4]} intensity={2.5} />
      <Block at={[0, -0.15, 0]} size={[9, 0.2, 5]} color="#ac906b" />
      <Block at={[0, -0.02, -0.15]} size={[5.8, 0.08, 2.6]} color="#424b46" />
      {[-1.4, 1.4].map((x) => (
        <mesh key={x} position={[x, 0.04, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <torusGeometry args={[0.65, 0.025, 8, 36]} />
          <meshStandardMaterial color="#81978c" />
        </mesh>
      ))}
      <Block at={[0, 0.65, -2.15]} size={[9, 1.6, 0.15]} color="#e8dfcc" />
      {[-3, -2, -1, 0, 1, 2, 3].map((x) => (
        <Block
          key={x}
          at={[x, 0.65, -2.05]}
          size={[0.012, 1.6, 0.01]}
          color="#c7beac"
        />
      ))}
      <group ref={pan} position={[0, 0.3, 0]}>
        <mesh>
          <latheGeometry args={[points, 48]} />
          <meshStandardMaterial
            color="#36413c"
            metalness={0.55}
            roughness={0.36}
            side={THREE.DoubleSide}
          />
        </mesh>
        <mesh position={[0, 0.47, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[1.25, 0.04, 8, 48]} />
          <meshStandardMaterial
            color="#88978d"
            metalness={0.7}
            roughness={0.3}
          />
        </mesh>
        <Block at={[0, 0.4, 1.43]} size={[0.17, 0.12, 0.8]} color="#3c443e" />
        <Block at={[0, 0.4, 1.94]} size={[0.22, 0.17, 0.8]} color="#936744" />
        <mesh position={[0.12, 0.41, 2.06]} scale={[0.22, 0.12, 0.29]}>
          <sphereGeometry args={[1, 16, 10]} />
          <meshStandardMaterial color="#dcb395" />
        </mesh>
        <Block
          at={[0.15, 0.35, 2.5]}
          size={[0.3, 0.24, 0.55]}
          color="#789388"
        />
        {m.kind === "eggs" && (
          <>
            <group ref={egg}>
              <mesh scale={[0.48, 0.025, 0.4]}>
                <sphereGeometry args={[1, 24, 12]} />
                <meshStandardMaterial color="#eeb827" roughness={0.25} />
              </mesh>
              <mesh position={[0.13, 0.025, -0.07]} scale={[0.2, 0.02, 0.12]}>
                <sphereGeometry args={[1, 16, 8]} />
                <meshStandardMaterial color="#ffe170" />
              </mesh>
            </group>
            <group ref={grains}>
              {m.grains.map((grain, i) => (
                <group key={i}>
                  {Array.from({ length: 12 }, (_, j) => (
                    <mesh
                      key={j}
                      position={[
                        Math.sin(j * 2.4) * 0.12,
                        (j % 3) * 0.026,
                        Math.cos(j * 2.4) * 0.12,
                      ]}
                      rotation={[0, j, 0]}
                      scale={[0.07, 0.025, 0.033]}
                    >
                      <sphereGeometry args={[1, 6, 4]} />
                      <meshStandardMaterial color="#faf0d0" />
                    </mesh>
                  ))}
                </group>
              ))}
            </group>
          </>
        )}
      </group>
      {m.kind === "toss" && (
        <>
          <mesh ref={beef} position={[0, 0.72, 0]}>
            <boxGeometry args={[0.68, 0.68, 0.68, 2, 2, 2]} />
            {m.faces.map((_, i) => (
              <meshStandardMaterial
                key={i}
                attach={`material-${i}`}
                color="#c66e68"
                roughness={0.57}
              />
            ))}
            {/* Irregular fine sear fibres, never numbered pips. */}
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <group
                key={i}
                rotation={
                  i < 4
                    ? [0, i * (Math.PI / 2), 0]
                    : [i === 4 ? Math.PI / 2 : -Math.PI / 2, 0, 0]
                }
              >
                {[0, 1, 2, 3, 4].map((j) => (
                  <Block
                    key={j}
                    at={[-0.23 + j * 0.105, Math.sin(j * 3 + i) * 0.12, 0.343]}
                    size={[0.016, 0.18 + (j % 3) * 0.065, 0.005]}
                    color="#9c5b4d"
                  />
                ))}
              </group>
            ))}
          </mesh>
          <mesh
            ref={shadow}
            position={[0, 0.075, 0]}
            rotation={[-Math.PI / 2, 0, 0]}
          >
            <ringGeometry args={[0.22, 0.29, 28]} />
            <meshBasicMaterial color="#f8db90" side={THREE.DoubleSide} />
          </mesh>
        </>
      )}
    </>
  );
}

export default function CookingGame3D({ mini }: { mini: Mini }) {
  return (
    <Canvas
      orthographic
      camera={{ position: [0, 5.8, 6], zoom: 70 }}
      dpr={[1, 1.5]}
      gl={{ antialias: true, powerPreference: "low-power" }}
      onCreated={({ camera, gl }) => {
        camera.lookAt(0, 0.65, 0);
        gl.domElement.dataset.cookingCanvas = "true";
      }}
    >
      <Kitchen mini={mini} />
    </Canvas>
  );
}
