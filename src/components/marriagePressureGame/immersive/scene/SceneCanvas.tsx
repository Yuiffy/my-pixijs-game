"use client";

import { memo, useEffect, useMemo, useRef, useState, type MutableRefObject } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import type { Hotspot, SceneRoute } from "../sceneRouter";
import { HotContext, type Vec3 } from "./kit";
import { HomeScene, HospitalScene, OfficeScene, ParentHomeScene, ReunionScene, RoomScene } from "./indoor";
import { ParkScene } from "./outdoor";
import CommuteScene from "./CommuteScene";
import { stepCommute, type CommuteMotion } from "./commuteMotion";
import { venueView } from "./venueView";
import { VENUE_LOOKS, VenueScene } from "./venues";
import ScenePhone, { PHONE_POSITIONS } from "./ScenePhone";
import styles from "../immersive.module.css";

interface CameraShot {
  position: Vec3;
  target: Vec3;
  fov: number;
}

interface SceneLook {
  background: string;
  fog: [number, number];
  ambient: number;
  sun: number;
  sunColor: string;
  sunPosition: Vec3;
  lamp?: { position: Vec3; color: string; intensity: number };
}

const SHOTS: Record<string, CameraShot> = {
  room: { position: [0.3, 1.75, 3.6], target: [0, 0.9, -0.9], fov: 58 },
  home: { position: [0.2, 1.85, 4.3], target: [0, 0.85, -0.8], fov: 58 },
  office: { position: [0.05, 1.24, 0.82], target: [0, 0.96, -0.65], fov: 66 },
  "meeting-room": { position: [0.8, 1.7, 2.2], target: [-0.6, 1.1, -3], fov: 60 },
  commute: { position: [0, 1.72, 5.5], target: [0, 1.5, -10], fov: 62 },
  park: { position: [0, 2.0, 6.2], target: [0, 1.1, -1.2], fov: 55 },
  matchmaking: { position: [0, 1.8, 5.2], target: [0, 1.0, -1.2], fov: 55 },
  "parent-home": { position: [1.2, 1.8, 4.2], target: [-0.2, 0.8, -1], fov: 58 },
  venue: { position: [0, 1.55, 3.4], target: [0, 1.0, -0.7], fov: 55 },
  reunion: { position: [0, 1.38, 1.48], target: [0, 1.05, -1.05], fov: 68 },
  hospital: { position: [0.2, 1.6, 3.4], target: [0.3, 1.1, -3], fov: 58 },
};

function lookFor(route: SceneRoute): SceneLook {
  const winter = route.season === "winter";
  const summer = route.season === "summer";
  switch (route.id) {
    case "room":
      return { background: "#1c2130", fog: [9, 20], ambient: 0.42, sun: 0.35, sunColor: "#9fb7ff", sunPosition: [2, 3, -2], lamp: { position: [0, 2.6, 0], color: "#ffd59a", intensity: 5 } };
    case "home":
      return { background: "#1c2130", fog: [9, 22], ambient: 0.5, sun: 0.35, sunColor: "#9fb7ff", sunPosition: [1, 3, -2], lamp: { position: [0, 2.6, 0], color: "#ffe0b0", intensity: 6 } };
    case "office":
      if (route.night) return { background: "#141a26", fog: [9, 22], ambient: 0.32, sun: 0.25, sunColor: "#9fb7ff", sunPosition: [2, 4, -4], lamp: { position: [0, 2.4, -0.3], color: "#dfe8ff", intensity: 4 } };
      return { background: "#e4ded1", fog: [14, 32], ambient: 0.85, sun: 2.2, sunColor: "#ffe5bb", sunPosition: [-3, 5, -2], lamp: { position: [1, 3, 2], color: "#e5f1f5", intensity: 4 } };
    case "meeting-room":
      return { background: "#cfdbe6", fog: [10, 26], ambient: 0.72, sun: 1.1, sunColor: "#ffffff", sunPosition: [2, 5, -5], lamp: { position: [0, 3, 0], color: "#f2f6ff", intensity: route.id === "meeting-room" ? 2 : 4 } };
    case "commute":
      return { background: winter ? "#8e9db2" : summer ? "#6e7c8e" : "#e3a17c", fog: [16, 40], ambient: 0.8, sun: 1.2, sunColor: winter ? "#dfe8ff" : "#ffb98a", sunPosition: [-6, 4, -6] };
    case "park":
    case "matchmaking":
      return { background: winter ? "#cdd8e2" : "#bcd8ea", fog: [12, 34], ambient: 0.75, sun: 1.3, sunColor: "#fff4dc", sunPosition: [4, 8, 4] };
    case "reunion":
      return { background: "#a57860", fog: [12, 25], ambient: 0.85, sun: 1.4, sunColor: "#ffe1b5", sunPosition: [-3, 5, 2], lamp: { position: [0, 2.6, -0.6], color: "#ffd7a0", intensity: 9 } };
    case "hospital":
      return { background: "#dfe8e6", fog: [7, 16], ambient: 0.8, sun: 0.5, sunColor: "#eaf6ff", sunPosition: [1, 5, 2], lamp: { position: [0, 2.6, -1.5], color: "#eaf6ff", intensity: 4 } };
    case "parent-home":
      return { background: "#e8dcc4", fog: [9, 22], ambient: 0.7, sun: 1.0, sunColor: "#fff0d0", sunPosition: [3, 4, 3], lamp: { position: [0, 2.6, 0], color: "#fff0d0", intensity: 3 } };
    case "venue": {
      const venue = VENUE_LOOKS[route.venue ?? "restaurant"];
      return { background: venue.background, fog: venue.fog, ambient: venue.ambient, sun: venue.sun, sunColor: venue.sunColor, sunPosition: [3, 6, 4], lamp: venue.outdoor ? undefined : { position: [0, 2.8, -0.4], color: venue.sunColor, intensity: 3 } };
    }
    default:
      return { background: "#222", fog: [10, 30], ambient: 0.6, sun: 1, sunColor: "#fff", sunPosition: [3, 6, 4] };
  }
}

// 相机随场景切换；竖屏时拉宽视角，保证手机上也能看到主要物件
function CameraRig({ shot, walking, firstPerson, phoneOpen, reducedMotion, motion }: { shot: CameraShot; walking: boolean; firstPerson: boolean; phoneOpen: boolean; reducedMotion: boolean; motion: MutableRefObject<CommuteMotion> }) {
  const camera = useThree(state => state.camera) as THREE.PerspectiveCamera;
  const aspect = useThree(state => state.size.width / Math.max(1, state.size.height));
  const invalidate = useThree(state => state.invalidate);
  useEffect(() => {
    const narrow = aspect < 1;
    const pull = narrow && !firstPerson ? 1 + (1 - aspect) * 0.55 : 1;
    const [x, y, z] = shot.position;
    const [tx, ty, tz] = shot.target;
    camera.position.set(tx + (x - tx) * pull, y + (narrow && !firstPerson ? 0.25 : 0), tz + (z - tz) * pull);
    camera.fov = narrow ? Math.min(78, shot.fov + 14) : shot.fov;
    camera.lookAt(tx, ty - (narrow && firstPerson && !walking ? 0.32 : 0), tz);
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();
    invalidate();
  }, [camera, aspect, shot, invalidate, walking, firstPerson]);
  useFrame(() => {
    if (!walking) return;
    const phase = motion.current.distance * 7;
    const bob = reducedMotion ? 0 : Math.sin(phase * 2) * 0.012;
    camera.position.set(shot.position[0] + (reducedMotion ? 0 : Math.sin(phase) * 0.016), shot.position[1] + bob, shot.position[2]);
    camera.lookAt(shot.target[0], (phoneOpen && aspect < 1 ? -4 : shot.target[1]) + bob, shot.target[2]);
    camera.updateMatrixWorld();
  }, -1);
  return null;
}

function MotionClock({ motion }: { motion: MutableRefObject<CommuteMotion> }) {
  useFrame((_, delta) => stepCommute(motion.current, delta), -2);
  return null;
}

function ContextGuard({ onLost }: { onLost: (reason: string) => void }) {
  const gl = useThree(state => state.gl);
  useEffect(() => {
    const canvas = gl.domElement;
    canvas.dataset.marriageCanvas = "true";
    const lost = (event: Event) => {
      event.preventDefault();
      onLost("3D 场景的显卡上下文丢失，已切换到经典模式。");
    };
    canvas.addEventListener("webglcontextlost", lost);
    return () => canvas.removeEventListener("webglcontextlost", lost);
  }, [gl, onLost]);
  return null;
}

function SceneContent({ route, portrait, portraits, parenthood, month, parentActive, speaker, motion }: SceneCanvasProps) {
  const night = route.id === "room" || route.id === "home";
  switch (route.id) {
    case "room":
      return <RoomScene season={route.season} portrait={null} night={night} month={month} />;
    case "home":
      return <HomeScene season={route.season} portrait={portrait} night={night} parenthood={parenthood} month={month} />;
    case "office":
      return <OfficeScene season={route.season} portrait={null} night={Boolean(route.night)} />;
    case "meeting-room":
      return <OfficeScene season={route.season} portrait={null} night={false} meeting />;
    case "commute":
      return <CommuteScene season={route.season} motion={motion} />;
    case "park":
      return <ParkScene season={route.season} portraits={[]} showParent={parentActive} />;
    case "matchmaking":
      return <ParkScene season={route.season} portraits={portraits} showParent={false} />;
    case "parent-home":
      return <ParentHomeScene season={route.season} portrait={null} night={false} month={month} />;
    case "reunion":
      return <ReunionScene season={route.season} portrait={null} night speaker={speaker} />;
    case "hospital":
      return <HospitalScene />;
    case "venue":
      return <VenueScene venue={route.venue ?? "restaurant"} season={route.season} portrait={portrait} />;
    default:
      return null;
  }
}

/* eslint-disable react/no-unused-prop-types -- 这些字段在 SceneCanvas 内解构使用，规则误判为未使用 */
export interface SceneCanvasProps {
  route: SceneRoute;
  motion: MutableRefObject<CommuteMotion>;
  walkEnabled: boolean;
  phoneOpen: boolean;
  reducedMotion: boolean;
  hotspots: Hotspot[];
  onHotspot: (id: string) => void;
  portrait: string | null;
  portraits: string[];
  parenthood: boolean;
  parentActive: boolean;
  month: number;
  onContextLost: (reason: string) => void;
  speaker?: number;
  unread: number;
  clock: string;
  phonePreview: string;
  showPhone: boolean;
  onPhone: () => void;
}
/* eslint-enable react/no-unused-prop-types */

function SceneCanvas(props: SceneCanvasProps) {
  const { route, hotspots, onHotspot, onContextLost, showPhone, unread, phonePreview, onPhone, clock, motion, walkEnabled, reducedMotion, phoneOpen } = props;
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    const update = () => setVisible(!document.hidden);
    update();
    document.addEventListener("visibilitychange", update);
    return () => document.removeEventListener("visibilitychange", update);
  }, []);
  const walking = route.id === "commute";
  const animate = walking && walkEnabled && visible;
  useEffect(() => {
    const travel = motion.current;
    travel.moving = animate;
    return () => { travel.moving = false; };
  }, [motion, animate]);
  const [hovered, setHovered] = useState<string | null>(null);
  const phoneAnchor = useRef<HTMLButtonElement>(null);
  const look = lookFor(route);
  const shot = useMemo(() => (route.id === "venue" ? venueView(route.venue ?? "restaurant") : SHOTS[route.id] ?? SHOTS.room), [route.id, route.venue]);
  const context = useMemo(() => ({
    hotspots: Object.fromEntries(hotspots.map(spot => [spot.id, spot])),
    hovered,
    setHovered,
    onHotspot,
  }), [hotspots, hovered, onHotspot]);
  useEffect(() => () => { document.body.style.cursor = ""; }, []);
  return (
    <>
    <Canvas
      frameloop={animate ? "always" : "demand"}
      shadows
      dpr={[1, 1.75]}
      camera={{ fov: shot.fov, near: 0.05, far: 80, position: shot.position }}
      gl={{ antialias: true, alpha: false, powerPreference: "default" }}
      onPointerMissed={() => setHovered(null)}
    >
      <color attach="background" args={[look.background]} />
      <fog attach="fog" args={[look.background, look.fog[0], look.fog[1]]} />
      <ambientLight intensity={look.ambient} />
      <hemisphereLight args={["#ffffff", "#6a5a4a", 0.35]} />
      <directionalLight position={look.sunPosition} intensity={look.sun} color={look.sunColor} castShadow shadow-mapSize={walking ? [1024, 1024] : [2048, 2048]} shadow-bias={-0.0005} shadow-normalBias={0.025} shadow-camera-left={-7} shadow-camera-right={7} shadow-camera-top={7} shadow-camera-bottom={-7} />
      {look.lamp && <pointLight position={look.lamp.position} intensity={look.lamp.intensity} distance={9} color={look.lamp.color} />}
      <MotionClock motion={motion} />
      <CameraRig shot={shot} walking={walking} firstPerson={walking || route.id === "venue"} phoneOpen={phoneOpen} reducedMotion={reducedMotion} motion={motion} />
      <ContextGuard onLost={onContextLost} />
      <HotContext.Provider value={context}>
        <SceneContent {...props} />
        {showPhone && <ScenePhone scene={route.id} unread={unread} preview={phonePreview} onOpen={onPhone} anchorRef={phoneAnchor} clock={clock} motion={walking && !reducedMotion ? motion : undefined} />}
      </HotContext.Provider>
    </Canvas>
    {showPhone && PHONE_POSITIONS[route.id] && (
      <button ref={phoneAnchor} className={styles.scenePhone} data-testid="scene-phone" data-unread={unread > 0} onClick={onPhone}>
        <span>{unread > 0 ? `微信 · ${unread} 条新消息` : "拿起手机"}</span><small>{phonePreview}</small><i />
      </button>
    )}
    </>
  );
}

export default memo(SceneCanvas);
