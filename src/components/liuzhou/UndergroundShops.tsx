"use client";

import { memo, useEffect, useMemo } from "react";
import * as T from "three";
import { UNDERGROUND_SHOPS, undergroundLevel } from "./underground";

// Generic display artwork, not a survey of tenants or present-day businesses.
const STYLES = [
  { label: "书 屋", color: "#49655e", paper: "#efdfb8" },
  { label: "衣 橱", color: "#93665d", paper: "#eedad2" },
  { label: "茶 饮", color: "#657b54", paper: "#e4e5c6" },
  { label: "鞋 包", color: "#886b49", paper: "#f1dfbc" },
  { label: "日 用", color: "#627c87", paper: "#d9e7e6" },
  { label: "修 理", color: "#626575", paper: "#e2e0d5" },
  { label: "轻 食", color: "#a47742", paper: "#f4dfb4" },
  { label: "城 市 小 礼", color: "#77715c", paper: "#ebe1c4" },
];

function shopAtlas() {
  const canvas = document.createElement("canvas"); canvas.width = 2048; canvas.height = 1024;
  const c = canvas.getContext("2d")!;
  STYLES.forEach((style, kind) => {
    c.save(); c.translate((kind % 4) * 512, Math.floor(kind / 4) * 512);
    c.fillStyle = style.color; c.fillRect(0, 0, 512, 512);
    c.strokeStyle = style.paper; c.lineWidth = 2; c.strokeRect(8, 7, 496, 52);
    c.fillStyle = style.paper; c.textAlign = "center"; c.textBaseline = "middle";
    c.font = 'bold 34px "Microsoft YaHei", sans-serif'; c.fillText(style.label, 256, 34, 470);
    c.translate(0, 96);
    c.fillStyle = style.paper; c.fillRect(0, 0, 512, 256);
    c.fillStyle = "#f7efd9"; c.fillRect(12, 10, 488, 24);
    c.fillStyle = style.color; c.fillRect(14, 238, 484, 18);
    c.lineWidth = 4; c.strokeStyle = style.color;
    const shelf = (y: number) => { c.fillStyle = "#a58e6d"; c.fillRect(28, y, 456, 7); };
    const cup = (x: number, y: number, color: string) => {
      c.fillStyle = color; c.beginPath(); c.moveTo(x, y); c.lineTo(x + 33, y); c.lineTo(x + 29, y + 44); c.lineTo(x + 4, y + 44); c.closePath(); c.fill();
      c.fillStyle = "#efe3c5"; c.fillRect(x - 2, y - 4, 37, 6);
      c.strokeStyle = "#745d46"; c.lineWidth = 3; c.beginPath(); c.moveTo(x + 22, y + 4); c.lineTo(x + 27, y - 20); c.stroke();
    };
    if (kind === 0) {
      for (const y of [105, 174, 235]) {
        for (let n = 0; n < 23; n++) {
          const h = 33 + ((n * 11 + y) % 20);
          c.fillStyle = ["#9d6656", "#69847b", "#d1ab6c", "#747b98", "#c4bb99"][n % 5]; c.fillRect(32 + n * 19, y - h, 14, h);
          c.fillStyle = "#e5d9b9"; c.fillRect(35 + n * 19, y - h + 7, 8, 2);
        }
        shelf(y);
      }
    } else if (kind === 1) {
      c.fillStyle = "#9e8b75"; c.fillRect(30, 57, 452, 5);
      for (let n = 0; n < 7; n++) {
        const x = 53 + n * 65;
        c.strokeStyle = "#6e6b5f"; c.lineWidth = 2; c.beginPath(); c.moveTo(x, 62); c.lineTo(x, 76); c.lineTo(x - 22, 91); c.lineTo(x + 22, 91); c.lineTo(x, 76); c.stroke();
        c.fillStyle = ["#b16f60", "#6c8488", "#d2be94", "#7b7a99"][n % 4];
        c.beginPath(); c.moveTo(x - 16, 86); c.lineTo(x - 31, 104); c.lineTo(x - 23, 122); c.lineTo(x - 17, 117); c.lineTo(x - 18, 190); c.lineTo(x + 18, 190); c.lineTo(x + 17, 117); c.lineTo(x + 23, 122); c.lineTo(x + 31, 104); c.lineTo(x + 16, 86); c.closePath(); c.fill();
        c.fillStyle = "#eadfc7"; c.fillRect(x - 5, 91, 10, 4);
      }
      shelf(218);
    } else if (kind === 2 || kind === 6) {
      c.fillStyle = style.color; c.fillRect(28, 46, 160, 115);
      c.fillStyle = style.paper; c.font = '18px "Microsoft YaHei", sans-serif'; c.fillText(kind === 2 ? "茶 · 清饮" : "今日小食", 108, 69);
      for (let n = 0; n < 4; n++) { c.fillRect(44, 91 + n * 15, 75, 2); c.fillRect(144, 91 + n * 15, 23, 2); }
      if (kind === 2) {
        for (let n = 0; n < 5; n++) cup(228 + n * 48, 154 - (n % 2) * 10, ["#b88854", "#8e9b6b", "#d4ae83"][n % 3]);
      } else {
        c.fillStyle = "#b89b6d"; c.fillRect(219, 96, 254, 105);
        for (let n = 0; n < 6; n++) { c.fillStyle = n % 2 ? "#d7aa62" : "#cb9260"; c.beginPath(); c.ellipse(248 + (n % 3) * 86, 129 + Math.floor(n / 3) * 45, 28, 14, 0, 0, Math.PI * 2); c.fill(); c.fillStyle = "#f0cf8e"; c.fillRect(238 + (n % 3) * 86, 125 + Math.floor(n / 3) * 45, 20, 3); }
      }
      shelf(202); c.fillStyle = "#b8a58a"; c.fillRect(28, 209, 456, 26);
    } else if (kind === 3) {
      for (let row = 0; row < 2; row++) {
        for (let n = 0; n < 5; n++) {
          const x = 49 + n * 92; const y = 78 + row * 102; c.fillStyle = ["#a6755a", "#6c7a75", "#b6a07f", "#696574"][n % 4];
          if (row === 0) { c.fillRect(x, y + 10, 50, 47); c.strokeStyle = "#6e5d4b"; c.lineWidth = 4; c.beginPath(); c.arc(x + 25, y + 12, 15, Math.PI, 0); c.stroke(); } else { c.beginPath(); c.moveTo(x, y); c.lineTo(x + 19, y); c.lineTo(x + 26, y + 18); c.lineTo(x + 52, y + 24); c.lineTo(x + 52, y + 38); c.lineTo(x, y + 38); c.closePath(); c.fill(); c.fillStyle = "#ede0c2"; c.fillRect(x, y + 35, 52, 5); }
        }
        shelf(141 + row * 88);
      }
    } else if (kind === 4) {
      for (let row = 0; row < 3; row++) {
        for (let n = 0; n < 10; n++) {
          const x = 37 + n * 44; const y = 96 + row * 65;
          c.fillStyle = ["#8eaaa0", "#cba983", "#a6a2b9", "#dacba8"][n % 4]; c.fillRect(x, y - 33, 25, 33);
          c.fillStyle = style.color; c.fillRect(x + 5, y - 39, 15, 6); c.fillStyle = "#f4ebd4"; c.fillRect(x + 4, y - 23, 17, 11);
        }
        shelf(99 + row * 65);
      }
    } else if (kind === 5) {
      c.fillStyle = "#c0af8f"; c.fillRect(27, 46, 458, 133);
      for (let n = 0; n < 6; n++) {
        const x = 64 + n * 73; c.strokeStyle = style.color; c.lineWidth = 8;
        c.beginPath(); c.moveTo(x, 82); c.lineTo(x, 143); c.stroke(); c.lineWidth = 4;
        c.beginPath(); c.moveTo(x - 12, 72); c.lineTo(x - 12, 86); c.lineTo(x, 95); c.lineTo(x + 12, 86); c.lineTo(x + 12, 72); c.stroke();
      }
      shelf(192); c.fillStyle = "#7e8178"; c.fillRect(52, 202, 108, 31); c.fillRect(225, 195, 65, 38); c.fillRect(370, 207, 87, 26);
    } else {
      for (const y of [135, 230]) {
        for (let n = 0; n < 5; n++) {
          const x = 42 + n * 93; c.fillStyle = ["#698b83", "#b98469", "#b5a171"][n % 3]; c.fillRect(x, y - 65, 61, 61);
          c.strokeStyle = "#ebd6a3"; c.lineWidth = 3; c.beginPath(); c.moveTo(x + 8, y - 22); c.lineTo(x + 24, y - 45); c.lineTo(x + 36, y - 27); c.lineTo(x + 49, y - 48); c.stroke();
          c.fillStyle = "#f0dfb9"; c.fillRect(x + 8, y - 13, 45, 2);
        }
        shelf(y);
      }
    }
    // Window mullions and a quiet glass reflection keep the drawings framed.
    c.fillStyle = "#647c73"; c.fillRect(6, 0, 6, 256); c.fillRect(500, 0, 6, 256); c.fillRect(252, 0, 5, 256);
    c.fillStyle = "rgba(255,255,255,.12)"; c.beginPath(); c.moveTo(30, 0); c.lineTo(68, 0); c.lineTo(185, 256); c.lineTo(147, 256); c.closePath(); c.fill();
    c.restore();
  });
  const texture = new T.CanvasTexture(canvas); texture.colorSpace = T.SRGBColorSpace; texture.anisotropy = 4;
  return texture;
}

function shopFaces() {
  const positions: number[] = []; const uv: number[] = []; const indices: number[] = [];
  const quad = (s: typeof UNDERGROUND_SHOPS[number], kind: number, inset: number, height: number, w: number, h: number, top: number, bottom: number) => {
    const yaw = s.angle - (s.side * Math.PI) / 2; const sin = Math.sin(yaw); const cos = Math.cos(yaw);
    const x = s.x - Math.cos(s.angle) * s.side * inset; const z = s.z + Math.sin(s.angle) * s.side * inset; const y = undergroundLevel(s) + height;
    const start = positions.length / 3;
    for (const [dx, dy] of [[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]]) positions.push(x + cos * dx, y + dy, z - sin * dx);
    const left = ((kind % 4) * 512 + 2) / 2048; const right = ((kind % 4) * 512 + 510) / 2048;
    const vTop = 1 - (Math.floor(kind / 4) * 512 + top) / 1024; const vBottom = 1 - (Math.floor(kind / 4) * 512 + bottom) / 1024;
    uv.push(left, vBottom, right, vBottom, right, vTop, left, vTop); indices.push(start, start + 1, start + 2, start, start + 2, start + 3);
  };
  UNDERGROUND_SHOPS.forEach((s, i) => {
    const kind = (i + (s.side > 0 ? 3 : 0)) % STYLES.length;
    quad(s, kind, 0.47, 1.7, 6.1, 2.6, 96, 352);
    quad(s, kind, 2.62, 3.35, 6.4, 0.55, 1, 64);
  });
  const geometry = new T.BufferGeometry(); geometry.setAttribute("position", new T.Float32BufferAttribute(positions, 3)); geometry.setAttribute("uv", new T.Float32BufferAttribute(uv, 2)); geometry.setIndex(indices); geometry.computeVertexNormals();
  return geometry;
}

function UndergroundShops() {
  const texture = useMemo(shopAtlas, []); const geometry = useMemo(shopFaces, []);
  useEffect(() => () => { texture.dispose(); geometry.dispose(); }, [texture, geometry]);
  return <mesh name="估算商铺橱窗与类别招牌" geometry={geometry}><meshStandardMaterial map={texture} roughness={0.85} /></mesh>;
}

export default memo(UndergroundShops);
