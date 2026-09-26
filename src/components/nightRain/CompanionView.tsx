import { useCallback, useRef, type MutableRefObject } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { GameState } from "./types";
import type { Companion } from "./companion";
import CompanionModel from "./CompanionModels";

export default function CompanionView({
  stateRef,
  companionRef,
}: {
  stateRef: MutableRefObject<GameState>;
  companionRef: MutableRefObject<Companion>;
}) {
  const root = useRef<THREE.Group>(null);
  const cookie = useRef<THREE.Group>(null);
  const otter = useRef<THREE.Group>(null);
  const sparks = useRef<THREE.Group>(null);
  const pose = useCallback(
    () => ({
      time: stateRef.current.time,
      talking:
        !!companionRef.current.subtitle &&
        companionRef.current.until > stateRef.current.time,
      leading:
        companionRef.current.status === "leading" ||
        companionRef.current.status === "waiting",
    }),
    [stateRef, companionRef],
  );
  useFrame(({ camera }, dt) => {
    const c = companionRef.current;
    const s = stateRef.current;
    if (!root.current) return;
    root.current.visible = c.enabled;
    root.current.position.set(
      c.position.x,
      c.position.y + 1.7 + Math.sin(s.time * 2.5) * 0.065,
      c.position.z,
    );
    const heading = Math.atan2(
      camera.position.x - c.position.x,
      camera.position.z - c.position.z,
    );
    root.current.rotation.y +=
      Math.atan2(
        Math.sin(heading - root.current.rotation.y),
        Math.cos(heading - root.current.rotation.y),
      ) *
      (1 - Math.exp(-dt * 9));
    root.current.rotation.z = Math.sin(s.time * 1.8) * 0.035;
    if (cookie.current) cookie.current.visible = c.skin === "biscuit";
    if (otter.current) otter.current.visible = c.skin === "otter";
    if (sparks.current) sparks.current.rotation.y = s.time * 0.5;
  });
  return (
    <group ref={root} name="travel-companion">
      <group ref={cookie}>
        <CompanionModel skin="biscuit" pose={pose} />
      </group>
      <group ref={otter} visible={false}>
        <CompanionModel skin="otter" pose={pose} />
      </group>
      <group ref={sparks}>
        {[0, 1, 2].map((i) => (
          <mesh
            key={i}
            position={[
              Math.cos(i * 2.1) * 0.47,
              -0.4 + i * 0.14,
              Math.sin(i * 2.1) * 0.36,
            ]}
          >
            <sphereGeometry args={[0.012, 6, 6]} />
            <meshBasicMaterial color="#ffe8b5" />
          </mesh>
        ))}
      </group>
      <pointLight color="#ffdfb5" intensity={0.65} distance={2.5} />
    </group>
  );
}
