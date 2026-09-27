'use client';

import { Canvas, useThree } from '@react-three/fiber';
import { Component, ReactNode, useEffect, useMemo } from 'react';
import * as THREE from 'three';
// Three's ESM exports require the extension for TypeScript's bundler resolution.
// eslint-disable-next-line import/extensions
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { built, Cell, ConstructionGame, MAIN_PROJECTS, Project, PROJECTS, requiredWork, SiteState } from './construction';

const COLORS = ['#c46b42', '#427d91', '#918057', '#896b99'];
type Vec = [number, number, number];
const world = (cell: Cell, y = 0): Vec => [cell[0] - 5.5, y, cell[1] - 4];
const noise = (x: number, z: number) => {
  const n = Math.sin(x * 127.1 + z * 311.7 + 42) * 43758.5453;
  return n - Math.floor(n);
};

function Box({ at, size, color, rotation = 0, opacity = 1 }: { at: Vec; size: Vec; color: string; rotation?: number; opacity?: number }) {
  return <mesh position={at} rotation={[0, rotation, 0]} castShadow receiveShadow><boxGeometry args={size} /><meshStandardMaterial color={color} roughness={0.9} transparent={opacity < 1} opacity={opacity} /></mesh>;
}
function Tree({ at, scale = 1 }: { at: Vec; scale?: number }) {
  return <group position={at} scale={scale}><mesh position={[0, 0.16, 0]} castShadow><cylinderGeometry args={[0.04, 0.055, 0.32, 5]} /><meshStandardMaterial color="#8f7c57" /></mesh><mesh position={[0, 0.53, 0]} castShadow><coneGeometry args={[0.28, 0.78, 6]} /><meshStandardMaterial color="#648974" roughness={1} /></mesh><mesh position={[0, 0.72, 0]} castShadow><coneGeometry args={[0.2, 0.6, 6]} /><meshStandardMaterial color="#789a78" roughness={1} /></mesh></group>;
}
function Water({ at, size, color = '#72b4b4' }: { at: Vec; size: [number, number]; color?: string }) {
  return <mesh position={at} rotation={[-Math.PI / 2, 0, 0]} receiveShadow><planeGeometry args={size} /><meshStandardMaterial color={color} roughness={0.3} metalness={0.16} /></mesh>;
}
function Label({ at, text, active, complete, onClick }: { at: Vec; text: string; active: boolean; complete: boolean; onClick: () => void }) {
  const texture = useMemo(() => {
    const canvas = document.createElement('canvas'); canvas.width = 320; canvas.height = 86;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = active ? '#c27345' : complete ? '#3e786e' : '#fff8e8';
    ctx.beginPath(); ctx.roundRect(4, 4, 312, 74, 10); ctx.fill();
    ctx.strokeStyle = active ? '#f9d1a2' : '#d4d4bb'; ctx.lineWidth = 3; ctx.stroke();
    ctx.fillStyle = active || complete ? '#fffaf0' : '#466657';
    ctx.font = 'bold 33px "Microsoft YaHei", sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(text, 160, 42);
    const result = new THREE.CanvasTexture(canvas); result.colorSpace = THREE.SRGBColorSpace;
    return result;
  }, [text, active, complete]);
  useEffect(() => () => texture.dispose(), [texture]);
  return <sprite position={at} scale={[1.65, 0.44, 1]} renderOrder={3} onClick={(event) => { event.stopPropagation(); onClick(); }}><spriteMaterial map={texture} depthTest={false} toneMapped={false} transparent /></sprite>;
}
function Excavator({ at, color = '#d49b4f' }: { at: Vec; color?: string }) {
  return <group position={at} rotation={[0, -0.35, 0]}><Box at={[0, 0.065, 0]} size={[0.5, 0.13, 0.37]} color="#52605a" /><Box at={[0, 0.18, 0]} size={[0.31, 0.17, 0.3]} color={color} /><Box at={[-0.06, 0.35, 0]} size={[0.18, 0.23, 0.25]} color="#eff0d8" /><Box at={[-0.07, 0.36, 0.13]} size={[0.13, 0.14, 0.01]} color="#79a1a1" /><group rotation={[0, 0, 0.65]} position={[0.12, 0.26, 0]}><Box at={[0.25, 0, 0]} size={[0.55, 0.07, 0.08]} color={color} /><group position={[0.5, 0, 0]} rotation={[0, 0, -1.15]}><Box at={[0.12, 0, 0]} size={[0.33, 0.06, 0.07]} color={color} /><Box at={[0.31, -0.045, 0]} size={[0.12, 0.13, 0.17]} color="#52605a" /></group></group></group>;
}
function Crane({ at, progress }: { at: Vec; progress: number }) {
  return <group position={at}><Box at={[0, 0.38, 0]} size={[0.06, 0.76, 0.06]} color="#d7ad68" /><Box at={[0.08, 0.77, 0]} size={[1.03, 0.05, 0.06]} color="#d7ad68" /><Box at={[0.54, 0.54, 0]} size={[0.015, 0.48, 0.015]} color="#7f8980" /><Box at={[0.54, 0.28, 0]} size={[0.13, 0.06, 0.12]} color="#97a394" /><Box at={[-0.38, 0.74, 0]} size={[0.14, 0.15, 0.14]} color="#aaa994" />{progress > 0 && <Box at={[0, 0.02, 0]} size={[0.22, 0.05, 0.24]} color="#7c8b82" />}</group>;
}
function Flag({ at, owner }: { at: Vec; owner: number }) {
  return <group position={at}><Box at={[0, 0.36, 0]} size={[0.025, 0.72, 0.025]} color="#766e59" /><Box at={[0.13, 0.61, 0]} size={[0.26, 0.15, 0.025]} color={COLORS[owner]} /></group>;
}
function Lock({ progress, accepted }: { progress: number; accepted: boolean }) {
  const h = 0.16 + progress * 0.6;
  return (
<group position={world([5.2, 3.25], 0.04)}>
    <Box at={[0, -0.05, 0]} size={[1.05, 0.12, 2.4]} color="#a5b1a3" />
    {[-0.44, 0.44].map((x) => <group key={x}><Box at={[x, h / 2, 0]} size={[0.18, h, 2.4]} color="#d4d4bd" /><Box at={[x, h + 0.015, 0]} size={[0.23, 0.04, 2.44]} color="#edebd8" />{[0, 1, 2, 3, 4, 5].map((n) => <Box key={n} at={[x, h + 0.1, n * 0.43 - 1.05]} size={[0.018, 0.19, 0.018]} color="#7d9b92" />)}</group>)}
    {[-0.77, 0.01, 0.78].map((z, i) => <group key={z}><Water at={[0, 0.1 + i * 0.075, z]} size={[0.65, 0.72]} color={accepted ? '#5ca7aa' : '#a5c2b5'} />{progress > 0.4 && <Box at={[0, 0.15 + progress * 0.3, z - 0.34]} size={[0.69, progress * 0.6, 0.07]} color={accepted ? '#587976' : '#938e71'} />}</group>)}
    {progress > 0.5 && <><Box at={[0.72, 0.25, 0.3]} size={[0.34, 0.5, 0.49]} color="#f0e7cc" /><Box at={[0.72, 0.52, 0.3]} size={[0.41, 0.07, 0.56]} color="#647e79" /><Box at={[0.72, 0.38, 0.55]} size={[0.2, 0.1, 0.02]} color="#76a3a2" /></>}
  </group>
);
}
function Bridge({ at, progress, green = false }: { at: Vec; progress: number; green?: boolean }) {
  const deck = green ? '#8fba70' : '#ded9c5';
  return (
<group position={at}>
    {[-0.65, 0.65].map((x) => <group key={x}><Box at={[x, progress * 0.34, 0]} size={[0.17, 0.12 + progress * 0.64, 0.5]} color="#b9b9a1" /><Box at={[x, 0.03, 0]} size={[0.3, 0.06, 0.65]} color="#a8af99" /></group>)}
    {progress > 0.35 && <><Box at={[0, 0.22 + progress * 0.63, 0]} size={[1.85, 0.13, green ? 0.74 : 0.58]} color={deck} /><Box at={[0, 0.33 + progress * 0.63, -0.32]} size={[1.88, 0.14, 0.05]} color={green ? '#688d5b' : '#a4aaa0'} /><Box at={[0, 0.33 + progress * 0.63, 0.32]} size={[1.88, 0.14, 0.05]} color={green ? '#688d5b' : '#a4aaa0'} /></>}
    {progress > 0.8 && (green ? <><Tree at={[-0.65, 0.96, 0]} scale={0.32} /><Tree at={[0.53, 0.96, 0.04]} scale={0.36} /><mesh position={[0, 0.98, 0.05]}><boxGeometry args={[0.15, 0.1, 0.06]} /><meshStandardMaterial color="#b79868" /></mesh></> : <>{[-0.5, 0, 0.5].map((x) => <Box key={x} at={[x, 0.3 + progress * 0.63, 0]} size={[0.23, 0.008, 0.025]} color="#eee6c9" />)}</>)}
  </group>
);
}
function Fishway({ progress }: { progress: number }) {
  return <group position={world([6.05, 2.25], 0.07)} rotation={[0, -0.15, 0]}>{Array.from({ length: 7 }, (_, i) => <group key={i} position={[i % 2 === 0 ? -0.12 : 0.12, i * 0.035, i * 0.16 - 0.45]}><Box at={[0, 0, 0]} size={[0.5, 0.1, 0.18]} color="#cbcbb2" />{progress > i / 7 && <Water at={[0, 0.057, 0]} size={[0.42, 0.13]} color="#73b9b1" />}</group>)}</group>;
}
function SavingPools({ progress }: { progress: number }) {
  return <group position={world([6.5, 3.35], 0.04)}>{[0, 1, 2].map((i) => <group key={i} position={[i * 0.31, 0.07 * i, 0]}><Box at={[0, 0, 0]} size={[0.26, 0.12, 0.88]} color="#b7bfa9" />{progress > i / 3 && <Water at={[0, 0.065, 0]} size={[0.21, 0.78]} />}</group>)}</group>;
}
function Controls({ reset, interactive }: { reset: number; interactive: boolean }) {
  const { camera, gl, invalidate, size } = useThree();
  const controls = useMemo(() => new OrbitControls(camera, gl.domElement), [camera, gl]);
  useEffect(() => {
    controls.minPolarAngle = 0.25; controls.maxPolarAngle = Math.PI / 2.55;
    controls.minZoom = 24; controls.maxZoom = 110; controls.enablePan = true;
    const requestFrame = () => invalidate();
    controls.addEventListener('change', requestFrame);
    return () => { controls.removeEventListener('change', requestFrame); controls.dispose(); };
  }, [controls, invalidate]);
  useEffect(() => { controls.enabled = interactive; }, [controls, interactive]);
  useEffect(() => {
    camera.position.set(10.5, 12.5, 13.5);
    controls.target.set(0, 0, 0); camera.zoom = Math.min(size.width / 18, size.height / 13); camera.updateProjectionMatrix(); controls.update(); invalidate();
  }, [reset, camera, controls, invalidate, size.width, size.height]);
  return null;
}
function Terrain({ game, sites }: { game: ConstructionGame; sites: Record<string, SiteState> }) {
  const routeKeys = new Set(MAIN_PROJECTS.flatMap((p) => p.cells.map(([x, z]) => `${x},${z}`)));
  const cells = useMemo(() => Array.from({ length: 108 }, (_, i) => ({ x: i % 12, z: Math.floor(i / 12) })), []);
  return (
<>
    <Box at={[0, -0.46, 0]} size={[12.5, 0.8, 9.45]} color="#b3b199" /><Box at={[0, -0.82, 0]} size={[12.8, 0.13, 9.75]} color="#737e65" />
    {cells.map(({ x, z }) => {
      const path = routeKeys.has(`${x},${z}`);
      const mountain = !path && x > 0 && x < 5 && z < 4;
      const bay = x > 9 && z > 5;
      const y = mountain ? 0.24 + noise(x, z) * 0.28 : -0.02;
      const color = bay ? '#a6c7bd' : mountain ? ['#b9c2a1', '#aeb99b', '#a8b69b'][Math.floor(noise(x, z) * 3)] : ['#c6d2b0', '#cdd7b6', '#becba8'][Math.floor(noise(x, z) * 3)];
      return <group key={`${x}-${z}`} position={world([x, z])}><Box at={[0, y / 2, 0]} size={[0.99, 0.15 + y, 0.99]} color={color} />{bay && <Water at={[0, 0.07, 0]} size={[0.97, 0.97]} color="#86bdb6" />}{!path && !bay && noise(x + 12, z) > 0.56 && !PROJECTS.some((p) => !p.main && Math.hypot(p.at[0] - x, p.at[1] - z) < 1.25) && <Tree at={[0.1, y + 0.12, 0.15]} scale={0.65 + noise(z, x) * 0.5} />}{mountain && noise(x, z) > 0.65 && <mesh position={[-0.1, y + 0.2, -0.1]} castShadow><dodecahedronGeometry args={[0.34, 0]} /><meshStandardMaterial color="#a1aa99" flatShading /></mesh>}</group>;
    })}
    <Water at={world([-0.5, 4], 0.08)} size={[1.9, 0.64]} /><Water at={world([11.3, 4.4], 0.09)} size={[0.9, 2.1]} color="#79aaa9" />
    {[[3, 1], [4, 1], [5, 1]].map((cell, i) => <Water key={i} at={world(cell as unknown as Cell, 0.43)} size={[1.02, 0.31]} color={built(game, 'C', sites) ? '#9fbc98' : '#9fbfb6'} />)}
    {[-3.5, 2.8].map((x) => <Box key={x} at={[x, 0.1, 3.05]} size={[2.6, 0.015, 0.23]} color="#ddd0a8" rotation={0.1} />)}
    {[0, 1, 2].map((i) => <group key={i} position={world([0.3 + i * 0.45, 6.9], 0.08)}><Box at={[0, 0.17, 0]} size={[0.34, 0.34, 0.42]} color="#efe3bc" /><mesh position={[0, 0.43, 0]} rotation={[0, Math.PI / 4, 0]}><coneGeometry args={[0.34, 0.23, 4]} /><meshStandardMaterial color="#bb8262" /></mesh></group>)}
  </>
);
}
function Site({ game, project, site, selected, ghost, onSelect }: { game: ConstructionGame; project: Project; site: SiteState; selected: boolean; ghost: boolean; onSelect: (id: string) => void }) {
  const progress = site.work / requiredWork(game, project);
  const owner = Object.entries(site.contributions).sort((a, b) => b[1] - a[1])[0];
  const color = site.accepted ? '#61a8aa' : progress >= 1 ? '#89a9a0' : progress ? '#b6a483' : '#dacbac';
  const route = MAIN_PROJECTS.flatMap((p) => p.cells);
  return (
<group>
    {project.cells.map((cell) => {
      const routeIndex = route.findIndex((c) => c[0] === cell[0] && c[1] === cell[1]);
      const before: Cell = route[routeIndex - 1] ?? cell;
      const after: Cell = route[routeIndex + 1] ?? cell;
      const across = before[0] !== cell[0] || after[0] !== cell[0];
      const along = before[1] !== cell[1] || after[1] !== cell[1];
      return (
<group key={`${cell[0]}-${cell[1]}`} position={world(cell)} onClick={(event) => { event.stopPropagation(); onSelect(project.id); }}>
        <Box at={[0, 0.1, 0]} size={[0.96, 0.09, 0.96]} color={selected ? '#e6be80' : '#bdc7a9'} />
        <Box at={[0, 0.145, 0]} size={[across ? 1 : 0.58, 0.028, along ? 1 : 0.58]} color={color} />
        {progress > 0 && <Water at={[0, 0.17, 0]} size={[across ? 1 : 0.5, along ? 1 : 0.5]} color={color} />}
        {progress === 0 && [-0.33, 0.33].map((z) => <Box key={z} at={[0, 0.17, z]} size={[0.66, 0.015, 0.025]} color="#f5edd2" />)}
        {project.kind === 'rock' && progress < 1 && <mesh position={[0.12, 0.2 + (1 - progress) * 0.25, -0.1]} scale={[1, 1 - progress * 0.6, 0.75]} castShadow><dodecahedronGeometry args={[0.42, 0]} /><meshStandardMaterial color="#a6ac92" flatShading /></mesh>}
        {project.kind === 'fill' && progress < 1 && <Box at={[0.2, 0.22, 0.16]} size={[0.33, 0.1 + progress * 0.22, 0.37]} color="#c2a272" />}
      </group>
);
    })}
    {project.kind === 'lock' && <Lock progress={progress} accepted={site.accepted} />}
    {project.kind === 'bridge' && <Bridge at={world(project.at, 0.06)} progress={progress} />}
    {project.kind === 'wildlife' && <Bridge at={world(project.at, 0.32)} progress={progress} green />}
    {project.kind === 'fishway' && <Fishway progress={progress} />}
    {project.kind === 'saving' && <SavingPools progress={progress} />}
    {project.kind === 'wetland' && <group position={world(project.at, 0.1)}><Water at={[0, 0, 0]} size={[1.5, 0.95]} color={progress ? '#8fae82' : '#c4bc95'} />{[0, 1, 2, 3, 4].map((i) => <Tree key={i} at={[i * 0.25 - 0.6, 0, i % 2 ? 0.37 : -0.4]} scale={0.25 + progress * 0.15} />)}</group>}
    {project.main && !site.accepted && (progress > 0 || selected) && <Excavator at={world([project.at[0] - 0.45, project.at[1] + 0.5], 0.2)} color={ghost ? '#e8bd73' : '#d7a354'} />}
    {['lock', 'bridge'].includes(project.kind) && progress < 1 && <Crane at={world([project.at[0] - 0.75, project.at[1] - 0.2], 0.13)} progress={progress} />}
    {owner && <Flag at={world([project.at[0] + 0.45, project.at[1] + 0.4], 0.17)} owner={Number(owner[0])} />}
    <Label at={world(project.at, project.main ? 1.35 : 1.7)} text={`${project.main ? `${project.id} ` : ''}${project.short}${site.accepted ? ' ✓' : ghost ? ' · 计划' : ''}`} active={selected} complete={site.accepted} onClick={() => onSelect(project.id)} />
  </group>
);
}
function Scene({ game, sites, selected, onSelect, reset, interactive }: { game: ConstructionGame; sites: Record<string, SiteState>; selected: string; onSelect: (id: string) => void; reset: number; interactive: boolean }) {
  return (
<>
    <color attach="background" args={['#e7e9dc']} />
    <ambientLight intensity={0.45} /><hemisphereLight args={['#f7f0d7', '#829683', 1.25]} />
    <directionalLight position={[-7, 13, 8]} intensity={2} color="#fff3d6" castShadow shadow-mapSize={[2048, 2048]} shadow-camera-left={-10} shadow-camera-right={10} shadow-camera-top={9} shadow-camera-bottom={-9} shadow-bias={-0.0005} />
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.93, 0]} receiveShadow><planeGeometry args={[200, 200]} /><shadowMaterial opacity={0.12} /></mesh>
    <Terrain game={game} sites={sites} />
    {PROJECTS.map((project) => <Site key={project.id} game={game} project={project} site={sites[project.id]} selected={selected === project.id} ghost={sites[project.id].work > game.sites[project.id].work || sites[project.id].accepted !== game.sites[project.id].accepted} onSelect={onSelect} />)}
    <Controls reset={reset} interactive={interactive} />
  </>
);
}
class SceneBoundary extends Component<{ children: ReactNode; fallback: ReactNode }, { failed: boolean }> {
  constructor(props: { children: ReactNode; fallback: ReactNode }) { super(props); this.state = { failed: false }; }
  static getDerivedStateFromError() { return { failed: true }; }
  render() { const { failed } = this.state; const { fallback, children } = this.props; return failed ? fallback : children; }
}
export default function CanalDiorama({ game, sites, selected, onSelect, reset, interactive }: { game: ConstructionGame; sites: Record<string, SiteState>; selected: string; onSelect: (id: string) => void; reset: number; interactive: boolean }) {
  const fallback = <div style={{ padding: 40, color: '#456751' }}>当前设备无法打开 3D 沙盘。下方工地清单可完成全部游戏操作。</div>;
  return (
<SceneBoundary fallback={fallback}><Canvas orthographic shadows dpr={[1, 1.5]} frameloop="demand" camera={{ position: [10.5, 12.5, 13.5], zoom: 45, near: 0.1, far: 120 }} gl={{ antialias: true, alpha: false }} fallback={fallback} onCreated={({ gl }) => { gl.domElement.dataset.gameCanvas = 'pinglu-construction'; gl.setClearColor('#e7e9dc'); }}>
    <Scene game={game} sites={sites} selected={selected} onSelect={onSelect} reset={reset} interactive={interactive} />
  </Canvas></SceneBoundary>
);
}
