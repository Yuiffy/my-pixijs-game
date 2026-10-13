import * as THREE from 'three';

/** Fine crystalline salt, distinct from the old city's brick paving. */
export function createSaltTexture() {
  const size = 128; const data = new Uint8Array(size * size * 4);
  for (let z = 0; z < size; z++) for (let x = 0; x < size; x++) {
    const noise = ((x * 13 + z * 29 + ((x * z) % 17)) % 15) - 7;
    const vein = Math.abs(((x + Math.round(Math.sin(z * 0.07) * 5)) % 47) - 23) < 1;
    const value = (vein ? 191 : 231) + noise;
    const i = (z * size + x) * 4;
    data[i] = value; data[i + 1] = value - 3; data[i + 2] = value - 5; data[i + 3] = 255;
  }
  const texture = new THREE.DataTexture(data, size, size);
  texture.wrapS = THREE.RepeatWrapping; texture.wrapT = THREE.RepeatWrapping;
  texture.magFilter = THREE.LinearFilter; texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true; texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true; return texture;
}
