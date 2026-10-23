'use client';

import { useLayoutEffect, useRef, type ReactNode } from 'react';
import * as THREE from 'three';
// Three publishes the helper and its types under this explicit ESM path.
// eslint-disable-next-line import/extensions
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/** Bake immutable city artwork into local batches. Dynamic actors/gates stay outside. */
export default function StaticDistrict({ children, name }: { children: ReactNode; name: string }) {
  const parent = useRef<THREE.Group>(null);
  const source = useRef<THREE.Group>(null);
  useLayoutEffect(() => {
    if (!parent.current || !source.current) return undefined;
    const authored = source.current; const host = parent.current;
    host.updateWorldMatrix(true, true);
    const baked = new THREE.Group(); baked.name = `${name}-batches`;
    const geometries: THREE.BufferGeometry[] = []; const materials: THREE.Material[] = [];
    const batches = new Map<string, { parts: THREE.BufferGeometry[]; material: THREE.MeshStandardMaterial; cast: boolean; receive: boolean }>();
    const center = new THREE.Vector3();
    authored.traverse(object => {
      if (object instanceof THREE.Light) { const copy = object.clone(); copy.matrix.copy(object.matrixWorld); copy.matrixAutoUpdate = false; baked.add(copy); return; }
      if (!(object instanceof THREE.Mesh)) return;
      const { material } = object;
      // Textured signs, water and existing instances retain their exact materials.
      if (object instanceof THREE.InstancedMesh || !(material instanceof THREE.MeshStandardMaterial) || material.map || material.transparent) {
        const copy = object.clone(false); copy.matrix.copy(object.matrixWorld); copy.matrixAutoUpdate = false; baked.add(copy); return;
      }
      object.getWorldPosition(center);
      const key = [Math.floor(center.x / 24), Math.floor(center.z / 24), material.roughness, material.metalness, material.emissive.getHex(), material.emissiveIntensity, material.side, object.castShadow, object.receiveShadow, !!object.geometry.index].join('/');
      let batch = batches.get(key);
      if (!batch) {
        const shared = material.clone(); shared.color.set('#ffffff'); shared.vertexColors = true;
        materials.push(shared); batch = { parts: [], material: shared, cast: object.castShadow, receive: object.receiveShadow }; batches.set(key, batch);
      }
      const part = object.geometry.clone().applyMatrix4(object.matrixWorld);
      // These untextured meshes need only positions, normals and linear vertex colors.
      for (const attribute of Object.keys(part.attributes)) if (!['position', 'normal'].includes(attribute)) part.deleteAttribute(attribute);
      const colors = new Float32Array(part.attributes.position.count * 3);
      for (let i = 0; i < colors.length; i += 3) { colors[i] = material.color.r; colors[i + 1] = material.color.g; colors[i + 2] = material.color.b; }
      part.setAttribute('color', new THREE.BufferAttribute(colors, 3));
      batch.parts.push(part);
    });
    for (const batch of Array.from(batches.values())) {
      const geometry = mergeGeometries(batch.parts, false);
      batch.parts.forEach(part => part.dispose());
      if (!geometry) throw new Error('Static district geometry could not be merged');
      geometry.computeBoundingSphere(); geometry.computeBoundingBox(); geometries.push(geometry);
      const mesh = new THREE.Mesh(geometry, batch.material); mesh.castShadow = batch.cast; mesh.receiveShadow = batch.receive;
      baked.add(mesh);
    }
    const update = authored.updateMatrixWorld;
    authored.updateMatrixWorld = () => {};
    authored.visible = false; host.add(baked);
    return () => { host.remove(baked); authored.updateMatrixWorld = update; authored.visible = true; geometries.forEach(g => g.dispose()); materials.forEach(m => m.dispose()); };
  }, [name]);
  return <group ref={parent} name={name}><group ref={source}>{children}</group></group>;
}
