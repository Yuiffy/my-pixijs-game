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
import { activeSpots, corridorOpen, friendlyStage, SPOTS } from "./world";
import SuiActor from "./SuiActor";
import type { Game } from "./types";

export type RenderStats = {
  calls: number;
  triangles: number;
  type: string;
  assets: string[];
  fps: number;
  character?: {
    revision: number;
    actor: string;
    gesture: string;
    joints: number;
    morphs: string[];
    blink: number;
    smile: number;
  };
};
type Props = {
  game: MutableRefObject<Game>;
  stats: MutableRefObject<RenderStats>;
  brightness: number;
  quality: "high" | "low";
  onReady: () => void;
  onError: (message: string) => void;
  onPhoto: (image: string) => void;
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
  onPhoto,
}: Omit<Props, "quality">) {
  const { gl, scene, camera } = useThree();
  const [assets, setAssets] = useState<{
    apartment: THREE.Group;
    sui: THREE.Group;
  } | null>(null);
  const door = useRef<THREE.Group>(null);
  const markers = useRef<THREE.Group>(null);
  const ambient = useRef<THREE.AmbientLight>(null);
  const main = useRef<THREE.SpotLight>(null);
  const studio = useRef<THREE.SpotLight>(null);
  const bed = useRef<THREE.PointLight>(null);
  const hallway = useRef<THREE.PointLight>(null);
  const cold = useRef<THREE.DirectionalLight>(null);
  const characterFill = useRef<THREE.PointLight>(null);
  const carriedCup = useRef<THREE.Group>(null);
  const torch = useRef<THREE.SpotLight>(null);
  const torchTarget = useMemo(() => new THREE.Object3D(), []);
  const mainTarget = useMemo(() => {
    const t = new THREE.Object3D();
    t.position.set(-3, 0, 0);
    return t;
  }, []);
  const studioTarget = useMemo(() => {
    const t = new THREE.Object3D();
    t.position.set(4.4, 0, -3.3);
    return t;
  }, []);
  const hemisphere = useRef<THREE.HemisphereLight>(null);
  const textures = useMemo(
    () => ({
      clock: labelTexture("00 : 17", "TIME DOES NOT MOVE"),
      portrait: labelTexture("S U I", "THE NAME IN YOUR PHOTO", "#393043"),
      radio: labelTexture("________", "NO SIGNAL", "#273b38"),
      window: nightWindow(),
      welcome: labelTexture("23 : 50", "ROOM // LISTENING", "#172934", "#93c6ba"),
      tea: labelTexture("00 : 05", "ROOM // LISTENING", "#172934", "#93c6ba"),
      photo: labelTexture("00 : 12", "ROOM // LISTENING", "#172934", "#93c6ba"),
      live: labelTexture("00 : 16", "ROOM // LISTENING", "#172934", "#93c6ba"),
      midnight: labelTexture("00 : 17", "STILL LISTENING", "#19222d", "#bcb4db"),
      ended: labelTexture("OFF AIR", "SEE YOU TOMORROW", "#141923", "#819b9e"),
    }),
    [],
  );
  const cameraDirection = useMemo(() => new THREE.Vector3(), []);
  const samples = useRef({ elapsed: 0, frames: 0 });
  const halo = useRef<THREE.MeshBasicMaterial>(null);
  const screen = useRef<THREE.MeshBasicMaterial>(null);
  const picture = useRef<THREE.MeshBasicMaterial>(null);
  const photoSeen = useRef(0);
  const lastPicture = useRef("");
  const portraitTexture = useRef<THREE.Texture | null>(null);

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
      portraitTexture.current?.dispose();
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
    const portrait = g.panel === "dialogue" || g.panel === "tea";
    const shooting = g.panel === "photo";
    if (camera instanceof THREE.PerspectiveCamera) {
      const fov = portrait ? 42 : shooting ? 44 : g.mode === "title" ? 48 : 66;
      if (camera.fov !== fov) {
        camera.fov = fov;
        camera.updateProjectionMatrix();
      }
    }
    if (g.mode === "title") {
      camera.position.set(-1.7, 1.55, 3.9);
      camera.lookAt(-4.85, 1.16, 1.15);
    } else if (shooting) {
      camera.position.set(-2.1, 1.42, 2.25);
      camera.lookAt(g.sui.x, 1.08, g.sui.z);
    } else if (portrait) {
      camera.position.set(
        g.sui.x + Math.sin(g.sui.yaw) * 1.32,
        1.56,
        g.sui.z + Math.cos(g.sui.yaw) * 1.32,
      );
      camera.lookAt(g.sui.x, 1.45, g.sui.z);
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
    const warm = friendlyStage(g) && g.stage !== "unease";
    const dark = g.stage === "power";
    const easing = Math.min(1, dt * 3);
    const lightLevel = brightness;
    scene.environmentIntensity = dark ? 0.015 : warm ? 0.14 : 0.075;
    if (hemisphere.current) hemisphere.current.intensity =
        (dark ? 0.035 : warm ? 0.2 : 0.1) * lightLevel;
    if (screen.current) {
      screen.current.map = ["visit", "tea", "photo", "home"].includes(g.stage)
        ? ({ visit: textures.welcome, tea: textures.tea, photo: textures.photo, home: textures.live }[g.stage as "visit" | "tea" | "photo" | "home"])
        : g.sources.includes("computer") || g.stage === "dawn"
          ? textures.ended
          : textures.midnight;
      screen.current.color.set(
        g.sources.includes("computer") ? "#3c4b55" : "#8a989e",
      );
    }
    if (characterFill.current) {
      const actor = friendlyStage(g) ? g.sui : g.echo;
      characterFill.current.position.set(
        actor.x + Math.sin(actor.yaw) * 0.8,
        1.85,
        actor.z + Math.cos(actor.yaw) * 0.8,
      );
      characterFill.current.intensity = dark
        ? 0
        : warm
          ? 0.7 * lightLevel
          : 0.17 * lightLevel;
    }
    if (carriedCup.current) {
      carriedCup.current.visible = g.evening.carrying && g.panel === "none";
      carriedCup.current.position
        .set(0.27, -0.31, -0.58)
        .applyQuaternion(camera.quaternion)
        .add(camera.position);
      carriedCup.current.quaternion.copy(camera.quaternion);
    }
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
    if (cold.current) cold.current.intensity =
        (g.stage === "dawn" ? 1.7 : dark ? 0.04 : 0.19) * lightLevel;
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
          activeSpots(g).some((s) => s.id === child.name) &&
          g.mode !== "title" &&
          !g.hidden;
        child.visible = enabled;
        const scale =
          g.focus === child.name ? 1.7 : 1 + Math.sin(time * 2.2) * 0.15;
        child.scale.setScalar(scale);
      });
    if (!g.photoRequest) photoSeen.current = 0;
    if (shooting && g.photoRequest && photoSeen.current !== g.photoRequest) {
      photoSeen.current = g.photoRequest;
      // The saved photo uses its own landscape framing on every device.
      // Render and copy synchronously. No persistent GPU buffer is needed.
      const photoCamera = camera.clone();
      if (photoCamera instanceof THREE.PerspectiveCamera) {
        photoCamera.aspect = 640 / 450;
        photoCamera.updateProjectionMatrix();
      }
      const previousSize = gl.getSize(new THREE.Vector2());
      const canvas = document.createElement("canvas");
      canvas.width = 640;
      canvas.height = 480;
      const ctx = canvas.getContext("2d")!;
      try {
        gl.setSize(640, 450, false);
        gl.render(scene, photoCamera);
        ctx.drawImage(gl.domElement, 0, 0, 640, 450);
      } finally {
        gl.setSize(previousSize.x, previousSize.y, false);
      }
      ctx.fillStyle = "#eee5d2";
      ctx.fillRect(0, 450, 640, 30);
      ctx.fillStyle = "#5b4b54";
      ctx.font = "16px Georgia";
      ctx.fillText("SUI / tonight, with you", 20, 471);
      onPhoto(canvas.toDataURL("image/jpeg", 0.86));
    }
    if (g.photoImage !== lastPicture.current) {
      lastPicture.current = g.photoImage;
      if (g.photoImage) {
        const requested = g.photoImage;
        new THREE.TextureLoader().load(requested, (texture) => {
          if (lastPicture.current !== requested || !picture.current) {
            texture.dispose();
            return;
          }
          texture.colorSpace = THREE.SRGBColorSpace;
          portraitTexture.current?.dispose();
          portraitTexture.current = texture;
          picture.current.map = texture;
          picture.current.needsUpdate = true;
        });
      } else if (picture.current) {
        portraitTexture.current?.dispose();
        portraitTexture.current = null;
        picture.current.map = textures.portrait;
        picture.current.needsUpdate = true;
      }
    }
    if (portraitTexture.current) {
      portraitTexture.current.repeat.x = g.stage === "unease" ? -1 : 1;
      portraitTexture.current.offset.x = g.stage === "unease" ? 1 : 0;
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
      <pointLight
        ref={characterFill}
        intensity={0.7}
        distance={3}
        decay={2}
        color="#fff2e8"
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
      <mesh position={[4.5, 1.32, -4.725]}>
        <planeGeometry args={[1.35, 0.72]} />
        <meshBasicMaterial ref={screen} map={textures.welcome} />
      </mesh>
      {assets && (
        <>
          <primitive object={assets.apartment} />
          <SuiActor asset={assets.sui} game={game} stats={stats} />
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
      <group position={[-2.3, 1.06, -4.65]}>
        <mesh castShadow>
          <cylinderGeometry args={[0.095, 0.1, 0.18, 28]} />
          <meshStandardMaterial color="#dad7c8" roughness={0.3} />
        </mesh>
        <mesh position={[0.11, 0, 0]} rotation={[0, Math.PI / 2, 0]}>
          <torusGeometry args={[0.065, 0.009, 8, 20]} />
          <meshStandardMaterial color="#b6a578" metalness={0.6} />
        </mesh>
        <mesh position={[-0.22, -0.01, 0]}>
          <boxGeometry args={[0.1, 0.13, 0.09]} />
          <meshStandardMaterial color="#ac8144" />
        </mesh>
        <mesh position={[0.25, -0.06, 0.03]}>
          <sphereGeometry args={[0.07, 18, 12]} />
          <meshStandardMaterial color="#ecd789" />
        </mesh>
      </group>
      <group ref={carriedCup} visible={false}>
        <TeaCup />
      </group>
      <group position={[-2.1, 0, 2.25]} rotation={[0, 1.08, 0]}>
        <mesh position={[0, 1.36, 0]} castShadow>
          <boxGeometry args={[0.19, 0.13, 0.085]} />
          <meshStandardMaterial color="#4a414a" />
        </mesh>
        <mesh position={[0, 1.36, 0.055]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.044, 0.047, 0.05, 24]} />
          <meshStandardMaterial color="#151923" metalness={0.3} />
        </mesh>
        <mesh position={[0, 0.7, 0]}>
          <cylinderGeometry args={[0.012, 0.017, 1.28, 10]} />
          <meshStandardMaterial color="#8e8170" metalness={0.6} />
        </mesh>
        {[0, 2.1, 4.2].map((a) => (
          <mesh
            key={a}
            position={[Math.sin(a) * 0.12, 0.19, Math.cos(a) * 0.12]}
            rotation={[Math.cos(a) * 0.52, 0, -Math.sin(a) * 0.52]}
          >
            <cylinderGeometry args={[0.01, 0.014, 0.46, 8]} />
            <meshStandardMaterial color="#6c655c" />
          </mesh>
        ))}
      </group>
      <group position={[-3.5, 0.77, -0.58]} rotation={[-0.25, 0.4, 0]}>
        <mesh castShadow>
          <boxGeometry args={[0.42, 0.32, 0.035]} />
          <meshStandardMaterial color="#e6d8b6" />
        </mesh>
        <mesh position={[0, 0, 0.02]}>
          <planeGeometry args={[0.37, 0.278]} />
          <meshBasicMaterial ref={picture} map={textures.portrait} />
        </mesh>
      </group>
      <group ref={markers}>
        {SPOTS.filter((s) => !["sui", "echo"].includes(s.id)).map((s) => (
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

function TeaCup() {
  return (
    <>
      <mesh castShadow>
        <cylinderGeometry args={[0.065, 0.052, 0.105, 28]} />
        <meshStandardMaterial color="#eee0c3" roughness={0.3} />
      </mesh>
      <mesh position={[0, 0.053, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.06, 28]} />
        <meshStandardMaterial color="#9d5d2b" side={THREE.DoubleSide} />
      </mesh>
      <mesh position={[0.068, 0, 0]}>
        <torusGeometry args={[0.035, 0.007, 8, 18]} />
        <meshStandardMaterial color="#e5cda0" />
      </mesh>
    </>
  );
}

function Scene({
  quality,
  game,
  stats,
  brightness,
  onReady,
  onError,
  onPhoto,
}: Props) {
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
        onPhoto={onPhoto}
      />
    </Canvas>
  );
}

export default memo(Scene);
