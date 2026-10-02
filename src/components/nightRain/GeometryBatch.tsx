'use client';

import { useLayoutEffect, useRef } from 'react';
import * as THREE from 'three';

export type StoneBox = { position: [number, number, number]; size: [number, number, number]; rotation?: [number, number, number]; color?: string };

/** Identical static geometry in one draw call, with an accurate raycast bound. */
export default function GeometryBatch({ boxes, color = '#8b9382', shadows = true }: { boxes: StoneBox[]; color?: string; shadows?: boolean }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  useLayoutEffect(() => {
    if (!ref.current) return;
    const transform = new THREE.Object3D(); const tint = new THREE.Color();
    boxes.forEach((box, i) => {
      transform.position.set(...box.position); transform.scale.set(...box.size); transform.rotation.set(...(box.rotation ?? [0, 0, 0])); transform.updateMatrix();
      ref.current!.setMatrixAt(i, transform.matrix); ref.current!.setColorAt(i, tint.set(box.color ?? color));
    });
    ref.current.instanceMatrix.needsUpdate = true;
    if (ref.current.instanceColor) ref.current.instanceColor.needsUpdate = true;
    ref.current.computeBoundingBox(); ref.current.computeBoundingSphere();
  }, [boxes, color]);
  if (!boxes.length) return null;
  return <instancedMesh ref={ref} args={[undefined, undefined, boxes.length]} castShadow={shadows} receiveShadow><boxGeometry /><meshStandardMaterial roughness={0.74} /></instancedMesh>;
}
