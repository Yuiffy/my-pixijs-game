'use client';

/* eslint-disable react/no-unused-prop-types -- Scene props are shared by specialized rendering components via prop spreading. */

import { Canvas, ThreeEvent, useFrame, useThree } from '@react-three/fiber';
import { Component, ReactNode, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
// Three exposes its example modules with explicit ESM extensions.
// eslint-disable-next-line import/extensions
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { bedLevel, GEOGRAPHY, LOCKS, waterLevel, Contractor, MAP_H, MAP_W, PLAYER_COLORS, Point, Quote, reclamationLevel, Route, TerrainGame, truckRoute, WorkEvent, xy } from './terrainEngine';
import { referenceLines, WATER_STEPS } from './geography';

const HEIGHT = 0.17;
const BASE = -2.05;
type Vec = [number, number, number];
const position = (p: Point, h = 0): Vec => [p[0] - (MAP_W - 1) / 2, h, p[1] - (MAP_H - 1) / 2];
const matrix = new THREE.Object3D();
const color = new THREE.Color();
const bodyMaterial = new THREE.MeshStandardMaterial({ roughness: 0.93, flatShading: true });
const topMaterial = new THREE.MeshStandardMaterial({ roughness: 0.94, side: THREE.DoubleSide });
const cube = new THREE.BoxGeometry(1, 1, 1);
const plane = new THREE.PlaneGeometry(1, 1);
function Box({ at, size, tint }: { at: Vec; size: Vec; tint: string }) {
  return <mesh position={at} scale={size} geometry={cube} castShadow receiveShadow><meshStandardMaterial color={tint} roughness={0.8} /></mesh>;
}
export interface TerrainSceneProps {
  game: TerrainGame; wet: boolean[]; selected: number[]; hovered: number | null; quote: Quote | null;
  route: Route | null; proposal: Route | null; showSurvey: boolean; showOwners: boolean; showReclamation: boolean;
  focus: number | null; showReference: boolean; reset: number; topDown: boolean; disabled: boolean; navigate: boolean;
  onSelect: (id: number) => void; onHover: (id: number | null) => void;
}

function Terrain({ game, wet, onSelect, onHover }: TerrainSceneProps) {
  const ground = useRef<THREE.InstancedMesh>(null);
  const surface = useRef<THREE.InstancedMesh>(null);
  const water = useRef<THREE.InstancedMesh>(null);
  const shown = useRef(game.plots.map(p => p.height));
  const { invalidate } = useThree();
  useLayoutEffect(() => {
    game.plots.forEach((p, id) => {
      const [x, z] = xy(id);
      matrix.position.set(x - (MAP_W - 1) / 2, waterLevel(id) * HEIGHT + 0.035, z - (MAP_H - 1) / 2);
      matrix.rotation.set(-Math.PI / 2, 0, 0); matrix.scale.setScalar(wet[id] ? 0.998 : 0);
      matrix.updateMatrix(); water.current!.setMatrixAt(id, matrix.matrix);
      color.set(p.height <= bedLevel(id) ? '#369ba5' : '#72babc'); water.current!.setColorAt(id, color);
    });
    water.current!.instanceMatrix.needsUpdate = true;
    if (water.current!.instanceColor) water.current!.instanceColor.needsUpdate = true;
    invalidate();
  }, [game.plots, wet, invalidate]);
  useFrame((_, delta) => {
    let moving = false;
    game.plots.forEach((p, id) => {
      const difference = p.height - shown.current[id];
      if (Math.abs(difference) > 0.015) { shown.current[id] += difference * Math.min(1, delta * 9); moving = true; } else shown.current[id] = p.height;
      const height = shown.current[id] * HEIGHT;
      const [x, , z] = position(xy(id));
      matrix.rotation.set(0, 0, 0); matrix.position.set(x, (height + BASE) / 2, z); matrix.scale.set(0.997, height - BASE, 0.997); matrix.updateMatrix();
      ground.current!.setMatrixAt(id, matrix.matrix);
      color.set(Object.keys(p.cuts).length ? (p.rock ? '#9e9d87' : '#b5a17b') : p.fill.length ? '#b28f5f' : p.rock ? '#7f9671' : '#9aa67b'); ground.current!.setColorAt(id, color);
      matrix.rotation.set(-Math.PI / 2, 0, 0); matrix.position.set(x, height + 0.012, z); matrix.scale.set(0.97, 0.97, 1); matrix.updateMatrix(); surface.current!.setMatrixAt(id, matrix.matrix);
      const disturbed = Object.keys(p.cuts).length > 0;
      color.set(p.fill.length ? (p.height >= reclamationLevel(p) ? '#a8bb67' : '#b9986c') : disturbed ? '#baa27a' : p.rock ? (p.height >= 65 ? '#a6b79a' : (id % 4 ? '#7e9f71' : '#8eac7b')) : p.height < 1 ? '#708e65' : ((id * 37) % 5 ? '#91af78' : '#a1bb80'));
      surface.current!.setColorAt(id, color);
    });
    [ground, surface].forEach(ref => { ref.current!.instanceMatrix.needsUpdate = true; if (ref.current!.instanceColor) ref.current!.instanceColor.needsUpdate = true; });
    if (moving) invalidate();
  });
  const select = (event: ThreeEvent<MouseEvent>) => { event.stopPropagation(); if (event.delta < 5 && event.instanceId !== undefined) onSelect(event.instanceId); };
  const hover = (event: ThreeEvent<PointerEvent>) => { event.stopPropagation(); if (event.instanceId !== undefined) onHover(event.instanceId); };
  return (
<>
    <instancedMesh ref={ground} args={[cube, bodyMaterial, game.plots.length]} frustumCulled={false} castShadow receiveShadow onClick={select} onPointerMove={hover} onPointerLeave={() => onHover(null)} />
    <instancedMesh ref={surface} args={[plane, topMaterial, game.plots.length]} frustumCulled={false} receiveShadow onClick={select} onPointerMove={hover} />
    <instancedMesh ref={water} args={[plane, undefined, game.plots.length]} frustumCulled={false} onClick={select} onPointerMove={hover}>
      <meshStandardMaterial roughness={0.26} metalness={0.2} transparent opacity={0.8} depthWrite={false} />
    </instancedMesh>
  </>
);
}
function Outlines({ game, wet, selected, hovered, quote, proposal, route, showSurvey, showOwners, showReclamation }: TerrainSceneProps) {
  const overlays = useMemo(() => {
    const vertices: number[] = []; const colors: number[] = [];
    const faces: number[] = []; const faceColors: number[] = [];
    const quad = (points: number[][], target: number[], tints: number[]) => {
      [0, 1, 2, 0, 2, 3].forEach(i => { target.push(...points[i]); tints.push(color.r, color.g, color.b); });
    };
    const adopted = new Set((route ?? proposal)?.cells ?? []); const selection = new Set(selected);
    game.plots.forEach((p, id) => {
      const active = selection.has(id); const hot = hovered === id;
      const survey = showSurvey && adopted.has(id);
      const owners = Object.values(p.cuts);
      const reclaim = showReclamation && p.farm && p.height < reclamationLevel(p) && !wet[id];
      if (!active && !hot && !survey && !reclaim && !(showOwners && owners.length)) return;
      const tint = active ? '#00e5ff' : hot ? '#ffffff' : reclaim ? '#47dc78' : survey ? (p.height > bedLevel(id) ? '#ff5029' : '#75ffd4') : PLAYER_COLORS[owners[owners.length - 1]];
      color.set(tint);
      const [x, , z] = position(xy(id)); const h = Math.max(wet[id] ? waterLevel(id) * HEIGHT + 0.065 : -2, p.height * HEIGHT + 0.055);
      const corners = [[x - 0.47, h, z - 0.47], [x + 0.47, h, z - 0.47], [x + 0.47, h, z + 0.47], [x - 0.47, h, z + 0.47]];
      quad(corners, faces, faceColors);
      const width = active ? 0.085 : 0.04;
      const inner = corners.map(([cx, cy, cz]) => [cx + Math.sign(x - cx) * width, cy, cz + Math.sign(z - cz) * width]);
      for (let i = 0; i < 4; i++) quad([corners[i], corners[(i + 1) % 4], inner[(i + 1) % 4], inner[i]], vertices, colors);
      // Diagonal marks identify route work even when color is hard to distinguish.
      if (survey && p.height > -3 && !active && !reclaim) {
        quad([[x - 0.35, h, z + 0.25], [x - 0.25, h, z + 0.35], [x + 0.35, h, z - 0.25], [x + 0.25, h, z - 0.35]], vertices, colors);
      }
      if (active) {
        color.set(quote?.error ? '#ff3561' : '#ffffff');
        quad([[x - 0.23, h, z - 0.035], [x + 0.23, h, z - 0.035], [x + 0.23, h, z + 0.035], [x - 0.23, h, z + 0.035]], vertices, colors);
        quad([[x - 0.035, h, z - 0.23], [x + 0.035, h, z - 0.23], [x + 0.035, h, z + 0.23], [x - 0.035, h, z + 0.23]], vertices, colors);
      }
    });
    const geometry = (points: number[], tints: number[]) => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(points, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(tints, 3)); return g; };
    return { marks: geometry(vertices, colors), faces: geometry(faces, faceColors) };
  }, [game.plots, wet, selected, hovered, quote?.error, proposal, route, showSurvey, showOwners, showReclamation]);
  useEffect(() => () => { overlays.marks.dispose(); overlays.faces.dispose(); }, [overlays]);
  return <><mesh geometry={overlays.faces} renderOrder={4} raycast={() => {}}><meshBasicMaterial vertexColors transparent opacity={0.2} depthTest={false} depthWrite={false} side={THREE.DoubleSide} toneMapped={false} /></mesh><mesh geometry={overlays.marks} renderOrder={5} raycast={() => {}}><meshBasicMaterial vertexColors depthTest={false} depthWrite={false} side={THREE.DoubleSide} toneMapped={false} /></mesh></>;
}
function CutPreview({ game, quote }: { game: TerrainGame; quote: Quote | null }) {
  if (!quote || quote.error) return null;
  return (
<>{quote.cells.map(id => {
    const plot = game.plots[id]; const target = quote.depths[id];
    const height = Math.abs(plot.height - target) * HEIGHT;
    return (
<mesh key={id} position={position(xy(id), ((plot.height + target) * HEIGHT) / 2)} scale={[0.96, height, 0.96]} geometry={cube} renderOrder={3} raycast={() => {}}>
      <meshBasicMaterial color={target < plot.height ? '#00cfff' : '#47dc78'} transparent opacity={0.24} depthWrite={false} />
    </mesh>
);
  })}</>
);
}
function PortLabel({ at, text, altitude = 1.45 }: { at: Point; text: string; altitude?: number }) {
  const ref = useRef<THREE.Sprite>(null);
  const { camera } = useThree();
  useFrame(() => { const scale = Math.min(1, 12 / camera.zoom); ref.current?.scale.set(8 * scale, 2.8 * scale, 1); });
  const texture = useMemo(() => {
    const canvas = document.createElement('canvas'); canvas.width = 256; canvas.height = 90;
    const context = canvas.getContext('2d')!; context.fillStyle = '#f7f5e7'; context.fillRect(0, 0, 256, 90);
    context.strokeStyle = '#628572'; context.lineWidth = 4; context.strokeRect(3, 3, 250, 84);
    context.fillStyle = '#395e51'; context.font = '500 36px "Microsoft YaHei", sans-serif'; context.textAlign = 'center'; context.textBaseline = 'middle'; context.fillText(text, 128, 47);
    const result = new THREE.CanvasTexture(canvas); result.colorSpace = THREE.SRGBColorSpace; return result;
  }, [text]);
  useEffect(() => () => texture.dispose(), [texture]);
  return <sprite ref={ref} position={position(at, altitude)} scale={[8, 2.8, 1]} renderOrder={10} raycast={() => {}}><spriteMaterial map={texture} toneMapped={false} depthTest={false} depthWrite={false} /></sprite>;
}
function PathLine({ points, tint, game, floor = false }: { points: Point[]; tint: string; game: TerrainGame; floor?: boolean }) {
  const geometry = useMemo(() => new THREE.BufferGeometry().setFromPoints(points.map(([x, z]) => {
    const id = Math.min(game.plots.length - 1, Math.max(0, Math.round(z) * MAP_W + Math.round(x)));
    return new THREE.Vector3(...position([x, z], floor ? Math.max(waterLevel(id) * HEIGHT + 0.1, game.plots[id].height * HEIGHT + 0.09) : waterLevel(id) * HEIGHT + 0.22));
  })), [points, game.plots, floor]);
  const routeLine = useMemo(() => new THREE.Line(geometry, new THREE.LineBasicMaterial({ color: tint, transparent: true, opacity: 0.85, depthTest: false })), [geometry, tint]);
  useEffect(() => () => { geometry.dispose(); routeLine.material.dispose(); }, [geometry, routeLine]);
  return <primitive object={routeLine} />;
}
function Scenery({ game, wet }: { game: TerrainGame; wet: boolean[] }) {
  const trees = useMemo(() => game.plots.map((p, id) => ({ p, id })).filter(({ p, id }) => p.initial > 0 && !p.farm && p.initial < 4 && ((Math.sin(id * 127.1 + game.seed * 71.3) * 43758.5453) % 1) > 0.88), [game.plots, game.seed]);
  return (
<>
    <Box at={[0, BASE - 0.14, 0]} size={[MAP_W + 0.3, 0.28, MAP_H + 0.3]} tint="#877e60" />
    {trees.filter(({ id, p }) => game.plots[id].height === p.initial && !Object.keys(game.plots[id].cuts).length).map(({ id }) => (
<group key={id} position={position(xy(id), game.plots[id].height * HEIGHT)}>
      <Box at={[0, 0.3, 0]} size={[0.11, 0.6, 0.11]} tint="#8e7957" />
      <mesh position={[0, 0.9, 0]} castShadow><coneGeometry args={[0.48, 1.6, 5]} /><meshStandardMaterial color="#527963" flatShading /></mesh>
    </group>
))}
    {game.plots.map((p, id) => (p.farm && p.fill.length > 0 && p.height >= reclamationLevel(p) && !wet[id] ? <group key={id} position={position(xy(id), p.height * HEIGHT + 0.04)}>{[-0.28, 0, 0.28].map(z => <Box key={z} at={[0, 0.02, z]} size={[0.83, 0.035, 0.075]} tint="#5d8748" />)}</group> : null))}
  </>
);
}
function SoilPiles({ game, players }: { game: TerrainGame; players: Contractor[] }) {
  return (
<>{players.flatMap(p => Object.entries(p.piles).filter(([, batches]) => batches.some(s => s.amount)).filter((_, i) => i % 3 === 0).map(([key, batches]) => {
    const id = Number(key); const [x, z] = xy(id); const units = batches.reduce((sum, s) => sum + s.amount, 0);
    return (
<group key={`${p.id}-${id}`} position={position([x + 0.32, z + 0.3], Math.max(waterLevel(id) * HEIGHT + 0.08, game.plots[id].height * HEIGHT))}>
      <mesh position={[0, 0.11, 0]}><coneGeometry args={[Math.min(0.35, 0.16 + units * 0.018), 0.24, 5]} /><meshStandardMaterial color="#c79d62" /></mesh>
      <Box at={[0, 0.4, 0]} size={[0.025, 0.5, 0.025]} tint="#756445" /><Box at={[0.1, 0.58, 0]} size={[0.2, 0.13, 0.015]} tint={PLAYER_COLORS[p.id]} />
    </group>
);
  }))}</>
);
}
function Excavator({ tint }: { tint: string }) {
  return <group><Box at={[0, 0.13, 0]} size={[0.7, 0.18, 0.55]} tint="#49534b" /><Box at={[0, 0.35, 0]} size={[0.5, 0.3, 0.45]} tint={tint} /><Box at={[-0.14, 0.56, 0]} size={[0.24, 0.28, 0.36]} tint="#e8dfc2" /><Box at={[-0.14, 0.6, 0.19]} size={[0.17, 0.15, 0.015]} tint="#557d82" /><group rotation={[0, 0, 0.5]}><Box at={[0.4, 0.4, 0]} size={[0.8, 0.09, 0.12]} tint={tint} /><Box at={[0.72, 0.22, 0]} size={[0.1, 0.48, 0.13]} tint={tint} /><Box at={[0.78, 0.03, 0]} size={[0.28, 0.2, 0.32]} tint="#626b55" /></group></group>;
}
function WorkAnimation({ event, game, reduced }: { event: WorkEvent; game: TerrainGame; reduced: boolean }) {
  const vehicle = useRef<THREE.Group>(null); const particles = useRef<THREE.Group>(null);
  const elapsed = useRef(0); const { invalidate } = useThree();
  const path = useMemo(() => (event.tool === 'haul' && event.from !== undefined && event.cells.length ? truckRoute(game, event.from, event.cells[0]) : []), [game, event]);
  const workId = event.cells[0] ?? 0;
  useFrame((_, delta) => {
    elapsed.current += delta; const t = elapsed.current;
    if (event.tool === 'haul' && path.length && vehicle.current) {
      const progress = Math.min(1, t / (reduced ? 0.1 : 2.1)); const index = progress * (path.length - 1); const first = path[Math.floor(index)]; const second = path[Math.min(path.length - 1, Math.floor(index) + 1)];
      const a = xy(first); const b = xy(second); const f = index % 1;
      vehicle.current.position.set(...position([a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f], (game.plots[first].height * (1 - f) + game.plots[second].height * f) * HEIGHT + 0.12));
      if (first !== second) vehicle.current.rotation.y = -Math.atan2(b[1] - a[1], b[0] - a[0]);
    }
    if (particles.current) particles.current.children.forEach((child, i) => {
      const part = Math.min(1, t / 1.8); const angle = i * 2.4;
      const origin = xy(event.cells[i % event.cells.length]); const first = xy(workId);
      child.position.set(origin[0] - first[0] + Math.cos(angle) * part, Math.sin(part * Math.PI) * (0.6 + (i % 3) * 0.35), origin[1] - first[1] + Math.sin(angle) * part);
      child.scale.setScalar(Math.max(0, 1 - part)); child.rotation.set(t * 2, t + i, 0);
    });
    if (!reduced && t < 2.2) invalidate();
  });
  if (!event.cells.length) return null;
  return (
<>
    {event.tool === 'haul' ? <group ref={vehicle}><Box at={[0, 0.28, 0]} size={[0.9, 0.3, 0.45]} tint={PLAYER_COLORS[event.player]} /><Box at={[0.32, 0.52, 0]} size={[0.28, 0.23, 0.42]} tint="#eae3cf" /><Box at={[-0.12, 0.52, 0]} size={[0.5, 0.17, 0.39]} tint="#b69a6c" />{[-0.28, 0.28].flatMap(x => [-0.27, 0.27].map(z => <Box key={`${x}-${z}`} at={[x, 0.11, z]} size={[0.2, 0.23, 0.09]} tint="#394e4e" />))}</group> : <group position={position(xy(workId), Math.max(waterLevel(workId) * HEIGHT + 0.08, game.plots[workId].height * HEIGHT))}><Excavator tint={PLAYER_COLORS[event.player]} /></group>}
    {!reduced && event.tool !== 'haul' && <group ref={particles} position={position(xy(workId), Math.max(waterLevel(workId) * HEIGHT, game.plots[workId].height * HEIGHT) + 0.3)}>{Array.from({ length: 14 }, (_, i) => <mesh key={i}><dodecahedronGeometry args={[0.12 + (i % 3) * 0.05, 0]} /><meshStandardMaterial color={event.tool === 'blast' ? '#a3977a' : '#cbb38a'} /></mesh>)}</group>}
    {path.length > 0 && <PathLine points={path.map(xy)} tint="#e6c98c" game={game} floor />}
  </>
);
}
function LockStructures({ game }: { game: TerrainGame }) {
  return (
<>{LOCKS.map(l => {
    const built = game.locks[l.index] !== null; const top = WATER_STEPS[l.index] * HEIGHT; const bottom = WATER_STEPS[l.index + 1] * HEIGHT;
    return (
<group key={l.name} position={position(l.at)}>
      {[-1.8, 1.8].map(x => <Box key={x} at={[x, top / 2 + 0.15, 0]} size={[0.35, top + 0.4, 4.6]} tint={built ? '#78898a' : '#b6ad91'} />)}
      {built && [-1.5, 0, 1.5].map((z, i) => <mesh key={z} rotation={[-Math.PI / 2, 0, 0]} position={[0, top + (bottom - top) * ((i + 0.5) / 3) + 0.08, z]}><planeGeometry args={[3.2, 1.5]} /><meshStandardMaterial color="#4faeb9" /></mesh>)}
      {[-2.1, 2.1].map(z => <Box key={z} at={[0, (z < 0 ? top : bottom) + 0.35, z]} size={[3.4, 0.65, 0.18]} tint={built ? '#496c78' : '#d0aa70'} />)}
    </group>
);
  })}</>
);
}
function shipHeight(x: number, z: number) {
  const gate = LOCKS.find(l => Math.abs(x - l.at[0]) < 2 && Math.abs(z - l.at[1]) <= 2);
  if (gate) return (WATER_STEPS[gate.index] + (WATER_STEPS[gate.index + 1] - WATER_STEPS[gate.index]) * ((z - gate.at[1] + 2) / 4)) * HEIGHT;
  return waterLevel(Math.round(z) * MAP_W + Math.round(x)) * HEIGHT;
}
function TrialShip({ route, reduced }: { route: Route; reduced: boolean }) {
  const ref = useRef<THREE.Group>(null); const time = useRef(0); const { invalidate } = useThree();
  const distances = useMemo(() => { let total = 0; return route.points.map((p, i) => { if (i) total += Math.hypot(p[0] - route.points[i - 1][0], p[1] - route.points[i - 1][1]); return total; }); }, [route]);
  useFrame((_, delta) => {
    time.current += delta * 1.4; const distance = reduced ? distances[distances.length - 1] / 2 : time.current % distances[distances.length - 1];
    const index = Math.max(1, distances.findIndex(d => d >= distance));
    const a = route.points[index - 1]; const b = route.points[index];
    const f = (distance - distances[index - 1]) / Math.max(0.001, distances[index] - distances[index - 1]);
    const x = a[0] + (b[0] - a[0]) * f; const z = a[1] + (b[1] - a[1]) * f;
    ref.current!.position.set(...position([x, z], shipHeight(x, z) + 0.17));
    ref.current!.rotation.y = -Math.atan2(b[1] - a[1], b[0] - a[0]);
    if (!reduced) invalidate();
  });
  return <group ref={ref}><Box at={[0, 0.12, 0]} size={[1.55, 0.26, 0.66]} tint="#e5e3c8" /><Box at={[0, 0.26, 0]} size={[1.25, 0.1, 0.57]} tint="#69887d" /><Box at={[-0.48, 0.48, 0]} size={[0.3, 0.42, 0.52]} tint="#f5e9c5" /><Box at={[-0.48, 0.54, 0]} size={[0.33, 0.13, 0.55]} tint="#476f7b" /></group>;
}
function Controls({ reset, topDown, disabled, navigate, focus }: Pick<TerrainSceneProps, 'reset' | 'topDown' | 'disabled' | 'navigate' | 'focus'>) {
  const { camera, gl, size, invalidate } = useThree();
  const ref = useRef<OrbitControls | null>(null);
  useEffect(() => {
    const controls = new OrbitControls(camera, gl.domElement); ref.current = controls;
    const change = () => invalidate(); controls.addEventListener('change', change);
    controls.minPolarAngle = 0.05; controls.maxPolarAngle = Math.PI / 2.4;
    controls.minZoom = 3; controls.maxZoom = 85;
    controls.mouseButtons = { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN };
    return () => { controls.removeEventListener('change', change); controls.dispose(); ref.current = null; };
  }, [camera, gl, invalidate]);
  useEffect(() => { if (ref.current) { ref.current.enabled = !disabled; ref.current.enableRotate = navigate; ref.current.enablePan = navigate; } }, [camera, gl, disabled, navigate]);
  useEffect(() => {
    const controls = ref.current; if (!controls) return;
    camera.position.set(topDown ? 0 : 16, topDown ? 100 : 80, topDown ? 0.01 : 64);
    controls.target.set(0, 0, 0); camera.zoom = Math.min(size.width / 62, size.height / (topDown ? 82 : 73)); camera.updateProjectionMatrix(); controls.update(); invalidate();
  }, [camera, gl, invalidate, reset, topDown, size.width, size.height]);
  useEffect(() => {
    const controls = ref.current; if (!controls || focus === null) return;
    const target = new THREE.Vector3(...position(xy(focus), waterLevel(focus) * HEIGHT));
    const offset = camera.position.clone().sub(controls.target); controls.target.copy(target); camera.position.copy(target).add(offset);
    camera.zoom = 24; camera.updateProjectionMatrix(); controls.update(); invalidate();
  }, [focus, camera, gl, invalidate]);
  return null;
}
function Scene(props: TerrainSceneProps) {
  const { game, route, proposal, showSurvey, wet, reset, topDown, disabled, navigate, quote, focus, showReference } = props;
  const reduced = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const event = game.events[game.events.length - 1];
  const animatedEvents = useMemo(() => {
    if (!event) return [];
    if (!event.deliveries?.length) return [event];
    return Array.from(new Set(event.deliveries.map(d => d.source))).slice(0, 4).map(source => ({
      ...event,
      from: source,
      cells: event.deliveries!.filter(d => d.source === source).map(d => d.target),
    }));
  }, [event]);
  return (
<>
    <color attach="background" args={['#e7ecdf']} />
    <ambientLight intensity={0.6} /><hemisphereLight args={['#f3f2df', '#7d8b77', 1.3]} />
    <directionalLight position={[-30, 70, 25]} intensity={2} castShadow shadow-mapSize={[2048, 2048]} shadow-camera-left={-55} shadow-camera-right={55} shadow-camera-top={55} shadow-camera-bottom={-55} shadow-camera-far={180} shadow-bias={-0.0006} />
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, BASE - 0.3, 0]} receiveShadow><planeGeometry args={[200, 200]} /><shadowMaterial opacity={0.18} /></mesh>
    <Terrain {...props} /><Scenery game={game} wet={wet} /><Outlines {...props} />
    <CutPreview game={game} quote={quote} />
    {GEOGRAPHY.landmarks.filter(p => p.kind !== 'river').map(p => <PortLabel key={p.name} at={p.grid as Point} text={p.name} altitude={Math.max(waterLevel(p.grid[1] * MAP_W + p.grid[0]), game.plots[p.grid[1] * MAP_W + p.grid[0]].height) * HEIGHT + 2.2} />)}
    <LockStructures game={game} />
    {showReference && referenceLines.map((points, i) => <PathLine key={i} points={points} tint="#b86ee8" game={game} floor />)}
    <SoilPiles game={game} players={game.players} />
    {showSurvey && (route ?? proposal) && <PathLine points={(route ?? proposal)!.points} tint={route ? '#caffec' : '#ff5029'} game={game} floor={!route} />}
    {animatedEvents.map(work => <WorkAnimation key={`${work.id}-${work.from ?? 'work'}`} event={work} game={game} reduced={reduced} />)}
    {route && <TrialShip route={route} reduced={reduced} />}
    <Controls reset={reset} topDown={topDown} disabled={disabled} navigate={navigate} focus={focus} />
  </>
);
}
class Boundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  constructor(props: { children: ReactNode }) { super(props); this.state = { failed: false }; }
  static getDerivedStateFromError() { return { failed: true }; }
  render() { const { failed } = this.state; const { children } = this.props; return failed ? <div style={{ padding: 40 }}>3D 沙盘未能启动。可用右侧坐标选择施工，或换用支持 WebGL 的浏览器。</div> : children; }
}
export default function TerrainScene(props: TerrainSceneProps) {
  return (
<Boundary><Canvas orthographic shadows frameloop="demand" dpr={[1, 1.5]} camera={{ position: [22, 30, 29], zoom: 9, near: 0.1, far: 300 }} gl={{ antialias: true, alpha: false }} onCreated={({ gl }) => { gl.domElement.dataset.gameCanvas = 'pinglu-terrain'; }}>
    <Scene {...props} />
  </Canvas></Boundary>
);
}
