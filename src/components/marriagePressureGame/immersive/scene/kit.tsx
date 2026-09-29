"use client";

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useThree, type ThreeEvent } from "@react-three/fiber";
import * as THREE from "three";
import type { Hotspot } from "../sceneRouter";

export type Vec3 = [number, number, number];

// 场景中可点击物件的共享上下文：DOM 按钮与 3D 物件走同一个回调
interface HotContextValue {
  hotspots: Record<string, Hotspot>;
  hovered: string | null;
  setHovered: (id: string | null) => void;
  onHotspot: (id: string) => void;
}

export const HotContext = createContext<HotContextValue>({
  hotspots: {},
  hovered: null,
  setHovered: () => undefined,
  onHotspot: () => undefined,
});

export function Box({ position, size, color, rotation, roughness = 0.85, metalness = 0, emissive, opacity }: {
  position: Vec3;
  size: Vec3;
  color: string;
  rotation?: Vec3;
  roughness?: number;
  metalness?: number;
  emissive?: string;
  opacity?: number;
}) {
  return (
    <mesh position={position} rotation={rotation} castShadow receiveShadow>
      <boxGeometry args={size} />
      <meshStandardMaterial
        color={color}
        roughness={roughness}
        metalness={metalness}
        emissive={emissive ?? "#000000"}
        emissiveIntensity={emissive ? 0.8 : 0}
        transparent={opacity !== undefined}
        opacity={opacity ?? 1}
        flatShading
      />
    </mesh>
  );
}

export function Cyl({ position, radius, height, color, segments = 10, rotation, top }: {
  position: Vec3;
  radius: number;
  height: number;
  color: string;
  segments?: number;
  rotation?: Vec3;
  top?: number;
}) {
  return (
    <mesh position={position} rotation={rotation} castShadow receiveShadow>
      <cylinderGeometry args={[top ?? radius, radius, height, segments]} />
      <meshStandardMaterial color={color} roughness={0.8} flatShading />
    </mesh>
  );
}

export function Ball({ position, radius, color, emissive }: { position: Vec3; radius: number; color: string; emissive?: boolean }) {
  return (
    <mesh position={position} castShadow>
      <icosahedronGeometry args={[radius, 0]} />
      <meshStandardMaterial color={color} emissive={emissive ? color : "#000000"} emissiveIntensity={emissive ? 0.9 : 0} flatShading />
    </mesh>
  );
}

// 用 Canvas 画出招牌、屏幕等带字的贴图
export function useCanvasTexture(key: string, draw: (context: CanvasRenderingContext2D, width: number, height: number) => void, width = 256, height = 128) {
  const texture = useMemo(() => {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (context) draw(context, width, height);
    const result = new THREE.CanvasTexture(canvas);
    result.colorSpace = THREE.SRGBColorSpace;
    return result;
    // key 决定何时重绘；draw 每次渲染都是新函数
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, width, height]);
  useEffect(() => () => texture.dispose(), [texture]);
  return texture;
}

export function Sign({ position, size, text, background, color = "#fff8ea", rotation, glow = false, font = 64 }: {
  position: Vec3;
  size: [number, number];
  text: string;
  background: string;
  color?: string;
  rotation?: Vec3;
  glow?: boolean;
  font?: number;
}) {
  const texture = useCanvasTexture(`${text}-${background}-${color}-${font}`, (context, width, height) => {
    context.fillStyle = background;
    context.fillRect(0, 0, width, height);
    context.fillStyle = color;
    context.font = `700 ${font}px "Noto Sans SC", "Microsoft YaHei", sans-serif`;
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText(text, width / 2, height / 2 + 4, width - 20);
  });
  return (
    <mesh position={position} rotation={rotation}>
      <planeGeometry args={size} />
      <meshStandardMaterial map={texture} emissive={glow ? "#ffffff" : "#000000"} emissiveMap={glow ? texture : null} emissiveIntensity={glow ? 0.7 : 0} />
    </mesh>
  );
}

export interface FigureLook {
  shirt: string;
  pants?: string;
  skin?: string;
  hair?: string;
  hairLong?: boolean;
}

// 父母、同事、亲戚等非立绘角色使用的低模人偶
export function Figure({ position, look, rotation = 0, seated = false, scale = 1, holding }: {
  position: Vec3;
  look: FigureLook;
  rotation?: number;
  seated?: boolean;
  scale?: number;
  holding?: "phone" | "cup" | "bag";
}) {
  const skin = look.skin ?? "#e9c3a0";
  const hair = look.hair ?? "#2b2522";
  const pants = look.pants ?? "#3b3f4a";
  const legY = seated ? 0.45 : 0.42;
  return (
    <group position={position} rotation={[0, rotation, 0]} scale={scale}>
      {seated ? (
        <>
          <Box position={[0, 0.47, 0.18]} size={[0.34, 0.14, 0.42]} color={pants} />
          <Box position={[-0.09, 0.22, 0.38]} size={[0.12, 0.44, 0.12]} color={pants} />
          <Box position={[0.09, 0.22, 0.38]} size={[0.12, 0.44, 0.12]} color={pants} />
        </>
      ) : (
        <>
          <Box position={[-0.09, legY, 0]} size={[0.13, 0.84, 0.14]} color={pants} />
          <Box position={[0.09, legY, 0]} size={[0.13, 0.84, 0.14]} color={pants} />
        </>
      )}
      <mesh position={[0, seated ? 0.82 : 1.12, 0]} scale={[1, 1, 0.7]} castShadow><capsuleGeometry args={[0.2, 0.22, 6, 16]} /><meshStandardMaterial color={look.shirt} roughness={0.9} /></mesh>
      {[-1, 1].map(side => (
<group key={side} position={[side * 0.23, seated ? 0.83 : 1.1, 0.05]} rotation={[seated || holding ? -0.85 : 0, 0, -side * 0.12]}>
        <mesh castShadow><capsuleGeometry args={[0.067, 0.29, 6, 12]} /><meshStandardMaterial color={look.shirt} /></mesh>
        <mesh position={[0, -0.22, 0]}><sphereGeometry args={[0.065, 12, 10]} /><meshStandardMaterial color={skin} /></mesh>
      </group>
))}
      <Cyl position={[0, seated ? 1.12 : 1.42, 0]} radius={0.065} height={0.12} color={skin} segments={16} />
      <group position={[0, seated ? 1.26 : 1.56, 0]}>
        <mesh castShadow>
          <sphereGeometry args={[0.17, 24, 18]} />
          <meshStandardMaterial color={skin} roughness={0.85} />
        </mesh>
        {/* 头发只盖住头顶和后脑，正面留出脸 */}
        <mesh position={[0, 0.05, -0.025]} scale={[1.08, 0.72, 1.08]} castShadow>
          <sphereGeometry args={[0.175, 24, 16, 0, Math.PI * 2, 0, Math.PI * 0.55]} />
          <meshStandardMaterial color={hair} roughness={0.85} />
        </mesh>
        {look.hairLong && <Box position={[0, -0.1, -0.11]} size={[0.3, 0.32, 0.07]} color={hair} />}
        <Box position={[-0.055, 0.0, 0.15]} size={[0.03, 0.035, 0.02]} color="#2b2522" />
        <Box position={[0.055, 0.0, 0.15]} size={[0.03, 0.035, 0.02]} color="#2b2522" />
        <Box position={[0, -0.07, 0.152]} size={[0.06, 0.012, 0.01]} color="#b0605a" />
        {[-0.09, 0.09].map(x => <mesh key={x} position={[x, -0.045, 0.143]} scale={[1, 0.5, 0.18]}><sphereGeometry args={[0.037, 12, 8]} /><meshStandardMaterial color="#dfab96" /></mesh>)}
      </group>
      {holding === "phone" && <Box position={[0, seated ? 0.95 : 1.25, 0.3]} size={[0.09, 0.16, 0.02]} color="#1b1c20" emissive="#6fb8ff" />}
      {holding === "cup" && <Cyl position={[0.22, seated ? 0.95 : 1.25, 0.28]} radius={0.05} height={0.1} color="#f2eee6" />}
      {holding === "bag" && <Box position={[0.3, 0.8, 0]} size={[0.08, 0.3, 0.3]} color="#7a5a3c" />}
    </group>
  );
}

// 立绘立牌：候选人与伴侣用原有立绘贴在一块竖板上
export function PortraitBillboard({ image, position, height = 1.7, rotation = 0, tint }: {
  image: string;
  position: Vec3;
  height?: number;
  rotation?: number;
  tint?: string;
}) {
  const invalidate = useThree(state => state.invalidate);
  const [texture, setTexture] = useState<THREE.Texture | null>(null);
  useEffect(() => {
    let cancelled = false;
    const loader = new THREE.TextureLoader();
    loader.load(encodeURI(image), loaded => {
      if (cancelled) { loaded.dispose(); return; }
      loaded.colorSpace = THREE.SRGBColorSpace;
      setTexture(loaded);
      invalidate();
    });
    return () => { cancelled = true; };
  }, [image, invalidate]);
  useEffect(() => () => texture?.dispose(), [texture]);
  const source = texture?.image as { width?: number; height?: number } | undefined;
  const aspect = source?.width && source?.height ? source.width / source.height : 0.62;
  const width = height * Math.min(1.2, aspect);
  return (
    <group position={position} rotation={[0, rotation, 0]}>
      <mesh position={[0, 0.01, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[width * 0.42, 20]} />
        <meshBasicMaterial color="#000000" transparent opacity={0.22} />
      </mesh>
      {texture && (
        <>
          {/* 立牌的白边与底座，让立绘看起来像一块真实的展板 */}
          <Box position={[0, height / 2, -0.02]} size={[width + 0.08, height + 0.08, 0.03]} color="#fbf8f1" />
          <Box position={[0, 0.03, 0.02]} size={[width * 0.6, 0.06, 0.24]} color="#6a6f78" />
          <mesh position={[0, height / 2, 0.001]}>
            <planeGeometry args={[width, height]} />
            <meshStandardMaterial map={texture} transparent alphaTest={0.08} color={tint ?? "#ffffff"} roughness={1} />
          </mesh>
        </>
      )}
    </group>
  );
}

// 可点击物件：悬停高亮，旁边浮一个小标记；不可用时变灰且不响应
export function Hot({ id, children, marker }: { id: string; children: ReactNode; marker: Vec3 }) {
  const { hotspots, hovered, setHovered, onHotspot } = useContext(HotContext);
  const spot = hotspots[id];
  if (!spot) return <group>{children}</group>;
  const active = hovered === id;
  const handleOver = (event: ThreeEvent<PointerEvent>) => {
    event.stopPropagation();
    setHovered(id);
    document.body.style.cursor = spot.enabled ? "pointer" : "not-allowed";
  };
  const handleOut = () => {
    setHovered(null);
    document.body.style.cursor = "";
  };
  return (
    <group
      onPointerOver={handleOver}
      onPointerOut={handleOut}
      onClick={event => { event.stopPropagation(); if (spot.enabled) onHotspot(id); }}
    >
      {children}
      <mesh position={marker}>
        <sphereGeometry args={[active ? 0.028 : 0.016, 12, 8]} />
        <meshStandardMaterial
          color={spot.enabled ? active ? "#ffe08a" : "#f4c35a" : "#8c8780"}
          emissive={spot.enabled ? "#f4a52a" : "#000000"}
          emissiveIntensity={spot.enabled ? active ? 1.2 : 0.6 : 0}
          flatShading
        />
      </mesh>
    </group>
  );
}

export function Floor({ size, color, y = 0 }: { size: [number, number]; color: string; y?: number }) {
  return (
    <mesh position={[0, y, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
      <planeGeometry args={size} />
      <meshStandardMaterial color={color} roughness={0.95} />
    </mesh>
  );
}

// 一扇窗：窗框加一块自发光的“外景”
export function Window({ position, size, sky, rotation }: { position: Vec3; size: [number, number]; sky: string; rotation?: Vec3 }) {
  return (
    <group position={position} rotation={rotation}>
      <mesh>
        <planeGeometry args={size} />
        <meshBasicMaterial color={sky} />
      </mesh>
      <Box position={[0, 0, 0.02]} size={[size[0] + 0.1, 0.06, 0.06]} color="#e9e4da" />
      <Box position={[0, size[1] / 2, 0.02]} size={[size[0] + 0.1, 0.06, 0.06]} color="#e9e4da" />
      <Box position={[0, -size[1] / 2, 0.02]} size={[size[0] + 0.1, 0.06, 0.06]} color="#e9e4da" />
      <Box position={[0, 0, 0.02]} size={[0.06, size[1], 0.06]} color="#e9e4da" />
    </group>
  );
}
