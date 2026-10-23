"use client";

import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as T from "three";
import { terrainHeight } from "./terrain";
import { eveningFrame, SCREEN } from "./evening";
import type { Game } from "./simulation";

function postcard(card: string) {
  const canvas = document.createElement("canvas");
  canvas.width = 960;
  canvas.height = 480;
  const c = canvas.getContext("2d")!;
  c.fillStyle = "#152f37";
  c.fillRect(0, 0, 960, 480);
  const titles: Record<string, string> = { street: "锅沿的节拍", bridge: "桥头的远行", river: "留给明天的水声", together: "明天，还在这里。", waiting: "江风有回音" };
  c.fillStyle = "#d8ba79";
  c.font = "16px sans-serif";
  c.fillText("LIUZHOU / A POSTCARD OF TODAY", 62, 52);
  if (card === "street") {
    for (let i = 0; i < 6; i++) {
      c.fillStyle = i % 2 ? "#b79a74" : "#78978b";
      c.fillRect(74 + i * 140, 100 + (i % 2) * 25, 115, 170);
      c.fillStyle = "#304d4b";
      for (let j = 0; j < 3; j++) c.fillRect(86 + i * 140 + j * 32, 135 + (i % 2) * 25, 18, 62);
    }
    c.fillStyle = "#e1ca95";
    c.beginPath(); c.ellipse(480, 260, 130, 35, 0, 0, Math.PI); c.fill();
    c.strokeStyle = "#e1ca95"; c.lineWidth = 4;
    for (let i = 0; i < 3; i++) { c.beginPath(); c.moveTo(440 + i * 40, 215); c.bezierCurveTo(420 + i * 40, 180, 470 + i * 40, 170, 445 + i * 40, 140); c.stroke(); }
  } else if (card === "bridge" || card === "river") {
    c.fillStyle = "#345e5c";
    c.beginPath(); c.moveTo(0, 250); c.lineTo(120, 155); c.lineTo(230, 230); c.lineTo(350, 140); c.lineTo(530, 260); c.lineTo(720, 175); c.lineTo(960, 250); c.closePath(); c.fill();
    c.strokeStyle = "#7da997"; c.lineWidth = 3;
    for (let row = 0; row < 5; row++) { c.beginPath(); c.moveTo(50 + row * 23, 278 + row * 10); c.bezierCurveTo(280, 260 + row * 12, 650, 290 + row * 10, 910 - row * 33, 275 + row * 10); c.stroke(); }
    if (card === "bridge") {
      c.strokeStyle = "#d78268"; c.lineWidth = 7;
      c.beginPath(); c.moveTo(100, 250); c.lineTo(860, 250); c.stroke();
      for (let span = 0; span < 3; span++) {
        c.beginPath(); c.moveTo(100 + span * 253, 248); c.bezierCurveTo(150 + span * 253, 85, 300 + span * 253, 85, 353 + span * 253, 248); c.stroke();
      }
    }
  } else {
    const colors = ["#a288c5", "#e7d3ab", "#eee5d8", "#73a4bf"];
    colors.forEach((color, i) => {
      c.fillStyle = color;
      c.beginPath(); c.arc(300 + i * 120, 170, 25, 0, Math.PI * 2); c.fill();
      c.fillRect(275 + i * 120, 203, 50, 70);
    });
    c.strokeStyle = "#8baa92"; c.lineWidth = 2;
    c.beginPath(); c.moveTo(100, 290); c.quadraticCurveTo(480, 340, 860, 290); c.stroke();
  }
  c.fillStyle = "#f2e1b0";
  c.font = "38px serif";
  c.fillText(titles[card], 62, 390);
  c.font = "18px sans-serif";
  c.fillStyle = "#91b6a7";
  c.fillText(card === "waiting" ? "岁己 · 栞栞 · 米汀 · 七海 / 今晚，东门见" : "声音明信片 / 我们在这座城里，留下今天", 65, 432);
  const texture = new T.CanvasTexture(canvas);
  texture.colorSpace = T.SRGBColorSpace;
  return texture;
}
function Part({ at, size, color }: { at: [number, number, number]; size: [number, number, number]; color: string }) {
  return <mesh position={at} castShadow receiveShadow><boxGeometry args={size} /><meshStandardMaterial color={color} roughness={0.85} /></mesh>;
}
export default function EveningStage({ game }: { game: Game }) {
  const root = useRef<T.Group>(null);
  const screen = useRef<T.MeshBasicMaterial>(null);
  const glow = useRef<T.PointLight>(null);
  const textures = useMemo(() => Object.fromEntries(["waiting", "street", "bridge", "river", "together"].map(card => [card, postcard(card)])), []);
  useEffect(() => () => Object.values(textures).forEach(t => t.dispose()), [textures]);
  useFrame(() => {
    if (root.current) root.current.visible = game.evening.started;
    const card = game.evening.watching ? eveningFrame(game.evening).card : game.evening.completed ? "together" : "waiting";
    if (screen.current && screen.current.map !== textures[card]) { screen.current.map = textures[card]; screen.current.needsUpdate = true; }
    if (glow.current) glow.current.intensity = game.evening.watching ? 7 : 2;
  });
  return (
    <group ref={root} position={[SCREEN.x, terrainHeight(SCREEN), SCREEN.z]}>
      <Part at={[0, 0.07, 3]} size={[15, 0.14, 9]} color="#7a7964" />
      {[-1, 1].map(side => (
<group key={side}>
        <Part at={[side * 5.3, 2.9, 0]} size={[0.13, 5.8, 0.15]} color="#625c4e" />
        <Part at={[side * 5.3, 0.15, 0]} size={[1.8, 0.3, 1.4]} color="#666c5c" />
        <Part at={[side * 6.4, 0.85, 1.3]} size={[0.85, 1.7, 0.8]} color="#293d3d" />
        {[0.55, 1.25].map(y => <mesh key={y} position={[side * 6.4, y, 1.71]} rotation={[Math.PI / 2, 0, 0]}><cylinderGeometry args={[0.25, 0.25, 0.04, 16]} /><meshStandardMaterial color="#526561" /></mesh>)}
        <Part at={[side * 7, 2.3, 1]} size={[0.08, 4.6, 0.08]} color="#625c4e" />
        <mesh position={[side * 7, 4.5, 1]}><sphereGeometry args={[0.24, 10, 8]} /><meshBasicMaterial color="#ffd793" /></mesh>
      </group>
))}
      <Part at={[0, 5.7, 0]} size={[10.8, 0.14, 0.2]} color="#625c4e" />
      <Part at={[0, 3.1, 0.02]} size={[10.3, 5.25, 0.12]} color="#e6dcb5" />
      <mesh position={[0, 3.1, 0.1]}><planeGeometry args={[10, 5]} /><meshBasicMaterial ref={screen} map={textures.waiting} toneMapped={false} /></mesh>
      <pointLight ref={glow} position={[0, 4.5, 5]} color="#f6d8a4" intensity={2} distance={24} decay={1.4} />
      <Part at={[0, 0.65, 12]} size={[0.7, 1.3, 0.6]} color="#6c725e" />
      <Part at={[0, 1.4, 12]} size={[1, 0.3, 0.7]} color="#d3c8a5" />
      <mesh position={[0, 1.4, 11.62]}><circleGeometry args={[0.12, 12]} /><meshBasicMaterial color="#fff2bf" side={T.DoubleSide} /></mesh>
    </group>
  );
}
