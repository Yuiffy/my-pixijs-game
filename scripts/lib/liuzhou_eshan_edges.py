"""Seal the existing trail mesh at its exact edges, without changing heights."""
import json
import math
import subprocess

import numpy as np
from shapely.geometry import Point, Polygon
from shapely.ops import unary_union
from shapely.strtree import STRtree


def seal_trail_edges(layout, root):
    vertices = np.array(layout['vertices'])
    triangles = vertices[np.array(layout['faces'])]
    shapes = [Polygon(t[:, [0, 2]]) for t in triangles]
    surface = unary_union(shapes)
    tree = STRtree(shapes)
    sampler = r"""
const fs=require('fs'),ts=require('typescript');
require.extensions['.ts']=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,f);
const m=require('./src/components/liuzhou/terrainMesh.ts');
const input=JSON.parse(fs.readFileSync(0,'utf8'));
process.stdout.write(JSON.stringify({chunks:m.terrainChunks().filter(c=>c.minX<input.maxX&&c.maxX>input.minX&&c.minZ<input.maxZ&&c.maxZ>input.minZ),groundDrawOffset:m.terrainDrawHeight(0,0),trailDrawOffset:m.terrainDrawHeight(0,6),heights:input.points.map(([x,z])=>m.terrainBaseTriangleHeight({x,z}))}));
"""
    min_x, min_z, max_x, max_z = surface.bounds

    def sample(points):
        result = subprocess.run(['node', '-e', sampler], cwd=root, text=True,
                                input=json.dumps({'points': points, 'minX': min_x, 'minZ': min_z,
                                                  'maxX': max_x, 'maxZ': max_z}),
                                capture_output=True, check=True)
        return json.loads(result.stdout)

    settings = sample([])
    chunks = settings['chunks']
    draw_delta = settings['trailDrawOffset']-settings['groundDrawOffset']

    def height(p):
        index = int(tree.nearest(Point(p)))
        assert shapes[index].distance(Point(p)) < 1e-7
        a, b, c = triangles[index]
        det = (b[2]-c[2])*(a[0]-c[0])+(c[0]-b[0])*(a[2]-c[2])
        u = ((b[2]-c[2])*(p[0]-c[0])+(c[0]-b[0])*(p[1]-c[2])) / det
        v = ((c[2]-a[2])*(p[0]-c[0])+(a[0]-c[0])*(p[1]-c[2])) / det
        return float(a[1]*u+b[1]*v+c[1]*(1-u-v))

    segments = []
    pieces = [surface] if surface.geom_type == 'Polygon' else list(surface.geoms)
    for polygon in pieces:
        for ring in [polygon.exterior, *polygon.interiors]:
            coords = list(ring.coords)
            for a, b in zip(coords, coords[1:]):
                values = {0.0, 1.0}
                for chunk in chunks:
                    if max(a[0], b[0]) < chunk['minX'] or min(a[0], b[0]) > chunk['maxX'] or max(a[1], b[1]) < chunk['minZ'] or min(a[1], b[1]) > chunk['maxZ']:
                        continue
                    step = chunk['step']
                    # Cell edges and diagonals are all breaklines in the base
                    # triangle sampler. Extra collinear splits are harmless.
                    for lo, hi, origin in [(a[0], b[0], chunk['minX']), (a[1], b[1], chunk['minZ']),
                                           (a[0]+a[1], b[0]+b[1], chunk['minX']+chunk['minZ'])]:
                        if abs(hi-lo) < 1e-12:
                            continue
                        for n in range(math.floor((min(lo, hi)-origin)/step), math.ceil((max(lo, hi)-origin)/step)+1):
                            t = (origin+n*step-lo)/(hi-lo)
                            if 1e-9 < t < 1-1e-9:
                                values.add(t)
                chain = [[a[j]+(b[j]-a[j])*t for j in range(2)] for t in sorted(values)]
                segments.extend(zip(chain, chain[1:]))

    points = [p for segment in segments for p in segment]
    raw_heights = sample(points)['heights']
    wall_faces = []
    crossing_splits = 0
    draw_splits = 0
    for i, (a, b) in enumerate(segments):
        base_a, base_b = raw_heights[i*2:i*2+2]
        trail_a, trail_b = height(a), height(b)
        delta_a, delta_b = trail_a-base_a, trail_b-base_b
        parameters = [0.0, 1.0]
        for offset in [0, draw_delta]:
            if (delta_a+offset)*(delta_b+offset) < 0:
                t = (delta_a+offset)/(delta_a-delta_b)
                if 1e-9 < t < 1-1e-9:
                    parameters.append(t)
                    if offset == 0:
                        crossing_splits += 1
                    else:
                        draw_splits += 1
        parameters = sorted(set(parameters))
        for lo, hi in zip(parameters, parameters[1:]):
            ends = []
            for t in [lo, hi]:
                ends.append([a[0]+(b[0]-a[0])*t, base_a+(base_b-base_a)*t, a[1]+(b[1]-a[1])*t,
                             trail_a+(trail_b-trail_a)*t])
            p, q = ends
            wall_faces.append([[p[0], p[1], p[2]], [q[0], q[1], q[2]],
                               [q[0], q[3], q[2]], [p[0], p[3], p[2]]])
    return wall_faces, {'method': 'Exact rendered trail boundary, base terrain cell/diagonal breaklines and cut/fill zero crossings',
                        'crossingSplits': crossing_splits, 'drawCrossingSplits': draw_splits,
                        'groundDrawOffset': settings['groundDrawOffset'], 'trailDrawOffset': settings['trailDrawOffset'],
                        'boundaryLengthMeters': float(surface.boundary.length),
                        'heightChangeMeters': 0}
