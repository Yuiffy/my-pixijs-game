import * as THREE from 'three';

/** Own faded copies so weapon/skin materials shared elsewhere stay untouched. */
export function createPlayerCameraVisibility() {
  type FadedMaterial = { original: THREE.Material | THREE.Material[]; copies: THREE.Material[]; versions: number[] };
  const materials = new Map<THREE.Mesh, FadedMaterial>();
  const release = (mesh: THREE.Mesh, { original, copies }: FadedMaterial) => {
    // A skin or weapon may have replaced the material while the camera was close.
    if (mesh.material === copies[0] || mesh.material === copies) mesh.material = original;
    copies.forEach(material => material.dispose()); materials.delete(mesh);
  };
  const restore = () => {
    materials.forEach((item, mesh) => release(mesh, item));
  };
  return {
    restore,
    apply(root: THREE.Object3D | undefined, opacity: number) {
      if (!root || opacity >= 0.999) { restore(); return; }
      const seen = new Set<THREE.Mesh>();
      root.traverse(object => {
        if (!(object instanceof THREE.Mesh)) return;
        seen.add(object);
        let item = materials.get(object);
        if (item && object.material !== item.copies[0] && object.material !== item.copies) {
          release(object, item); item = undefined;
        }
        if (!item) {
          const original = object.material;
          const copies = (Array.isArray(original) ? original : [original]).map(material => material.clone());
          item = { original, copies, versions: (Array.isArray(original) ? original : [original]).map(m => m.version) };
          materials.set(object, item);
          object.material = Array.isArray(original) ? copies : copies[0];
        }
        const originals = Array.isArray(item.original) ? item.original : [item.original];
        item.copies.forEach((material, i) => {
          // React updates colors and other props on the attached original in place.
          // Keep the copy current, preserving its fade shader mode between frames.
          const wasTransparent = material.transparent; const source = originals[i];
          material.copy(source); material.transparent = true;
          material.opacity = source.opacity * opacity;
          material.depthWrite = false;
          if (!wasTransparent || item!.versions[i] !== source.version) material.needsUpdate = true;
          item!.versions[i] = source.version;
        });
      });
      // Removed skin/armor meshes must not stay retained until the camera moves away.
      materials.forEach((item, mesh) => { if (!seen.has(mesh)) release(mesh, item); });
    },
  };
}
