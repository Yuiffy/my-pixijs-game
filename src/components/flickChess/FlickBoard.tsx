"use client";

import { Canvas, type ThreeEvent, useThree } from "@react-three/fiber";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import type { FlickSnapshot } from "./engine";

type FlickPiece = FlickSnapshot["pieces"][number];
type AimChange = { pieceId: string; power: number } | null;
type BoardProps = {
  snapshot: FlickSnapshot;
  onShot: (pieceId: string, angleRadians: number, power: number) => void;
  onAimChange: (aim: AimChange) => void;
  disabled?: boolean;
};
type Aim = {
  pieceId: string;
  pointerId: number;
  angle: number;
  power: number;
};
type CaptureTarget = EventTarget & {
  setPointerCapture: (pointerId: number) => void;
  hasPointerCapture: (pointerId: number) => boolean;
  releasePointerCapture: (pointerId: number) => void;
};

const BOARD_PLANE = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const MAX_PULL = 3.25;
const RED = "#e75e55";
const BLUE = "#61d7d2";

function makeBoardTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = 1450;
  const context = canvas.getContext("2d");
  if (!context) return null;

  const { width, height } = canvas;
  const base = context.createLinearGradient(0, 0, width, height);
  base.addColorStop(0, "#436c62");
  base.addColorStop(0.48, "#315650");
  base.addColorStop(1, "#254a48");
  context.fillStyle = base;
  context.fillRect(0, 0, width, height);

  // Restrained grain gives the lacquered surface depth without hiding the grid.
  for (let i = 0; i < 180; i += 1) {
    const seed = Math.sin(i * 91.217) * 43758.5453;
    const t = seed - Math.floor(seed);
    const y = t * height;
    context.strokeStyle = i % 3 === 0 ? "#b5c8a3" : "#102b2c";
    context.globalAlpha = 0.015 + (i % 4) * 0.006;
    context.lineWidth = i % 7 === 0 ? 3 : 1;
    context.beginPath();
    context.moveTo(0, y);
    context.bezierCurveTo(width * 0.32, y + 16, width * 0.7, y - 11, width, y + 5);
    context.stroke();
  }
  context.globalAlpha = 1;

  const left = 91;
  const right = width - left;
  const top = 76;
  const bottom = height - top;
  const col = (right - left) / 8;
  const row = (bottom - top) / 9;
  const xAt = (index: number) => left + index * col;
  const yAt = (index: number) => top + index * row;

  context.strokeStyle = "#d7c698";
  context.lineWidth = 3;
  context.globalAlpha = 0.9;
  context.strokeRect(left - 20, top - 19, right - left + 40, bottom - top + 38);
  context.lineWidth = 2.4;
  for (let i = 0; i <= 9; i += 1) {
    context.beginPath();
    context.moveTo(left, yAt(i));
    context.lineTo(right, yAt(i));
    context.stroke();
  }
  for (let i = 0; i <= 8; i += 1) {
    context.beginPath();
    context.moveTo(xAt(i), top);
    context.lineTo(xAt(i), yAt(4));
    context.moveTo(xAt(i), yAt(5));
    context.lineTo(xAt(i), bottom);
    context.stroke();
  }
  for (const start of [0, 7]) {
    context.beginPath();
    context.moveTo(xAt(3), yAt(start));
    context.lineTo(xAt(5), yAt(start + 2));
    context.moveTo(xAt(5), yAt(start));
    context.lineTo(xAt(3), yAt(start + 2));
    context.stroke();
  }
  context.globalAlpha = 1;

  context.fillStyle = "#d8c99e";
  context.globalAlpha = 0.68;
  context.font = '700 52px "KaiTi", "STKaiti", serif';
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText("楚  河", width * 0.28, height * 0.5);
  context.fillText("汉  界", width * 0.72, height * 0.5);
  context.globalAlpha = 1;

  for (const x of [left - 43, right + 43]) {
    for (const y of [top - 37, bottom + 37]) {
      context.strokeStyle = "#d7c698";
      context.lineWidth = 3;
      context.beginPath();
      context.arc(x, y, 12, 0, Math.PI * 2);
      context.stroke();
      context.beginPath();
      context.arc(x, y, 3, 0, Math.PI * 2);
      context.fillStyle = "#d7c698";
      context.fill();
    }
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

function BoardSurface({ width, length }: { width: number; length: number }) {
  const texture = useMemo(() => makeBoardTexture(), []);
  useEffect(() => () => texture?.dispose(), [texture]);

  return (
    <group>
      <mesh position={[0, -0.43, 0]} castShadow receiveShadow>
        <boxGeometry args={[width + 1.06, 0.34, length + 1.06]} />
        <meshStandardMaterial color="#53382f" metalness={0.15} roughness={0.62} />
      </mesh>
      <mesh position={[0, -0.24, 0]} castShadow receiveShadow>
        <boxGeometry args={[width + 0.72, 0.22, length + 0.72]} />
        <meshStandardMaterial color="#ae8254" metalness={0.3} roughness={0.46} />
      </mesh>
      <mesh position={[0, -0.12, 0]} castShadow receiveShadow>
        <boxGeometry args={[width, 0.24, length]} />
        <meshStandardMaterial color="#254f4a" metalness={0.09} roughness={0.44} />
      </mesh>
      <mesh position={[0, 0.009, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[width - 0.015, length - 0.015]} />
        <meshStandardMaterial map={texture} color={texture ? "#ffffff" : "#315650"} roughness={0.66} />
      </mesh>
      <mesh position={[0, -0.55, 0]} receiveShadow>
        <boxGeometry args={[width + 1.18, 0.045, length + 1.18]} />
        <meshStandardMaterial color="#c1a172" metalness={0.7} roughness={0.32} />
      </mesh>
    </group>
  );
}

function Portrait({ path, radius, height }: { path: string; radius: number; height: number }) {
  const [texture, setTexture] = useState<THREE.Texture | null>(null);
  useEffect(() => {
    let mounted = true;
    const loader = new THREE.TextureLoader();
    const loaded = loader.load(
      path,
      (imageTexture) => {
        imageTexture.colorSpace = THREE.SRGBColorSpace;
        imageTexture.anisotropy = 8;
        if (mounted) setTexture(imageTexture);
      },
      undefined,
      () => { if (mounted) setTexture(null); },
    );
    return () => {
      mounted = false;
      loaded.dispose();
    };
  }, [path]);

  if (!texture) {
    return (
      <mesh position={[0, height / 2 + 0.014, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[radius * 0.33, 24]} />
        <meshBasicMaterial color="#c6ad79" transparent opacity={0.75} />
      </mesh>
    );
  }
  return (
    <mesh position={[0, height / 2 + 0.018, 0]} rotation={[-Math.PI / 2, 0, 0]}>
      <planeGeometry args={[radius * 1.73, radius * 1.73]} />
      <meshBasicMaterial map={texture} transparent alphaTest={0.04} depthWrite={false} side={THREE.DoubleSide} toneMapped={false} />
    </mesh>
  );
}

function Piece({
  piece,
  active,
  hovered,
  selectable,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onPointerCancel,
  onPointerOver,
  onPointerOut,
}: {
  piece: FlickPiece;
  active: boolean;
  hovered: boolean;
  selectable: boolean;
  onPointerDown: (event: ThreeEvent<PointerEvent>) => void;
  onPointerMove: (event: ThreeEvent<PointerEvent>) => void;
  onPointerUp: (event: ThreeEvent<PointerEvent>) => void;
  onPointerCancel: (event: ThreeEvent<PointerEvent>) => void;
  onPointerOver: () => void;
  onPointerOut: () => void;
}) {
  const teamColor = piece.side === "red" ? RED : BLUE;
  const topY = piece.height / 2;

  return (
    <group
      position={[piece.x, piece.y, piece.z]}
      rotation={[0, piece.angle || 0, 0]}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      onPointerOver={onPointerOver}
      onPointerOut={onPointerOut}
    >
      <mesh castShadow receiveShadow>
        <cylinderGeometry args={[piece.radius, piece.radius * 0.94, piece.height, 40]} />
        <meshStandardMaterial color={teamColor} metalness={0.42} roughness={0.36} />
      </mesh>
      <mesh position={[0, topY + 0.002, 0]} receiveShadow>
        <cylinderGeometry args={[piece.radius * 0.91, piece.radius * 0.91, 0.013, 40]} />
        <meshStandardMaterial color="#f3eee0" metalness={0.1} roughness={0.58} />
      </mesh>
      <mesh position={[0, topY + 0.02, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[piece.radius * 0.88, 0.037, 8, 40]} />
        <meshStandardMaterial color={teamColor} emissive={teamColor} emissiveIntensity={active ? 0.75 : 0.14} metalness={0.5} roughness={0.3} />
      </mesh>
      <Portrait path={piece.portrait} radius={piece.radius} height={piece.height} />
      {(active || hovered) && selectable && (
        <mesh position={[0, -piece.height / 2 + 0.035, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[piece.radius + 0.13, active ? 0.066 : 0.039, 8, 48]} />
          <meshBasicMaterial color={active ? "#fff0bd" : teamColor} transparent opacity={active ? 0.98 : 0.72} />
        </mesh>
      )}
    </group>
  );
}

function AimArrow({ piece, aim }: { piece: FlickPiece; aim: Aim }) {
  if (aim.power < 0.025) return null;
  const start = piece.radius + 0.12;
  const end = start + 1.0 + aim.power * 2.65;
  const length = end - start - 0.18;
  const color = piece.side === "red" ? "#ffe58d" : "#b3fff2";

  return (
    <group position={[piece.x, piece.y + piece.height / 2 + 0.14, piece.z]} rotation={[0, Math.PI / 2 - aim.angle, 0]}>
      <mesh position={[0, 0, start + length / 2]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.035 + aim.power * 0.03, 0.035 + aim.power * 0.03, length, 10]} />
        <meshBasicMaterial color={color} transparent opacity={0.91} depthWrite={false} />
      </mesh>
      <mesh position={[0, 0, end - 0.11]} rotation={[Math.PI / 2, 0, 0]}>
        <coneGeometry args={[0.21 + aim.power * 0.045, 0.38, 12]} />
        <meshBasicMaterial color={color} transparent opacity={0.98} depthWrite={false} />
      </mesh>
      <mesh position={[0, -0.11, -(0.3 + aim.power * 1.35) / 2]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.022, 0.022, 0.3 + aim.power * 1.35, 8]} />
        <meshBasicMaterial color="#ffffff" transparent opacity={0.5} depthWrite={false} />
      </mesh>
    </group>
  );
}

function CameraRig({ width, length }: { width: number; length: number }) {
  const { camera, size } = useThree();
  useLayoutEffect(() => {
    if (!(camera instanceof THREE.OrthographicCamera)) return;
    const aspect = size.width / Math.max(1, size.height);
    const viewHeight = Math.max(length * (aspect >= 1 ? 1.23 : 1.08), (width + 1.85) / aspect);
    camera.left = -(viewHeight * aspect) / 2;
    camera.right = (viewHeight * aspect) / 2;
    camera.top = viewHeight / 2;
    camera.bottom = -viewHeight / 2;
    camera.position.set(0, 18, 15);
    camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();
  }, [camera, size.width, size.height, width, length]);
  return null;
}

function Scene({ snapshot, onShot, onAimChange, disabled = false }: BoardProps) {
  const { gl } = useThree();
  const [aim, setAim] = useState<Aim | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const aimRef = useRef<Aim | null>(null);
  const inputLocked = disabled || snapshot.phase !== "aiming" || snapshot.winner !== null;

  const clearAim = useCallback(() => {
    aimRef.current = null;
    setAim(null);
    onAimChange(null);
    gl.domElement.style.cursor = "default";
  }, [gl, onAimChange]);

  useEffect(() => {
    if (inputLocked && aimRef.current) clearAim();
  }, [clearAim, inputLocked]);

  useEffect(() => {
    window.addEventListener("blur", clearAim);
    return () => {
      window.removeEventListener("blur", clearAim);
      gl.domElement.style.cursor = "default";
    };
  }, [clearAim, gl]);

  const updateAim = (event: ThreeEvent<PointerEvent>) => {
    const { current } = aimRef;
    if (!current || current.pointerId !== event.pointerId) return null;
    const piece = snapshot.pieces.find((candidate) => candidate.id === current.pieceId);
    if (!piece || !piece.inPlay) return null;
    const hit = event.ray.intersectPlane(BOARD_PLANE, new THREE.Vector3());
    if (!hit) return current;
    const dx = piece.x - hit.x;
    const dz = piece.z - hit.z;
    const distance = Math.hypot(dx, dz);
    const next = {
      ...current,
      angle: distance > 0.01 ? Math.atan2(dz, dx) : current.angle,
      power: Math.min(1, distance / MAX_PULL),
    };
    aimRef.current = next;
    setAim(next);
    onAimChange({ pieceId: next.pieceId, power: next.power });
    return next;
  };

  const startAim = (piece: FlickPiece, event: ThreeEvent<PointerEvent>) => {
    if (inputLocked || piece.side !== snapshot.turn || !piece.inPlay || aimRef.current || event.button !== 0) return;
    event.stopPropagation();
    (event.target as CaptureTarget | null)?.setPointerCapture(event.pointerId);
    const initial = { pieceId: piece.id, pointerId: event.pointerId, angle: 0, power: 0 };
    aimRef.current = initial;
    setAim(initial);
    onAimChange({ pieceId: piece.id, power: 0 });
    gl.domElement.style.cursor = "grabbing";
  };

  const finishAim = (event: ThreeEvent<PointerEvent>, cancel = false) => {
    if (!aimRef.current || aimRef.current.pointerId !== event.pointerId) return;
    event.stopPropagation();
    const finalAim = cancel ? aimRef.current : updateAim(event);
    const target = event.target as CaptureTarget | null;
    if (target?.hasPointerCapture(event.pointerId)) target.releasePointerCapture(event.pointerId);
    clearAim();
    if (!cancel && finalAim && finalAim.power >= 0.04 && !inputLocked) {
      onShot(finalAim.pieceId, finalAim.angle, finalAim.power);
    }
  };

  const visiblePieces = snapshot.pieces.filter((piece) => piece.inPlay && piece.y > -1);
  const aimedPiece = aim && visiblePieces.find((piece) => piece.id === aim.pieceId);

  return (
    <>
      <color attach="background" args={["#1d2227"]} />
      <ambientLight intensity={1.65} />
      <hemisphereLight args={["#f0e3c2", "#193d42", 1.1]} />
      <directionalLight position={[-7, 18, 10]} intensity={2.7} color="#fff1d6" castShadow shadow-mapSize={[2048, 2048]} shadow-camera-left={-11} shadow-camera-right={11} shadow-camera-top={14} shadow-camera-bottom={-14} shadow-bias={-0.00035} />
      <directionalLight position={[8, 11, -8]} intensity={0.65} color="#9cdbd4" />
      <CameraRig width={snapshot.board.width} length={snapshot.board.length} />
      <mesh position={[0, -0.68, 0]} receiveShadow>
        <boxGeometry args={[snapshot.board.width + 13, 0.16, snapshot.board.length + 12]} />
        <meshStandardMaterial color="#303337" roughness={0.91} />
      </mesh>
      <BoardSurface width={snapshot.board.width} length={snapshot.board.length} />
      {visiblePieces.map((piece) => {
        const selectable = !inputLocked && piece.side === snapshot.turn;
        return (
          <Piece
            key={piece.id}
            piece={piece}
            active={aim?.pieceId === piece.id}
            hovered={hoveredId === piece.id}
            selectable={selectable}
            onPointerDown={(event) => startAim(piece, event)}
            onPointerMove={(event) => { if (aimRef.current?.pieceId === piece.id) updateAim(event); }}
            onPointerUp={(event) => finishAim(event)}
            onPointerCancel={(event) => finishAim(event, true)}
            onPointerOver={() => {
              if (selectable && !aimRef.current) {
                setHoveredId(piece.id);
                gl.domElement.style.cursor = "grab";
              }
            }}
            onPointerOut={() => {
              if (hoveredId === piece.id) setHoveredId(null);
              if (!aimRef.current) gl.domElement.style.cursor = "default";
            }}
          />
        );
      })}
      {aim && aimedPiece && <AimArrow piece={aimedPiece} aim={aim} />}
    </>
  );
}

export default function FlickBoard(props: BoardProps) {
  return (
    <Canvas
      orthographic
      shadows
      dpr={[1, 1.8]}
      camera={{ position: [0, 18, 15], near: 0.1, far: 100 }}
      gl={{ antialias: true, alpha: false, powerPreference: "high-performance" }}
      onCreated={({ gl }) => { gl.domElement.dataset.gameCanvas = "flick-chess"; }}
      style={{ width: "100%", height: "100%", display: "block", touchAction: "none" }}
    >
      <Scene {...props} />
    </Canvas>
  );
}
