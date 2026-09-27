/** Rebuild the checked-in regional terrain from public DEM and OSM data. */
import fs from 'node:fs/promises';
import path from 'node:path';
import { inflateSync } from 'node:zlib';

const cache = 'artifacts/pinglu-geography';
const bounds = { west: 108.48, east: 109.18, south: 21.70, north: 22.73 };
const width = 48; const height = 72; const zoom = 10;
const headers = { 'User-Agent': 'PingluCanalGame-GeographyResearch/1.0 (public educational terrain)' };
await fs.mkdir(`${cache}/dem`, { recursive: true });

async function download(url, file, options = {}) {
  try { return await fs.readFile(file); } catch { /* Download missing source once. */ }
  const response = await fetch(url, { headers, signal: AbortSignal.timeout(55000), ...options });
  if (!response.ok) throw new Error(`${response.status}: ${url}`);
  const bytes = Buffer.from(await response.arrayBuffer()); await fs.writeFile(file, bytes); return bytes;
}
const query = '[out:json][timeout:40];way["waterway"]["name"~"郁江|沙坪|旧州|钦江|平陆"](21.5,108.3,23.1,109.5);out geom;';
const osm = JSON.parse(await download('https://overpass.kumi.systems/api/interpreter', `${cache}/osm-waterways.json`, { method: 'POST', body: new URLSearchParams({ data: query }) }));

function decodePng(buffer) {
  let cursor = 8; let w; let h; let channels; const chunks = [];
  while (cursor < buffer.length) {
    const size = buffer.readUInt32BE(cursor); const kind = buffer.toString('ascii', cursor + 4, cursor + 8); const data = buffer.subarray(cursor + 8, cursor + 8 + size);
    if (kind === 'IHDR') {
      w = data.readUInt32BE(0); h = data.readUInt32BE(4); channels = data[9] === 2 ? 3 : data[9] === 6 ? 4 : 0;
      if (data[8] !== 8 || !channels || data[12]) throw new Error('Expected non-interlaced 8-bit RGB(A) terrain tile');
    }
    if (kind === 'IDAT') chunks.push(data);
    cursor += size + 12;
  }
  const raw = inflateSync(Buffer.concat(chunks)); const stride = w * channels; const pixels = Buffer.alloc(stride * h);
  const paeth = (a, b, c) => { const p = a + b - c; const pa = Math.abs(p - a); const pb = Math.abs(p - b); const pc = Math.abs(p - c); return pa <= pb && pa <= pc ? a : pb <= pc ? b : c; };
  for (let y = 0; y < h; y++) {
    const filter = raw[y * (stride + 1)];
    for (let x = 0; x < stride; x++) {
      const at = y * stride + x; const a = x >= channels ? pixels[at - channels] : 0; const b = y ? pixels[at - stride] : 0; const c = y && x >= channels ? pixels[at - stride - channels] : 0;
      pixels[at] = raw[y * (stride + 1) + 1 + x] + (filter === 1 ? a : filter === 2 ? b : filter === 3 ? Math.floor((a + b) / 2) : filter === 4 ? paeth(a, b, c) : 0);
    }
  }
  return { pixels, width: w, channels };
}
const mercator = (lon, lat) => [(lon + 180) / 360 * 2 ** zoom, (1 - Math.asinh(Math.tan(lat * Math.PI / 180)) / Math.PI) / 2 * 2 ** zoom];
const nw = mercator(bounds.west, bounds.north); const se = mercator(bounds.east, bounds.south); const tiles = new Map(); const urls = [];
for (let x = Math.floor(nw[0]); x <= Math.floor(se[0]); x++) {
  for (let y = Math.floor(nw[1]); y <= Math.floor(se[1]); y++) {
    const url = `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${zoom}/${x}/${y}.png`; urls.push(url);
    const bytes = await download(url, `${cache}/dem/${zoom}-${x}-${y}.png`); tiles.set(`${x}/${y}`, decodePng(bytes));
    console.log(`DEM ${zoom}/${x}/${y}`);
  }
}
function sample(lon, lat) {
  const [tx, ty] = mercator(lon, lat); const tile = tiles.get(`${Math.floor(tx)}/${Math.floor(ty)}`);
  const px = Math.floor((tx % 1) * tile.width); const py = Math.floor((ty % 1) * tile.width); const at = (py * tile.width + px) * tile.channels;
  return tile.pixels[at] * 256 + tile.pixels[at + 1] + tile.pixels[at + 2] / 256 - 32768;
}
const toGrid = (lon, lat) => [(lon - bounds.west) / (bounds.east - bounds.west) * (width - 1), (bounds.north - lat) / (bounds.north - bounds.south) * (height - 1)];
const rivers = osm.elements.filter(e => e.tags?.waterway === 'river').map(e => ({ osmId: e.id, name: e.tags.name, points: e.geometry.map(p => [p.lon, p.lat]) }));
const reference = osm.elements.filter(e => e.tags?.name === '平陆运河').map(e => ({ osmId: e.id, points: e.geometry.map(p => [p.lon, p.lat]) }));
const elevation = Array.from({ length: width * height }, (_, id) => {
  const lon = bounds.west + (id % width) / (width - 1) * (bounds.east - bounds.west);
  const lat = bounds.north - Math.floor(id / width) / (height - 1) * (bounds.north - bounds.south);
  return Math.round(sample(lon, lat));
});
const landmarks = [
  { name: '平塘江口', kind: 'port', lon: 109.0724839, lat: 22.6459917, source: 'OSM 沙坪河与郁江交汇节点' },
  { name: '沙坪河', kind: 'river', lon: 109.017, lat: 22.575, source: 'OSM 沙坪河河线' },
  { name: '分水岭开挖段', kind: 'divide', lon: 108.953, lat: 22.488, source: '两条天然河流之间的概略位置，非测量桩号' },
  { name: '马道枢纽', kind: 'lock', lon: 108.9366596, lat: 22.4453832, source: 'OSM node 13228278949' },
  { name: '企石枢纽', kind: 'lock', lon: 108.9408578, lat: 22.3263386, source: 'OSM node 11813336478' },
  { name: '陆屋镇', kind: 'town', lon: 108.9462385, lat: 22.2839567, source: 'OSM node 369494647' },
  { name: '钦江', kind: 'river', lon: 108.8, lat: 22.17, source: 'OSM 钦江河线' },
  { name: '青年枢纽', kind: 'lock', lon: 108.6566091, lat: 22.0131657, source: 'OSM way 1179583233 水道中心' },
  { name: '钦州城区', kind: 'town', lon: 108.625, lat: 21.97, source: '概略地名位置' },
  { name: '茅尾海 / 北部湾', kind: 'port', lon: 108.6, lat: 21.76, source: '海湾内的游戏终点，非实际航道终点桩号' },
].map(p => ({ ...p, grid: toGrid(p.lon, p.lat).map(Math.round) }));
const output = { revision: 'pinglu-dem-osm-20260927', width, height, bounds, elevation, rivers, reference, landmarks, license: 'ODbL-1.0 (derived geographic database; code excluded)', attribution: '© OpenStreetMap contributors. Elevation tiles: Mapzen / Tilezen, AWS; SRTM and GMTED2010 data courtesy of the U.S. Geological Survey; global ETOPO1: NOAA/NCEI. Resampled, rounded and simplified for gameplay; not a survey or navigation dataset.', sources: { demTiles: urls, osmTimestamp: osm.osm3s?.timestamp_osm_base, osmIds: osm.elements.map(e => e.id) } };
const target = 'src/components/pingluCanal/geography-data.json';
await fs.mkdir(path.dirname(target), { recursive: true }); await fs.writeFile(target, JSON.stringify(output));
await fs.writeFile('public/games/pinglu-canal/geography-data.json', JSON.stringify(output));
console.log(`Wrote ${width} × ${height} measured elevation samples to ${target}. Range ${Math.min(...elevation)}..${Math.max(...elevation)} m.`);
