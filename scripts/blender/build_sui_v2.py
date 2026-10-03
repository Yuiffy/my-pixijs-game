"""Sui's blue-and-white outfit: authored anime topology, layered hair and facial rig.

Blender 4.5: --background --python scripts/blender/build_sui_v2.py --
  --output public/games/after-hours
The character is entirely 3D. Face, iris and hair paint are packed into the GLB.
"""
import argparse
from collections import defaultdict
import json
import math
from pathlib import Path
import sys

import bpy
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / "assets/after-hours"


def xyz(p):
    return (p[0], -p[2], p[1])


def mat(name, color, roughness=.65, metal=0, glow=0):
    m = bpy.data.materials.new(name)
    m.diffuse_color = (*color, 1)
    m.use_nodes = True
    bs = m.node_tree.nodes.get("Principled BSDF")
    bs.inputs['Base Color'].default_value = (*color, 1)
    bs.inputs['Roughness'].default_value = roughness
    bs.inputs['Metallic'].default_value = metal
    bs.inputs['Specular IOR Level'].default_value = .25
    bs.inputs['Emission Color'].default_value = (*color, 1)
    bs.inputs['Emission Strength'].default_value = glow
    return m


def paint(m, name, size, fn):
    image = bpy.data.images.new(name, width=size, height=size, alpha=False)
    pixels = []
    for j in range(size):
        for i in range(size):
            pixels.extend((*fn(i / (size - 1), j / (size - 1)), 1))
    image.pixels.foreach_set(pixels)
    image.pack()
    node = m.node_tree.nodes.new('ShaderNodeTexImage')
    node.image = image
    m.node_tree.links.new(node.outputs['Color'], m.node_tree.nodes.get('Principled BSDF').inputs['Base Color'])


def pivot(name, position, parent=None):
    o = bpy.data.objects.new(name, None)
    bpy.context.collection.objects.link(o)
    o.location = xyz(position)
    bpy.context.view_layer.update()
    if parent:
        attach(o, parent)
    return o


def attach(o, par):
    bpy.context.view_layer.update()
    matrix = o.matrix_world.copy()
    o.parent = par
    o.matrix_world = matrix
    return o


def mesh(name, vertices, faces, material, par=None, uv=None):
    data = bpy.data.meshes.new(name)
    data.from_pydata([xyz(p) for p in vertices], [], faces)
    data.update()
    o = bpy.data.objects.new(name, data)
    bpy.context.collection.objects.link(o)
    o.data.materials.append(material)
    for polygon in data.polygons:
        polygon.use_smooth = True
    if uv:
        data.uv_layers.new(name='Paint')
        for loop in data.loops:
            data.uv_layers.active.data[loop.index].uv = uv[loop.vertex_index]
    # Mesh winding is recalculated once, never corrected by DoubleSide at runtime.
    bpy.ops.object.select_all(action='DESELECT')
    o.select_set(True)
    bpy.context.view_layer.objects.active = o
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.mesh.normals_make_consistent(inside=False)
    bpy.ops.object.mode_set(mode='OBJECT')
    o.select_set(False)
    if par:
        attach(o, par)
    return o


def ball(name, p, scale, material, par=None, segments=20):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segments, ring_count=12, location=xyz(p))
    o = bpy.context.object
    o.name = name
    o.scale = (scale[0], scale[2], scale[1])
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    o.data.materials.append(material)
    for face in o.data.polygons:
        face.use_smooth = True
    if par:
        attach(o, par)
    return o


def tube(name, points, radius, material, par=None):
    c = bpy.data.curves.new(name, 'CURVE')
    c.dimensions = '3D'
    c.resolution_u = 2
    c.bevel_depth = radius
    c.bevel_resolution = 2
    s = c.splines.new('POLY')
    s.points.add(len(points) - 1)
    for v, p in zip(s.points, points):
        v.co = (*xyz(p), 1)
    o = bpy.data.objects.new(name, c)
    bpy.context.collection.objects.link(o)
    o.data.materials.append(material)
    bpy.ops.object.select_all(action='DESELECT')
    o.select_set(True)
    bpy.context.view_layer.objects.active = o
    bpy.ops.object.convert(target='MESH')
    o.select_set(False)
    if par:
        attach(o, par)
    return o


def sample(points, count=36):
    result = []
    for i in range(count):
        t = i / (count - 1) * (len(points) - 1)
        n = min(int(t), len(points) - 2)
        f = t - n
        a, b, c, d = [Vector(points[min(len(points) - 1, max(0, j))]) for j in (n - 1, n, n + 1, n + 2)]
        result.append(tuple(.5 * ((2 * b) + (-a + c) * f + (2 * a - 5 * b + 4 * c - d) * f*f + (-a + 3*b - 3*c + d) * f*f*f)))
    return result


def lock(name, points, width, material, par, depth=.006, count=32):
    """A closed, tapered lens section; flat locks rather than cylindrical ropes."""
    path = sample(points, count)
    verts, faces, uv = [], [], []
    sides = 10
    for j, p in enumerate(path):
        t = j / (count - 1)
        taper = max(.035, (math.sin(math.pi * (t * .90 + .065))) ** .58)
        if t > .82:
            taper *= max(.035, (1 - t) / .18)
        for i in range(sides):
            a = math.tau * i / sides
            verts.append((p[0] + math.cos(a) * width * taper, p[1], p[2] + math.sin(a) * depth * taper))
            uv.append((i / sides, t))
    for j in range(count - 1):
        for i in range(sides):
            a = j * sides + i
            b = j * sides + (i + 1) % sides
            faces.append((a, b, b + sides, a + sides))
    faces.extend([tuple(range(sides - 1, -1, -1)), tuple((count-1)*sides+i for i in range(sides))])
    return mesh(name, verts, faces, material, par, uv)


def loft(name, rings, material, par=None, sides=32, pleats=0):
    # ring: y, width, depth, center_x, center_z. Connected anatomical / cloth loops.
    verts, faces, uv = [], [], []
    for j, (y, width, depth, cx, cz) in enumerate(rings):
        for i in range(sides):
            a = math.tau * i / sides
            fold = 1 + pleats * math.cos(a * 12)
            verts.append((cx + width * math.sin(a) * fold, y, cz + depth * math.cos(a) * fold))
            uv.append((i / sides, j / max(1, len(rings) - 1)))
    for j in range(len(rings) - 1):
        for i in range(sides):
            a = j * sides + i
            b = j * sides + (i + 1) % sides
            faces.append((a, b, b + sides, a + sides))
    faces.extend([tuple(range(sides - 1, -1, -1)), tuple((len(rings)-1)*sides+i for i in range(sides))])
    return mesh(name, verts, faces, material, par, uv)


def build_character(out):
    out = Path(out).resolve()
    out.mkdir(parents=True, exist_ok=True)
    SOURCE.mkdir(parents=True, exist_ok=True)
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete(use_global=False)
    for m in list(bpy.data.materials):
        bpy.data.materials.remove(m)
    skin = mat('Porcelain skin / painted blush', (.96, .83, .79), .83, glow=.015)
    face_skin = mat('Soft anime face / painted blush', (.99, .86, .84), .95, glow=.16)
    white = mat('Ivory cotton', (.88, .89, .96), .9)
    navy = mat('Midnight blue tailoring', (.031, .046, .091), .83)
    lining = mat('Blue grey velvet', (.105, .145, .23), .74)
    silk = mat('Pearl silver hair / strand paint', (.92, .91, .97), .6, glow=.025)
    shadow = mat('Silver lilac hair underside', (.59, .56, .71), .7)
    gold = mat('Antique champagne gold', (.65, .48, .22), .42, .55)
    ruby = mat('Ruby brooch', (.45, .018, .038), .28, .15)
    ink = mat('Soft cocoa eyelashes', (.042, .024, .038), .95)
    eyes = mat('Warm eye whites', (.98, .94, .92), .95, glow=.015)
    iris = mat('Ruby iris / radial paint', (.72, .13, .18), .9, glow=.025)
    lips = mat('Rose lips', (.56, .15, .21), .8)
    shoe = mat('Polished midnight shoes', (.027, .032, .064), .28)

    def blush(u, v):
        x, y = (u - .5) * .29, 1.315 + v * .315
        strength = sum(math.exp(-((x - c) / .031)**2 - ((y - 1.392) / .016)**2) * .25 for c in (-.081, .081))
        strength += math.exp(-(x/.015)**2 - ((y-1.39)/.02)**2) * .065
        return tuple(c * (1-strength) + b * strength for c, b in zip((.99, .885, .847), (1, .46, .52)))

    def face_paint(u, v):
        x, y = (u - .5) * .29, 1.315 + v * .315
        strength = sum(math.exp(-((x - c) / .035)**2 - ((y - 1.409) / .020)**2) * .27 for c in (-.073, .073))
        strength += math.exp(-(x/.012)**2 - ((y-1.390)/.014)**2) * .065
        return tuple(c * (1-strength) + b * strength for c, b in zip((.995, .863, .847), (1, .42, .51)))

    def iris_paint(u, v):
        x, y = (u-.5)*2, (v-.5)*2
        r, a = math.hypot(x, y), math.atan2(y, x)
        fiber = math.sin(a*43 + r*10)*.012 + math.cos(a*71-r*5)*.008
        warm = min(1, max(0, (.6-y)/1.5))
        base = tuple(top*(1-warm)+bottom*warm+fiber for top,bottom in zip((.39,.055,.105),(.88,.28,.28)))
        edge = min(1, max(0, (r-.84)*6))
        base = tuple(c*(1-edge) + d*edge for c,d in zip(base, (.22,.035,.065)))
        if (x/.28)**2 + ((y-.025)/.29)**2 < 1:
            base = (.12,.023,.046)
        if ((x+.29)/.13)**2+((y-.35)/.16)**2 < 1:
            base = (1,.97,.95)
        if ((x-.34)/.065)**2+((y+.41)/.065)**2 < 1:
            base = (.96,.69,.65)
        if abs(y + .59) < .015 and .32 < r < .77:
            base = (.98,.51,.40)
        return base

    paint(skin, 'Hand painted porcelain face 512', 512, blush)
    paint(face_skin, 'Soft cheek and nose face paint 512', 512, face_paint)
    face_nodes = face_skin.node_tree.nodes
    face_skin.node_tree.links.new(next(n for n in face_nodes if n.type=='TEX_IMAGE').outputs['Color'], face_nodes.get('Principled BSDF').inputs['Emission Color'])
    paint(iris, 'Ruby iris highlights and fibers 512', 512, iris_paint)
    paint(eyes, 'Soft upper eyelid shadow 256', 256, lambda u,v: tuple(c*(1-.10*v**3)+d*.10*v**3 for c,d in zip((1,.975,.966),(.69,.49,.52))))
    paint(silk, 'Pearl hair satin strands 256', 256, lambda u,v: tuple(max(0,min(1,c + .024*math.cos(u*math.tau) + .008*math.cos(u*90 + v*4))) for c in (.90,.885,.95)))

    root = pivot('Sui_Root', (0,0,0))
    body = pivot('Sui_Body', (0,.99,0), root)
    head = pivot('Sui_Head', (0,1.31,0), body)
    # Width and front-depth loops form temples, cheeks, a jaw and a small chin.
    profile = [(1.315,.014,.04,.028),(1.33,.044,.073,.018),(1.35,.073,.09,.007),
               (1.38,.099,.10,0),(1.414,.12,.107,-.008),(1.45,.126,.108,-.011),
               (1.49,.13,.11,-.014),(1.535,.129,.112,-.021),(1.575,.111,.103,-.026),
               (1.609,.07,.066,-.024),(1.626,.009,.01,-.024)]

    def ring_at(y):
        for a,b in zip(profile, profile[1:]):
            if a[0] <= y <= b[0]:
                t = (y-a[0])/(b[0]-a[0])
                return tuple(a[i]*(1-t)+b[i]*t for i in (1,2,3))
        return profile[-1][1:]

    def front(x,y):
        w,d,c = ring_at(y)
        return c + d * max(0,1-(x/w)**2)**.30 + .003*math.exp(-(x/.014)**2-((y-1.395)/.025)**2)

    verts, faces, uv = [], [], []
    rows, sides = 46, 64
    for j in range(rows):
        y = 1.316 + j/(rows-1)*.309
        w,d,c = ring_at(y)
        for i in range(sides):
            a = math.tau*i/sides
            x, k = w*math.sin(a), math.cos(a)
            z = front(x,y) if k >= 0 else c+d*k
            verts.append((x,y,z))
            uv.append((.5+x/.29,(y-1.315)/.315))
    for j in range(rows-1):
        for i in range(sides):
            a=j*sides+i; b=j*sides+(i+1)%sides
            faces.append((a,b,b+sides,a+sides))
    faces.extend([tuple(range(sides-1,-1,-1)),tuple((rows-1)*sides+i for i in range(sides))])
    face = mesh('Sui_Face / shaped cheek and jaw topology',verts,faces,face_skin,head,uv)
    face['topology'] = 'contiguous 46 x 64 loops; shallow anime nose; softly painted cheek blush'
    loft('Neck',[(1.235,.042,.039,0,0),(1.31,.042,.039,0,0),(1.35,.039,.033,0,.006)],skin,body)
    for side,label in [(-1,'Left'),(1,'Right')]:
        ball('Ear', (side*.126,1.41,-.005),(.013,.03,.014),skin,head)
        tube('Earring',[(side*.132,1.386,.003),(side*.136,1.373,.013),(side*.132,1.365,.018)],.002,gold,head)
        ball('Pearl drop',(side*.132,1.361,.018),(.005,.007,.005),white,head)
        cx,cy = side*.056,1.438
        eye_width, upper, lower = .076, .016, -.014

        def eye_edge(t, upper_lid):
            dx = (t-.5)*eye_width
            arc = math.sin(math.pi*t)**.68
            return cy + side*dx*.035 + (upper if upper_lid else lower)*arc

        eye_group = pivot('Sui_'+label+'Eye',(cx,cy,front(cx,cy)),head)
        ev,ef,eu = [],[],[]
        # The 3D performance reference has relaxed lids, not a complete dark rim.
        nx,ny = 28,14
        for j in range(ny+1):
            q = j/ny
            for i in range(nx+1):
                t=i/nx; dx=(t-.5)*eye_width
                arc=math.sin(math.pi*t)**.68
                y=eye_edge(t,False)*(1-q)+eye_edge(t,True)*q
                x=cx+dx
                ev.append((x,y,front(x,y)+.0012+.0003*math.sin(q*math.pi)*arc))
                eu.append((t,q))
        for j in range(ny):
            for i in range(nx):
                a=j*(nx+1)+i
                ef.append((a,a+1,a+nx+2,a+nx+1))
        mesh(label+' almond eye white',ev,ef,eyes,eye_group,eu)
        iv,iff,iu=[],[],[]
        segments=48
        for j in range(9):
            r=j/8
            for i in range(segments):
                a=math.tau*i/segments
                dx=math.cos(a)*r*.0195
                dy=math.sin(a)*r*.022
                t=dx/eye_width+.5
                # Clip the iris under both lids; the upper iris is never fully exposed.
                y=max(eye_edge(t,False)+.00035,min(eye_edge(t,True)-.00035,cy+dy+.001))
                x=cx+dx
                iv.append((x,y,front(x,y)+.0023+.0002*(1-r*r)))
                iu.append((.5+dx/.039,.5+dy/.044))
        for j in range(8):
            for i in range(segments):
                a=j*segments+i; b=j*segments+(i+1)%segments
                iff.append((a,a+segments,b+segments,b))
        mesh(label+' ruby iris',iv,iff,iris,eye_group,iu)
        for upper_lid in [True,False]:
            points=[]
            for i in range(33):
                t=i/32
                if not upper_lid and not ((side<0 and .035<t<.31) or (side>0 and .69<t<.965)):
                    continue
                dx=(t-.5)*eye_width
                y=eye_edge(t,upper_lid)
                points.append((cx+dx,y,front(cx+dx,y)+.0035))
            tube(label+(' upper lash' if upper_lid else ' soft lower outer lid'),points,.00165 if upper_lid else .00045,ink if upper_lid else lips,eye_group)
        for i in range(2):
            dx=side*(.031-i*.004)
            x=cx+dx; y=eye_edge(dx/eye_width+.5,True)
            tube('Lash flick',[(x,y,front(x,y)+.005),(x+side*(.006-i*.001),y+.0035,front(x,y)+.005)],.0009,ink,eye_group)
        points=[(cx+(i/20-.5)*.056,1.477+.003*math.sin(i/20*math.pi),front(cx+(i/20-.5)*.056,1.477)+.002) for i in range(21)]
        tube('Soft eyebrow',points,.0012,shadow,head)

    mouth = pivot('Sui_Mouth',(0,1.361,front(0,1.361)),head)
    # Smile is actual lip geometry, with exported morphs used during dialogue.
    mv,mf=[],[]
    for j in range(3):
        for i in range(25):
            x=(i/24-.5)*.038
            y=1.359+.003*(abs(x)/.019)**1.7+(j-1)*.0007*math.sin(i/24*math.pi)
            mv.append((x,y,front(x,y)+.0013))
    for j in range(2):
        for i in range(24):
            a=j*25+i; mf.append((a,a+1,a+26,a+25))
    mouth_mesh=mesh('Sui_Lips',mv,mf,lips,mouth)
    mouth_mesh.shape_key_add(name='Basis')
    smile=mouth_mesh.shape_key_add(name='Smile')
    talk=mouth_mesh.shape_key_add(name='Talk')
    worry=mouth_mesh.shape_key_add(name='Worry')
    for i,p in enumerate(mv):
        smile.data[i].co=xyz((p[0]*1.13,p[1]+.003*(abs(p[0])/.019)**1.3,p[2]))
        talk.data[i].co=xyz((p[0],p[1]+((i//25)-1)*.006*math.sin((i%25)/24*math.pi),p[2]+.001))
        worry.data[i].co=xyz((p[0]*.75,1.363-(p[1]-1.359),p[2]))

    # Hair crown has its own clipped hairline, with no sphere crossing the face.
    hv,hf,hu=[],[],[]
    for j in range(18):
        for i in range(64):
            a=math.tau*i/64
            t=j/17
            low=1.54 if math.cos(a)>.35 else 1.345
            y=1.636-(1.636-low)*t
            w,d,c=ring_at(min(1.624,max(1.316,y)))
            hv.append(((w+.009)*math.sin(a),y,c+(d+.014)*math.cos(a)))
            hu.append((i/64,t))
    for j in range(17):
        for i in range(64):
            a=j*64+i;b=j*64+(i+1)%64;hf.append((a,b,b+64,a+64))
    mesh('Silver crown with shaped hairline',hv,hf,silk,head,hu)
    for i in range(9):
        x=(i-4)*.027
        tip=1.455+abs(i-4)*.005
        lock('Layered pointed fringe',[(x*.66,1.62,.053),(x*.83,1.576,.111),(x,1.523,.121),(x*.87,tip,.110)],.025,silk,head,.006)
    for side in (-1,1):
        lock('Cheek framing lock',[(side*.116,1.57,.059),(side*.129,1.454,.084),(side*.115,1.367,.103),(side*.101,1.324,.088)],.019,silk,head,.009)
        tail=pivot('Sui_'+('Left' if side<0 else 'Right')+'Hair',(side*.132,1.555,-.07),head)
        for i in range(9):
            spread=(i-4)*.008
            end=1.005+(i%3)*.025
            lock('Flowing twin tail / layered ribbon',[(side*(.13+spread),1.573,-.051+spread),
                 (side*(.18+spread),1.43,-.085+spread),(side*(.208+spread),1.245,-.083+spread),
                 (side*(.232+spread),1.10,-.006+spread),(side*(.20+spread),end,.035+spread),
                 (side*(.166+spread),end+.012,.044+spread)],.027+(i%3)*.008,silk if i>1 else shadow,tail,.010)
        ball('Ponytail bow knot',(side*.143,1.568,.001),(.012,.015,.014),navy,head)
        for k in (-1,1):
            lock('Ponytail silk bow',[(side*.145,1.567,.006),(side*(.145+k*.029),1.598,.015),(side*(.145+k*.041),1.569,.018),(side*.147,1.558,.013)],.016,navy,head,.003,24)
        lock('Bow ribbon',[(side*.154,1.557,.018),(side*.17,1.49,.029),(side*.162,1.457,.03)],.012,navy,head,.003,20)
    # An embroidered beret, not a cap covering her eyes.
    loft('Soft blue beret',[(1.601,.134,.115,0,-.022),(1.626,.152,.134,-.008,-.027),
          (1.659,.142,.133,-.018,-.028),(1.68,.102,.099,-.026,-.03),(1.688,.026,.026,-.032,-.03)],navy,head,64)
    tube('Beret gold piping',[(.137*math.sin(i/64*math.tau),1.609,-.021+.117*math.cos(i/64*math.tau)) for i in range(65)],.002,gold,head)
    for i in range(7):
        a=i*math.tau/7
        ball('Beret rose petal',(-.116+math.cos(a)*.014,1.607+math.sin(a)*.014,.07),(.010,.008,.003),gold,head)
    ball('Beret rose center',(-.116,1.607,.078),(.009,.009,.005),gold,head)
    for offset in [-.007,.007]:
        tube('Cross hairpin',[(.085,1.517+offset,.104),(.107,1.535-offset,.078)],.0014,navy,head)
    # Elliptical tilted halo and individual laurel leaves.
    halo_points=[(.204*math.cos(i/100*math.tau),1.784+.043*math.cos(i/100*math.tau),-.025+.135*math.sin(i/100*math.tau)) for i in range(101)]
    tube('Laurel halo',halo_points,.0027,gold,head)
    for i in range(22):
        a=i/22*math.tau
        p=(.204*math.cos(a),1.784+.043*math.cos(a),-.025+.135*math.sin(a))
        lock('Halo laurel leaf',[p,(p[0]+math.cos(a)*.009,p[1]+.01,p[2]+math.sin(a)*.008),(p[0]+math.cos(a)*.017,p[1]+.013,p[2]+math.sin(a)*.016)],.003,gold,head,.001,8)

    # Continuous fitted blouse and pleated skirt, with cloth layers and trims.
    loft('Fitted ivory blouse',[(.974,.083,.062,0,0),(1.035,.092,.066,0,0),(1.12,.12,.078,0,0),
         (1.2,.13,.074,0,0),(1.253,.115,.067,0,-.008),(1.29,.052,.045,0,-.004)],white,body,48)
    loft('High collar',[(1.249,.053,.047,0,-.003),(1.30,.045,.039,0,-.003)],navy,body)
    for side in (-1,1):
        # Front cape panels leave the blouse and neck ribbon visible.
        cv,cf=[],[]
        for j in range(15):
            t=j/14;y=1.27-t*.24
            inner=.043+t*.037;outer=.137+t*.012
            for i in range(12):
                q=i/11;x=side*(inner*(1-q)+outer*q)
                z=.077*(1-q)+.026*q+.006*math.sin(t*math.pi)
                cv.append((x,y,z))
        for j in range(14):
            for i in range(11):
                a=j*12+i;cf.append((a,a+1,a+13,a+12))
        o=mesh('Tailored cape panel',cv,cf,navy,body)
        mod=o.modifiers.new('Fabric thickness','SOLIDIFY');mod.thickness=.005
        bpy.context.view_layer.objects.active=o;bpy.ops.object.modifier_apply(modifier=mod.name)
        tube('Cape hem piping',[(side*(.043+t*.037),1.27-t*.24,.079+.006*math.sin(t*math.pi)) for t in [i/24 for i in range(25)]],.0015,gold,body)
        tube('Cape bottom piping',[(side*(.08+i/20*.069),1.03,.079-i/20*.052) for i in range(21)],.0016,gold,body)
        lock('Neck ribbon bow',[(0,1.261,.069),(side*.037,1.272,.085),(side*.053,1.245,.086),(0,1.254,.077)],.017,navy,body,.006,22)
        lock('Bow long silk ribbon',[(side*.006,1.257,.078),(side*.016,1.209,.099),(side*.031,1.167,.092)],.012,navy,body,.003,24)
        lock('White collar ruffle',[(side*.037,1.238,.079),(side*.038,1.184,.091),(side*.026,1.114,.082)],.014,white,body,.004,30)
    ball('Ruby heart brooch',(0,1.255,.091),(.007,.010,.005),ruby,body)
    tube('Blouse button seam',[(0,y,.081) for y in [1.19,1.16,1.10,1.055]],.0008,lining,body)
    for y in [1.187,1.16,1.131,1.102,1.073]:
        ball('Pearl blouse button',(0,y,.084),(.003,.003,.003),white,body)
    loft('Waist belt',[(.986,.092,.066,0,.001),(1.003,.092,.066,0,.001)],navy,body)
    tube('Heart buckle',[(-.009,.993,.072),(-.012,1.001,.072),(-.006,1.005,.072),(0,1,.073),(.006,1.005,.072),(.012,1.001,.072),(.009,.993,.072),(0,.985,.073),(-.009,.993,.072)],.0015,gold,body)
    skirt_rings=[(.982,.09,.068,0,0),(.95,.117,.082,0,0),(.90,.156,.109,0,0),(.84,.199,.14,0,0),(.785,.224,.16,0,0)]
    loft('Ivory pleated skirt',skirt_rings,white,body,96,.047)
    loft('Navy ruffled underskirt',[(.80,.225,.163,0,0),(.766,.235,.174,0,0),(.758,.23,.17,0,0)],navy,body,96,.052)
    tube('Skirt double hem',[(.220*math.sin(i/96*math.tau)*(1+.047*math.cos(i/96*math.tau*12)),.797,.158*math.cos(i/96*math.tau)*(1+.047*math.cos(i/96*math.tau*12))) for i in range(97)],.0015,lining,body)
    for level in [0,1,2]:
        tube('Draped waist chain',[(.125*(i/28-.5)*2,1.008-.024*level-.020*math.sin(i/28*math.pi),.094+.019*level) for i in range(29)],.0012,gold,body)
    # Back cape silhouette, split from sleeves to support gestures.
    loft('Cropped cape back',[(1.032,.132,.037,0,-.079),(1.14,.151,.04,0,-.065),(1.246,.135,.052,0,-.046)],navy,body,32)
    for side,label in [(-1,'Left'),(1,'Right')]:
        arm=pivot('Sui_'+label+'Arm',(side*.139,1.245,0),body)
        fore=pivot('Sui_'+label+'Forearm',(side*.174,1.083,.007),arm)
        hand=pivot('Sui_'+label+'Hand',(side*.178,.948,.016),fore)
        loft('Soft puffed sleeve',[(1.247,.030,.044,side*.14,0),(1.22,.047,.057,side*.155,0),
             (1.17,.05,.054,side*.166,.002),(1.115,.036,.041,side*.174,.005),(1.08,.029,.033,side*.174,.007)],navy,arm,36)
        loft('Fitted sleeve',[(1.096,.03,.033,side*.174,.007),(1.045,.029,.032,side*.178,.01),(.978,.023,.027,side*.178,.014),(.952,.023,.027,side*.178,.016)],navy,fore)
        loft('Cuff lace',[(.965,.024,.028,side*.178,.016),(.944,.029,.031,side*.178,.016)],white,fore,36,.08)
        loft('Gloved palm',[(.945,.020,.017,side*.178,.016),(.918,.022,.019,side*.178,.021),(.897,.019,.016,side*.178,.027)],navy,hand,24)
        for i in range(4):
            x=side*.178+(i-1.5)*.011
            tube('Sculpted glove finger',sample([(x,.903,.024),(x,.883+(i%3)*.002,.031),(x,.874+(i%3)*.002,.042)],10),.0045,navy,hand)
        tube('Opposed glove thumb',sample([(side*.192,.921,.026),(side*.211,.911,.04),(side*.209,.899,.049)],12),.005,navy,hand)
        leg=pivot('Sui_'+label+'Leg',(side*.066,.84,0),root)
        shin=pivot('Sui_'+label+'Shin',(side*.066,.459,.006),leg)
        loft('Shaped thigh',[(.844,.054,.057,side*.065,0),(.764,.058,.060,side*.067,0),(.67,.055,.057,side*.069,.002),(.56,.042,.045,side*.068,.005),(.461,.031,.036,side*.066,.006)],skin,leg)
        loft('Ivory knee sock',[(.475,.032,.037,side*.066,.006),(.42,.034,.04,side*.066,.006),(.315,.039,.046,side*.066,-.002),(.19,.028,.033,side*.066,-.004),(.079,.022,.03,side*.066,.01)],white,shin)
        loft('Sock frilled top',[(.45,.034,.039,side*.066,.006),(.475,.038,.044,side*.066,.006),(.488,.034,.039,side*.066,.006)],white,shin,48,.12)
        ball('Shoe heel',(side*.066,.065,-.026),(.039,.05,.04),shoe,shin)
        ball('Round pointed shoe',(side*.066,.062,.055),(.045,.044,.085),shoe,shin,32)
        loft('Shoe sole',[(.017,.046,.086,side*.066,.04),(.033,.046,.086,side*.066,.04)],navy,shin,40)
        tube('Mary Jane strap',[(side*.066+math.cos(i/24*math.pi)*.041,.092+math.sin(i/24*math.pi)*.011,.059) for i in range(25)],.004,navy,shin)
        ball('Shoe gold buckle',(side*.09,.094,.061),(.006,.004,.006),gold,shin)
        for i in range(5):
            a=math.tau*i/5
            ball('Sock rosette',(side*.093+math.cos(a)*.009,.479+math.sin(a)*.009,.044),(.007,.006,.003),white,shin)
        lock('Sock bow',[(side*.099,.472,.045),(side*.113,.448,.044),(side*.10,.432,.043)],.009,navy,shin,.002,18)
        # Layered feather wings, matching the blue outfit reference.
        wing=pivot('Sui_'+label+'Wing',(side*.10,.985,-.09),body)
        for i in range(7):
            t=i/6
            lock('Layered angel feather',[(side*.11,.988,-.085),(side*(.22+t*.08),.969-t*.029,-.105),
                 (side*(.34+t*.045),.875-t*.035,-.10)],.015+(.004*(1-t)),white,wing,.006,24)
        tube('Wing leading edge',sample([(side*.11,.988,-.085),(side*.255,.982,-.11),(side*.35,.896,-.102)],28),.005,white,wing)

    # Join only static batches within a joint. Mouth morphs and eye pivots survive.
    groups=defaultdict(list)
    for o in list(bpy.context.scene.objects):
        if o.type=='MESH' and not o.data.shape_keys and 'Face /' not in o.name:
            groups[(o.parent,o.data.materials[0].name)].append(o)
    for (par,m),objects in groups.items():
        if len(objects)<2:
            continue
        bpy.ops.object.select_all(action='DESELECT')
        for o in objects:
            o.select_set(True)
        bpy.context.view_layer.objects.active=objects[0]
        bpy.ops.object.join()
        objects[0].name=(par.name if par else 'Sui')+' / '+m
    root['character_revision']=2
    root['face_revision']=3
    root['face_reference']='Bilibili BV1XAt666E6M ; 3D performance closeups at 10:08 and 10:16'
    root['reference']='public/images/materials/blue/岁己_20231216形象_双马尾有外套.webp'
    root['face']='soft painted cheeks; relaxed 0.076m eyes with clipped ruby irises; partial lower lid; Smile / Talk / Worry morphs'
    bpy.ops.object.camera_add(location=xyz((0,1.35,3.4)))
    camera=bpy.context.object
    camera.rotation_euler=(Vector(xyz((0,1.025,0)))-camera.location).to_track_quat('-Z','Y').to_euler()
    camera.data.lens=58
    bpy.context.scene.camera=camera
    for p,power,color,size in [((-.85,2.5,2),180,(1,.88,.81),2),((1.3,1.8,1),95,(.78,.86,1),2),((0,2,-1),210,(.84,.83,1),1.5)]:
        bpy.ops.object.light_add(type='AREA',location=xyz(p))
        o=bpy.context.object;o.data.energy=power;o.data.color=color;o.data.shape='DISK';o.data.size=size
        o.rotation_euler=(Vector(xyz((0,1.22,0)))-o.location).to_track_quat('-Z','Y').to_euler()
    scene=bpy.context.scene
    scene.world.color=(.10,.12,.17)
    scene.render.engine='BLENDER_EEVEE_NEXT'
    scene.render.resolution_x,scene.render.resolution_y=1100,1100
    scene.render.resolution_percentage=100
    scene.view_settings.view_transform='AgX'
    scene.view_settings.look='AgX - Medium High Contrast'
    bpy.context.preferences.filepaths.save_version=0
    bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE/'sui.blend'),compress=True)
    bpy.ops.export_scene.gltf(filepath=str(out/'sui.glb'),export_format='GLB',export_cameras=False,export_lights=False,
         export_animations=False,export_extras=True,export_yup=True,export_apply=True,export_morph=True)
    meshes=[o for o in scene.objects if o.type=='MESH']
    return {'file':'sui.glb','bytes':(out/'sui.glb').stat().st_size,'meshes':len(meshes),
            'triangles':sum(sum(len(p.vertices)-2 for p in o.data.polygons) for o in meshes),
            'materials':len({m.name for o in meshes for m in o.data.materials}),
            'source':'assets/after-hours/sui.blend','revision':2,'face_revision':3,'morphs':['Smile','Talk','Worry']}


if __name__=='__main__':
    parser=argparse.ArgumentParser()
    parser.add_argument('--output',required=True)
    args=parser.parse_args(sys.argv[sys.argv.index('--')+1:])
    report=build_character(args.output)
    manifest_file=Path(args.output)/'manifest.json'
    manifest=json.loads(manifest_file.read_text(encoding='utf-8-sig')) if manifest_file.exists() else {'units':'meters','runtime_up':'Y','assets':[]}
    manifest['assets']=[a for a in manifest['assets'] if a['file']!='sui.glb']+[report]
    manifest_file.write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding='utf-8')
    print('SUI_CHARACTER_V2='+json.dumps(report))
