"use client";

import { memo, useEffect, useMemo, useRef } from "react";
import * as T from "three";
import { BRIDGE_AXES, BRIDGE_RAILS, BRIDGE_SECTIONS, deckVertices } from "./bridges";
import { inMappedRiver, terrainHeight, WATER_LEVEL } from "./terrain";

type Part = { at: T.Vector3; size: T.Vector3; rotation: T.Quaternion; color: string };
type Arch = { geometry: T.TubeGeometry; transforms: T.Matrix4[] };
const SLAB_INDICES = [0, 4, 2, 2, 4, 6, 1, 3, 5, 3, 7, 5, 0, 1, 4, 1, 5, 4, 2, 6, 3, 3, 6, 7, 0, 2, 1, 1, 2, 3, 4, 5, 6, 5, 7, 6];
const orient = (yaw = 0, pitch = 0) => new T.Quaternion().setFromEuler(new T.Euler(pitch, yaw, 0, "YXZ"));
const position = (origin: T.Vector3, rotation: T.Quaternion, x: number, y: number, z: number) => new T.Vector3(x, y, z).applyQuaternion(rotation).add(origin);

function BoxInstances({ parts }: { parts: Part[] }) {
  const ref = useRef<T.InstancedMesh>(null);
  useEffect(() => {
    if (!ref.current) return;
    const matrix = new T.Matrix4(); const color = new T.Color();
    parts.forEach((part, i) => {
      ref.current!.setMatrixAt(i, matrix.compose(part.at, part.rotation, part.size));
      ref.current!.setColorAt(i, color.set(part.color));
    });
    ref.current.instanceMatrix.needsUpdate = true;
    if (ref.current.instanceColor) ref.current.instanceColor.needsUpdate = true;
    ref.current.computeBoundingSphere();
  }, [parts]);
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, parts.length]} castShadow receiveShadow>
      <boxGeometry />
      <meshStandardMaterial roughness={0.8} />
    </instancedMesh>
  );
}
function ArchInstances({ arch }: { arch: Arch }) {
  const ref = useRef<T.InstancedMesh>(null);
  useEffect(() => {
    if (!ref.current) return;
    arch.transforms.forEach((matrix, i) => ref.current!.setMatrixAt(i, matrix));
    ref.current.instanceMatrix.needsUpdate = true;
    ref.current.computeBoundingSphere();
  }, [arch]);
  return (
    <instancedMesh ref={ref} args={[arch.geometry, undefined, arch.transforms.length]} castShadow>
      <meshStandardMaterial color="#b95544" roughness={0.58} />
    </instancedMesh>
  );
}

function BridgeView() {
  const model = useMemo(() => {
    const parts: Part[] = [];
    const add = (at: T.Vector3, size: [number, number, number], color: string, rotation = orient()) => parts.push({ at, size: new T.Vector3(...size), color, rotation });
    const vertices: number[] = []; const indices: number[] = [];
    BRIDGE_SECTIONS.forEach(section => {
      const offset = vertices.length / 3;
      vertices.push(...deckVertices(section));
      indices.push(...SLAB_INDICES.map(i => i + offset));
    });
    const slabs = new T.BufferGeometry();
    slabs.setAttribute("position", new T.Float32BufferAttribute(vertices, 3));
    slabs.setIndex(indices); slabs.computeVertexNormals();

    for (const rail of BRIDGE_RAILS) {
      const origin = new T.Vector3(...rail.at); const rotation = orient(rail.yaw, rail.pitch);
      add(position(origin, rotation, 0, -0.44, 0), [0.34, 0.35, rail.size[2]], "#afb5a7", rotation);
      add(position(origin, rotation, 0, 0.52, 0), [0.16, 0.14, rail.size[2]], "#dce0cf", rotation);
      for (let z = -rail.size[2] / 2; z <= rail.size[2] / 2; z += 6) add(position(origin, rotation, 0, 0.02, z), [0.12, 1.04, 0.12], "#bcc9bd", rotation);
    }
    for (const section of BRIDGE_SECTIONS) {
      const run = Math.hypot(section.b.x - section.a.x, section.b.z - section.a.z);
      const length = Math.hypot(run, section.b.y - section.a.y);
      const yaw = Math.atan2(section.b.x - section.a.x, section.b.z - section.a.z);
      const rotation = orient(yaw, -Math.atan2(section.b.y - section.a.y, run));
      const origin = new T.Vector3(section.a.x, section.a.y, section.a.z);
      for (let z = 4; z + 1.75 < length; z += 9) add(position(origin, rotation, 0, 0.025, z), [0.13, 0.025, 3.5], "#ece0b9", rotation);
      // Each side has a continuous light strip separating the narrow walkway
      // from traffic. Its elevation follows the same graded deck as physics.
      for (const side of [-1, 1]) {
        add(position(origin, rotation, side * 4.2, 0.035, length / 2), [0.13, 0.025, length], "#e6dbc3", rotation);
        add(position(origin, rotation, side * 4.68, 0.014, length / 2), [0.76, 0.016, length], "#aeb5a8", rotation);
        for (let z = 22; z < length - 8; z += 46) {
          const base = position(origin, rotation, side * 4.85, 0, z);
          // Lamp posts stay vertical even on an approach slope.
          add(base.clone().add(new T.Vector3(0, 2.9, 0)), [0.13, 5.8, 0.13], "#82948a");
          const lampRotation = orient(yaw);
          add(position(base, lampRotation, -side * 0.45, 5.76, 0), [1.05, 0.12, 0.16], "#82948a", lampRotation);
          add(position(base, lampRotation, -side * 0.9, 5.69, 0), [0.52, 0.13, 0.3], "#dedbc0", lampRotation);
        }
      }
    }

    const arches: Arch[] = [];
    for (const axis of BRIDGE_AXES) {
      const deck = BRIDGE_SECTIONS.find(section => section.main && section.id === axis.id)!;
      const yaw = Math.atan2(axis.south.x - axis.north.x, axis.south.z - axis.north.z);
      const rotation = orient(yaw); const origin = new T.Vector3(axis.north.x, deck.a.y, axis.north.z);
      const rise = deck.b.y - deck.a.y; const spanLength = axis.length / 3;
      const points = Array.from({ length: 33 }, (_, i) => {
        const t = i / 32;
        return new T.Vector3(0, rise * (t / 3) + Math.sin(t * Math.PI) * 23, spanLength * t);
      });
      const geometry = new T.TubeGeometry(new T.CatmullRomCurve3(points), 48, 0.65, 6, false);
      const transforms: T.Matrix4[] = [];
      for (let span = 0; span < 3; span++) {
        for (const side of [-4.7, 4.7]) {
          transforms.push(new T.Matrix4().compose(position(origin, rotation, side, rise * (span / 3), spanLength * span), rotation, new T.Vector3(1, 1, 1)));
          for (let n = 1; n < 16; n++) {
            const t = n / 16; const height = Math.sin(t * Math.PI) * 23; const fraction = (span + t) / 3;
            add(position(origin, rotation, side, rise * fraction + height / 2, axis.length * fraction), [0.14, height, 0.14], "#aa5948");
          }
        }
        for (const t of [0.25, 0.5, 0.75]) {
          const fraction = (span + t) / 3;
          add(position(origin, rotation, 0, rise * fraction + Math.sin(t * Math.PI) * 23, axis.length * fraction), [9.4, 0.35, 0.45], "#ad5a48", rotation);
        }
      }
      arches.push({ geometry, transforms });
      for (let i = 0; i <= 3; i++) {
        const p = position(origin, rotation, 0, rise * (i / 3), axis.length * (i / 3));
        const ground = terrainHeight({ x: p.x, z: p.z });
        const bottom = (inMappedRiver(p) ? Math.min(ground, WATER_LEVEL - 1.5) : ground) - 0.8;
        const top = p.y - 0.9;
        if (top <= bottom) continue;
        add(new T.Vector3(p.x, (top + bottom) / 2, p.z), [6.8, top - bottom, 3], "#9baba5", rotation);
        add(new T.Vector3(p.x, top - 0.42, p.z), [8.8, 0.84, 3.8], "#aab7ab", rotation);
      }
    }
    return { slabs, parts, arches };
  }, []);
  useEffect(() => () => { model.slabs.dispose(); model.arches.forEach(arch => arch.geometry.dispose()); }, [model]);
  return (
    <group name="wenhui-grade-separated-bridges">
      <mesh geometry={model.slabs} receiveShadow castShadow><meshStandardMaterial color="#6b7775" side={T.DoubleSide} /></mesh>
      <BoxInstances parts={model.parts} />
      {model.arches.map((arch, i) => <ArchInstances key={i} arch={arch} />)}
    </group>
  );
}
export default memo(BridgeView);
