"use client";

import { useRef, type RefObject } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import type { SceneId } from "../sceneRouter";
import { Box, useCanvasTexture, type Vec3 } from "./kit";

export const PHONE_POSITIONS: Partial<Record<SceneId, Vec3>> = {
  office: [0.48, 0.797, -0.03],
  "meeting-room": [0.48, 0.797, -0.03],
  room: [-0.62, 0.51, 0.65],
  home: [-2.3, 0.53, -0.2],
  "parent-home": [0.4, 0.51, 0.85],
  commute: [0.5, 1.05, 4.8],
};

export default function ScenePhone({ scene, unread, preview, onOpen, anchorRef, clock }: { scene: SceneId; unread: number; preview: string; onOpen: () => void; anchorRef: RefObject<HTMLButtonElement>; clock: string }) {
  const { camera, size } = useThree();
  const position = PHONE_POSITIONS[scene];
  const texture = useCanvasTexture(`phone-${unread}-${preview}-${clock}`, (ctx, w, h) => {
    const gradient = ctx.createLinearGradient(0, 0, w, h);
    gradient.addColorStop(0, "#254c59"); gradient.addColorStop(1, "#86a99f");
    ctx.fillStyle = gradient; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = "#e7f6ee"; ctx.textAlign = "center";
    ctx.font = "300 48px sans-serif"; ctx.fillText(clock, w / 2, 104);
    ctx.fillStyle = "#eff6ef"; ctx.fillRect(16, 145, w - 32, 130);
    ctx.fillStyle = "#48a46d"; ctx.fillRect(30, 163, 32, 32);
    ctx.textAlign = "left"; ctx.font = "600 21px Microsoft YaHei"; ctx.fillStyle = "#26473f"; ctx.fillText(`微信 · ${unread || "暂无"}条新消息`, 30, 228, w - 60);
    ctx.font = "18px Microsoft YaHei"; ctx.fillText(preview.slice(0, 12), 30, 255, w - 60);
    ctx.fillStyle = "#d8e8df"; ctx.fillRect(80, h - 18, w - 160, 4);
  }, 256, 480);
  const projected = useRef(new THREE.Vector3());
  useFrame(() => {
    if (!anchorRef.current || !position) return;
    projected.current.set(...position).project(camera);
    const x = ((projected.current.x + 1) * size.width) / 2;
    const y = ((1 - projected.current.y) * size.height) / 2;
    anchorRef.current.style.left = `${Math.max(94, Math.min(size.width - 94, x))}px`;
    anchorRef.current.style.top = `${Math.max(200, Math.min(size.height - 155, y - 26))}px`;
  });
  if (!position) return null;
  const handheld = scene === "commute";
  return (
    <group position={position} rotation={[handheld ? -0.25 : -Math.PI / 2, 0, handheld ? -0.12 : 0.12]} onClick={event => { event.stopPropagation(); onOpen(); }}>
        <Box position={[0, 0, 0]} size={[0.17, 0.31, 0.018]} color="#252d32" metalness={0.4} roughness={0.3} />
        <mesh position={[0, 0, 0.011]}><planeGeometry args={[0.151, 0.286]} /><meshBasicMaterial map={texture} /></mesh>
        <Box position={[0, 0.132, 0.014]} size={[0.045, 0.012, 0.002]} color="#17262a" />
        {handheld && <Box position={[0, -0.16, -0.025]} size={[0.19, 0.14, 0.06]} color="#d9b496" rotation={[0, 0, 0.15]} />}
      </group>
  );
}
