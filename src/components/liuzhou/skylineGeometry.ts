import * as T from "three";
import geography from "./skyline-map.json";
import { inMappedRiver, terrainHeight, TERRAIN_GRID, WATER_LEVEL } from "./terrain";
import type { Road } from "./world";
import { inCity } from "./exploration";
import { bridgeSurface } from "./bridges";
import { GUANGYA_ARCH_OFFSET, GUANGYA_MAIN } from "./guangya";

type P = { x: number; z: number };
type Part = { at: T.Vector3; scale: T.Vector3; rotation: T.Quaternion; color: string };
const covered = (p: P) => p.x > TERRAIN_GRID.minX + 100 && p.x < TERRAIN_GRID.maxX - 100 && p.z > TERRAIN_GRID.minZ + 100 && p.z < TERRAIN_GRID.maxZ - 100;

export function buildSkylineGeometry(cityRoads: Road[], bounds: { minX: number; minZ: number; maxX: number; maxZ: number }) {
    const outside = (p: P, margin = 0) => p.x < bounds.minX - margin || p.x > bounds.maxX + margin || p.z < bounds.minZ - margin || p.z > bounds.maxZ + margin;
    const contextRoads = [...geography.contextRoads.filter(r => !r.points.some(p => inCity({ x: p[0], z: p[1] }))), ...cityRoads.map(r => ({ width: r.width, points: r.points.map(p => [p.x, p.z]) }))];
    const parts: Part[] = [];
    const rotation = new T.Quaternion();
    const box = (p: T.Vector3, size: [number, number, number], color: string, q = rotation) => parts.push({ at: p, scale: new T.Vector3(...size), rotation: q.clone(), color });
    const beam = (a: T.Vector3, b: T.Vector3, width: number, color: string, depth = width) => {
      const delta = b.clone().sub(a);
      if (delta.length() < 0.01) return;
      const length = delta.length(); const along = delta.normalize();
      const across = Math.hypot(along.x, along.z) > 0.001 ? new T.Vector3(along.z, 0, -along.x).normalize() : new T.Vector3(1, 0, 0);
      const up = new T.Vector3().crossVectors(across, along).normalize();
      const q = new T.Quaternion().setFromRotationMatrix(new T.Matrix4().makeBasis(across, along, up));
      box(a.clone().add(b).multiplyScalar(0.5), [width, length, depth], color, q);
    };
    const occupied: { x: number; z: number; r: number }[] = [];
    const roadLines: { a: P; b: P; width: number }[] = [];
    for (const road of contextRoads) for (let i = 1; i < road.points.length; i++) {
      const [ax, az] = road.points[i - 1]; const [bx, bz] = road.points[i];
      roadLines.push({ a: { x: ax, z: az }, b: { x: bx, z: bz }, width: road.width });
    }
    const distanceTo = (p: P, a: P, b: P) => {
      const dx = b.x - a.x; const dz = b.z - a.z;
      const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.z - a.z) * dz) / (dx * dx + dz * dz || 1)));
      return Math.hypot(p.x - a.x - dx * t, p.z - a.z - dz * t);
    };
    const addHouse = (p: P, w: number, d: number, h: number, yaw: number, mapped: boolean, seed: number) => {
      const radius = Math.hypot(w, d) / 2;
      if (inCity(p, -radius) || !outside(p, radius + 12) || !covered(p) || inMappedRiver(p)) return;
      const y = terrainHeight(p);
      if (!mapped && (y > 48 || Math.max(Math.abs(terrainHeight({ x: p.x + 18, z: p.z }) - y), Math.abs(terrainHeight({ x: p.x, z: p.z + 18 }) - y)) > 4)) return;
      if (!mapped && (occupied.some(b => Math.hypot(p.x - b.x, p.z - b.z) < radius + b.r + 5) || roadLines.some(r => distanceTo(p, r.a, r.b) < radius + r.width / 2 + 3))) return;
      // Reject footprints spanning a shoreline or a protected hill foot.
      if ([-1, 1].some(s => inMappedRiver({ x: p.x + radius * s, z: p.z }) || inMappedRiver({ x: p.x, z: p.z + radius * s }))) return;
      if (geography.hills.some(hill => Math.hypot(p.x - hill.x, p.z - hill.z) < (hill.name === "鱼峰山" ? 130 : hill.name === "马鞍山" ? 310 : 220) + radius)) return;
      const q = new T.Quaternion().setFromAxisAngle(new T.Vector3(0, 1, 0), yaw);
      const color = ["#bbb8a9", "#c5c0ad", "#acb7ad", "#b5bdba", "#ccc6b8"][seed % 5];
      box(new T.Vector3(p.x, y + h / 2 - 1, p.z), [w, h + 2, d], color, q);
      box(new T.Vector3(p.x, y + h + 0.3, p.z), [w + 0.6, 0.6, d + 0.6], "#7f918e", q);
      if (h > 14 && Math.hypot(p.x, p.z) < 3200) for (let floor = 5; floor < h - 2; floor += 5) box(new T.Vector3(p.x, y + floor, p.z), [w + 0.15, 0.65, d + 0.15], "#839b9c", q);
      occupied.push({ ...p, r: radius });
    };
    geography.contextBuildings.forEach((b, i) => addHouse(b, b.w, b.d, b.h, 0, true, i));
    for (let index = 0; index < contextRoads.length; index++) {
      const road = contextRoads[index];
      for (let i = 1; i < road.points.length; i++) {
        const [ax, az] = road.points[i - 1]; const [bx, bz] = road.points[i];
        const length = Math.hypot(bx - ax, bz - az); if (length < 0.1) continue;
        const dx = (bx - ax) / length; const dz = (bz - az) / length;
        // Short draped sections keep roads on the same terrain as the city.
        for (let dist = 0; dist < length; dist += 24) {
          const end = Math.min(length, dist + 24);
          const a = { x: ax + dx * dist, z: az + dz * dist }; const b = { x: ax + dx * end, z: az + dz * end };
          if (inCity(a) || inCity(b) || !outside(a, road.width) || !outside(b, road.width) || !covered(a) || inMappedRiver(a) || inMappedRiver(b)) continue;
          beam(new T.Vector3(a.x, terrainHeight(a) + 0.06, a.z), new T.Vector3(b.x, terrainHeight(b) + 0.06, b.z), road.width, "#919b95", 0.12);
        }
        for (let dist = 30; dist < length; dist += 62) for (const side of [-1, 1]) {
          const seed = index * 31 + i * 7 + Math.floor(dist) + (side + 1);
          const offset = side * (road.width / 2 + 28);
          const p = { x: ax + dx * dist + dz * offset, z: az + dz * dist - dx * offset };
          addHouse(p, 18 + (seed % 13), 15 + (seed % 11), 13 + ((seed % 8) * 3.2), Math.atan2(dx, dz), false, seed);
        }
      }
    }
    const buildings = occupied.length;
    for (const bridge of geography.bridges) {
      if (bridge.name === "文惠桥") continue;
      const a = bridge.name === "广雅大桥" ? new T.Vector3(GUANGYA_MAIN.a.x, 0, GUANGYA_MAIN.a.z) : new T.Vector3(bridge.a[0], 0, bridge.a[1]);
      const b = bridge.name === "广雅大桥" ? new T.Vector3(GUANGYA_MAIN.b.x, 0, GUANGYA_MAIN.b.z) : new T.Vector3(bridge.b[0], 0, bridge.b[1]);
      const length = a.distanceTo(b); const direction = b.clone().sub(a).normalize();
      const normal = new T.Vector3(direction.z, 0, -direction.x);
      // Endpoint DEM includes canopy/urban artefacts; limit these inferred deck
      // heights rather than copying a roof into the bridge's vertical profile.
      const y = bridge.name === "广雅大桥" ? bridgeSurface({ x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 })!.y : Math.max(WATER_LEVEL + 14, Math.min(terrainHeight({ x: a.x, z: a.z }), 28), Math.min(terrainHeight({ x: b.x, z: b.z }), 28)) + 2;
      const point = (t: number, h = 0, side = 0) => a.clone().lerp(b, t).addScaledVector(normal, side).setY(y + h);
      if (bridge.name !== "广雅大桥") {
        beam(point(0, -1.2), point(1, -1.2), bridge.width, "#a2aba2", 2.4);
        beam(point(0, 0.02), point(1, 0.02), bridge.width - 1, "#727e7b", 0.12);
        for (const side of [-1, 1]) beam(point(0, 1.1, (side * bridge.width) / 2), point(1, 1.1, (side * bridge.width) / 2), 0.45, "#c2ccbf");
      }
      const spans = Math.max(2, Math.round(length / 140));
      for (let i = 0; i <= spans; i++) {
        const p = point(i / spans); const bottom = Math.min(terrainHeight(p), WATER_LEVEL - 1.5);
        beam(p.clone().setY(bottom), p.clone().setY(y - 2), 5, "#9faeaa", bridge.width * 0.65);
      }
      if (bridge.style === "arch") {
        const arches = bridge.name === "广雅大桥" ? 2 : 1;
        const rise = Math.min(90, (length / arches) * 0.15);
        const archOffset = bridge.name === "广雅大桥" ? GUANGYA_ARCH_OFFSET : bridge.width * 0.44;
        for (let span = 0; span < arches; span++) for (const side of [-archOffset, archOffset]) for (let j = 0; j < 32; j++) {
          const t = j / 32; const next = (j + 1) / 32;
          beam(point((span + t) / arches, Math.sin(t * Math.PI) * rise, side), point((span + next) / arches, Math.sin(next * Math.PI) * rise, side), 2.2, "#b17464");
          if (j % 2 === 0) beam(point((span + t) / arches, 0, side), point((span + t) / arches, Math.sin(t * Math.PI) * rise, side), 0.65, "#c1b4a3");
        }
      } else if (bridge.style === "suspension") {
        const single = bridge.name === "鹧鸪江大桥";
        const height = single ? 95 : 65;
        for (const t of [0.2, 0.8]) {
          if (single) for (const side of [-1, 1]) beam(point(t, 0, side * bridge.width * 0.42), point(t, height), 3.5, "#c2b9a1");
          else { for (const side of [-1, 1]) beam(point(t, 0, side * bridge.width * 0.44), point(t, height, side * bridge.width * 0.44), 3.4, "#b35f53"); beam(point(t, height - 7, -bridge.width * 0.44), point(t, height - 7, bridge.width * 0.44), 3, "#b35f53"); }
        }
        for (const side of single ? [0] : [-bridge.width * 0.44, bridge.width * 0.44]) for (let i = 0; i < 60; i++) {
          const cable = (t: number) => (t < 0.2 ? (height * t) / 0.2 : t > 0.8 ? (height * (1 - t)) / 0.2 : height * (0.22 + 0.78 * ((t - 0.5) / 0.3) ** 2));
          const t = i / 60; const next = (i + 1) / 60;
          beam(point(t, cable(t), side), point(next, cable(next), side), 1.1, "#c3b9a2");
          if (i % 2 === 0) for (const anchor of single ? [-bridge.width * 0.4, bridge.width * 0.4] : [side]) beam(point(t, 0, anchor), point(t, cable(t), side), 0.35, "#afbab1");
        }
      } else if (bridge.style === "cable") {
        // Baisha's single sculptural arch/gate tower and double cable planes.
        for (const side of [-1, 1]) {
          for (let i = 0; i < 20; i++) {
            const tower = (t: number) => point(0.43 + Math.sin(t * Math.PI) * 0.035, t * 106, side * bridge.width * 0.43 * (1 - t) ** 0.65);
            beam(tower(i / 20), tower((i + 1) / 20), 3, "#d7d8c9");
          }
          for (let i = 1; i < 16; i++) beam(point(0.43, 95, side * 2.5), point(i / 16, 0, side * bridge.width * 0.4), 0.42, "#d2d6c9");
        }
      } else if (bridge.style === "covered") {
        for (let i = 0; i <= 8; i++) {
          const t = i / 8;
          for (const side of [-1, 1]) beam(point(t, 0, side * bridge.width * 0.4), point(t, 7, side * bridge.width * 0.4), 1, "#8d7362");
          const p = point(t, 9);
          box(p, [bridge.width + 3, 1.8, 12], "#5b706c", new T.Quaternion().setFromAxisAngle(new T.Vector3(0, 1, 0), Math.atan2(direction.x, direction.z)));
          if (i % 2 === 0) for (let tier = 0; tier < 3; tier++) box(point(t, 12 + tier * 3), [18 - tier * 4, 1.5, 18 - tier * 4], "#69786b");
        }
      } else if (bridge.style === "truss") {
        for (const side of [-bridge.width / 2, bridge.width / 2]) {
          beam(point(0, 9, side), point(1, 9, side), 0.8, "#708f89");
          for (let i = 0; i < 36; i++) beam(point(i / 36, i % 2 ? 9 : 0, side), point((i + 1) / 36, i % 2 ? 0 : 9, side), 0.65, "#708f89");
        }
      }
    }
    const matrices = new Float32Array(parts.length * 16); const colors = new Float32Array(parts.length * 3);
    const matrix = new T.Matrix4(); const color = new T.Color();
    parts.forEach((p, i) => { matrix.compose(p.at, p.rotation, p.scale).toArray(matrices, i * 16); color.set(p.color).toArray(colors, i * 3); });
    return { matrices, colors, buildings, bridgeCount: geography.bridges.length };
}
