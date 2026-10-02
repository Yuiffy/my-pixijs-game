import * as THREE from 'three';

/** Small, deterministic tile texture: no download, canvas readback or frame cost. */
export function createStoneTexture() {
  const size = 128; const data = new Uint8Array(size * size * 4);
  for (let z = 0; z < size; z++) for (let x = 0; x < size; x++) {
    const row = Math.floor(z / 32); const xx = (x + (row % 2) * 32) % 64;
    const edge = Math.min(xx, 63 - xx, z % 32, 31 - (z % 32));
    const noise = ((x * 17 + z * 31 + ((x * z) % 23)) % 19) - 9;
    const stone = 204 + (((Math.floor((x + (row % 2) * 32) / 64) * 7 + row * 11) % 5) - 2) * 7;
    const value = edge === 0 ? 126 : edge === 1 ? 166 : stone + noise;
    const i = (z * size + x) * 4;
    data[i] = value; data[i + 1] = value; data[i + 2] = value - 5; data[i + 3] = 255;
  }
  const texture = new THREE.DataTexture(data, size, size);
  texture.wrapS = THREE.RepeatWrapping; texture.wrapT = THREE.RepeatWrapping;
  texture.magFilter = THREE.LinearFilter; texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true; texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true; return texture;
}
