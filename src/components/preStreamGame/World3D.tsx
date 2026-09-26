"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { MutableRefObject } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { INCIDENT_IDS, STATIONS, TASK_IDS } from "./gameplay3d";
import type { IncidentId, PrepState, StationId } from "./gameplay3d";

type Vec3 = [number, number, number];
type BlockProps = {
  at: Vec3;
  size: Vec3;
  color: string;
  rotation?: Vec3;
  metalness?: number;
  roughness?: number;
  transparent?: boolean;
  opacity?: number;
  emissive?: string;
};

const palette = {
  wall: "#f3eee4",
  trim: "#d2bca5",
  wood: "#cba77c",
  oak: "#ae7956",
  mint: "#8daf9d",
  mintDark: "#628a78",
  lilac: "#a489b9",
  plum: "#514163",
  peach: "#f4c6ae",
  brass: "#cda975",
  screen: "#2b3240",
  blue: "#74cbe2",
};

function Block({ at, size, color, rotation, metalness = 0, roughness = 0.8, transparent, opacity, emissive }: BlockProps) {
  return (
    <mesh position={at} rotation={rotation} castShadow receiveShadow>
      <boxGeometry args={size} />
      <meshStandardMaterial color={color} metalness={metalness} roughness={roughness} transparent={transparent} opacity={opacity} emissive={emissive} emissiveIntensity={0.22} />
    </mesh>
  );
}

function Orb({ at, scale, color, metalness = 0, roughness = 0.82, transparent, opacity, emissive }: {
  at: Vec3; scale: Vec3; color: string; metalness?: number; roughness?: number; transparent?: boolean; opacity?: number; emissive?: string;
}) {
  return (
    <mesh position={at} scale={scale} castShadow receiveShadow>
      <sphereGeometry args={[1, 16, 12]} />
      <meshStandardMaterial color={color} metalness={metalness} roughness={roughness} transparent={transparent} opacity={opacity} emissive={emissive} emissiveIntensity={0.25} />
    </mesh>
  );
}

function Tube({ from, to, radius, color, metalness = 0 }: {
  from: Vec3; to: Vec3; radius: number; color: string; metalness?: number;
}) {
  const start = new THREE.Vector3(...from);
  const end = new THREE.Vector3(...to);
  const vector = end.clone().sub(start);
  const quaternion = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), vector.clone().normalize());
  return (
    <mesh position={start.add(end).multiplyScalar(0.5)} quaternion={quaternion} castShadow>
      <cylinderGeometry args={[radius, radius, vector.length(), 10]} />
      <meshStandardMaterial color={color} metalness={metalness} roughness={0.62} />
    </mesh>
  );
}

function disk(at: Vec3, radius: number, color: string) {
  return (
    <mesh position={at} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
      <circleGeometry args={[radius, 24]} />
      <meshStandardMaterial color={color} roughness={1} />
    </mesh>
  );
}

function makeWoodTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    ctx.fillStyle = "#d4b58e";
    ctx.fillRect(0, 0, 512, 512);
    for (let i = 0; i < 12; i++) {
      const y = i * 44;
      ctx.fillStyle = i % 3 === 0 ? "#c49d75" : i % 2 ? "#d9ba95" : "#cfad83";
      ctx.fillRect(0, y, 512, 42);
      ctx.fillStyle = "#a87f6038";
      ctx.fillRect((i % 4) * 128 - 2, y, 2, 42);
      ctx.strokeStyle = "#a67d5530";
      for (let j = 0; j < 3; j++) {
        ctx.beginPath();
        ctx.moveTo(0, y + 10 + j * 9);
        ctx.bezierCurveTo(120, y + 13 + j * 9, 380, y + 5 + j * 9, 512, y + 10 + j * 9);
        ctx.stroke();
      }
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(2.2, 1.5);
  return texture;
}

function makeScreenTexture(kind: "vts" | "obs", live: boolean) {
  const canvas = document.createElement("canvas");
  canvas.width = 320;
  canvas.height = 220;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    ctx.fillStyle = kind === "vts" ? "#a8a2bd" : "#313441";
    ctx.fillRect(0, 0, 320, 220);
    ctx.fillStyle = kind === "vts" ? "#d7d1e4" : "#565364";
    ctx.fillRect(7, 8, 306, 175);
    if (kind === "vts") {
      ctx.fillStyle = "#f0e9f4";
      ctx.fillRect(16, 16, 211, 160);
      ctx.fillStyle = "#d6d3e6";
      ctx.beginPath(); ctx.arc(120, 117, 66, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#f5e0d6";
      ctx.beginPath(); ctx.ellipse(120, 115, 40, 52, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#eeeaf5";
      ctx.beginPath(); ctx.ellipse(120, 65, 53, 24, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#bd6787";
      ctx.beginPath(); ctx.arc(105, 110, 5, 0, Math.PI * 2); ctx.arc(138, 110, 5, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#7e7196";
      ctx.fillRect(238, 20, 62, 12); ctx.fillRect(238, 45, 42, 8); ctx.fillRect(238, 63, 51, 8);
      ctx.fillStyle = live ? "#9bd2b6" : "#e6b895";
      ctx.fillRect(238, 147, 61, 19);
      ctx.fillStyle = "#493b55";
      ctx.font = "bold 14px sans-serif";
      ctx.fillText(live ? "READY" : "VTS", 246, 162);
    } else {
      ctx.fillStyle = "#aaa1bd";
      ctx.fillRect(16, 17, 207, 124);
      ctx.fillStyle = "#ded2dd";
      ctx.fillRect(22, 24, 195, 110);
      ctx.fillStyle = "#e8d9d3";
      ctx.beginPath(); ctx.arc(112, 75, 29, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#746782";
      ctx.fillRect(240, 22, 63, 9); ctx.fillRect(240, 42, 47, 7); ctx.fillRect(240, 60, 59, 7);
      for (let i = 0; i < 8; i++) {
        ctx.fillStyle = live ? "#8fccaa" : "#a797b6";
        ctx.fillRect(25 + i * 34, 150 - ((i * 7) % 23), 15, 22 + ((i * 7) % 23));
      }
    }
    ctx.fillStyle = kind === "vts" ? "#665e76" : "#d9cfdc";
    ctx.font = "bold 14px sans-serif";
    ctx.fillText(kind === "vts" ? "VTube Studio" : "OBS Studio", 15, 206);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function Architecture() {
  const wood = useMemo(makeWoodTexture, []);
  useEffect(() => () => wood.dispose(), [wood]);
  return (
    <group>
      <mesh position={[0, -0.11, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[10.6, 6.6]} />
        <meshStandardMaterial map={wood} roughness={0.9} />
      </mesh>
      <Block at={[0, -0.21, 0]} size={[10.6, 0.21, 6.6]} color="#bd916f" />
      <Block at={[3.24, -0.093, 0]} size={[4.08, 0.025, 6.36]} color="#c7d4cf" />
      {Array.from({ length: 11 }, (_, i) => <Block key={`bedroom-plank-${i}`} at={[3.24, -0.074, -2.9 + i * 0.57]} size={[4.06, 0.008, 0.014]} color="#aebfb9" />)}
      <Block at={[0, 1.34, -3.22]} size={[10.6, 2.7, 0.16]} color={palette.wall} />
      <Block at={[-5.22, 1.34, 0]} size={[0.16, 2.7, 6.6]} color="#f0e7d9" />
      <Block at={[0, 0.12, -3.11]} size={[10.5, 0.2, 0.09]} color={palette.trim} />
      <Block at={[-5.11, 0.12, 0]} size={[0.09, 0.2, 6.55]} color={palette.trim} />
      <Block at={[-3.74, -0.035, -1.73]} size={[2.84, 0.04, 3.05]} color="#a7bec1" />
      {Array.from({ length: 7 }, (_, i) => <Block key={`tile-v-${i}`} at={[-5.06 + i * 0.43, -0.008, -1.7]} size={[0.014, 0.007, 3]} color="#d5e2df" />)}
      {Array.from({ length: 8 }, (_, i) => <Block key={`tile-h-${i}`} at={[-3.74, -0.007, -3.16 + i * 0.42]} size={[2.78, 0.007, 0.014]} color="#d5e2df" />)}
      <Block at={[-2.39, 0.9, -2.72]} size={[0.12, 1.8, 0.87]} color="#e4e0d7" />
      <Block at={[-2.39, 0.9, -0.48]} size={[0.12, 1.8, 0.6]} color="#e4e0d7" />
      <Block at={[-2.39, 1.83, -2.72]} size={[0.18, 0.12, 0.9]} color="#c7b5a6" />
      <Block at={[-2.39, 1.83, -0.48]} size={[0.18, 0.12, 0.66]} color="#c7b5a6" />
      <Block at={[-3.69, 0.43, -0.45]} size={[2.72, 0.86, 0.12]} color="#d8e3df" />
      <Block at={[-3.69, 0.9, -0.45]} size={[2.76, 0.09, 0.17]} color="#f4f2e9" />
      <Block at={[-3.7, 1.45, -3.11]} size={[2.35, 1.58, 0.025]} color="#d8e4e4" />
      <Block at={[-3.7, 1.45, -3.08]} size={[2.31, 0.045, 0.045]} color="#f8f7ed" />
      <Block at={[0.1, 1.74, -3.11]} size={[1.62, 1.15, 0.04]} color="#d9b99d" />
      <Block at={[0.1, 1.74, -3.07]} size={[1.43, 0.96, 0.04]} color="#aed2d3" />
      <Block at={[0.1, 1.74, -3.04]} size={[0.06, 0.97, 0.05]} color="#f4eee5" />
      <Block at={[0.1, 1.74, -3.03]} size={[1.44, 0.055, 0.05]} color="#f4eee5" />
      <Orb at={[0.47, 1.93, -3]} scale={[0.15, 0.15, 0.015]} color="#f5e4a9" emissive="#fff1af" />
      <Block at={[0.11, 1.15, -2.98]} size={[1.72, 0.12, 0.23]} color="#b99171" />
      <Block at={[2.58, 1.64, -3.11]} size={[0.85, 1.04, 0.05]} color="#c69487" />
      <Block at={[2.58, 1.64, -3.07]} size={[0.73, 0.91, 0.025]} color="#e8d4c7" />
      <Orb at={[2.58, 1.73, -3.02]} scale={[0.18, 0.18, 0.015]} color="#ad8ab7" />
      <Tube from={[2.32, 1.33, -3.02]} to={[2.86, 1.33, -3.02]} radius={0.018} color="#b48c9c" />
      <Block at={[4.62, 1.5, -3.08]} size={[0.14, 1.45, 0.08]} color="#f8e4a9" emissive="#e2b363" />
      <Block at={[4.41, 1.76, -3.08]} size={[0.5, 0.12, 0.08]} color="#f8e4a9" emissive="#e2b363" />
      <Block at={[4.41, 1.25, -3.08]} size={[0.5, 0.12, 0.08]} color="#f8e4a9" emissive="#e2b363" />
      <Block at={[1.2, 0.55, -2.51]} size={[0.16, 1.1, 1.42]} color="#e0e9e3" />
      <Block at={[1.2, 1.37, -2.51]} size={[0.045, 0.52, 1.34]} color="#9ebcb6" transparent opacity={0.22} />
      <Block at={[1.2, 1.65, -2.51]} size={[0.12, 0.06, 1.42]} color="#b8c8bf" />
      <Block at={[1.2, 0.225, -0.675]} size={[0.16, 0.45, 2.25]} color="#e0e9e3" />
      <Block at={[1.2, 0.25, 2.385]} size={[0.16, 0.5, 1.67]} color="#e0e9e3" />
      <Block at={[1.2, 1.08, 0.45]} size={[0.09, 2.16, 0.08]} color="#d1d9ce" />
      <Block at={[1.2, 1.08, 1.55]} size={[0.09, 2.16, 0.08]} color="#d1d9ce" />
      <Block at={[1.2, 2.15, 1]} size={[0.1, 0.1, 1.18]} color="#c6b79f" />
      <Block at={[1.2, -0.049, 1]} size={[0.34, 0.025, 1.1]} color="#e8d9bd" />
    </group>
  );
}

function Plant({ at, scale = 1 }: { at: Vec3; scale?: number }) {
  return (
    <group position={at} scale={scale}>
      <mesh position={[0, 0.18, 0]} castShadow><cylinderGeometry args={[0.2, 0.15, 0.34, 10]} /><meshStandardMaterial color="#c4876d" roughness={1} /></mesh>
      <Tube from={[0, 0.33, 0]} to={[0, 0.95, 0]} radius={0.025} color="#5c866b" />
      {Array.from({ length: 6 }, (_, i) => {
        const theta = i * 2.4;
        return <Orb key={i} at={[Math.cos(theta) * 0.22, 0.65 + (i % 3) * 0.1, Math.sin(theta) * 0.22]} scale={[0.13, 0.055, 0.26]} color={i % 2 ? "#668b70" : "#7da583"} />;
      })}
    </group>
  );
}

function Kitchen() {
  return (
    <group>
      <Block at={[-4.11, 0.48, 1.78]} size={[1.75, 0.94, 1.02]} color={palette.mint} />
      <Block at={[-4.11, 0.99, 1.78]} size={[1.91, 0.11, 1.18]} color="#edd4b2" />
      {[-4.6, -3.74].map((x) => (
        <group key={x}>
          <Block at={[x, 0.43, 2.305]} size={[0.75, 0.72, 0.035]} color="#9fc2ad" />
          <Block at={[x + 0.22, 0.49, 2.33]} size={[0.18, 0.035, 0.02]} color="#c8a06c" metalness={0.65} />
        </group>
      ))}
      <mesh position={[-4.51, 1.055, 1.76]} rotation={[-Math.PI / 2, 0, 0]}><circleGeometry args={[0.31, 24]} /><meshStandardMaterial color="#9db9b9" metalness={0.46} roughness={0.35} /></mesh>
      <mesh position={[-4.51, 1.06, 1.76]} rotation={[-Math.PI / 2, 0, 0]}><ringGeometry args={[0.27, 0.35, 24]} /><meshStandardMaterial color="#edf1e9" metalness={0.3} /></mesh>
      <Tube from={[-4.77, 1.09, 1.67]} to={[-4.77, 1.41, 1.67]} radius={0.035} color="#c9d0c5" metalness={0.6} />
      <Tube from={[-4.77, 1.41, 1.67]} to={[-4.49, 1.41, 1.67]} radius={0.035} color="#c9d0c5" metalness={0.6} />
      <Block at={[-3.68, 1.065, 1.76]} size={[0.53, 0.035, 0.42]} color="#ba8d62" />
      <Orb at={[-3.79, 1.13, 1.75]} scale={[0.15, 0.07, 0.11]} color="#e7b774" />
      <Orb at={[-3.55, 1.13, 1.72]} scale={[0.13, 0.06, 0.1]} color="#db836b" />
      <Block at={[-3.8, 1.5, -3.08]} size={[1.28, 0.11, 0.32]} color="#b48967" />
      {[0, 1, 2].map((i) => (
        <group key={i} position={[-4.27 + i * 0.38, 1.61, -2.97]}>
          <mesh><cylinderGeometry args={[0.1, 0.08, 0.16, 12]} /><meshStandardMaterial color={i === 1 ? "#d6a27f" : "#e7d7b7"} /></mesh>
          <Block at={[0, 0.12, 0]} size={[0.22, 0.035, 0.22]} color={i === 1 ? "#a77c60" : "#c7a88a"} />
        </group>
      ))}
      <Plant at={[-4.95, 1.05, 1.18]} scale={0.53} />
    </group>
  );
}

function LivingRoom() {
  return (
    <group>
      <Block at={[-0.48, -0.061, -1.65]} size={[1.88, 0.025, 1.66]} color="#c79282" />
      <Block at={[-0.48, -0.042, -1.65]} size={[1.65, 0.012, 1.44]} color="#e0bca9" />
      <Block at={[-0.5, 0.34, -2.59]} size={[1.66, 0.54, 0.58]} color="#689184" />
      <Block at={[-0.5, 0.67, -2.91]} size={[1.72, 0.7, 0.17]} color="#577d74" />
      {[-1.3, 0.3].map(x => <Block key={x} at={[x, 0.53, -2.57]} size={[0.18, 0.45, 0.62]} color="#577d74" />)}
      {[-0.95, -0.45, 0.05].map((x, i) => <Block key={x} at={[x, 0.64, -2.57]} size={[0.43, 0.17, 0.47]} color={i === 1 ? "#d6c6aa" : "#88a99b"} />)}
      <Block at={[-0.42, 0.3, -1.43]} size={[0.84, 0.08, 0.47]} color="#b08064" />
      {[-0.73, -0.11].map(x => [-1.6, -1.26].map(z => <Block key={`${x}-${z}`} at={[x, 0.15, z]} size={[0.055, 0.3, 0.055]} color="#8d6852" />))}
      <Block at={[-0.44, 0.36, -1.44]} size={[0.29, 0.022, 0.19]} color="#f3e7d2" />
      <Orb at={[-0.53, 0.39, -1.45]} scale={[0.045, 0.025, 0.045]} color="#b88da5" />
      <Block at={[0.72, 0.78, -2.74]} size={[0.055, 1.55, 0.055]} color="#a78e77" />
      <Orb at={[0.72, 1.57, -2.74]} scale={[0.23, 0.18, 0.23]} color="#f6dfb2" emissive="#ddbb79" transparent opacity={0.9} />
    </group>
  );
}

function Bedroom() {
  return (
    <group>
      <Block at={[2.26, -0.061, 0.88]} size={[1.5, 0.025, 1.27]} color="#75978f" />
      <Block at={[2.26, -0.043, 0.88]} size={[1.29, 0.011, 1.06]} color="#a7beb4" />
      <Block at={[4.45, 0.21, 2.05]} size={[1.1, 0.4, 1.48]} color="#b28d79" />
      <Block at={[4.45, 0.45, 2.05]} size={[1.03, 0.14, 1.42]} color="#f0e9df" />
      <Block at={[4.45, 0.54, 2.28]} size={[1.01, 0.1, 0.93]} color="#aa93ab" />
      <Block at={[4.45, 0.52, 1.4]} size={[1.1, 0.48, 0.12]} color="#a37c72" />
      {[-0.25, 0.25].map(dx => <Orb key={dx} at={[4.45 + dx, 0.6, 1.59]} scale={[0.21, 0.1, 0.18]} color="#f8f4e8" />)}
      <Block at={[3.72, 0.24, 2.63]} size={[0.28, 0.48, 0.34]} color="#a77f69" />
      <Block at={[3.72, 0.51, 2.63]} size={[0.36, 0.06, 0.39]} color="#d7b497" />
      <Orb at={[3.72, 0.61, 2.63]} scale={[0.12, 0.1, 0.12]} color="#f7e4ba" emissive="#ddb779" />
      <Block at={[4.83, 0.98, -2.79]} size={[0.65, 1.95, 0.35]} color="#a98b7c" />
      <Block at={[4.82, 0.99, -2.59]} size={[0.56, 1.79, 0.035]} color="#d8baa6" />
      <Block at={[4.82, 0.99, -2.55]} size={[0.024, 1.78, 0.04]} color="#b38e80" />
      {[-0.12, 0.12].map(dx => <Orb key={dx} at={[4.83 + dx, 1.03, -2.51]} scale={[0.025, 0.025, 0.025]} color="#e9d2a5" />)}
    </group>
  );
}

function Thermos({ state }: { state: PrepState }) {
  const onTable = state.water.cup === "table";
  return (
    <group>
      <Block at={[2.85, 0.46, 1.62]} size={[1.03, 0.09, 0.74]} color="#ae815f" />
      {[-0.41, 0.41].map((dx) => [-0.25, 0.25].map((dz) => <Block key={`${dx}-${dz}`} at={[2.85 + dx, 0.24, 1.62 + dz]} size={[0.065, 0.43, 0.065]} color="#91694f" />))}
      <Block at={[2.48, 0.52, 1.6]} size={[0.25, 0.04, 0.21]} color="#d2b9a5" />
      <Orb at={[2.49, 0.58, 1.59]} scale={[0.055, 0.04, 0.04]} color="#c2a584" />
      {onTable && <Cup at={[3.03, 0.51, 1.64]} full={false} />}
      <Plant at={[3.3, 0.5, 1.53]} scale={0.38} />
    </group>
  );
}

function Cup({ at, full }: { at: Vec3; full: boolean }) {
  return (
    <group position={at}>
      <mesh position={[0, 0.12, 0]} castShadow><cylinderGeometry args={[0.1, 0.083, 0.24, 16]} /><meshStandardMaterial color="#ddd5c8" metalness={0.43} roughness={0.42} /></mesh>
      <mesh position={[0, 0.245, 0]}><cylinderGeometry args={[0.102, 0.102, 0.015, 16]} /><meshStandardMaterial color="#4f5a61" metalness={0.55} /></mesh>
      <mesh position={[0, 0.16, 0.102]}><planeGeometry args={[0.11, 0.12]} /><meshStandardMaterial color={full ? "#80cadd" : "#9b86ac"} /></mesh>
      <mesh position={[0, 0.27, 0]}><cylinderGeometry args={[0.039, 0.039, 0.036, 14]} /><meshStandardMaterial color="#b7afaa" metalness={0.5} /></mesh>
    </group>
  );
}

function Dispenser({ state }: { state: PrepState }) {
  const fill = state.water.cup === "filling";
  const ready = state.water.cup === "ready";
  const amount = Math.max(0.04, Math.min(1, state.water.fillMs / Math.max(1, state.water.fillRequiredMs)));
  const stream = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    if (stream.current) stream.current.scale.y = fill ? 0.85 + Math.sin(clock.elapsedTime * 17) * 0.12 : 0.001;
  });
  return (
    <group position={[-0.6, 0, 2.25]}>
      <Block at={[0, 0.56, -0.1]} size={[0.6, 1.12, 0.5]} color="#e5dfd0" />
      <Block at={[0, 0.74, 0.16]} size={[0.52, 0.32, 0.045]} color="#abc9c2" />
      <Block at={[0, 0.3, 0.17]} size={[0.44, 0.05, 0.23]} color="#a8a69f" metalness={0.4} />
      <mesh position={[0, 1.38, -0.1]} castShadow><cylinderGeometry args={[0.25, 0.21, 0.55, 16]} /><meshStandardMaterial color="#9cd2df" transparent opacity={0.67} roughness={0.18} metalness={0.03} /></mesh>
      <mesh position={[0, 1.2, -0.1]}><cylinderGeometry args={[0.21, 0.19, 0.18, 16]} /><meshStandardMaterial color="#69bad5" transparent opacity={0.82} roughness={0.18} /></mesh>
      <mesh position={[0, 1.67, -0.1]}><cylinderGeometry args={[0.17, 0.24, 0.07, 16]} /><meshStandardMaterial color="#d7d8d0" /></mesh>
      <Block at={[-0.1, 0.72, 0.2]} size={[0.075, 0.08, 0.08]} color="#6aaac5" />
      <Block at={[0.1, 0.72, 0.2]} size={[0.075, 0.08, 0.08]} color="#d9a995" />
      <Tube from={[0, 0.6, 0.19]} to={[0, 0.51, 0.19]} radius={0.026} color="#a4aba8" metalness={0.5} />
      <mesh ref={stream} position={[0, 0.405, 0.19]}><cylinderGeometry args={[0.012, 0.02, 0.19, 8]} /><meshStandardMaterial color="#71d8f4" transparent opacity={0.7} emissive="#4bb9da" emissiveIntensity={0.45} /></mesh>
      {(fill || ready) && (
        <group position={[0, 0.19, 0.19]}>
          <Cup at={[0, 0, 0]} full={ready || amount > 0.5} />
          <mesh position={[0, 0.015 + amount * 0.15, 0]}><cylinderGeometry args={[0.073, 0.073, 0.018, 16]} /><meshStandardMaterial color="#6ac7dc" transparent opacity={0.87} /></mesh>
        </group>
      )}
    </group>
  );
}

function Bathroom({ state }: { state: PrepState }) {
  const flush = state.minigame?.kind === "toilet" && state.minigame.stage === "flushing";
  const splash = state.minigame?.kind === "toilet" ? Math.min(12, state.minigame.splashCount) : 0;
  const vortex = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    if (vortex.current) vortex.current.rotation.y = clock.elapsedTime * (flush ? 11 : 0.35);
  });
  return (
    <group>
      <Block at={[-4.05, 0.018, -1.83]} size={[1.15, 0.028, 0.75]} color="#d8e6de" />
      <mesh position={[-4.05, 0.49, -1.83]} castShadow><cylinderGeometry args={[0.38, 0.34, 0.76, 20]} /><meshStandardMaterial color="#f9f8f0" roughness={0.28} /></mesh>
      <mesh position={[-4.05, 0.88, -1.83]} rotation={[-Math.PI / 2, 0, 0]}><torusGeometry args={[0.29, 0.075, 10, 24]} /><meshStandardMaterial color="#fcfaf4" roughness={0.33} /></mesh>
      <mesh position={[-4.05, 0.86, -1.83]} rotation={[-Math.PI / 2, 0, 0]}><circleGeometry args={[0.245, 24]} /><meshStandardMaterial color={flush ? "#8fdae7" : "#93bac2"} roughness={0.3} /></mesh>
      <Block at={[-4.05, 0.94, -2.27]} size={[0.79, 0.74, 0.33]} color="#f5f3eb" roughness={0.32} />
      <mesh position={[-4.05, 1.34, -2.23]}><cylinderGeometry args={[0.1, 0.1, 0.04, 16]} /><meshStandardMaterial color="#b9c9ca" metalness={0.6} /></mesh>
      <group ref={vortex} position={[-4.05, 0.89, -1.83]} visible={flush}>
        <mesh rotation={[-Math.PI / 2, 0, 0]}><torusGeometry args={[0.18, 0.018, 8, 32]} /><meshStandardMaterial color="#d9f9fc" emissive="#7ed5e8" emissiveIntensity={0.4} /></mesh>
        <mesh rotation={[-Math.PI / 2, 0, 0]} scale={[0.62, 0.62, 1]}><torusGeometry args={[0.18, 0.018, 8, 32]} /><meshStandardMaterial color="#ffffff" transparent opacity={0.8} /></mesh>
      </group>
      {Array.from({ length: splash }, (_, i) => {
        const angle = i * 2.4;
        return <Orb key={i} at={[-4.05 + Math.cos(angle) * (0.16 + ((i % 3) * 0.07)), 1.02 + ((i % 4) * 0.1), -1.83 + Math.sin(angle) * 0.22]} scale={[0.035, 0.06, 0.035]} color="#74d8ee" transparent opacity={0.72} />;
      })}
      <Block at={[-4.95, 1.05, -0.93]} size={[0.08, 0.06, 0.19]} color="#c7caca" metalness={0.45} />
      <mesh position={[-4.86, 1.02, -0.93]} rotation={[0, 0, Math.PI / 2]}><cylinderGeometry args={[0.12, 0.12, 0.18, 16]} /><meshStandardMaterial color="#f7eee2" /></mesh>
      <Block at={[-4.82, 1.58, -3.01]} size={[0.52, 0.64, 0.06]} color="#e1bdaa" />
      <Block at={[-4.82, 1.58, -2.97]} size={[0.43, 0.55, 0.025]} color="#cbe1df" metalness={0.13} roughness={0.17} />
      <Block at={[-2.96, 0.36, -2.8]} size={[0.46, 0.7, 0.42]} color="#efede4" />
      <mesh position={[-2.96, 0.75, -2.8]}><cylinderGeometry args={[0.25, 0.24, 0.08, 16]} /><meshStandardMaterial color="#faf9f0" /></mesh>
      <Tube from={[-2.96, 0.82, -2.97]} to={[-2.96, 1.03, -2.97]} radius={0.028} color="#b7c7c3" metalness={0.55} />
      <Tube from={[-2.96, 1.03, -2.97]} to={[-2.95, 1.03, -2.82]} radius={0.028} color="#b7c7c3" metalness={0.55} />
    </group>
  );
}

function CatBowl({ state }: { state: PrepState }) {
  const fed = state.completed.includes("cat");
  const station = STATIONS.find(item => item.id === "cat")!;
  return (
    <group position={[station.x, 0, station.z]}>
      {disk([0, 0.018, 0], 0.38, "#ead9c5")}
      <mesh position={[0, 0.12, 0]}><cylinderGeometry args={[0.25, 0.2, 0.19, 16]} /><meshStandardMaterial color="#d37f77" /></mesh>
      <mesh position={[0, 0.19, 0]}><cylinderGeometry args={[0.19, 0.19, 0.02, 16]} /><meshStandardMaterial color={fed ? "#997455" : "#eee5d7"} /></mesh>
      {fed && Array.from({ length: 5 }, (_, i) => <Orb key={i} at={[-0.11 + i * 0.05, 0.21, (i % 2) * 0.05]} scale={[0.027, 0.018, 0.027]} color="#684d39" />)}
    </group>
  );
}

function RoamingCat({ liveStateRef }: { liveStateRef: MutableRefObject<PrepState> }) {
  const rig = useRef<THREE.Group>(null);
  const tail = useRef<THREE.Group>(null);
  const frontLeft = useRef<THREE.Group>(null);
  const frontRight = useRef<THREE.Group>(null);
  const previous = useRef({ x: liveStateRef.current.cat.x, z: liveStateRef.current.cat.z, moving: 0, initialized: false });
  useFrame(({ clock }, dt) => {
    if (!rig.current) return;
    const { cat } = liveStateRef.current;
    const distance = Math.hypot(cat.x - previous.current.x, cat.z - previous.current.z);
    const snap = !previous.current.initialized || Math.hypot(rig.current.position.x - cat.x, rig.current.position.z - cat.z) > 1.2;
    previous.current.x = cat.x;
    previous.current.z = cat.z;
    previous.current.initialized = true;
    previous.current.moving = THREE.MathUtils.damp(previous.current.moving, snap ? 0 : distance > 0.003 ? 1 : 0, 9, dt);
    if (snap) {
      rig.current.position.set(cat.x, 0, cat.z);
      rig.current.rotation.y = cat.yaw;
    } else {
      rig.current.position.x = THREE.MathUtils.damp(rig.current.position.x, cat.x, 14, dt);
      rig.current.position.z = THREE.MathUtils.damp(rig.current.position.z, cat.z, 14, dt);
      const yawDelta = Math.atan2(Math.sin(cat.yaw - rig.current.rotation.y), Math.cos(cat.yaw - rig.current.rotation.y));
      rig.current.rotation.y += yawDelta * (1 - Math.exp(-10 * dt));
    }
    rig.current.position.y = Math.abs(Math.sin(clock.elapsedTime * 9)) * previous.current.moving * 0.025;
    if (tail.current) tail.current.rotation.x = Math.sin(clock.elapsedTime * 3.4) * 0.28;
    const stride = Math.sin(clock.elapsedTime * 9) * previous.current.moving * 0.24;
    if (frontLeft.current) frontLeft.current.rotation.x = stride;
    if (frontRight.current) frontRight.current.rotation.x = -stride;
  });
  return (
    <group ref={rig}>
      <mesh position={[0, 0.015, 0]} rotation={[-Math.PI / 2, 0, 0]}><circleGeometry args={[0.3, 24]} /><meshBasicMaterial color="#544548" transparent opacity={0.19} depthWrite={false} /></mesh>
      <Orb at={[0, 0.31, -0.08]} scale={[0.29, 0.24, 0.38]} color="#dfb99b" />
      <Orb at={[0, 0.42, 0.22]} scale={[0.25, 0.24, 0.24]} color="#e6c6aa" />
      <group ref={frontLeft} position={[-0.18, 0.22, 0.18]}><Orb at={[0, -0.11, 0.04]} scale={[0.09, 0.17, 0.11]} color="#e6c6aa" /></group>
      <group ref={frontRight} position={[0.18, 0.22, 0.18]}><Orb at={[0, -0.11, 0.04]} scale={[0.09, 0.17, 0.11]} color="#e6c6aa" /></group>
      {[-0.18, 0.18].map(x => <Orb key={x} at={[x, 0.12, -0.31]} scale={[0.09, 0.13, 0.1]} color="#dfb99b" />)}
      <mesh position={[-0.17, 0.62, 0.2]} rotation={[0, 0, -0.22]}><coneGeometry args={[0.12, 0.27, 4]} /><meshStandardMaterial color="#e6c6aa" /></mesh>
      <mesh position={[0.17, 0.62, 0.2]} rotation={[0, 0, 0.22]}><coneGeometry args={[0.12, 0.27, 4]} /><meshStandardMaterial color="#e6c6aa" /></mesh>
      <Orb at={[-0.085, 0.45, 0.434]} scale={[0.018, 0.03, 0.009]} color="#493f4c" />
      <Orb at={[0.085, 0.45, 0.434]} scale={[0.018, 0.03, 0.009]} color="#493f4c" />
      <Orb at={[0, 0.36, 0.458]} scale={[0.024, 0.015, 0.012]} color="#bb7880" />
      <group ref={tail} position={[0, 0.36, -0.44]}><Tube from={[0, 0, 0]} to={[0.09, 0.31, -0.16]} radius={0.068} color="#d4ae93" /><Orb at={[0.09, 0.31, -0.16]} scale={[0.076, 0.076, 0.076]} color="#e3c2a3" /></group>
    </group>
  );
}

function PawTrail({ at, yaw = 0 }: { at: Vec3; yaw?: number }) {
  return (
    <group position={at} rotation={[0, yaw, 0]}>
      {[0, 1, 2].map((step) => (
        <group key={step} position={[step % 2 ? 0.1 : -0.1, 0, -step * 0.23]} rotation={[0, (step % 2 ? 1 : -1) * 0.18, 0]}>
          <Orb at={[0, 0.018, 0]} scale={[0.07, 0.012, 0.055]} color="#b88d7b" />
          {[-0.058, 0, 0.058].map((x) => <Orb key={x} at={[x, 0.018, 0.072]} scale={[0.025, 0.011, 0.027]} color="#b88d7b" />)}
        </group>
      ))}
    </group>
  );
}

function MischiefAfterimage({ at, yaw = 0 }: { at: Vec3; yaw?: number }) {
  const rig = useRef<THREE.Group>(null);
  const bornAt = useRef<number | null>(null);
  useFrame(({ clock }) => {
    if (!rig.current) return;
    if (bornAt.current === null) bornAt.current = clock.elapsedTime;
    const elapsed = clock.elapsedTime - bornAt.current;
    rig.current.visible = elapsed < 2.4;
    rig.current.position.y = 0.07 + Math.abs(Math.sin(elapsed * 8)) * 0.11;
    rig.current.rotation.y = yaw + Math.min(elapsed, 1.5) * 0.42;
  });
  return (
    <group ref={rig} position={at} rotation={[0, yaw, 0]} scale={0.67}>
      <Orb at={[0, 0.4, -0.08]} scale={[0.32, 0.24, 0.4]} color="#e4c7ad" transparent opacity={0.62} />
      <Orb at={[0, 0.52, 0.25]} scale={[0.24, 0.23, 0.22]} color="#efd3b7" transparent opacity={0.7} />
      {[-0.15, 0.15].map((x) => <mesh key={x} position={[x, 0.75, 0.24]}><coneGeometry args={[0.12, 0.25, 4]} /><meshStandardMaterial color="#e4c7ad" transparent opacity={0.7} /></mesh>)}
      <Tube from={[0, 0.42, -0.4]} to={[0.16, 0.68, -0.54]} radius={0.055} color="#d1ab97" />
    </group>
  );
}

function IncidentScenes({ active }: { active: IncidentId[] }) {
  return (
    <group>
      {active.includes("spill") && (
        <group>
          {disk([0.15, 0.025, 0.25], 0.43, "#77bdcb")}
          {disk([0.42, 0.027, 0.18], 0.19, "#9bd8db")}
          {disk([-0.11, 0.027, 0.34], 0.14, "#9bd8db")}
          <mesh position={[0.45, 0.12, 0.42]} rotation={[0.18, 0.1, Math.PI / 2.7]} castShadow>
            <cylinderGeometry args={[0.1, 0.083, 0.25, 16]} />
            <meshStandardMaterial color="#e7ddd0" metalness={0.33} roughness={0.38} />
          </mesh>
          <Orb at={[0.44, 0.055, 0.31]} scale={[0.085, 0.03, 0.06]} color="#b2e6e9" transparent opacity={0.85} />
          <PawTrail at={[0.62, 0.033, 0.8]} yaw={2.35} />
          <MischiefAfterimage at={[0.69, 0.08, 0.55]} yaw={-1.2} />
        </group>
      )}
      {active.includes("cable") && (
        <group>
          <Tube from={[4.25, 0.3, -0.2]} to={[3.12, 0.08, 0.14]} radius={0.025} color="#c06169" />
          <Block at={[3.02, 0.12, 0.14]} size={[0.21, 0.1, 0.13]} color="#4d4b56" />
          <Tube from={[2.92, 0.13, 0.14]} to={[2.82, 0.13, 0.14]} radius={0.026} color="#c3babb" metalness={0.52} />
          <PawTrail at={[3.18, 0.033, 0.72]} yaw={2.9} />
        </group>
      )}
      {active.includes("catwalk") && (
        <group position={[3.12, 0.89, -1.58]}>
          <Orb at={[0, 0.17, 0]} scale={[0.32, 0.19, 0.22]} color="#e6c4a7" />
          <Orb at={[0.23, 0.26, 0.04]} scale={[0.16, 0.16, 0.15]} color="#efd0af" />
          {[-0.18, 0.18].map((x) => <mesh key={x} position={[0.23 + x * 0.5, 0.43, 0.06]}><coneGeometry args={[0.08, 0.17, 4]} /><meshStandardMaterial color="#e6c4a7" /></mesh>)}
          <Orb at={[0.4, 0.26, 0.17]} scale={[0.018, 0.024, 0.015]} color="#443c43" />
          <Tube from={[-0.28, 0.21, -0.06]} to={[-0.48, 0.35, -0.2]} radius={0.055} color="#d8b495" />
        </group>
      )}
      {active.includes("power") && (
        <group>
          <Block at={[3.95, 0.39, 0.25]} size={[0.39, 0.13, 0.34]} color="#44444c" />
          <mesh position={[3.95, 0.48, 0.25]}><cylinderGeometry args={[0.105, 0.105, 0.06, 24]} /><meshStandardMaterial color="#d8524c" emissive="#e34b43" emissiveIntensity={0.65} /></mesh>
          <mesh position={[3.95, 0.515, 0.25]} rotation={[-Math.PI / 2, 0, 0]}><torusGeometry args={[0.054, 0.009, 8, 20]} /><meshBasicMaterial color="#fff5db" /></mesh>
          <Block at={[4.34, 0.91, -2.19]} size={[0.19, 0.14, 0.04]} color="#e17366" emissive="#cf403e" />
          <PawTrail at={[4.3, 0.033, 0.78]} yaw={2.7} />
          <MischiefAfterimage at={[4.18, 0.09, 0.48]} yaw={-1.5} />
        </group>
      )}
      {active.includes("glass") && (
        <group>
          {disk([-1.2, 0.025, 1.85], 0.37, "#bdd2cf")}
          {Array.from({ length: 7 }, (_, i) => {
            const angle = i * 2.4;
            return (
              <mesh key={i} position={[-1.2 + Math.cos(angle) * (0.12 + i * 0.035), 0.05, 1.85 + Math.sin(angle) * (0.12 + i * 0.035)]} rotation={[Math.PI / 2, angle, 0]}>
                <coneGeometry args={[0.12, 0.025, 3]} />
                <meshStandardMaterial color="#d8f0ee" metalness={0.18} roughness={0.18} transparent opacity={0.8} side={THREE.DoubleSide} />
              </mesh>
            );
          })}
          <mesh position={[-0.97, 0.12, 1.77]} rotation={[0, 0, 1.12]}><cylinderGeometry args={[0.09, 0.07, 0.22, 12]} /><meshStandardMaterial color="#e0f5f1" transparent opacity={0.7} metalness={0.15} /></mesh>
          <PawTrail at={[-0.77, 0.033, 2.24]} yaw={2.6} />
          <MischiefAfterimage at={[-0.78, 0.08, 1.9]} yaw={-1.2} />
        </group>
      )}
      {active.includes("litter") && (
        <group>
          <Block at={[3.95, 0.09, -1.95]} size={[0.82, 0.17, 0.65]} color="#8ba9a0" />
          <Block at={[3.95, 0.18, -1.95]} size={[0.68, 0.03, 0.53]} color="#ddd0b2" />
          <Orb at={[3.83, 0.22, -1.99]} scale={[0.13, 0.07, 0.09]} color="#a08367" />
          <Orb at={[4.05, 0.22, -1.86]} scale={[0.09, 0.06, 0.07]} color="#aa8a6e" />
          <Tube from={[4.36, 0.1, -2.25]} to={[4.47, 0.36, -2.25]} radius={0.024} color="#c49d78" />
          <Block at={[4.49, 0.38, -2.25]} size={[0.19, 0.035, 0.14]} color="#b99172" />
          <PawTrail at={[3.55, 0.033, -1.5]} yaw={-0.35} />
          <MischiefAfterimage at={[3.6, 0.08, -1.78]} yaw={2.4} />
        </group>
      )}
      {active.includes("bowel") && (
        <group>
          <Block at={[-3.45, 0.09, -2.31]} size={[0.24, 0.15, 0.18]} color="#f3eee1" />
          <mesh position={[-3.45, 0.19, -2.31]} rotation={[Math.PI / 2, 0, 0]}><torusGeometry args={[0.105, 0.045, 8, 20]} /><meshStandardMaterial color="#fffaf0" /></mesh>
          <Orb at={[-4.05, 0.94, -1.83]} scale={[0.2, 0.025, 0.2]} color="#d8ad88" transparent opacity={0.6} />
        </group>
      )}
    </group>
  );
}

function Monitor({ x, z, kind, live }: { x: number; z: number; kind: "vts" | "obs"; live: boolean }) {
  const texture = useMemo(() => makeScreenTexture(kind, live), [kind, live]);
  useEffect(() => () => texture.dispose(), [texture]);
  return (
    <group position={[x, 1.25, z]} rotation={[0, kind === "vts" ? -0.12 : 0.1, 0]}>
      <Block at={[0, 0, 0]} size={[0.98, 0.68, 0.07]} color="#44414c" roughness={0.38} />
      <mesh position={[0, 0, 0.042]}><planeGeometry args={[0.89, 0.6]} /><meshStandardMaterial map={texture} emissiveMap={texture} emissive="#ffffff" emissiveIntensity={0.28} roughness={0.38} /></mesh>
      <Block at={[0, -0.43, -0.025]} size={[0.06, 0.2, 0.06]} color="#7c7880" metalness={0.46} />
      <Block at={[0, -0.54, 0.02]} size={[0.37, 0.025, 0.19]} color="#7c7880" metalness={0.46} />
      <Orb at={[0.45, -0.3, 0.05]} scale={[0.015, 0.015, 0.015]} color={live ? "#8ccb9d" : "#d2ba8e"} />
    </group>
  );
}

function Studio({ state, ready }: { state: PrepState; ready: boolean }) {
  const audioDone = state.completed.includes("audio");
  return (
    <group>
      <group position={[0, 0, -0.2]}>
      <Block at={[3.2, 0.73, -1.86]} size={[3.12, 0.13, 0.89]} color="#b18168" />
      {[1.85, 4.55].map((x) => <Block key={x} at={[x, 0.36, -1.86]} size={[0.095, 0.72, 0.68]} color="#805b4b" />)}
      <Monitor x={2.46} z={-2.1} kind="obs" live={state.completed.includes("obs")} />
      <Monitor x={3.65} z={-2.1} kind="vts" live={state.completed.includes("vts")} />
      <Block at={[3.15, 0.83, -1.41]} size={[0.67, 0.044, 0.22]} color="#d8c6c0" />
      {Array.from({ length: 9 }, (_, i) => <Block key={i} at={[2.89 + (i % 5) * 0.105, 0.859, -1.45 + Math.floor(i / 5) * 0.076]} size={[0.075, 0.012, 0.046]} color="#f9f2e8" />)}
      <Orb at={[4.13, 0.83, -1.43]} scale={[0.075, 0.035, 0.1]} color="#ece5db" />
      <Block at={[4.42, 0.97, -2.22]} size={[0.31, 0.46, 0.29]} color="#55505e" />
      <Orb at={[4.42, 1.09, -2.06]} scale={[0.13, 0.13, 0.025]} color="#957ab2" />
      {ready && <Block at={[3.2, 0.69, -1.39]} size={[2.8, 0.04, 0.04]} color="#72dbb0" emissive="#39bc8a" />}
      </group>
      <Block at={[3.51, 0.42, -0.84]} size={[0.7, 0.11, 0.61]} color="#6b6272" />
      <Block at={[3.51, 0.24, -0.89]} size={[0.48, 0.31, 0.08]} color="#6b6272" />
      <Tube from={[3.51, 0.24, -0.9]} to={[3.51, 0.04, -0.9]} radius={0.042} color="#5f5966" metalness={0.35} />
      <group>
      <Block at={[3.55, 0.48, 0.65]} size={[0.86, 0.09, 0.63]} color="#a87661" />
      <Block at={[3.2, 0.24, 0.65]} size={[0.07, 0.47, 0.48]} color="#805b4b" />
      <Block at={[3.9, 0.24, 0.65]} size={[0.07, 0.47, 0.48]} color="#805b4b" />
      <Block at={[3.55, 0.55, 0.65]} size={[0.55, 0.045, 0.42]} color="#69566c" />
      <Block at={[3.55, 0.58, 0.65]} size={[0.46, 0.04, 0.34]} color="#363542" />
      {Array.from({ length: 4 }, (_, i) => (
        <group key={i}>
          <Orb at={[3.36 + (i % 2) * 0.34, 0.61, 0.53 + Math.floor(i / 2) * 0.22]} scale={[0.04, 0.04, 0.04]} color={audioDone ? "#82d6ad" : "#c59abc"} />
          <Block at={[3.41 + (i % 2) * 0.26, 0.614, 0.58 + Math.floor(i / 2) * 0.18]} size={[0.055, 0.01, 0.016]} color="#d6c8d9" />
        </group>
      ))}
      <Tube from={[3.83, 0.62, 0.59]} to={[4.02, 1.14, 0.43]} radius={0.023} color="#50505c" metalness={0.4} />
      <Tube from={[4.02, 1.14, 0.43]} to={[3.72, 1.38, 0.55]} radius={0.023} color="#50505c" metalness={0.4} />
      <Orb at={[3.72, 1.38, 0.55]} scale={[0.12, 0.14, 0.12]} color="#5f5666" />
      </group>
      <Block at={[1.7, 0.78, -2.14]} size={[0.1, 1.5, 0.1]} color="#5b5860" />
      <Orb at={[1.7, 1.62, -2.14]} scale={[0.21, 0.2, 0.21]} color="#efd9ac" transparent opacity={0.85} />
    </group>
  );
}

function Avatar({ state, liveStateRef }: { state: PrepState; liveStateRef: MutableRefObject<PrepState> }) {
  const rig = useRef<THREE.Group>(null);
  const leftArm = useRef<THREE.Group>(null);
  const rightArm = useRef<THREE.Group>(null);
  const leftLeg = useRef<THREE.Group>(null);
  const rightLeg = useRef<THREE.Group>(null);
  const prev = useRef({ x: liveStateRef.current.player.x, z: liveStateRef.current.player.z, moving: 0, initialized: false });
  useFrame(({ clock }, dt) => {
    if (!rig.current) return;
    const { player } = liveStateRef.current;
    const dx = player.x - prev.current.x;
    const dz = player.z - prev.current.z;
    const moving = Math.hypot(dx, dz) > 0.005 ? 1 : 0;
    prev.current.x = player.x;
    prev.current.z = player.z;
    prev.current.moving = THREE.MathUtils.damp(prev.current.moving, moving, 8, dt);
    const snap = !prev.current.initialized || Math.hypot(rig.current.position.x - player.x, rig.current.position.z - player.z) > 0.9;
    prev.current.initialized = true;
    if (snap) {
      rig.current.position.set(player.x, 0.04, player.z);
      rig.current.rotation.y = player.yaw;
    } else {
      rig.current.position.x = THREE.MathUtils.damp(rig.current.position.x, player.x, 18, dt);
      rig.current.position.z = THREE.MathUtils.damp(rig.current.position.z, player.z, 18, dt);
      const yawDelta = Math.atan2(Math.sin(player.yaw - rig.current.rotation.y), Math.cos(player.yaw - rig.current.rotation.y));
      rig.current.rotation.y += yawDelta * (1 - Math.exp(-12 * dt));
    }
    rig.current.position.y = 0.04 + Math.sin(clock.elapsedTime * 11) * prev.current.moving * 0.05;
    const stride = Math.sin(clock.elapsedTime * 11) * prev.current.moving * 0.38;
    if (leftArm.current) leftArm.current.rotation.x = stride;
    if (rightArm.current) rightArm.current.rotation.x = -stride;
    if (leftLeg.current) leftLeg.current.rotation.x = -stride;
    if (rightLeg.current) rightLeg.current.rotation.x = stride;
  });
  const carrying = state.water.cup === "carried-empty" || state.water.cup === "carried-full";
  return (
    <group ref={rig}>
      <mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}><circleGeometry args={[0.28, 24]} /><meshBasicMaterial color="#554565" transparent opacity={0.22} depthWrite={false} /></mesh>
      <group ref={leftLeg} position={[-0.12, 0.61, 0]}>
        <Orb at={[0, -0.27, 0]} scale={[0.12, 0.31, 0.13]} color="#f1d6d5" />
        <Orb at={[0, -0.49, 0.08]} scale={[0.15, 0.09, 0.23]} color="#6b536b" />
      </group>
      <group ref={rightLeg} position={[0.12, 0.61, 0]}>
        <Orb at={[0, -0.27, 0]} scale={[0.12, 0.31, 0.13]} color="#f1d6d5" />
        <Orb at={[0, -0.49, 0.08]} scale={[0.15, 0.09, 0.23]} color="#6b536b" />
      </group>
      <Orb at={[0, 0.84, 0]} scale={[0.36, 0.4, 0.24]} color="#725985" />
      <Orb at={[0, 0.89, 0.19]} scale={[0.28, 0.27, 0.095]} color="#8d6d9d" />
      <Block at={[0, 0.9, 0.29]} size={[0.024, 0.32, 0.018]} color="#e9d3dd" />
      <group ref={leftArm} position={[-0.31, 1.04, 0]}><Orb at={[-0.09, -0.25, 0]} scale={[0.14, 0.31, 0.14]} color="#725985" /><Orb at={[-0.09, -0.49, 0.025]} scale={[0.1, 0.1, 0.09]} color="#ffe1d5" /></group>
      <group ref={rightArm} position={[0.31, 1.04, 0]}><Orb at={[0.09, -0.25, 0]} scale={[0.14, 0.31, 0.14]} color="#725985" /><Orb at={[0.09, -0.49, 0.025]} scale={[0.1, 0.1, 0.09]} color="#ffe1d5" />{carrying && <Cup at={[0.14, -0.58, 0.1]} full={state.water.cup === "carried-full"} />}</group>
      <Orb at={[-0.28, 1.29, -0.02]} scale={[0.12, 0.44, 0.12]} color="#e8e7ef" />
      <Orb at={[0.28, 1.29, -0.02]} scale={[0.12, 0.44, 0.12]} color="#e8e7ef" />
      <Orb at={[0, 1.49, 0]} scale={[0.34, 0.38, 0.31]} color="#f4f1f6" />
      <Orb at={[0, 1.45, 0.2]} scale={[0.285, 0.3, 0.21]} color="#fce1d2" />
      <Orb at={[-0.11, 1.46, 0.398]} scale={[0.033, 0.05, 0.012]} color="#ae4c69" />
      <Orb at={[0.11, 1.46, 0.398]} scale={[0.033, 0.05, 0.012]} color="#ae4c69" />
      <Orb at={[0, 1.35, 0.405]} scale={[0.035, 0.014, 0.01]} color="#c57d7e" />
      <Orb at={[-0.18, 1.38, 0.39]} scale={[0.065, 0.025, 0.01]} color="#eeadad" transparent opacity={0.7} />
      <Orb at={[0.18, 1.38, 0.39]} scale={[0.065, 0.025, 0.01]} color="#eeadad" transparent opacity={0.7} />
      <Orb at={[-0.13, 1.71, 0.17]} scale={[0.18, 0.13, 0.21]} color="#faf9fb" />
      <Orb at={[0.13, 1.7, 0.16]} scale={[0.17, 0.12, 0.2]} color="#faf9fb" />
      <mesh position={[0, 1.74, -0.01]} scale={[1, 0.36, 1]}><sphereGeometry args={[0.39, 18, 12]} /><meshStandardMaterial color="#9e80b8" /></mesh>
      <mesh position={[-0.29, 1.9, -0.015]} rotation={[0, 0, -0.17]}><coneGeometry args={[0.15, 0.37, 4]} /><meshStandardMaterial color="#9476ad" /></mesh>
      <mesh position={[0.29, 1.9, -0.015]} rotation={[0, 0, 0.17]}><coneGeometry args={[0.15, 0.37, 4]} /><meshStandardMaterial color="#9476ad" /></mesh>
      <mesh position={[0, 1.72, 0.13]} scale={[1, 0.25, 1]}><sphereGeometry args={[0.42, 18, 12]} /><meshStandardMaterial color="#b095c8" /></mesh>
      <Orb at={[0.22, 1.76, 0.36]} scale={[0.045, 0.045, 0.018]} color="#e6d79e" metalness={0.5} />
    </group>
  );
}

const markerOffsets: Record<string, { anchor?: Vec3; label: Vec3; side: number }> = {
  thermos: { label: [0.65, 0.78, 0.13], side: 1 },
  dispenser: { label: [-0.48, 0.85, 0.24], side: -1 },
  toilet: { label: [-0.38, 0.78, 0.15], side: -1 },
  food: { label: [-0.5, 0.8, 0.25], side: -1 },
  cat: { label: [-0.55, 0.72, -0.08], side: -1 },
  audio: { label: [0.55, 0.9, 0.25], side: 1 },
  vts: { label: [0.52, 0.8, -0.22], side: 1 },
  obs: { label: [-0.58, 0.75, 0.05], side: -1 },
  spill: { label: [-0.48, 0.72, 0.3], side: -1 },
  cable: { anchor: [-0.53, 0, 0.43], label: [-0.53, 0.75, 0.35], side: -1 },
  catwalk: { anchor: [0.24, 0, -0.18], label: [0.55, 0.86, -0.28], side: 1 },
  power: { anchor: [0.3, 0, 0.12], label: [0.65, 0.85, 0.18], side: 1 },
  glass: { label: [-0.48, 0.72, 0.27], side: -1 },
  litter: { label: [0.45, 0.74, -0.25], side: 1 },
  bowel: { label: [0.5, 0.72, -0.18], side: 1 },
};

type MarkerTone = "pending" | "done" | "selected" | "incident" | "ready";
const markerColors: Record<MarkerTone, string> = {
  pending: "#426d6a",
  done: "#7aab89",
  selected: "#694a88",
  incident: "#d45e48",
  ready: "#448a66",
};

function StationMarker({ id, position, label, done, active, near, selected, ready, suppressed, onClick, player }: {
  id: StationId; position: Vec3; label: string; done: boolean; active: boolean; near: boolean; selected: boolean; ready: boolean; suppressed: boolean;
  player: PrepState["player"]; onClick: (id: StationId) => void;
}) {
  const [hovered, setHovered] = useState(false);
  const ring = useRef<THREE.Mesh>(null);
  const labelSprite = useRef<THREE.Sprite>(null);
  const { camera, size } = useThree();
  const placement = markerOffsets[id] || { label: [0, 0.8, 0] as Vec3, side: 1 };
  const tone: MarkerTone = active ? "incident" : ready ? "ready" : selected ? "selected" : done ? "done" : "pending";
  const color = markerColors[tone];
  const anchor = placement.anchor || [0, 0, 0];
  const markerPosition: Vec3 = [position[0] + anchor[0], position[1], position[2] + anchor[2]];
  const showLabel = selected || hovered || ready || (!suppressed && (!done || near));
  useFrame(({ clock }) => {
    if (ring.current) {
      const pulse = ready || active || selected ? 1 + Math.sin(clock.elapsedTime * 3.8) * 0.07 : 1;
      ring.current.scale.setScalar(pulse);
    }
    if (labelSprite.current && showLabel) {
      const { label: local } = placement;
      let shift = 0;
      const marker = new THREE.Vector3(markerPosition[0] + local[0], local[1], markerPosition[2] + local[2]).project(camera);
      const avatar = new THREE.Vector3(player.x, 1.35, player.z).project(camera);
      const dx = (marker.x - avatar.x) * size.width * 0.5;
      const dy = (marker.y - avatar.y) * size.height * 0.5;
      const { zoom } = camera as THREE.OrthographicCamera;
      if (Math.abs(dx) < 75 && Math.abs(dy) < 92) {
        shift = placement.side * ((75 - Math.abs(dx)) / Math.max(1, zoom) + 0.24);
      }
      const centerX = (marker.x + 1) * size.width * 0.5 + shift * zoom;
      const halfWidth = (tone === "selected" || tone === "incident" ? 1.17 : 1.04) * zoom * 0.5;
      const safeX = halfWidth + 8;
      const centerY = (1 - marker.y) * size.height * 0.5;
      const inView = centerX >= safeX && centerX <= size.width - safeX && centerY >= 22 && centerY <= size.height - 24;
      const keepInView = selected || hovered || active || ready;
      labelSprite.current.visible = keepInView || inView;
      if (keepInView && !inView) {
        shift += (THREE.MathUtils.clamp(centerX, safeX, size.width - safeX) - centerX) / Math.max(1, zoom);
      }
      const right = camera.matrixWorld.elements;
      labelSprite.current.position.set(local[0] + right[0] * shift, local[1], local[2] + right[2] * shift);
    }
  });
  const visible = !INCIDENT_IDS.includes(id as IncidentId) || active;
  if (!visible) return null;
  const click = (event: { stopPropagation: () => void }) => { event.stopPropagation(); onClick(id); };
  const enter = (event: { stopPropagation: () => void }) => { event.stopPropagation(); setHovered(true); document.body.style.cursor = "pointer"; };
  const leave = () => { setHovered(false); document.body.style.cursor = ""; };
  return (
    <group position={markerPosition}>
      <mesh ref={ring} rotation={[-Math.PI / 2, 0, 0]} onClick={click} onPointerOver={enter} onPointerOut={leave}>
        <ringGeometry args={[0.24, active || selected ? 0.34 : 0.3, 32]} />
        <meshBasicMaterial color={color} transparent opacity={done ? 0.55 : 0.95} depthWrite={false} />
      </mesh>
      {selected && (
        <mesh position={[0, 0.012, 0]} rotation={[-Math.PI / 2, 0, 0]} onClick={click} onPointerOver={enter} onPointerOut={leave}>
          <ringGeometry args={[0.37, 0.415, 32]} />
          <meshBasicMaterial color="#ffdc83" depthWrite={false} />
        </mesh>
      )}
      <mesh position={[0, 0.055, 0]} rotation={[-Math.PI / 2, 0, 0]} onClick={click} onPointerOver={enter} onPointerOut={leave}>
        <circleGeometry args={[0.225, 24]} />
        <meshBasicMaterial color={color} transparent opacity={done ? 0.5 : 0.76} depthWrite={false} side={THREE.DoubleSide} />
      </mesh>
      <mesh position={[0, 0.18, 0]}>
        <sphereGeometry args={[active || selected ? 0.09 : 0.065, 12, 9]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={active || selected || ready ? 0.8 : 0.35} />
      </mesh>
      {showLabel && <StationLabel spriteRef={labelSprite} title={ready ? "开始直播" : label} tone={tone} onClick={click} onPointerOver={enter} onPointerOut={leave} />}
      <mesh position={[0, 0.32, 0]} onClick={click} onPointerOver={enter} onPointerOut={leave}>
        <cylinderGeometry args={[0.18, 0.18, 0.62, 10]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} color="#ffffff" />
      </mesh>
    </group>
  );
}

function StationLabel({ title, tone, onClick, onPointerOver, onPointerOut, spriteRef }: {
  title: string; tone: MarkerTone; onClick: (event: { stopPropagation: () => void }) => void;
  onPointerOver: (event: { stopPropagation: () => void }) => void; onPointerOut: () => void;
  spriteRef: MutableRefObject<THREE.Sprite | null>;
}) {
  const texture = useMemo(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 384;
    canvas.height = 112;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      const color = markerColors[tone];
      ctx.fillStyle = tone === "done" ? "#e5efe7" : "#fffaf1";
      ctx.strokeStyle = color;
      ctx.lineWidth = 7;
      ctx.beginPath(); ctx.roundRect(7, 9, 370, 92, 17); ctx.fill(); ctx.stroke();
      ctx.fillStyle = color;
      ctx.beginPath(); ctx.arc(51, 55, 25, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#ffffff";
      ctx.font = 'bold 33px "Microsoft YaHei", sans-serif';
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(tone === "done" ? "✓" : tone === "incident" ? "!" : tone === "selected" ? "›" : "•", 51, 53);
      ctx.fillStyle = tone === "done" ? "#486b59" : "#302e35";
      ctx.font = `bold ${title.length > 5 ? 28 : 32}px "Microsoft YaHei", sans-serif`;
      ctx.textAlign = "left";
      ctx.fillText(title, 91, 55, 270);
    }
    const result = new THREE.CanvasTexture(canvas);
    result.colorSpace = THREE.SRGBColorSpace;
    return result;
  }, [title, tone]);
  useEffect(() => () => texture.dispose(), [texture]);
  return <sprite ref={spriteRef} scale={[tone === "selected" || tone === "incident" ? 1.17 : 1.04, 0.31, 1]} onClick={onClick} onPointerOver={onPointerOver} onPointerOut={onPointerOut}><spriteMaterial map={texture} transparent depthTest={false} /></sprite>;
}

const stationBodyTargets: Record<string, { at: Vec3; size: Vec3 }> = {
  thermos: { at: [3.03, 0.65, 1.64], size: [0.24, 0.48, 0.24] },
  dispenser: { at: [-0.6, 0.84, 2.25], size: [0.56, 1.68, 0.51] },
  toilet: { at: [-4.05, 0.64, -1.83], size: [0.72, 1.25, 0.75] },
  food: { at: [-3.68, 1.06, 1.76], size: [0.64, 0.28, 0.48] },
  cat: { at: [2.35, 0.15, -1.35], size: [0.48, 0.28, 0.48] },
  audio: { at: [3.55, 0.58, 0.65], size: [0.58, 0.24, 0.5] },
  vts: { at: [3.65, 1.25, -2.1], size: [0.88, 0.63, 0.12] },
  obs: { at: [2.46, 1.25, -2.1], size: [0.88, 0.63, 0.12] },
  spill: { at: [0.15, 0.11, 0.25], size: [0.65, 0.2, 0.65] },
  cable: { at: [3, 0.19, 0.15], size: [0.4, 0.3, 0.35] },
  catwalk: { at: [3.1, 0.99, -1.6], size: [0.65, 0.45, 0.52] },
  power: { at: [3.95, 0.56, 0.25], size: [0.38, 0.3, 0.38] },
  glass: { at: [-1.2, 0.13, 1.85], size: [0.65, 0.24, 0.65] },
  litter: { at: [3.95, 0.17, -1.95], size: [0.77, 0.31, 0.62] },
  bowel: { at: [-3.7, 0.68, -2.2], size: [0.75, 1.22, 0.85] },
};

function StationBodyHit({ id, onClick }: { id: StationId; onClick: (id: StationId) => void }) {
  const target = stationBodyTargets[id];
  if (!target) return null;
  return (
    <mesh
      position={target.at}
      onClick={(event) => { event.stopPropagation(); onClick(id); }}
      onPointerOver={(event) => { event.stopPropagation(); document.body.style.cursor = "pointer"; }}
      onPointerOut={() => { document.body.style.cursor = ""; }}
    >
      <boxGeometry args={target.size} />
      <meshBasicMaterial transparent opacity={0} depthWrite={false} />
    </mesh>
  );
}

function CameraRig({ liveStateRef }: { liveStateRef: MutableRefObject<PrepState> }) {
  const { camera, size } = useThree();
  const center = useRef(new THREE.Vector3());
  const target = useRef(new THREE.Vector3());
  const initialized = useRef(false);
  const offset = useMemo(() => new THREE.Vector3(9, 12, 16), []);
  useEffect(() => {
    if (camera instanceof THREE.OrthographicCamera) {
      camera.zoom = size.height / (size.width < 680 ? 8.5 : 9.2);
      camera.updateProjectionMatrix();
    }
  }, [camera, size.height, size.width]);
  useFrame((_, dt) => {
    const mobile = size.width < 680;
    const { player } = liveStateRef.current;
    target.current.set(player.x * (mobile ? 0.91 : 0.09), 0, player.z * (mobile ? 0.86 : 0.07));
    if (!initialized.current || center.current.distanceTo(target.current) > 1.5) center.current.copy(target.current);
    else center.current.lerp(target.current, 1 - Math.exp(-(mobile ? 6 : 2.8) * dt));
    initialized.current = true;
    camera.position.copy(center.current).add(offset);
    camera.lookAt(center.current);
  });
  return null;
}

function Room({ state, liveStateRef, selectedStation, onStationClick }: { state: PrepState; liveStateRef: MutableRefObject<PrepState>; selectedStation?: StationId | null; onStationClick: (id: StationId) => void }) {
  const incidents = state.incidents.active;
  const activeIncidentStations = STATIONS.filter(station => incidents.includes(station.id as (typeof incidents)[number]));
  const readyToGoLive = state.phase === "explore" && state.completed.length === TASK_IDS.length &&
    incidents.length === 0 && state.incidents.queue.length === 0 && state.incidents.resolved.length === state.level;
  return (
    <>
      <color attach="background" args={["#d8d9d4"]} />
      <ambientLight intensity={0.92} color="#eef4f3" />
      <hemisphereLight intensity={1.2} color="#fff4e3" groundColor="#9f8c82" />
      <directionalLight position={[-3, 8, 6]} intensity={2.15} color="#fff3df" castShadow shadow-mapSize-width={1024} shadow-mapSize-height={1024} shadow-camera-left={-8} shadow-camera-right={8} shadow-camera-top={7} shadow-camera-bottom={-7} shadow-normalBias={0.03} />
      <pointLight position={[3.7, 2.5, -1.8]} intensity={0.95} distance={6} color="#d5b5ed" />
      <Architecture />
      <Kitchen />
      <LivingRoom />
      <Bedroom />
      <Bathroom state={state} />
      <Dispenser state={state} />
      <Thermos state={state} />
      <Studio state={state} ready={readyToGoLive} />
      <CatBowl state={state} />
      <RoamingCat liveStateRef={liveStateRef} />
      <Avatar state={state} liveStateRef={liveStateRef} />
      <IncidentScenes active={incidents} />
      {state.phase === "explore" && STATIONS.map((station) => {
        const waterStation = station.id === "thermos" || station.id === "dispenser";
        const done = state.completed.includes(waterStation ? "water" : station.id as (typeof state.completed)[number]) || state.incidents.resolved.includes(station.id as (typeof state.incidents.resolved)[number]);
        const distance = Math.hypot(station.x - state.player.x, station.z - state.player.z);
        const incidentHasPriority = !incidents.includes(station.id as (typeof incidents)[number]) && activeIncidentStations.some(active => Math.hypot(station.x - active.x, station.z - active.z) < 1.85);
        const active = incidents.includes(station.id as IncidentId);
        if (INCIDENT_IDS.includes(station.id as IncidentId) && !active) return null;
        return (
          <group key={station.id}>
            <StationMarker
              id={station.id}
              position={[station.x, 0.035, station.z]}
              label={station.label}
              done={done}
              active={active}
              near={distance < 1.45 && !incidentHasPriority}
              selected={selectedStation === station.id}
              suppressed={incidentHasPriority}
              ready={station.id === "obs" && readyToGoLive}
              player={state.player}
              onClick={onStationClick}
            />
            <StationBodyHit id={station.id} onClick={onStationClick} />
          </group>
        );
      })}
      <CameraRig liveStateRef={liveStateRef} />
    </>
  );
}

type World3DProps = {
  state: PrepState;
  liveStateRef: MutableRefObject<PrepState>;
  selectedStation?: StationId | null;
  onStationClick: (id: StationId) => void;
  onReady?: () => void;
};

export default function World3D({ state, liveStateRef, selectedStation, onStationClick, onReady }: World3DProps) {
  return (
    <Canvas
      shadows
      orthographic
      camera={{ position: [9, 12, 16], near: 0.1, far: 65, zoom: 70 }}
      dpr={[1, 1.5]}
      gl={{ antialias: true, alpha: false, powerPreference: "high-performance" }}
      style={{ width: "100%", height: "100%", touchAction: "none" }}
      onCreated={() => onReady?.()}
      fallback={<div>请开启浏览器硬件加速以显示 3D 公寓。</div>}
    >
      <Room state={state} liveStateRef={liveStateRef} selectedStation={selectedStation} onStationClick={onStationClick} />
    </Canvas>
  );
}
