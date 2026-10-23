"use client";

import { terrainHeight } from "./terrain";

import { memo, useEffect, useMemo, useRef } from "react";
import * as T from "three";
import { cityTexture } from "./textures";
import { DONGMEN as gate, GATE_COLUMNS, GATE_HALL, GATE_LANDING, GATE_PARAPETS, GATE_STAIRS, GATE_STAIR_RAILS, GATE_WINGS, type GateBox } from "./dongmen";

type Part = GateBox & { color: string };
function Masonry({ parts, stone = false }: { parts: Part[]; stone?: boolean }) {
  const ref = useRef<T.InstancedMesh>(null);
  const map = useMemo(() => (stone ? cityTexture("dark-stone") : null), [stone]);
  const material = useMemo(() => {
    const m = new T.MeshStandardMaterial({ roughness: 0.93, map });
    if (stone) m.onBeforeCompile = shader => {
      shader.vertexShader = shader.vertexShader.replace("#include <uv_vertex>", `
        #include <uv_vertex>
        #ifdef USE_MAP
          vec3 partScale = vec3(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz), length(instanceMatrix[2].xyz));
          vec2 faceSize = abs(normal.y) > 0.5 ? partScale.xz : (abs(normal.x) > 0.5 ? partScale.zy : partScale.xy);
          vMapUv = uv * faceSize * vec2(1.0, 0.6);
        #endif
      `);
    };
    m.customProgramCacheKey = () => `dongmen-${stone ? "metre-masonry" : "wood"}`;
    return m;
  }, [map, stone]);
  useEffect(() => () => { map?.dispose(); material.dispose(); }, [map, material]);
  useEffect(() => {
    if (!ref.current) return;
    const matrix = new T.Matrix4(); const color = new T.Color();
    parts.forEach((p, i) => {
      matrix.makeScale(...p.size); matrix.setPosition(...p.at);
      ref.current!.setMatrixAt(i, matrix); ref.current!.setColorAt(i, color.set(p.color));
    });
    ref.current.instanceMatrix.needsUpdate = true;
    if (ref.current.instanceColor) ref.current.instanceColor.needsUpdate = true;
    ref.current.computeBoundingSphere();
  }, [parts]);
  return (
<instancedMesh ref={ref} args={[undefined, undefined, parts.length]} castShadow receiveShadow>
      <boxGeometry /><primitive object={material} attach="material" />
  </instancedMesh>
);
}
function Board({ text, at, width, height = 0.8, background = "#3e4b3e", ink = "#ead5a4" }: {
  text: string; at: [number, number, number]; width: number; height?: number; background?: string; ink?: string;
}) {
  const texture = useMemo(() => {
    const c = document.createElement("canvas"); c.width = 1024; c.height = 256;
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = background; ctx.fillRect(0, 0, c.width, c.height);
    ctx.strokeStyle = ink; ctx.lineWidth = 7; ctx.strokeRect(12, 12, 1000, 232);
    ctx.fillStyle = ink; ctx.font = 'bold 105px "Microsoft YaHei", sans-serif'; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText(text, 512, 136, 950);
    const t = new T.CanvasTexture(c); t.colorSpace = T.SRGBColorSpace; return t;
  }, [text, background, ink]);
  useEffect(() => () => texture.dispose(), [texture]);
  return <mesh position={at}><planeGeometry args={[width, height]} /><meshStandardMaterial map={texture} roughness={0.9} /></mesh>;
}

// Separate upper gables and lower hipped ends, rather than a flat box with a
// floating roof. Roof tile UVs are in metres so both tiers share their scale.
function Roof({ y, width, depth, rise }: { y: number; width: number; depth: number; rise: number }) {
  const { roof, gables, ridge } = useMemo(() => {
    const vertices: number[] = []; const uv: number[] = []; const indices: number[] = [];
    const ridgeHalf = width * 0.29;
    const height = (z: number) => rise * Math.max(0, 1 - Math.abs(z) / (depth / 2)) ** 1.2 + 0.34 * (Math.abs(z) / (depth / 2)) ** 10;
    const patch = (x0: number, x1: number, end: boolean) => {
      const offset = vertices.length / 3;
      for (let xi = 0; xi <= 20; xi++) for (let zi = 0; zi <= 40; zi++) {
        const x = x0 + ((x1 - x0) * xi) / 20; const z = (zi / 40 - 0.5) * depth;
        const t = Math.abs((x - Math.sign(x) * ridgeHalf) / (width / 2 - ridgeHalf));
        const h = end ? Math.min(height(z), rise * 0.38) * (1 - t) + (0.15 + 0.25 * (Math.abs(z) / (depth / 2)) ** 8) * t ** 6 : height(z);
        vertices.push(x, h, z); uv.push(x / 1.1, z / 1.1);
        if (xi < 20 && zi < 40) {
          const a = offset + xi * 41 + zi; indices.push(a, a + 1, a + 41, a + 41, a + 1, a + 42);
        }
      }
    };
    patch(-ridgeHalf, ridgeHalf, false); patch(-width / 2, -ridgeHalf, true); patch(ridgeHalf, width / 2, true);
    const geometry = new T.BufferGeometry(); geometry.setAttribute("position", new T.Float32BufferAttribute(vertices, 3));
    geometry.setAttribute("uv", new T.Float32BufferAttribute(uv, 2)); geometry.setIndex(indices); geometry.computeVertexNormals();
    const gableVertices: number[] = [];
    for (const x of [-ridgeHalf, ridgeHalf]) for (let i = 0; i < 40; i++) {
      const a = (i / 40 - 0.5) * depth; const b = ((i + 1) / 40 - 0.5) * depth;
      const lowA = Math.min(height(a), rise * 0.38); const lowB = Math.min(height(b), rise * 0.38);
      gableVertices.push(x, lowA, a, x, height(a), a, x, height(b), b, x, lowA, a, x, height(b), b, x, lowB, b);
    }
    const gable = new T.BufferGeometry(); gable.setAttribute("position", new T.Float32BufferAttribute(gableVertices, 3)); gable.computeVertexNormals();
    const curves: T.TubeGeometry[] = [];
    for (const side of [-1, 1]) curves.push(new T.TubeGeometry(new T.CatmullRomCurve3([
      new T.Vector3(side * (ridgeHalf - 0.6), rise + 0.08, 0), new T.Vector3(side * (ridgeHalf + 0.25), rise + 0.2, 0),
      new T.Vector3(side * (ridgeHalf + 0.6), rise + 0.7, 0), new T.Vector3(side * (ridgeHalf + 0.3), rise + 1, 0),
    ]), 12, 0.09, 5, false));
    return { roof: geometry, gables: gable, ridge: curves };
  }, [width, depth, rise]);
  const tile = useMemo(() => cityTexture("roof"), []);
  useEffect(() => () => { roof.dispose(); gables.dispose(); tile.dispose(); ridge.forEach(r => r.dispose()); }, [roof, gables, tile, ridge]);
  return (
<group position={[0, y, 0]}>
    <mesh geometry={roof} castShadow receiveShadow><meshStandardMaterial map={tile} color="#b3b3a4" side={T.DoubleSide} roughness={0.93} /></mesh>
    <mesh geometry={gables} castShadow><meshStandardMaterial color="#954c3d" side={T.DoubleSide} roughness={0.9} /></mesh>
    <mesh position={[0, rise + 0.12, 0]}><boxGeometry args={[width * 0.6, 0.18, 0.2]} /><meshStandardMaterial color="#7c6556" /></mesh>
    {ridge.map((r, i) => <mesh key={i} geometry={r} castShadow><meshStandardMaterial color="#777d70" /></mesh>)}
  </group>
);
}

export default memo(() => {
  const { stoneParts, woodParts, arch, floor, columns } = useMemo(() => {
    const stone: Part[] = [...GATE_WINGS, ...GATE_STAIRS, ...GATE_STAIR_RAILS, GATE_LANDING, ...GATE_PARAPETS].map(b => ({ ...b, color: "#a5aaa0" }));
    // Coping, visible individual treads and darker joints keep the staircase
    // legible at player height. Their proxy is the exact same stair array.
    GATE_STAIRS.forEach(b => stone.push({ at: [b.at[0], b.size[1] + 0.005, b.at[2] + b.size[2] / 2 - 0.035], size: [b.size[0], 0.02, 0.07], color: "#6a736c" }));
    for (let i = 0; i < 15; i++) stone.push({ at: [-13.6 + i * 1.94, gate.terrace + 1.15, gate.depth / 2 - 0.22], size: [1.85, 0.18, 0.58], color: "#abb1a3" });
    const wood: Part[] = [
      { ...GATE_HALL, at: [0, 8.2, -1], size: [gate.hallWidth, 4, gate.hallDepth - 3], color: "#8c8c7d" },
      { at: [0, 12.9, -0.2], size: [11, 2.8, 5.8], color: "#75483a" },
      { at: [0, 10.05, 4.6], size: [gate.hallWidth + 0.3, 0.27, 0.38], color: "#815240" },
      { at: [0, 6.3, 3.45], size: [gate.hallWidth + 0.3, 0.2, 3.3], color: "#a8a48e" },
      { at: [gate.stairs.x - 2.25, 0.65, 12.6], size: [0.12, 1.3, 0.12], color: "#525e50" },
    ];
    // Five front bays, deep door recesses, wood mullions and transoms.
    for (let bay = 0; bay < 5; bay++) {
      const x = ((bay - 2) * gate.hallWidth) / 5;
      wood.push({ at: [x, 8.1, 2.72], size: [2.9, 3.25, 0.14], color: "#3f4640" });
      for (let j = -2; j <= 2; j++) wood.push({ at: [x + j * 0.53, 8.5, 2.82], size: [0.055, 2.4, 0.06], color: "#b28b65" });
      for (const y of [7.35, 8.2, 9.1, 9.65]) wood.push({ at: [x, y, 2.83], size: [2.9, 0.065, 0.06], color: "#a77b59" });
    }
    for (const side of [-1, 1]) for (let i = 0; i < 5; i++) {
      const x = (i - 2) * 2.1;
      wood.push({ at: [x, 12.9, side * 2.94 - 0.2], size: [1.8, 2.1, 0.05], color: "#343f3c" });
      for (const dx of [-0.54, 0, 0.54]) wood.push({ at: [x + dx, 12.9, side * 3 - 0.2], size: [0.065, 2.1, 0.07], color: "#b29a78" });
      for (const y of [12.35, 13.15, 13.8]) wood.push({ at: [x, y, side * 3.01 - 0.2], size: [1.9, 0.06, 0.07], color: "#b29a78" });
    }
    const shape = new T.Shape(); shape.moveTo(-gate.opening / 2, 0); shape.lineTo(gate.opening / 2, 0);
    shape.lineTo(gate.opening / 2, gate.terrace); shape.lineTo(-gate.opening / 2, gate.terrace); shape.closePath();
    const hole = new T.Path(); hole.moveTo(-gate.opening / 2, 0); hole.lineTo(-gate.opening / 2, gate.spring);
    hole.absarc(0, gate.spring, gate.opening / 2, Math.PI, 0, true); hole.lineTo(gate.opening / 2, 0); hole.closePath(); shape.holes.push(hole);
    const vault = new T.ExtrudeGeometry(shape, { depth: gate.depth, bevelEnabled: false, curveSegments: 24 }).translate(0, 0, -gate.depth / 2);
    // Give the long tunnel and wall real-world texture scale (default extrude
    // UVs already use metre coordinates). No photo textures are shipped.
    const paving = cityTexture("dark-stone"); paving.repeat.set(0.6, 0.8);
    return { stoneParts: stone, woodParts: wood, arch: vault, floor: paving, columns: GATE_COLUMNS };
  }, []);
  useEffect(() => () => { arch.dispose(); floor.dispose(); }, [arch, floor]);
  return (
<group position={[gate.x, terrainHeight(gate), gate.z]}>
    <Masonry parts={stoneParts} stone /><Masonry parts={woodParts} />
    <mesh geometry={arch} castShadow receiveShadow><meshStandardMaterial color="#a5aaa0" map={floor} roughness={1} /></mesh>
    <mesh position={[0, gate.terrace + 0.01, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
      <planeGeometry args={[gate.width, gate.depth]} /><meshStandardMaterial map={floor} color="#aaa997" roughness={1} />
    </mesh>
    {columns.map((x, i) => (
<group key={x}>
      <mesh position={[x, 8.2, 4.65]} castShadow><cylinderGeometry args={[0.18, 0.23, 4, 10]} /><meshStandardMaterial color="#8e4e3b" /></mesh>
      <mesh position={[x, gate.terrace + 0.15, 4.65]}><cylinderGeometry args={[0.34, 0.34, 0.3, 10]} /><meshStandardMaterial color="#9d9d8b" /></mesh>
      {i > 0 && i < columns.length - 1 && (
<group position={[x - 1.64, 9.55, 4.7]}>
        <mesh><sphereGeometry args={[0.29, 10, 8]} /><meshStandardMaterial color="#bc5940" /></mesh>
        <mesh position={[0, -0.45, 0]}><cylinderGeometry args={[0.04, 0.04, 0.42, 6]} /><meshStandardMaterial color="#bd9a57" /></mesh>
      </group>
)}
    </group>
))}
    <Roof y={10.1} width={20.4} depth={13.3} rise={2.45} />
    <Roof y={14.1} width={15.1} depth={10.1} rise={2.1} />
    <Board text="東 門" at={[0, 4.65, gate.depth / 2 + 0.02]} width={2.4} height={0.85} background="#c0b59a" ink="#454b40" />
    <Board text="東 門 城 樓" at={[0, 9.3, 4.91]} width={4.1} height={0.74} />
      <Board text="步行登楼 · 柳江观景" at={[gate.stairs.x - 2.25, 1.4, 12.6]} width={2.7} height={0.6} />
  </group>
);
});
