"use client";

import { Canvas, useFrame, useThree } from "@react-three/fiber";
import {
  memo,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MutableRefObject,
} from "react";
import * as THREE from "three";
// Three's ESM export paths and its type declarations require the .js suffix.
// eslint-disable-next-line import/extensions
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
// eslint-disable-next-line import/extensions
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { activeSpots, corridorOpen } from "./world";
import type { Game } from "./types";

export type RenderStats = {
  calls: number;
  triangles: number;
  type: string;
  assets: string[];
  fps: number;
};
type Props = {
  game: MutableRefObject<Game>;
  stats: MutableRefObject<RenderStats>;
  brightness: number;
  quality: "high" | "low";
  onReady: () => void;
  onError: (message: string) => void;
};

function labelTexture(
  value: string,
  small: string,
  background = "#262a31",
  ink = "#d4c4a2",
) {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, 512, 512);
  ctx.strokeStyle = "#77634e";
  ctx.lineWidth = 5;
  ctx.strokeRect(14, 14, 484, 484);
  ctx.fillStyle = ink;
  ctx.textAlign = "center";
  ctx.font = "52px Georgia";
  ctx.fillText(value, 256, 247);
  ctx.font = "18px monospace";
  ctx.fillText(small, 256, 301);
  const t = new THREE.CanvasTexture(canvas);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function nightWindow() {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext("2d")!;
  const sky = ctx.createLinearGradient(0, 0, 0, 512);
  sky.addColorStop(0, "#11243c");
  sky.addColorStop(1, "#3a4d5c");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, 512, 512);
  ctx.fillStyle = "#b6cad3";
  ctx.beginPath();
  ctx.arc(356, 97, 25, 0, Math.PI * 2);
  ctx.fill();
  for (let i = 0; i < 18; i++) {
    const x = i * 34 - 30;
    const top = 240 + Math.sin(i * 4.7) * 65;
    ctx.fillStyle = i % 2 ? "#12222d" : "#172c37";
    ctx.fillRect(x, top, 30, 512 - top);
    for (let y = top + 15; y < 510; y += 23) for (let col = 0; col < 3; col++) {
        ctx.fillStyle =
          (i + col + Math.floor(y)) % 5 === 0 ? "#958366" : "#283b46";
        ctx.fillRect(x + 5 + col * 8, y, 3, 8);
      }
  }
  ctx.strokeStyle = "rgba(174,207,218,.25)";
  ctx.lineWidth = 1;
  for (let i = 0; i < 90; i++) {
    const x = (i * 113) % 512;
    const y = (i * 157) % 512;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x - 4, y + 32);
    ctx.stroke();
  }
  const t = new THREE.CanvasTexture(canvas);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function World({
  game,
  stats,
  brightness,
  onReady,
  onError,
}: Omit<Props, "quality">) {
  const { gl, scene, camera } = useThree();
  const [assets, setAssets] = useState<{
    apartment: THREE.Group;
    sui: THREE.Group;
  } | null>(null);
  const model = useRef<THREE.Group>(null);
  const door = useRef<THREE.Group>(null);
  const markers = useRef<THREE.Group>(null);
  const ambient = useRef<THREE.AmbientLight>(null);
  const main = useRef<THREE.SpotLight>(null);
  const studio = useRef<THREE.SpotLight>(null);
  const bed = useRef<THREE.PointLight>(null);
  const hallway = useRef<THREE.PointLight>(null);
  const cold = useRef<THREE.DirectionalLight>(null);
  const torch = useRef<THREE.SpotLight>(null);
  const torchTarget = useMemo(() => new THREE.Object3D(), []);
  const mainTarget = useMemo(() => { const t = new THREE.Object3D(); t.position.set(-3, 0, 0); return t; }, []);
  const studioTarget = useMemo(() => { const t = new THREE.Object3D(); t.position.set(4.4, 0, -3.3); return t; }, []);
  const hemisphere = useRef<THREE.HemisphereLight>(null);
  const textures = useMemo(
    () => ({
      clock: labelTexture("00 : 17", "TIME DOES NOT MOVE"),
      portrait: labelTexture("I U S", "SAY IT BACKWARDS", "#393043"),
      radio: labelTexture("________", "NO SIGNAL", "#273b38"),
      window: nightWindow(),
      live: labelTexture('23 : 59', 'SUI // LIVE', '#172934', '#93c6ba'),
      midnight: labelTexture('00 : 17', 'STILL ON AIR', '#19222d', '#bcb4db'),
      ended: labelTexture('OFF AIR', 'SEE YOU TOMORROW', '#141923', '#819b9e'),
    }),
    [],
  );
  const cameraDirection = useMemo(() => new THREE.Vector3(), []);
  const poses = useRef<Record<string, THREE.Object3D>>({});
  const lastEcho = useRef({ x: 0, z: 0 });
  const samples = useRef({ elapsed: 0, frames: 0 });
  const halo = useRef<THREE.MeshBasicMaterial>(null);
  const screen = useRef<THREE.MeshBasicMaterial>(null);

  useEffect(() => {
    let alive = true;
    const loader = new GLTFLoader();
    Promise.all([
      loader.loadAsync("/games/after-hours/apartment.glb"),
      loader.loadAsync("/games/after-hours/sui.glb"),
    ])
      .then(([apartment, sui]) => {
        const list = [apartment.scene, sui.scene];
        list.forEach((group) => group.traverse((obj) => {
            if (obj instanceof THREE.Mesh) {
              obj.castShadow = group === apartment.scene;
              obj.receiveShadow = true;
            }
          }),);
        if (!alive) {
          list.forEach(dispose);
          return;
        }
        sui.scene.traverse((obj) => {
          if (
            /^Sui_(Head|Body|LeftArm|RightArm|LeftLeg|RightLeg)$/.test(obj.name)
          ) poses.current[obj.name] = obj;
        });
        setAssets({ apartment: apartment.scene, sui: sui.scene });
        stats.current.assets = ["apartment.glb", "sui.glb"];
      })
      .catch((error) => {
        if (alive) onError(`模型载入失败：${error.message}`);
      });
    const pmrem = new THREE.PMREMGenerator(gl);
    const room = new RoomEnvironment();
    const environment = pmrem.fromScene(room, 0.04);
    scene.environment = environment.texture;
    scene.environmentIntensity = 0.35;
    room.dispose();
    pmrem.dispose();
    const canvas = gl.domElement;
    const lost = (event: Event) => {
      event.preventDefault();
      onError("3D 画面暂时中断，请重新载入画面。");
    };
    canvas.addEventListener("webglcontextlost", lost);
    return () => {
      alive = false;
      scene.environment = null;
      environment.dispose();
      canvas.removeEventListener("webglcontextlost", lost);
      Object.values(textures).forEach((t) => t.dispose());
    };
  }, [gl, onError, scene, stats, textures]);

  useEffect(() => {
    if (!assets) return undefined;
    // Precompile before the Start button is enabled, avoiding the first
    // movement hitch. The number of lights stays constant across chapters.
    let active = true;
    gl.compileAsync(scene, camera)
      .then(() => {
        if (active) onReady();
      })
      .catch((error) => {
        if (active) onError(error.message);
      });
    return () => {
      active = false;
      dispose(assets.apartment);
      dispose(assets.sui);
    };
  }, [assets, camera, gl, onError, onReady, scene]);

  useFrame(({ clock }, dt) => {
    const g = game.current;
    const time = clock.elapsedTime;
    if (g.mode === "title") {
      camera.position.set(-0.7, 1.6, 3.3);
      camera.lookAt(-4.1, 1.15, -1);
    } else {
      const bob =
        g.mode === "playing" && !g.hidden && g.panel === "none"
          ? Math.sin(g.time * 7) * 0.008
          : 0;
      if (g.hidden) {
        // Look through the wardrobe slit into the room, rather than at its
        // closed front panel. The stored player position stays at the exit.
        camera.position.set(2, 1.47, 1);
        camera.rotation.set(0, Math.PI, 0, "YXZ");
      } else {
        camera.position.set(g.player.x, 1.59 + bob, g.player.z);
        camera.rotation.set(g.player.pitch, g.player.yaw, 0, "YXZ");
      }
    }
    const warm = g.stage === "home" || g.stage === "dawn";
    const dark = g.stage === "power";
    const easing = Math.min(1, dt * 3);
    const lightLevel = brightness;
    scene.environmentIntensity = dark ? 0.015 : warm ? 0.14 : 0.075;
    if (hemisphere.current) hemisphere.current.intensity = (dark ? 0.035 : warm ? 0.2 : 0.1) * lightLevel;
    if (screen.current) { screen.current.map = g.stage === 'home' ? textures.live : g.sources.includes('computer') || g.stage === 'dawn' ? textures.ended : textures.midnight; screen.current.color.set(g.sources.includes('computer') ? '#3c4b55' : '#8a989e'); }
    if (ambient.current) ambient.current.intensity = THREE.MathUtils.lerp(
        ambient.current.intensity,
        (dark ? 0.035 : warm ? 0.25 : 0.13) * lightLevel,
        easing,
      );
    if (main.current) {
      main.current.intensity = THREE.MathUtils.lerp(
        main.current.intensity,
        (dark ? 0 : warm ? 29 : 12) * lightLevel,
        easing,
      );
      main.current.color.set(
        warm ? "#ffd8a0" : g.stage === "chase" ? "#b85c72" : "#a6bcca",
      );
    }
    if (studio.current) studio.current.intensity = THREE.MathUtils.lerp(
        studio.current.intensity,
        (dark ? 0.4 : g.sources.includes("computer") ? 3 : warm ? 20 : 10) *
          lightLevel,
        easing,
      );
    if (bed.current) bed.current.intensity = THREE.MathUtils.lerp(
        bed.current.intensity,
        (dark ? 0 : g.sources.includes("mirror") ? 3 : 10) * lightLevel,
        easing,
      );
    if (hallway.current) {
      hallway.current.intensity = 17 * lightLevel;
      hallway.current.color.set(g.seals > 1 ? "#b85e70" : "#adc3b9");
    }
    if (cold.current) cold.current.intensity = (g.stage === "dawn" ? 1.7 : dark ? 0.04 : 0.19) * lightLevel;
    if (torch.current) {
      camera.getWorldDirection(cameraDirection);
      torch.current.position
        .copy(camera.position)
        .add(new THREE.Vector3(0.07, -0.16, 0));
      torchTarget.position
        .copy(camera.position)
        .addScaledVector(cameraDirection, 8);
      torch.current.intensity =
        g.flashlight && g.mode !== "title" ? 6 * lightLevel : 0;
    }
    if (door.current) door.current.rotation.y = THREE.MathUtils.lerp(
        door.current.rotation.y,
        corridorOpen(g) ? 1.48 : 0,
        easing,
      );
    if (markers.current) markers.current.children.forEach((child) => {
        const enabled =
          activeSpots(g).some((s) => s.id === child.name) && g.mode !== "title" && !g.hidden;
        child.visible = enabled;
        const scale =
          g.focus === child.name ? 1.7 : 1 + Math.sin(time * 2.2) * 0.15;
        child.scale.setScalar(scale);
      });
    if (model.current) {
      model.current.position.set(g.echo.x, 0, g.echo.z);
      model.current.rotation.y = g.echo.yaw;
      const moving =
        Math.hypot(
          g.echo.x - lastEcho.current.x,
          g.echo.z - lastEcho.current.z,
        ) > 0.0001;
      const walk = moving
        ? Math.sin(g.time * 7) * 0.36
        : Math.sin(time * 1.7) * 0.035;
      for (const [name, obj] of Object.entries(poses.current)) {
        if (name.endsWith("Arm")) obj.rotation.x = walk * (name.includes("Left") ? -1 : 1);
        if (name.endsWith("Leg")) obj.rotation.x = walk * (name.includes("Left") ? 1 : -1);
        if (name.endsWith("Head")) {
          obj.rotation.z =
            Math.sin(time * 0.9) * (g.stage === "chase" ? 0.11 : 0.035);
        }
      }
      lastEcho.current = { x: g.echo.x, z: g.echo.z };
      model.current.visible = !["power", "dawn"].includes(g.stage);
    }
    if (halo.current) halo.current.opacity = g.stage === "chase" ? 0.5 : 0.2;
    samples.current.elapsed += dt;
    samples.current.frames++;
    if (samples.current.elapsed > 0.6) {
      stats.current.calls = gl.info.render.calls;
      stats.current.triangles = gl.info.render.triangles;
      stats.current.fps = Math.round(
        samples.current.frames / samples.current.elapsed,
      );
      samples.current = { elapsed: 0, frames: 0 };
    }
  });

  return (
    <>
      <color attach="background" args={["#111823"]} />
      <fog attach="fog" args={["#202535", 6, 27]} />
      <ambientLight ref={ambient} intensity={0.25} />
      <hemisphereLight ref={hemisphere} args={["#b5c4d6", "#332638", 0.2]} />
      <spotLight
        ref={main}
        position={[-3, 2.8, 0.1]}
        intensity={29}
        color="#ffd8a0"
        distance={16}
        decay={2}
        target={mainTarget}
angle={1.35}
penumbra={0.65}
castShadow
shadow-mapSize={[1024, 1024]}
shadow-bias={-0.0002}
shadow-normalBias={0.025}
      />
      <spotLight
        ref={studio}
        position={[4.4, 2.8, -3.3]}
        intensity={20}
        color="#a7b2ef"
        distance={11}
        decay={2}
        target={studioTarget}
angle={1.35}
penumbra={0.65}
castShadow
shadow-mapSize={[1024, 1024]}
shadow-bias={-0.0002}
shadow-normalBias={0.025}
      />
      <pointLight
        ref={bed}
        position={[3.3, 2.35, 3]}
        intensity={16}
        color="#f3c7a1"
        distance={11}
        decay={2}
      />
      <pointLight
        ref={hallway}
        position={[-3, 2.35, 12]}
        intensity={17}
        distance={12}
        decay={2}
      />
      <pointLight
        position={[-3, 2.4, 17]}
        intensity={8}
        color="#8caed7"
        distance={7}
      />
      <directionalLight
        ref={cold}
        position={[-7, 5, -2]}
        intensity={0.65}
        color="#8bb8e3"
      />
      <spotLight
        ref={torch}
        intensity={0}
        distance={14}
        angle={0.46}
        penumbra={0.65}
        decay={1.5}
        color="#fff0cc"
        target={torchTarget}
      />
      <primitive object={torchTarget} />
      <primitive object={mainTarget} />
      <primitive object={studioTarget} />
      <mesh position={[4.5, 1.32, -4.725]}><planeGeometry args={[1.35, 0.72]} /><meshBasicMaterial ref={screen} map={textures.live} /></mesh>
      {assets && (
        <>
          <primitive object={assets.apartment} />
          <group ref={model}>
            <primitive object={assets.sui} />
          </group>
        </>
      )}
      <group ref={door} position={[-4.02, 0, 6]}>
        <mesh position={[1, 1.13, 0]} castShadow receiveShadow>
          <boxGeometry args={[1.97, 2.26, 0.07]} />
          <meshStandardMaterial color="#3d4547" roughness={0.5} />
        </mesh>
        <mesh position={[1.8, 1.1, -0.07]}>
          <sphereGeometry args={[0.035, 12, 8]} />
          <meshStandardMaterial
            color="#b59865"
            metalness={0.7}
            roughness={0.3}
          />
        </mesh>
      </group>
      <mesh position={[2, 1.17, 0.55]} castShadow>
        <boxGeometry args={[1.3, 2.32, 0.6]} />
        <meshStandardMaterial color="#665444" />
      </mesh>
      <mesh position={[2, 1.17, 0.87]}>
        <boxGeometry args={[1.2, 2.2, 0.04]} />
        <meshStandardMaterial color="#746255" />
      </mesh>
      <mesh position={[2.05, 1.13, 0.91]}>
        <boxGeometry args={[0.015, 0.24, 0.02]} />
        <meshStandardMaterial color="#b79b65" metalness={0.65} />
      </mesh>
      <mesh position={[-4.01, 1.62, 8.1]} rotation={[0, Math.PI / 2, 0]}>
        <planeGeometry args={[0.62, 0.68]} />
        <meshStandardMaterial
          map={textures.clock}
          emissive="#68776e"
          emissiveIntensity={0.2}
        />
      </mesh>
      <mesh position={[-1.985, 1.62, 11.7]} rotation={[0, -Math.PI / 2, 0]}>
        <planeGeometry args={[0.62, 0.68]} />
        <meshStandardMaterial
          map={textures.portrait}
          emissive="#76617c"
          emissiveIntensity={0.2}
        />
      </mesh>
      <mesh position={[-4.01, 1.62, 15.3]} rotation={[0, Math.PI / 2, 0]}>
        <planeGeometry args={[0.62, 0.68]} />
        <meshStandardMaterial
          map={textures.radio}
          emissive="#526e64"
          emissiveIntensity={0.2}
        />
      </mesh>
      <mesh position={[-6.85, 1.65, -1.5]} rotation={[0, Math.PI / 2, 0]}>
        <planeGeometry args={[3.2, 1.9]} />
        <meshBasicMaterial map={textures.window} color="#8ca4b6" />
      </mesh>
      <mesh position={[-2.3, 1.015, -5.03]}>
        <boxGeometry args={[0.24, 0.035, 0.14]} />
        <meshStandardMaterial color="#30313b" />
      </mesh>
      <mesh position={[-5.7, 1.455, 4.75]}>
        <boxGeometry args={[0.24, 0.035, 0.14]} />
        <meshStandardMaterial color="#30313b" />
      </mesh>
      <group ref={markers}>
        {activeSpots({ ...game.current, stage: "chase", sources: [] })
          .concat(
            activeSpots({ ...game.current, stage: "memories", tapes: [] }),
            activeSpots({ ...game.current, stage: "corridor" }),
          )
          .filter(
            (s, index, list) => list.findIndex((v) => v.id === s.id) === index,
          )
          .map((s) => (
            <mesh name={s.id} key={s.id} position={[s.x, s.height + 0.16, s.z]}>
              <sphereGeometry args={[0.018, 10, 8]} />
              <meshBasicMaterial color="#e5ce98" transparent opacity={0.65} />
            </mesh>
          ))}
      </group>
      <mesh position={[-3, 0.012, 12]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[1.7, 11]} />
        <meshBasicMaterial
          ref={halo}
          color="#9b334c"
          transparent
          opacity={0.15}
          depthWrite={false}
        />
      </mesh>
    </>
  );
}

function dispose(root: THREE.Object3D) {
  const textures = new Set<THREE.Texture>();
  const materials = new Set<THREE.Material>();
  root.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh)) return;
    obj.geometry.dispose();
    (Array.isArray(obj.material) ? obj.material : [obj.material]).forEach(
      (m: THREE.Material) => {
        materials.add(m);
        Object.values(m).forEach((v) => {
          if (v instanceof THREE.Texture) textures.add(v);
        });
      },
    );
  });
  textures.forEach((t) => t.dispose());
  materials.forEach((m) => m.dispose());
}

function Scene({ quality, game, stats, brightness, onReady, onError }: Props) {
  return (
    <Canvas
      shadows
      dpr={quality === "high" ? [1, 1.5] : 1}
      camera={{ fov: 70, near: 0.07, far: 55 }}
      gl={{ antialias: true, powerPreference: "high-performance" }}
      onCreated={({ gl }) => {
        gl.toneMapping = THREE.ACESFilmicToneMapping;
        gl.toneMappingExposure = 1.1;
        stats.current.type = "WebGL2 / React Three Fiber";
      }}
    >
      <World
        game={game}
        stats={stats}
        brightness={brightness}
        onReady={onReady}
        onError={onError}
      />
    </Canvas>
  );
}

export default memo(Scene);
