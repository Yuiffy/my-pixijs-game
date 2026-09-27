const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const modules = new Map();
function load(file) {
  const resolved = path.resolve(file);
  if (modules.has(resolved)) return modules.get(resolved);
  if (resolved.endsWith('.json')) return JSON.parse(fs.readFileSync(resolved, 'utf8'));
  const exports = {}; modules.set(resolved, exports);
  const code = ts.transpileModule(fs.readFileSync(resolved, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true } }).outputText;
  new Function('exports', 'require', code)(exports, spec => load(path.join(path.dirname(resolved), `${spec}${spec.endsWith('.json') ? '' : '.ts'}`)));
  return exports;
}
const e = load('src/components/pingluCanal/terrainEngine.ts');
const game = e.createTerrain(); const wet = e.waterMask(game.plots);
const point = (x, z, h) => [305 + x * 9 - z * 1.8, 95 + z * 6 + x * 1.4 - h * 1.4];
const polygon = (points, fill) => `<polygon points="${points.map(p => p.map(n => n.toFixed(1)).join(',')).join(' ')}" fill="${fill}" stroke="#607957" stroke-opacity=".14" stroke-width=".35"/>`;
const parts = ['<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720" viewBox="0 0 1280 720" role="img" aria-label="平陆运河：真实高程、分水岭与三级船闸"><rect width="1280" height="720" fill="#e7ecdf"/>'];
for (let z = 0; z < e.MAP_H; z++) {
  for (let x = 0; x < e.MAP_W; x++) {
    const id = e.tileId(x, z); const p = game.plots[id]; const h = p.height;
    const a = point(x - 0.5, z - 0.5, h); const b = point(x + 0.5, z - 0.5, h); const c = point(x + 0.5, z + 0.5, h); const d = point(x - 0.5, z + 0.5, h);
    parts.push(polygon([b, c, point(x + 0.5, z + 0.5, -4), point(x + 0.5, z - 0.5, -4)], '#839574'));
    parts.push(polygon([c, d, point(x - 0.5, z + 0.5, -4), point(x + 0.5, z + 0.5, -4)], '#98a77c'));
    parts.push(polygon([a, b, c, d], p.rock ? (h >= 65 ? '#a6b79a' : '#87a578') : '#a0b985'));
    if (wet[id]) parts.push(polygon([point(x - 0.5, z - 0.5, e.waterLevel(id)), point(x + 0.5, z - 0.5, e.waterLevel(id)), point(x + 0.5, z + 0.5, e.waterLevel(id)), point(x - 0.5, z + 0.5, e.waterLevel(id))], '#66b3b7'));
  }
}
for (const landmark of e.GEOGRAPHY.landmarks.filter(l => ['port', 'lock', 'divide'].includes(l.kind))) {
  const [x, z] = landmark.grid; const [px, py] = point(x, z, game.plots[e.tileId(x, z)].height);
  parts.push(`<g font-family="Microsoft YaHei,sans-serif"><rect x="${px - 58}" y="${py - 24}" width="116" height="23" rx="2" fill="#fbf8e9" stroke="#90a580"/><text x="${px}" y="${py - 8}" text-anchor="middle" font-size="12" fill="#456654">${landmark.name}</text></g>`);
}
parts.push('<g font-family="Microsoft YaHei,sans-serif" fill="#345f4e"><text x="885" y="166" font-size="16" letter-spacing="4">PINGLU / EARTHWORKS</text><text x="885" y="222" font-size="29">平陆运河</text><text x="885" y="292" font-size="56">造山移海</text><path d="M885 326h285" stroke="#aebc99"/><text x="885" y="373" font-size="24">跨分水岭 · 通江达海</text><g font-size="19" fill="#637f61"><text x="885" y="427">真实高程与河网 · 3456 格</text><text x="885" y="469">三级船闸，连接两个水系</text><text x="885" y="524">单人 / AI / 同机多人</text></g><text x="145" y="648" font-size="16" fill="#65816c">地理压缩沙盘 · DEM: Mapzen / USGS / NOAA · © OpenStreetMap</text></g></svg>');
fs.writeFileSync('public/games/pinglu-canal/preview.svg', parts.join('\n'));
console.log('Updated Pinglu preview from the playable geographic terrain.');
