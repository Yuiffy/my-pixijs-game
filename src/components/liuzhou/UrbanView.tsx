"use client";

import { memo, useEffect, useMemo, useRef } from "react";
import * as T from "three";
import type { UrbanFabric, UrbanGround } from "./urban";
import type { Point } from "./world";

type Detail = { at: [number, number, number]; size: [number, number, number]; angle?: number; color: string };
const flatGround = () => 0;
function Instances({ items, leaves = false }: { items: Detail[]; leaves?: boolean }) {
  const ref = useRef<T.InstancedMesh>(null);
  useEffect(() => {
    if (!ref.current) return;
    const matrix = new T.Matrix4(); const quaternion = new T.Quaternion(); const axis = new T.Vector3(0, 1, 0); const color = new T.Color();
    items.forEach((item, index) => {
      quaternion.setFromAxisAngle(axis, item.angle || 0);
      matrix.compose(new T.Vector3(...item.at), quaternion, new T.Vector3(...item.size));
      ref.current!.setMatrixAt(index, matrix);
      ref.current!.setColorAt(index, color.set(item.color));
    });
    ref.current.instanceMatrix.needsUpdate = true;
    if (ref.current.instanceColor) ref.current.instanceColor.needsUpdate = true;
    ref.current.computeBoundingSphere();
  }, [items]);
  if (!items.length) return null;
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, items.length]} castShadow receiveShadow>
      {leaves ? <icosahedronGeometry args={[1, 1]} /> : <boxGeometry />}
      <meshStandardMaterial roughness={0.94} />
    </instancedMesh>
  );
}
const Ground = memo(({ area, heightAt }: { area: UrbanGround; heightAt: (p: Point) => number }) => {
  const geometry = useMemo(() => {
    const shape = new T.Shape(area.points.map(p => new T.Vector2(p.x, -p.z)));
    const polygon = new T.ShapeGeometry(shape);
    const outline = polygon.toNonIndexed();
    polygon.dispose();
    const source = outline.getAttribute("position"); const vertices: number[] = [];
    const midpoint = (a: Point, b: Point): Point => ({ x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 });
    const emit = (a: Point, b: Point, c: Point, depth = 0) => {
      if (depth < 8 && Math.max(Math.hypot(a.x - b.x, a.z - b.z), Math.hypot(b.x - c.x, b.z - c.z), Math.hypot(c.x - a.x, c.z - a.z)) > 16) {
        const ab = midpoint(a, b); const bc = midpoint(b, c); const ac = midpoint(a, c);
        emit(a, ab, ac, depth + 1); emit(ab, b, bc, depth + 1); emit(ac, bc, c, depth + 1); emit(ab, bc, ac, depth + 1);
        return;
      }
      for (const p of [a, b, c]) vertices.push(p.x, heightAt(p), p.z);
    };
    for (let i = 0; i < source.count; i += 3) emit(
      { x: source.getX(i), z: -source.getY(i) },
      { x: source.getX(i + 1), z: -source.getY(i + 1) },
      { x: source.getX(i + 2), z: -source.getY(i + 2) },
    );
    outline.dispose();
    const ground = new T.BufferGeometry();
    ground.setAttribute("position", new T.Float32BufferAttribute(vertices, 3));
    ground.computeVertexNormals();
    return ground;
  }, [area, heightAt]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return (
<mesh geometry={geometry} position={[0, area.id.startsWith("parcel-") ? 0.012 : 0.025, 0]} receiveShadow>
    <meshStandardMaterial color={area.color} roughness={1} />
  </mesh>
);
});

/** Walls use the exact boxes also included in BUILDINGS for all collision paths. */
export default function UrbanView({ fabric, heightAt = flatGround }: { fabric: UrbanFabric; heightAt?: (p: Point) => number }) {
  const details = useMemo(() => {
    const walls: Detail[] = [];
    for (const wall of fabric.walls) {
      const floor = heightAt(wall);
      walls.push({ at: [wall.x, floor + wall.h / 2, wall.z], size: [wall.w, wall.h, wall.d], angle: wall.angle, color: wall.color });
      walls.push({ at: [wall.x, floor + wall.h + 0.08, wall.z], size: [wall.w + 0.12, 0.16, wall.d + 0.19], angle: wall.angle, color: "#858d80" });
      for (let n = -wall.w / 2; n <= wall.w / 2; n += 6) {
        walls.push({ at: [wall.x + Math.cos(wall.angle) * n, floor + wall.h / 2 + 0.1, wall.z - Math.sin(wall.angle) * n], size: [0.7, wall.h + 0.2, 0.7], color: "#b2b6a3" });
      }
    }
    const trunks: Detail[] = fabric.planting.map(p => ({ at: [p.x, heightAt(p) + 1.7, p.z], size: [0.42, 3.4, 0.42], color: "#6c7460" }));
    const leaves: Detail[] = fabric.planting.map((p, i) => ({ at: [p.x, heightAt(p) + 4.6, p.z], size: [2.3 + (i % 2) * 0.5, 3.2, 2.4], color: i % 3 ? "#7c956e" : "#97a579" }));
    return { walls: [...walls, ...trunks], leaves };
  }, [fabric, heightAt]);
  return (
<group>
    {fabric.courtyards.map(area => <Ground key={area.id} area={area} heightAt={heightAt} />)}
    <Instances items={details.walls} />
    <Instances items={details.leaves} leaves />
  </group>
);
}
