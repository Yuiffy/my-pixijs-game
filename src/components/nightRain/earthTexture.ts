import * as THREE from 'three';

/** Seamless mineral strata and weathering, shared by cliffs and riverbanks. */
export function createEarthTexture() {
  const size = 256; const data = new Uint8Array(size * size * 4);
  const tau = Math.PI * 2;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const u = (x / size) * tau; const v = (y / size) * tau;
    const warp = Math.sin(u * 3 + Math.cos(v * 2)) * 0.5 + Math.sin(u * 7 - v * 3) * 0.18;
    const strata = Math.sin(v * 12 + warp * 2.1);
    const grain = Math.sin(u * 39 + v * 23) * Math.cos(v * 47 - u * 17);
    const broad = Math.sin(u * 4 + v * 3) * Math.cos(u * 3 - v * 5);
    const fissure = Math.max(0, Math.cos(u * 9 + Math.sin(v * 4)) - 0.93) * 420;
    const value = Math.max(68, Math.min(240, 186 + broad * 21 + grain * 12 + strata * 9 - fissure));
    const moss = Math.max(0, Math.sin(u * 5 + v * 2) * Math.cos(v * 3) - 0.36) * 24;
    const i = (y * size + x) * 4;
    data[i] = value - moss; data[i + 1] = value; data[i + 2] = value - 10 - moss * 0.5; data[i + 3] = 255;
  }
  const texture = new THREE.DataTexture(data, size, size);
  texture.wrapS = THREE.RepeatWrapping; texture.wrapT = THREE.RepeatWrapping;
  texture.magFilter = THREE.LinearFilter; texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true; texture.colorSpace = THREE.SRGBColorSpace; texture.needsUpdate = true;
  return texture;
}
