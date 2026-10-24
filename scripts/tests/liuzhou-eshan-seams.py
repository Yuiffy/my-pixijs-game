"""Independently check trail retaining faces against both adjoining meshes."""
import json
from pathlib import Path
import subprocess

import numpy as np
from shapely.geometry import LineString, Point, Polygon
from shapely.ops import unary_union
from shapely.strtree import STRtree

ROOT = Path(__file__).resolve().parents[2]
layout = json.loads((ROOT / 'src/components/liuzhou/eshan-layout.json').read_text(encoding='utf-8'))
vertices = np.array(layout['vertices'])
triangles = vertices[np.array(layout['faces'])]
polygons = [Polygon(t[:, [0, 2]]) for t in triangles]
tree = STRtree(polygons)
ground_points, trail_points, expected_ground, expected_trail = [], [], [], []
crossed = 0
draw_crossed = 0
for wall in layout['walls']:
    a, b, upper_b, upper_a = np.array(wall)
    if (upper_a[1] - a[1]) * (upper_b[1] - b[1]) < -1e-8:
        crossed += 1
    if (upper_a[1] - a[1] + 0.135) * (upper_b[1] - b[1] + 0.135) < -1e-8:
        draw_crossed += 1
    for t in [0.0, 0.25, 0.5, 0.75, 1.0]:
        p = a * (1 - t) + b * t
        ground_points.append([float(p[0]), float(p[2])])
        expected_ground.append(float(p[1]))
        trail_points.append(Point(p[0], p[2]))
        expected_trail.append(float(upper_a[1] * (1 - t) + upper_b[1] * t))

sampler = r"""
const fs=require('fs'),ts=require('typescript');
require.extensions['.ts']=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,f);
const h=require('./src/components/liuzhou/terrainMesh.ts').terrainBaseTriangleHeight;
process.stdout.write(JSON.stringify(JSON.parse(fs.readFileSync(0,'utf8')).map(([x,z])=>h({x,z}))));
"""
ground = json.loads(subprocess.run(['node', '-e', sampler], input=json.dumps(ground_points), cwd=ROOT,
                                  text=True, capture_output=True, check=True).stdout)
ground_errors = np.abs(np.array(ground) - expected_ground)
trail_errors = []
boundary_errors = []
for p, wanted in zip(trail_points, expected_trail):
    i = int(tree.nearest(p))
    boundary_errors.append(float(polygons[i].distance(p)))
    a, b, c = triangles[i]
    x, z = p.x, p.y
    det = (b[2] - c[2]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[2] - c[2])
    u = ((b[2] - c[2]) * (x - c[0]) + (c[0] - b[0]) * (z - c[2])) / det
    v = ((c[2] - a[2]) * (x - c[0]) + (a[0] - c[0]) * (z - c[2])) / det
    trail_errors.append(abs(float(a[1] * u + b[1] * v + c[1] * (1 - u - v)) - wanted))

surface = unary_union(polygons)
wall_lines = unary_union([LineString([(w[0][0], w[0][2]), (w[1][0], w[1][2])]) for w in layout['walls']])
unsealed = surface.boundary.difference(wall_lines.buffer(2e-6)).length
summary = {
    'walls': len(layout['walls']), 'samples': len(ground_points),
    'maxGroundGap': float(max(ground_errors)), 'maxTrailGap': float(max(trail_errors)),
    'maxBoundaryDistance': float(max(boundary_errors)), 'crossedQuads': crossed, 'drawCrossedQuads': draw_crossed,
    'unsealedBoundaryLength': float(unsealed),
    'worstGround': ground_points[int(np.argmax(ground_errors))],
    'worstTrail': ground_points[int(np.argmax(trail_errors))],
}
print(json.dumps(summary))
assert summary['maxGroundGap'] < 2e-5, summary
assert summary['maxTrailGap'] < 2e-5, summary
assert summary['maxBoundaryDistance'] < 2e-6, summary
assert summary['crossedQuads'] == 0, summary
assert summary['drawCrossedQuads'] == 0, summary
assert summary['unsealedBoundaryLength'] < 0.002, summary
