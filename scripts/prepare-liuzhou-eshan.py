"""Offline park path reconstruction. Horizontal paths are OSM, grades estimated.

Requires Shapely >= 2.1, numpy and scipy. No network requests. Original DEM and
source paths remain untouched; a narrow, explicitly estimated trail corridor
is cut from the shared terrain render/physics mesh.
"""
import hashlib
import json
import math
from pathlib import Path
import subprocess

import numpy as np
from scipy.sparse import coo_matrix, diags, eye
from scipy.sparse.linalg import factorized, spsolve
from scipy.spatial import cKDTree
from shapely import constrained_delaunay_triangles
from shapely.geometry import LineString, Polygon, box
from shapely.ops import unary_union
from lib.liuzhou_eshan_edges import seal_trail_edges

ROOT = Path(__file__).resolve().parents[1]
source_path = ROOT / 'src/components/liuzhou/city-map.json'
source = json.loads(source_path.read_text(encoding='utf8'))
park = next(a for a in source['areas'] if a['id'] == '205515998')
ids = {'945999802'} | {str(i) for i in range(1071650441, 1071650453)}
paths = [r for r in source['roads'] if r['id'] in ids]
# The cliff-side zigzag is retained as a rough source path. A 30m DEM cannot
# reconstruct its near-vertical ladders/rock steps, so it is not levelled here.
rough = next(r for r in source['roads'] if r['id'] == '1071650440')
nodes, node_lookup, edges, lines = [], {}, [], []


def node(p):
    key = tuple(round(v, 5) for v in p)
    if key not in node_lookup:
        node_lookup[key] = len(nodes)
        nodes.append(list(key))
    return node_lookup[key]


for route in paths:
    chain = []
    for a, b in zip(route['points'], route['points'][1:]):
        count = max(1, math.ceil(math.dist(a, b) / 2))
        part = [node([a[j] + (b[j] - a[j]) * i / count for j in range(2)]) for i in range(count + 1)]
        chain.extend(part if not chain else part[1:])
        edges.extend(zip(part, part[1:]))
    lines.append({'sourceId': route['id'], 'points': route['points'], 'nodes': chain,
                  'width': 4 if route['id'] in ['1071650450', '1071650451', '1071650452'] else 3.2})

# Use the exact unmodified terrain triangle sampler, not a second Python DEM.
sampler = r"""
const fs=require('fs'),ts=require('typescript');
require.extensions['.ts']=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,f);
const h=require('./src/components/liuzhou/terrainMesh.ts').terrainBaseTriangleHeight;
const points=JSON.parse(fs.readFileSync(0,'utf8'));
process.stdout.write(JSON.stringify(points.map(p=>h({x:p[0],z:p[1]}))));
"""


def sample(points):
    result = subprocess.run(['node', '-e', sampler], input=json.dumps(points), text=True,
                            cwd=ROOT, capture_output=True, check=True)
    return json.loads(result.stdout)


raw = np.array(sample(nodes))
row, col, data = [], [], []
for a, b in edges:
    row.extend([a, a, b, b]); col.extend([a, b, a, b]); data.extend([1, -1, -1, 1])
laplacian = coo_matrix((data, (row, col)), shape=(len(nodes), len(nodes))).tocsr()
heights = spsolve(eye(len(nodes), format='csr') + laplacian * 8, raw)
anchors = [node_lookup[tuple(route['points'][0])] for route in paths if route['id'] in ['1071650451', '1071650452']]
# Alternate grade projections only inside the trail footprint. This removes
# impossible radar spikes; it does not flatten the mountain or rescale its peak.
for iteration in range(1800):
    correction = 0
    for a, b in edges:
        limit = math.dist(nodes[a], nodes[b]) * 0.62
        excess = abs(heights[b] - heights[a]) - limit
        if excess > 0:
            sign = 1 if heights[b] > heights[a] else -1
            heights[a] += sign * excess / 2; heights[b] -= sign * excess / 2
            correction = max(correction, excess)
    heights[anchors] = raw[anchors]
    if correction < 1e-7:
        break
assert max(abs(heights[b] - heights[a]) / math.dist(nodes[a], nodes[b]) for a, b in edges) < 0.62001

node_tree = cKDTree(nodes)
node_array = np.array(nodes)


def grade(p):
    # A smooth compact kernel blends neighbouring arms at bends. Nearest-edge
    # selection creates Voronoi seams and steep skinny triangles even when the
    # centreline grades are safe.
    indices = node_tree.query_ball_point(p, 32)
    if not indices:
        return float(heights[int(node_tree.query(p)[1])])
    distances = np.sum((node_array[indices] - np.array(p)) ** 2, axis=1)
    weights = np.exp(-distances / 98) * np.maximum(0, 1 - distances / 1024) ** 3
    return float(np.sum(heights[indices] * weights) / np.sum(weights))


shelters = [b for b in source['buildings'] if b['id'] in ['1071650439', '1071650443']]
corridor = unary_union([LineString(r['points']).buffer(r['width'] / 2, cap_style=1, join_style=1, quad_segs=3) for r in lines]
                       + [Polygon(b['points']).buffer(1, quad_segs=3) for b in shelters])


def rings(shape):
    if shape.is_empty:
        return []
    polygons = [shape] if shape.geom_type == 'Polygon' else [g for g in shape.geoms if g.geom_type == 'Polygon']
    return [[[list(p) for p in poly.exterior.coords][:-1]] + [[list(p) for p in hole.coords][:-1] for hole in poly.interiors] for poly in polygons if poly.area > 1e-7]


faces, surface_nodes, surface_lookup = [], [], {}


def surface_node(p):
    key = tuple(round(v, 6) for v in p)
    if key not in surface_lookup:
        surface_lookup[key] = len(surface_nodes)
        surface_nodes.append([key[0], round(grade(key), 6), key[1]])
    return surface_lookup[key]


x0, z0, x1, z1 = corridor.bounds
for x in range(math.floor(x0 / 2) * 2, math.ceil(x1), 2):
    for z in range(math.floor(z0 / 2) * 2, math.ceil(z1), 2):
        patch = corridor.intersection(box(x, z, x + 2, z + 2))
        if patch.is_empty or patch.area < 1e-8:
            continue
        for face in constrained_delaunay_triangles(patch).geoms:
            indices = [surface_node(p) for p in list(face.exterior.coords)[:-1]]
            a, b, c = [surface_nodes[i] for i in indices]
            if (b[0] - a[0]) * (c[2] - a[2]) - (b[2] - a[2]) * (c[0] - a[0]) > 0:
                indices[1], indices[2] = indices[2], indices[1]
            faces.append(indices)

# Enforce the grade on actual triangles too. Centreline-only limits leave a
# few steep slivers at tightly rounded junctions. Project only the offending
# vertex heights; the horizontal source corridor remains unchanged.
face_indices = np.array(faces)
vertices = np.array(surface_nodes)
tri = vertices[face_indices]
dx1 = tri[:, 1, 0] - tri[:, 0, 0]; dz1 = tri[:, 1, 2] - tri[:, 0, 2]
dx2 = tri[:, 2, 0] - tri[:, 0, 0]; dz2 = tri[:, 2, 2] - tri[:, 0, 2]
det = dx1 * dz2 - dx2 * dz1
gradient = np.stack([np.stack([dz1-dz2, dz2, -dz1], axis=1), np.stack([dx2-dx1, -dx2, dx1], axis=1)], axis=1) / det[:, None, None]
ys = vertices[:, 1].copy()
raw_surface = np.array(sample([[p[0], p[2]] for p in vertices]))
anchor_distances = np.min(np.linalg.norm(vertices[:,None,[0,2]] - node_array[anchors][None,:,:], axis=2), axis=1)
weights = np.where(anchor_distances < 4, 1000.0, 1.0)
ys[anchor_distances < 4] = raw_surface[anchor_distances < 4]
initial_ys = ys.copy()
row = np.repeat(np.arange(len(faces)*2), 3)
col = np.repeat(face_indices[:,None,:], 2, axis=1).ravel()
g_matrix = coo_matrix((gradient.ravel(), (row,col)), shape=(len(faces)*2, len(vertices))).tocsr()
rho = 0.2
solve = factorized((diags(weights, format='csc') + rho * (g_matrix.T @ g_matrix)).tocsc())
projected = (g_matrix @ ys).reshape(-1, 2)
dual = np.zeros_like(projected)
for iteration in range(3000):
    ys = solve(initial_ys * weights + rho * (g_matrix.T @ (projected-dual).ravel()))
    slopes = (g_matrix @ ys).reshape(-1,2)
    norms = np.linalg.norm(slopes, axis=1)
    if float(np.max(norms)) < 0.775:
        break
    wanted = slopes + dual
    projected = wanted * np.minimum(1, 0.72 / np.maximum(1e-12, np.linalg.norm(wanted,axis=1)))[:,None]
    dual += slopes - projected
assert float(np.max(norms)) < 0.78, float(np.max(norms))
vertices[:, 1] = ys
surface_nodes = np.round(vertices, 6).tolist()

# Terrain cells outside the narrow route keep their existing elevations.
dem = json.loads((ROOT / 'src/components/liuzhou/terrain-dem.json').read_text())
cuts = {}
for step in [10, 20, 40]:
    start_x = dem['minX'] + math.floor((x0 - dem['minX']) / step) * step
    start_z = dem['minZ'] + math.floor((z0 - dem['minZ']) / step) * step
    for x in range(int(start_x), math.ceil(x1), step):
        for z in range(int(start_z), math.ceil(z1), step):
            cell = box(x, z, x + step, z + step)
            if cell.intersection(corridor).area > 1e-7:
                # Preserve the original cell diagonal so the uncut ground and
                # trail-edge retaining faces meet the same original triangles.
                cuts[f'{step}:{x}:{z}'] = [r for tri in [Polygon([(x,z),(x+step,z),(x,z+step)]), Polygon([(x+step,z),(x+step,z+step),(x,z+step)])] for r in rings(tri.difference(corridor))]

wall_faces, wall_sealing = seal_trail_edges({'vertices': surface_nodes, 'faces': faces}, ROOT)

output = {'version': 1, 'sourceSha256': hashlib.sha256(source_path.read_bytes()).hexdigest(),
          'park': park, 'paths': lines, 'roughPath': rough,
          'status': 'OSM horizontal boundaries/axes; estimated 3.2-4m widths, DEM-smoothed grades, facilities and planting. Cliff-side rough path is not graded.',
          'attribution': '© OpenStreetMap contributors · Mapzen/AWS Terrain Tiles', 'license': 'ODbL-1.0; original terrain attribution retained',
          'maxNodeGrade': 0.62, 'maxNodeDemAdjustment': round(float(np.max(np.abs(heights - raw))), 3),
          'maxSurfaceGrade': round(float(np.max(norms)), 6), 'maxMeshCorrection': round(float(np.max(np.abs(ys - initial_ys))), 6),
          'maxSurfaceDemAdjustment': round(float(np.max(np.abs(ys - raw_surface))), 6),
          'nodes': [[*p, round(float(heights[i]), 6)] for i, p in enumerate(nodes)],
          'vertices': surface_nodes, 'faces': faces, 'walls': wall_faces, 'wallSealing': wall_sealing, 'terrainCuts': cuts,
          'shelters': shelters}
for name in ['src/components/liuzhou/eshan-layout.json', 'public/games/liuzhou/eshan-layout.json']:
    (ROOT / name).write_text(json.dumps(output, ensure_ascii=False, separators=(',', ':')) + '\n', encoding='utf8')
print(json.dumps({k: len(output[k]) for k in ['paths', 'nodes', 'vertices', 'faces', 'walls', 'terrainCuts']} | {'maxDemAdjustment': output['maxNodeDemAdjustment']}))
