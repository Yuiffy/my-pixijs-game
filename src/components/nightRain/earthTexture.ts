import * as THREE from 'three';

function mineralNoise(x: number, y: number, period: number) {
  const ix = Math.floor(x); const iy = Math.floor(y);
  const fade = (t: number) => t * t * (3 - 2 * t);
  const hash = (a: number, b: number) => {
    const n = Math.sin(((a + period) % period) * 127.1 + ((b + period) % period) * 311.7) * 43758.5453;
    return n - Math.floor(n);
  };
  const u = fade(x - ix); const v = fade(y - iy);
  return (hash(ix, iy) * (1 - u) + hash(ix + 1, iy) * u) * (1 - v)
    + (hash(ix, iy + 1) * (1 - u) + hash(ix + 1, iy + 1) * u) * v;
}

/** Seamless mineral strata and weathering, shared by cliffs and riverbanks. */
export function createEarthTexture() {
  const size = 512; const data = new Uint8Array(size * size * 4);
  const tau = Math.PI * 2;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const u = (x / size) * tau; const v = (y / size) * tau;
    const broadNoise = mineralNoise((x / size) * 7, (y / size) * 7, 7);
    const fractureNoise = mineralNoise((x / size) * 23, (y / size) * 23, 23);
    const warp = Math.sin(u * 2 + Math.cos(v)) * 0.6 + Math.sin(u * 5 - v * 2) * 0.15;
    const strata = Math.sin(v * 5 + warp);
    const seam = Math.max(0, 1 - Math.abs(strata + (broadNoise - 0.5) * 0.7 + 0.65) * 8) * (0.35 + fractureNoise * 0.65);
    const grain = Math.sin(u * 79 + v * 53) * Math.cos(v * 67 - u * 43);
    const broad = (broadNoise - 0.5) * 2;
    // Broken vertical seepage and mineral seams avoid a uniform brick pattern.
    const fissure = Math.max(0, fractureNoise - 0.71) * 120;
    const value = Math.max(74, Math.min(242, 202 + broad * 30 + grain * 5 + (fractureNoise - 0.5) * 22 + strata * 9 - seam * 24 - fissure));
    const moss = Math.max(0, Math.sin(u * 3 + v) * Math.cos(v * 2) - 0.42) * 21;
    const i = (y * size + x) * 4;
    data[i] = value + 3 - moss; data[i + 1] = value; data[i + 2] = value - 13 - moss * 0.5; data[i + 3] = 255;
  }
  const texture = new THREE.DataTexture(data, size, size);
  texture.wrapS = THREE.RepeatWrapping; texture.wrapT = THREE.RepeatWrapping;
  texture.magFilter = THREE.LinearFilter; texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true; texture.colorSpace = THREE.SRGBColorSpace; texture.needsUpdate = true;
  return texture;
}
