"use client";

/** Procedural rain-soaked quarantine district. All geometry is authored, no external art. */

import { useMemo, useRef, type MutableRefObject } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { GameState } from "./types";
import { LEVEL, OBSTACLES, buildFacades, rng } from "./world";

function asphaltTexture() {
  const c = document.createElement("canvas");
  c.width = 512;
  c.height = 512;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#141b23";
  ctx.fillRect(0, 0, 512, 512);
  const random = rng(7713);
  for (let i = 0; i < 14000; i += 1) {
    const v = 18 + Math.floor(random() * 32);
    ctx.fillStyle = `rgba(${v},${v + 5},${v + 11},${0.06 + random() * 0.22})`;
    ctx.fillRect(random() * 512, random() * 512, 1 + random() * 2, 1 + random() * 2);
  }
  for (let i = 0; i < 28; i += 1) {
    ctx.strokeStyle = `rgba(8,12,18,${0.15 + random() * 0.25})`;
    ctx.lineWidth = 0.6 + random() * 1.8;
    ctx.beginPath();
    const x = random() * 512;
    const y = random() * 512;
    ctx.moveTo(x, y);
    ctx.lineTo(x + (random() - 0.5) * 130, y + (random() - 0.5) * 130);
    ctx.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(6, 14);
  tex.anisotropy = 4;
  return tex;
}

function signTexture(text: string, color: string) {
  const c = document.createElement("canvas");
  c.width = 512;
  c.height = 160;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#080c13";
  ctx.fillRect(0, 0, 512, 160);
  ctx.strokeStyle = color;
  ctx.lineWidth = 5;
  ctx.strokeRect(12, 12, 488, 136);
  ctx.shadowColor = color;
  ctx.shadowBlur = 28;
  ctx.fillStyle = color;
  ctx.font = "bold 78px 'Microsoft YaHei', 'PingFang SC', sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, 256, 84);
  ctx.shadowBlur = 0;
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function windowTexture(seed: number) {
  const c = document.createElement("canvas");
  c.width = 128;
  c.height = 256;
  const ctx = c.getContext("2d")!;
  const random = rng(seed);
  ctx.fillStyle = "#0c121b";
  ctx.fillRect(0, 0, 128, 256);
  for (let y = 0; y < 16; y += 1) {
    for (let x = 0; x < 6; x += 1) {
      const lit = random();
      ctx.fillStyle = lit > 0.76
        ? `rgba(${150 + random() * 90},${170 + random() * 70},${190 + random() * 60},${0.35 + random() * 0.5})`
        : lit > 0.62 ? "rgba(60,90,110,0.28)" : "rgba(20,30,42,0.7)";
      ctx.fillRect(6 + x * 20, 5 + y * 16, 14, 10);
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function Sky() {
  return (
    <mesh renderOrder={-100} position={[0, 0, -20]}>
      <sphereGeometry args={[400, 24, 16]} />
      <shaderMaterial
        side={THREE.BackSide}
        depthWrite={false}
        uniforms={useMemo(() => ({
          zenith: { value: new THREE.Color("#0a1020") },
          middle: { value: new THREE.Color("#26334a") },
          horizon: { value: new THREE.Color("#6b5570") },
        }), [])}
        vertexShader="varying vec3 vDir; void main(){vDir=normalize(position);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}"
        fragmentShader={`varying vec3 vDir; uniform vec3 zenith; uniform vec3 middle; uniform vec3 horizon;
          void main(){float t=clamp(vDir.y*0.5+0.5,0.0,1.0);
          vec3 c=mix(horizon,middle,smoothstep(0.36,0.58,t));
          c=mix(c,zenith,smoothstep(0.56,0.95,t));
          gl_FragColor=vec4(c,1.0);}`}
      />
    </mesh>
  );
}

function Ground() {
  const tex = useMemo(asphaltTexture, []);
  const puddles = useMemo(() => {
    const random = rng(4421);
    return Array.from({ length: 26 }, () => ({
      x: (random() - 0.5) * 19,
      z: 22 - random() * 72,
      w: 1.2 + random() * 3.6,
      d: 0.7 + random() * 2.4,
    }));
  }, []);
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.02, -14]} receiveShadow>
        <planeGeometry args={[46, 100]} />
        <meshStandardMaterial map={tex} roughness={0.42} metalness={0.34} color="#8e9aa8" />
      </mesh>
      {puddles.map((p, i) => (
        <mesh key={i} rotation={[-Math.PI / 2, 0, 0]} position={[p.x, 0.008, p.z]}>
          <planeGeometry args={[p.w, p.d]} />
          <meshStandardMaterial color="#1b2d3d" roughness={0.06} metalness={0.92} transparent opacity={0.72} />
        </mesh>
      ))}
      {/* Wet neon streaks: cheap vertical reflections that sell the rain-slick street. */}
      {[-8.3, -3.4, 3.8, 8.1].map((x, i) => (
        <group key={i}>
          {Array.from({ length: 7 }, (_, k) => (
            <mesh key={k} rotation={[-Math.PI / 2, 0, 0]} position={[x, 0.014, 4 - k * 4.7]}>
              <planeGeometry args={[0.1, 2.6]} />
              <meshBasicMaterial
                color={["#43e8ff", "#ff3d8b", "#ffc061", "#8f7bff"][i]}
                transparent
                opacity={0.16}
                blending={THREE.AdditiveBlending}
                depthWrite={false}
              />
            </mesh>
          ))}
        </group>
      ))}
      {/* Lane markings and the platform safety line. */}
      {Array.from({ length: 16 }, (_, i) => (
        <mesh key={`lane${i}`} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.012, 6 - i * 3.2]}>
          <planeGeometry args={[0.14, 1.5]} />
          <meshBasicMaterial color="#b8aa7c" transparent opacity={0.28} />
        </mesh>
      ))}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.016, 17]}>
        <planeGeometry args={[17, 0.14]} />
        <meshBasicMaterial color="#e5b34c" />
      </mesh>
      {/* Arena ring in the quarantine plaza. */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.018, LEVEL.bossSpawn.z]}>
        <ringGeometry args={[9.4, 9.75, 64]} />
        <meshBasicMaterial color="#ff405f" transparent opacity={0.5} side={THREE.DoubleSide} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.017, LEVEL.bossSpawn.z]}>
        <ringGeometry args={[6.1, 6.2, 64]} />
        <meshBasicMaterial color="#ff405f" transparent opacity={0.22} side={THREE.DoubleSide} />
      </mesh>
    </group>
  );
}

function Facades() {
  const facades = useMemo(buildFacades, []);
  const windows = useMemo(() => facades.map(f => windowTexture(f.seed + 1)), [facades]);
  const signs = useMemo(() => facades.map(f => signTexture(f.sign, f.signColor)), [facades]);
  return (
    <group>
      {facades.map((f, i) => {
        const side = Math.sign(f.x);
        const lightColor = f.signColor;
        return (
          <group key={i} position={[f.x, 0, f.z]}>
            <mesh position={[0, f.h / 2, 0]} castShadow receiveShadow>
              <boxGeometry args={[f.w, f.h, f.d]} />
              <meshStandardMaterial color="#161d28" roughness={0.94} />
            </mesh>
            <mesh position={[-side * (f.w / 2 + 0.012), f.h / 2, 0]} rotation={[0, (-side * Math.PI) / 2, 0]}>
              <planeGeometry args={[f.d * 0.92, f.h * 0.94]} />
              <meshStandardMaterial map={windows[i]} emissiveMap={windows[i]} emissive="#64809a" emissiveIntensity={0.3} roughness={0.8} />
            </mesh>
            {f.lit && (
              <>
                <mesh position={[-side * (f.w / 2 + 0.07), 3.1 + (i % 3) * 1.7, 0]} rotation={[0, (-side * Math.PI) / 2, 0]}>
                  <planeGeometry args={[3.0, 0.94]} />
                  <meshBasicMaterial map={signs[i]} toneMapped={false} />
                </mesh>
                {i % 3 === 0 && <pointLight position={[-side * (f.w / 2 + 1.1), 3.4, 0]} color={lightColor} intensity={9} distance={11} decay={2} />}
                <mesh position={[-side * (f.w / 2 + 0.6), 3.1 + (i % 3) * 1.7, 0]} rotation={[0, (-side * Math.PI) / 2, 0]}>
                  <planeGeometry args={[2.6, 0.8]} />
                  <meshBasicMaterial color={lightColor} transparent opacity={0.09} blending={THREE.AdditiveBlending} depthWrite={false} />
                </mesh>
              </>
            )}
            <mesh position={[0, f.h + 0.12, 0]}>
              <boxGeometry args={[f.w + 0.2, 0.24, f.d + 0.2]} />
              <meshStandardMaterial color="#0d131d" />
            </mesh>
          </group>
        );
      })}
    </group>
  );
}

function Platform() {
  const board = useMemo(() => signTexture("07 末班", "#7fe9ff"), []);
  return (
    <group>
      {/* Canopy and girders over the last-train platform. */}
      <mesh position={[0, 5.1, 16]} castShadow receiveShadow>
        <boxGeometry args={[19, 0.42, 15]} />
        <meshStandardMaterial color="#1d2632" roughness={0.85} />
      </mesh>
      {[-6.4, 6.4].map(x => (
        <mesh key={x} position={[x, 2.2, 12.3]} castShadow>
          <boxGeometry args={[0.7, 4.4, 0.7]} />
          <meshStandardMaterial color="#2a3442" roughness={0.8} />
        </mesh>
      ))}
      {[10, 14, 18, 22].map(z => (
        <group key={z}>
          <mesh position={[0, 4.82, z]}>
            <boxGeometry args={[18.4, 0.18, 0.22]} />
            <meshStandardMaterial color="#374352" metalness={0.6} roughness={0.5} />
          </mesh>
          <mesh position={[0, 4.66, z]}>
            <boxGeometry args={[16.8, 0.06, 0.5]} />
            <meshBasicMaterial color="#8fd8e8" transparent opacity={0.55} />
          </mesh>
          <pointLight position={[0, 4.3, z]} color="#9adcec" intensity={4.2} distance={9} decay={2} />
        </group>
      ))}
      {/* Hanging station board. */}
      <mesh position={[0, 3.9, 11]}>
        <boxGeometry args={[5.4, 0.9, 0.12]} />
        <meshStandardMaterial color="#101a24" emissive="#1b4d5c" emissiveIntensity={0.6} />
      </mesh>
      <mesh position={[0, 3.9, 10.92]}>
        <planeGeometry args={[5.2, 0.74]} />
        <meshBasicMaterial map={board} toneMapped={false} />
      </mesh>
      {/* Track-side walls and the stopped train silhouette. */}
      {[-1, 1].map(side => (
        <mesh key={side} position={[side * 9.4, 2.4, 16]}>
          <boxGeometry args={[0.5, 4.8, 15]} />
          <meshStandardMaterial color="#151c27" roughness={0.9} />
        </mesh>
      ))}
      <mesh position={[-7.9, 1.7, 12.5]} castShadow>
        <boxGeometry args={[2.4, 3.2, 11]} />
        <meshStandardMaterial color="#202c3a" metalness={0.55} roughness={0.5} />
      </mesh>
      {[8.5, 11.3, 14.1, 16.9].map(z => (
        <mesh key={z} position={[-6.66, 2.0, z]}>
          <planeGeometry args={[0.05, 1.5]} />
          <meshBasicMaterial color="#ffd28a" transparent opacity={0.42} />
        </mesh>
      ))}
    </group>
  );
}

function Props() {
  return (
    <group>
      {OBSTACLES.map((b, i) => {
        if (b.kind === "pillar") return null;
        if (b.kind === "tower") return null;
        if (b.kind === "car") {
          return (
            <group key={i} position={[b.x, 0, b.z]}>
              <mesh position={[0, 0.62, 0]} castShadow receiveShadow>
                <boxGeometry args={[b.hw * 2, 0.9, b.hd * 2]} />
                <meshStandardMaterial color="#28323e" metalness={0.72} roughness={0.42} />
              </mesh>
              <mesh position={[0, 1.28, -0.2]} castShadow>
                <boxGeometry args={[b.hw * 1.7, 0.62, b.hd * 1.25]} />
                <meshStandardMaterial color="#18232f" metalness={0.5} roughness={0.3} />
              </mesh>
              {[-1, 1].map(side => (
                <mesh key={side} position={[side * 0.72, 0.68, b.hd]}>
                  <boxGeometry args={[0.36, 0.16, 0.06]} />
                  <meshBasicMaterial color="#ff354f" toneMapped={false} />
                </mesh>
              ))}
              {[-1, 1].map(side => (
                <mesh key={`w${side}`} position={[side * b.hw, 0.34, b.hd * 0.55]} rotation={[0, 0, Math.PI / 2]}>
                  <cylinderGeometry args={[0.34, 0.34, 0.16, 12]} />
                  <meshStandardMaterial color="#0a0e13" />
                </mesh>
              ))}
            </group>
          );
        }
        if (b.kind === "bench") {
          return (
            <mesh key={i} position={[b.x, 0.42, b.z]} castShadow>
              <boxGeometry args={[b.hw * 2, 0.1, b.hd * 2]} />
              <meshStandardMaterial color="#3a4350" />
            </mesh>
          );
        }
        return (
          <group key={i} position={[b.x, 0, b.z]}>
            <mesh position={[0, 0.58, 0]} castShadow>
              <boxGeometry args={[b.hw * 2, 1.05, b.hd * 2]} />
              <meshStandardMaterial color="#4b4c46" roughness={0.9} />
            </mesh>
            {[-1, 0, 1].map(k => (
              <mesh key={k} position={[k * b.hw * 0.62, 0.62, -b.hd - 0.01]} rotation={[0, 0, 0.5]}>
                <planeGeometry args={[0.32, 0.92]} />
                <meshBasicMaterial color="#ffb547" side={THREE.DoubleSide} />
              </mesh>
            ))}
            <mesh position={[0, 1.16, 0]}>
              <sphereGeometry args={[0.1, 8, 6]} />
              <meshBasicMaterial color="#ff6a3d" toneMapped={false} />
            </mesh>
          </group>
        );
      })}
    </group>
  );
}

function Checkpoint({ stateRef }: { stateRef: MutableRefObject<GameState> }) {
  const glow = useRef<THREE.Mesh>(null);
  const light = useRef<THREE.PointLight>(null);
  const glowMat = useMemo(() => new THREE.MeshBasicMaterial({ color: '#374a57', transparent: true, opacity: 0.5, toneMapped: false }), []);
  const ringMat = useMemo(() => new THREE.MeshBasicMaterial({ color: '#43525d', transparent: true, opacity: 0.3, side: THREE.DoubleSide }), []);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    const { lit } = stateRef.current.checkpoint;
    if (glow.current) glow.current.scale.setScalar(lit ? 1 + Math.sin(t * 2.1) * 0.07 : 1);
    glowMat.color.set(lit ? '#8ff5ff' : '#374a57');
    glowMat.opacity = lit ? 0.95 : 0.5;
    ringMat.color.set(lit ? '#7fe9ff' : '#43525d');
    ringMat.opacity = lit ? 0.7 + Math.sin(t * 2.4) * 0.18 : 0.3;
    if (light.current) {
      light.current.intensity = lit ? 13 + Math.sin(t * 3) * 2.5 : 1.2;
      light.current.distance = lit ? 18 : 5;
    }
  });
  return (
    <group position={[LEVEL.checkpoint.x, 0, LEVEL.checkpoint.z]}>
      <mesh position={[0, 0.62, 0]} castShadow>
        <cylinderGeometry args={[0.66, 0.82, 1.24, 8]} />
        <meshStandardMaterial color="#2b3542" metalness={0.6} roughness={0.5} />
      </mesh>
      <mesh position={[0, 2.5, 0]} castShadow>
        <cylinderGeometry args={[0.12, 0.2, 3.2, 8]} />
        <meshStandardMaterial color="#3a4655" metalness={0.8} roughness={0.35} />
      </mesh>
      <mesh ref={glow} position={[0, 4.3, 0]} material={glowMat}>
        <icosahedronGeometry args={[0.42, 1]} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]} material={ringMat}>
        <ringGeometry args={[1.25, 1.42, 48]} />
      </mesh>
      <pointLight ref={light} position={[0, 3.8, 0]} color="#7fe9ff" intensity={1.2} distance={5} decay={2} />
    </group>
  );
}

function QuarantineGate() {
  const board = useMemo(() => signTexture("QUARANTINE · 07", "#ff4f6d"), []);
  return (
    <group position={[0, 0, LEVEL.bossGate]}>
      {[-8.2, 8.2].map(x => (
        <group key={x} position={[x, 0, 0]}>
          <mesh position={[0, 3.2, 0]} castShadow>
            <boxGeometry args={[0.75, 6.4, 0.75]} />
            <meshStandardMaterial color="#2c3644" metalness={0.7} roughness={0.5} />
          </mesh>
          <mesh position={[0, 5.9, 0]}>
            <sphereGeometry args={[0.2, 10, 8]} />
            <meshBasicMaterial color="#ff405f" toneMapped={false} />
          </mesh>
          <pointLight position={[0, 5.8, 0]} color="#ff405f" intensity={5} distance={10} />
        </group>
      ))}
      <mesh position={[0, 6.3, 0]}>
        <boxGeometry args={[17.2, 0.7, 0.8]} />
        <meshStandardMaterial color="#2c3644" metalness={0.7} roughness={0.5} />
      </mesh>
      <mesh position={[0, 6.3, 0.42]}>
        <planeGeometry args={[14, 0.48]} />
        <meshBasicMaterial map={board} toneMapped={false} />
      </mesh>
      {/* Caution tape. */}
      {[-1, 1].map(side => (
        <mesh key={side} position={[side * 4.1, 1.15, 0]} rotation={[0, 0, side * 0.06]}>
          <planeGeometry args={[7.8, 0.16]} />
          <meshBasicMaterial color="#f4b83e" side={THREE.DoubleSide} />
        </mesh>
      ))}
    </group>
  );
}

function DistantSkyline() {
  const random = useMemo(() => rng(99127), []);
  const blocks = useMemo(() => Array.from({ length: 46 }, () => ({
    x: (random() - 0.5) * 190,
    z: -60 - random() * 120,
    w: 4 + random() * 12,
    h: 12 + random() * 48,
  })), [random]);
  return (
    <group>
      {blocks.map((b, i) => (
        <mesh key={i} position={[b.x, b.h / 2, b.z]}>
          <boxGeometry args={[b.w, b.h, b.w]} />
          <meshStandardMaterial color="#101827" roughness={1} />
        </mesh>
      ))}
    </group>
  );
}

function StreetLamps() {
  return (
    <group>
      {[2.4, -4.4, -11.2, -18, -25.2].map((z, i) => (
        <group key={z} position={[i % 2 ? 8.6 : -8.6, 0, z]}>
          <mesh position={[0, 3.2, 0]}>
            <cylinderGeometry args={[0.09, 0.13, 6.4, 8]} />
            <meshStandardMaterial color="#303a47" metalness={0.7} />
          </mesh>
          <mesh position={[i % 2 ? -0.7 : 0.7, 6.3, 0]}>
            <boxGeometry args={[1.5, 0.16, 0.28]} />
            <meshStandardMaterial color="#303a47" />
          </mesh>
          <mesh position={[i % 2 ? -1.25 : 1.25, 6.2, 0]}>
            <boxGeometry args={[0.5, 0.08, 0.3]} />
            <meshBasicMaterial color="#ffd8a3" toneMapped={false} />
          </mesh>
          <pointLight position={[i % 2 ? -1.25 : 1.25, 6.0, 0]} color="#ffc78a" intensity={7} distance={13} decay={2} />
          <mesh position={[i % 2 ? -1.25 : 1.25, 3.0, 0]} rotation={[Math.PI / 2, 0, 0]}>
            <coneGeometry args={[2.4, 6, 12, 1, true]} />
            <meshBasicMaterial color="#ffc78a" transparent opacity={0.028} blending={THREE.AdditiveBlending} depthWrite={false} side={THREE.DoubleSide} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

export default function City({ stateRef }: { stateRef: MutableRefObject<GameState> }) {
  return (
    <group name="echo-city">
      <Sky />
      <Ground />
      <Platform />
      <Facades />
      <DistantSkyline />
      <Props />
      <StreetLamps />
      <Checkpoint stateRef={stateRef} />
      <QuarantineGate />
      <mesh position={[0, 0.01, LEVEL.bossSpawn.z]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[9.4, 64]} />
        <meshStandardMaterial color="#1a1e2b" roughness={0.55} metalness={0.4} transparent opacity={0.55} />
      </mesh>
    </group>
  );
}
