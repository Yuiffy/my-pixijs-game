"""Author the original apartment and articulated Sui model in Blender 4.5 LTS.
Run: blender -b --python this.py -- --output public/games/after-hours
All geometry and packed textures are made locally. Source .blend files are kept.
"""
import argparse
from collections import defaultdict
import json
import math
from pathlib import Path
import random
import sys

import bpy
from mathutils import Vector

parser = argparse.ArgumentParser()
parser.add_argument("--output", required=True)
args = parser.parse_args(sys.argv[sys.argv.index("--") + 1:])
OUT = Path(args.output).resolve()
ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / "assets/after-hours"
OUT.mkdir(parents=True, exist_ok=True)
SOURCE.mkdir(parents=True, exist_ok=True)
random.seed(2413)


def xyz(x, y, z):
    return (x, -z, y)


def reset():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for material in list(bpy.data.materials):
        bpy.data.materials.remove(material)


def material(name, color, roughness=.75, metallic=0, emission=0):
    mat = bpy.data.materials.new(name)
    mat.diffuse_color = (*color, 1)
    mat.use_nodes = True
    shader = mat.node_tree.nodes.get("Principled BSDF")
    shader.inputs["Base Color"].default_value = (*color, 1)
    shader.inputs["Roughness"].default_value = roughness
    shader.inputs["Metallic"].default_value = metallic
    if emission:
        shader.inputs["Emission Color"].default_value = (*color, 1)
        shader.inputs["Emission Strength"].default_value = emission
    return mat


def texture(mat, name, size, painter):
    img = bpy.data.images.new(name, width=size, height=size, alpha=False)
    pixels = []
    for v in range(size):
        for u in range(size):
            pixels.extend((*painter(u / size, v / size), 1))
    img.pixels.foreach_set(pixels)
    img.pack()
    node = mat.node_tree.nodes.new("ShaderNodeTexImage")
    node.image = img
    mat.node_tree.links.new(node.outputs["Color"], mat.node_tree.nodes.get("Principled BSDF").inputs["Base Color"])


def finish(obj, name, mat, bevel=0):
    obj.name = name
    obj.data.materials.append(mat)
    if bevel:
        modifier = obj.modifiers.new("Crafted edges", "BEVEL")
        modifier.width = bevel
        modifier.segments = 3
        bpy.context.view_layer.objects.active = obj
        bpy.ops.object.modifier_apply(modifier=modifier.name)
        for face in obj.data.polygons:
            face.use_smooth = True
        normal = obj.modifiers.new("Weighted corners", "WEIGHTED_NORMAL")
        bpy.ops.object.modifier_apply(modifier=normal.name)
    return obj


def box(name, p, size, mat, bevel=.025):
    bpy.ops.mesh.primitive_cube_add(size=1, location=xyz(*p))
    obj = bpy.context.object
    obj.scale = (size[0], size[2], size[1])
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    return finish(obj, name, mat, min(bevel, min(size) * .3))


def ellipsoid(name, p, size, mat):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=24, ring_count=16, location=xyz(*p))
    obj = bpy.context.object
    obj.scale = (size[0], size[2], size[1])
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    for face in obj.data.polygons:
        face.use_smooth = True
    return finish(obj, name, mat)


def cylinder(name, p, radius, height, mat, vertices=24):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=height, location=xyz(*p))
    return finish(bpy.context.object, name, mat, .012)


def curve(name, points, radius, mat):
    data = bpy.data.curves.new(name, "CURVE")
    data.dimensions = "3D"
    data.resolution_u = 2
    data.bevel_depth = radius
    data.bevel_resolution = 3
    spline = data.splines.new("POLY")
    spline.points.add(len(points) - 1)
    for point, p in zip(spline.points, points):
        point.co = (*xyz(*p), 1)
    obj = bpy.data.objects.new(name, data)
    bpy.context.collection.objects.link(obj)
    obj.data.materials.append(mat)
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.convert(target="MESH")
    obj.select_set(False)
    return obj


def torus(name, p, radius, thickness, mat, tilt=0):
    bpy.ops.mesh.primitive_torus_add(major_segments=48, minor_segments=8, location=xyz(*p), major_radius=radius, minor_radius=thickness)
    obj = finish(bpy.context.object, name, mat)
    obj.rotation_euler.x = tilt
    return obj


def text(name, value, p, size, mat, rotation=(math.pi / 2, 0, 0)):
    data = bpy.data.curves.new(name, "FONT")
    data.body = value
    data.size = size
    data.align_x = "CENTER"
    data.extrude = .001
    obj = bpy.data.objects.new(name, data)
    bpy.context.collection.objects.link(obj)
    obj.location = xyz(*p)
    obj.rotation_euler = rotation
    obj.data.materials.append(mat)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.ops.object.convert(target="MESH")
    obj.select_set(False)
    return obj


def parent(obj, pivot):
    world = obj.matrix_world.copy()
    obj.parent = pivot
    obj.matrix_world = world


def pivot(name, p):
    obj = bpy.data.objects.new(name, None)
    obj.location = xyz(*p)
    bpy.context.collection.objects.link(obj)
    bpy.context.view_layer.update()
    return obj


def join_batches():
    groups = defaultdict(list)
    for obj in list(bpy.context.scene.objects):
        if obj.type == "MESH":
            groups[(obj.parent, obj.data.materials[0].name)].append(obj)
    for (par, mat), objects in groups.items():
        if len(objects) < 2:
            continue
        bpy.ops.object.select_all(action="DESELECT")
        for obj in objects:
            obj.select_set(True)
        bpy.context.view_layer.objects.active = objects[0]
        bpy.ops.object.join()
        objects[0].name = (par.name if par else "Apartment") + "_" + mat
        objects[0].select_set(False)


def export(name, camera_at, look_at):
    join_batches()
    bpy.ops.object.camera_add(location=xyz(*camera_at))
    camera = bpy.context.object
    camera.name = "AuthoringCamera"
    camera.rotation_euler = (Vector(xyz(*look_at)) - camera.location).to_track_quat("-Z", "Y").to_euler()
    camera.data.lens = 33
    bpy.context.scene.camera = camera
    bpy.context.scene.world.color = (.23, .23, .23)
    for index, (p, energy, color, size) in enumerate([((0, 3.4, 0), 600, (1, .78, .6), 6), ((-5, 2.6, -4), 350, (.54, .69, 1), 5)]):
        bpy.ops.object.light_add(type="AREA", location=xyz(*p))
        light = bpy.context.object
        light.name = "AuthoringLight" + str(index)
        light.data.energy, light.data.color, light.data.shape, light.data.size = energy, color, "DISK", size
        light.rotation_euler = (Vector((0, 0, 0)) - light.location).to_track_quat("-Z", "Y").to_euler()
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE_NEXT"
    scene.render.resolution_x, scene.render.resolution_y = 1280, 800
    scene.render.resolution_percentage = 100
    bpy.context.preferences.filepaths.save_version = 0
    bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE / (name + ".blend")), compress=True)
    bpy.ops.export_scene.gltf(filepath=str(OUT / (name + ".glb")), export_format="GLB", export_cameras=False, export_lights=False, export_animations=False, export_extras=True, export_yup=True, export_apply=True)
    meshes = [o for o in scene.objects if o.type == "MESH"]
    return {"file": name + ".glb", "bytes": (OUT / (name + ".glb")).stat().st_size, "meshes": len(meshes), "triangles": sum(sum(len(p.vertices) - 2 for p in o.data.polygons) for o in meshes), "materials": len({m.name for o in meshes for m in o.data.materials}), "source": (SOURCE / (name + ".blend")).relative_to(ROOT).as_posix()}


reset()
wood = material("Oak", (.43, .25, .12))
texture(wood, "Oak grain 512", 512, lambda u, v: tuple(max(.05, min(.9, c + .012 * math.sin(u * 320 + math.sin(v * 14) * 3) + random.uniform(-.006, .006))) for c in (.39, .25, .15)))
plaster = material("Warm plaster", (.75, .69, .61))
texture(plaster, "Plaster 256", 256, lambda u, v: tuple(c + random.uniform(-.025, .025) for c in (.76, .71, .64)))
cream = material("Cream lacquer", (.81, .76, .65), .55)
dark = material("Graphite", (.028, .035, .049), .48)
fabric = material("Dusty sage fabric", (.23, .34, .31))
texture(fabric, "Woven fabric 256", 256, lambda u, v: tuple(c + (.018 if int(u * 240) % 2 == int(v * 240) % 2 else -.018) for c in (.25, .37, .34)))
violet = material("Lavender", (.42, .31, .57))
brass = material("Brushed brass", (.57, .39, .16), .32, .65)
glass = material("Night window", (.025, .074, .11), .18, .5)
light = material("Warm bulb", (1, .65, .29), .3, emission=2.5)
blue = material("Monitor cyan", (.12, .51, .57), .3, emission=.65)
paper = material("Paper", (.83, .79, .68))
red = material("Wine", (.35, .065, .08))
leaves = material("Leaves", (.12, .25, .18))

# A real furnished three-room apartment and a traversable exit corridor.
for x in range(28):
    for z in range(8):
        box("Floor plank", (-6.75 + x * .5, -.055, -5.25 + z * 1.5), (.494, .11, 1.485), wood, .004)
box("Ceiling", (0, 3.03, 0), (14.4, .15, 12.3), cream)
for p, size in [((0, 1.5, -6), (14.3, 3, .18)), ((-7, 1.5, 0), (.18, 3, 12.2)), ((7, 1.5, 0), (.18, 3, 12.2)), ((-5.55, 1.5, 6), (2.9, 3, .18)), ((2.45, 1.5, 6), (9.1, 3, .18)), ((-3, 2.65, 6), (2.2, .7, .18))]:
    box("Exterior plaster", p, size, plaster)
for p, size in [((1, 1.5, -4.8), (.14, 3, 2.4)), ((1, 1.5, -.2), (.14, 3, 1.6)), ((1, 1.5, 1.45), (.14, 3, 1.1)), ((1, 1.5, 4.8), (.14, 3, 2.4)), ((1, 2.65, -2.3), (.14, .7, 2.6)), ((1, 2.65, 2.8), (.14, .7, 1.6)), ((4, 1.5, 0), (6, 3, .15))]:
    box("Room partition", p, size, plaster)
for p, size in [((0, .11, -5.88), (14, .22, .09)), ((-6.88, .11, 0), (.09, .22, 12)), ((6.88, .11, 0), (.09, .22, 12)), ((1.1, .11, -4.8), (.1, .22, 2.4)), ((1.1, .11, 4.8), (.1, .22, 2.4))]:
    box("Skirting", p, size, wood, .008)

# Tall rainy window, frame, curtains and sill.
box("Living rainy glass", (-6.88, 1.65, -1.5), (.04, 1.9, 3.2), glass, 0)
for z in (-3.18, -1.5, .18):
    box("Window mullion", (-6.79, 1.65, z), (.09, 2.05, .07), brass)
for y in (.65, 1.65, 2.65):
    box("Window frame", (-6.79, y, -1.5), (.1, .07, 3.4), brass)
box("Sill", (-6.65, .64, -1.5), (.55, .08, 3.55), cream)
for z in (-3.5, .5):
    for i in range(7):
        cylinder("Curtain fold", (-6.58 + math.sin(i) * .07, 1.55, z + i * .07), .065, 2.4, violet, 12)

# Sofa and living room.
box("Rug", (-3.35, .015, -.1), (3.5, .024, 3.3), fabric, .008)
for p, size in [((-5.5, .36, -.6), (1.15, .35, 3.2)), ((-5.95, .78, -.6), (.3, .85, 3.2)), ((-5.5, .6, -2.2), (1.2, .7, .24)), ((-5.5, .6, 1), (1.2, .7, .24))]:
    box("Sofa", p, size, fabric, .12)
for z in (-1.7, -.65, .4):
    box("Sofa cushion", (-5.4, .56, z), (.84, .18, .94), fabric, .07)
for z in (-1.55, .45):
    pillow = box("Lavender pillow", (-5.65, .86, z), (.25, .43, .43), violet, .085)
    pillow.rotation_euler.y = .2
box("Coffee tabletop", (-3.5, .52, -.6), (1.55, .08, 1.05), wood, .06)
for x in (-4.1, -2.9):
    for z in (-1, -.2):
        cylinder("Table leg", (x, .25, z), .045, .5, brass)
box("Notebook", (-3.6, .59, -.65), (.3, .035, .4), paper)
text("Notebook title", "00:00", (-3.6, .611, -.65), .09, red, (0, 0, 0))
cylinder("Cup", (-3.15, .66, -.8), .065, .17, cream)
torus("Cup lip", (-3.15, .75, -.8), .057, .009, brass)

# Kitchen along the back wall.
for x in (-5.6, -4.4, -3.2, -2):
    box("Kitchen base", (x, .46, -5.45), (1.16, .9, .9), cream)
    box("Cabinet door", (x, .48, -4.98), (1.09, .76, .035), wood)
    box("Drawer handle", (x, .72, -4.93), (.3, .035, .04), brass)
    box("Upper cabinet", (x, 2.2, -5.62), (1.16, .85, .55), cream)
    box("Upper handle", (x, 2.04, -5.31), (.3, .035, .035), brass)
box("Counter", (-3.8, .94, -5.4), (4.9, .08, 1), dark)
box("Sink", (-4.55, .988, -5.3), (.75, .035, .5), brass)
curve("Faucet", [(-4.6, 1, -5.52), (-4.6, 1.3, -5.52), (-4.6, 1.35, -5.35), (-4.6, 1.22, -5.32)], .018, brass)
cylinder("Kettle", (-2.3, 1.12, -5.32), .12, .29, cream)
curve("Kettle handle", [(-2.46, 1.02, -5.3), (-2.55, 1.07, -5.3), (-2.55, 1.27, -5.3), (-2.46, 1.3, -5.3)], .02, dark)
box("Fridge", (-.4, .95, -5.45), (1, 1.9, .9), cream, .07)
box("Fridge handle", (-.12, 1.25, -4.96), (.04, .45, .05), brass)
box("Reminder", (-.58, 1.3, -4.982), (.28, .33, .015), paper)
text("Reminder print", "DON'T\nREPLY", (-.58, 1.36, -4.96), .056, red)

# Bookshelf and entry keepsakes.
for y in (.2, .8, 1.4, 2):
    box("Shelf", (-5.6, y, 4.8), (2.2, .07, .4), wood)
for x in (-6.65, -4.55):
    box("Shelf side", (x, 1.1, 4.8), (.07, 2.2, .4), wood)
for row in range(3):
    for i in range(12):
        box("Book", (-6.4 + i * .13, .48 + row * .6, 4.83), (.08 + random.random() * .04, .3 + random.random() * .13, .23), [paper, red, fabric, violet][i % 4], .007)
box("Entry chest", (-.6, .46, 4.8), (1.4, .9, .55), wood)
box("Fuse box", (-6.86, 1.45, 3.3), (.18, .57, .43), dark)
box("Fuse label", (-6.75, 1.5, 3.3), (.025, .36, .3), paper)

# Studio: desk, streaming monitor, mic, shelf, neon and chair.
box("Studio carpet", (4, .01, -2.5), (4.8, .02, 3.5), violet, .01)
box("Streaming desk", (4.4, .8, -4.7), (3.6, .09, .85), wood)
for x in (2.8, 6):
    box("Desk leg", (x, .4, -4.7), (.12, .8, .65), dark)
box("Monitor back", (4.5, 1.32, -4.82), (1.48, .83, .09), dark)
box("Monitor emissive", (4.5, 1.32, -4.757), (1.35, .72, .013), blue, .01)
text("Monitor text", "SUI // LIVE\n00 : 00 : 00", (4.5, 1.42, -4.735), .13, paper)
box("Monitor stand", (4.5, 1, -4.85), (.09, .35, .1), dark)
box("Keyboard", (4.45, .87, -4.44), (.68, .035, .22), dark)
for i in range(10):
    box("Key", (4.18 + i * .06, .897, -4.42), (.043, .015, .13), cream, .002)
box("Tower", (5.95, 1.1, -4.72), (.4, .5, .5), dark)
for y in (1, 1.18):
    fan = torus("PC ring", (5.95, y, -4.44), .075, .013, violet)
    fan.rotation_euler.x = math.pi / 2
curve("Mic boom", [(3.12, .88, -4.6), (3.12, 1.38, -4.6), (3.58, 1.56, -4.2), (3.78, 1.43, -4.17)], .022, dark)
cylinder("Microphone", (3.8, 1.38, -4.17), .05, .17, brass)
box("Chair cushion", (4.5, .5, -3.55), (.6, .12, .58), dark, .07)
box("Chair back", (4.5, .98, -3.82), (.63, .95, .15), violet, .08)
cylinder("Chair pedestal", (4.5, .24, -3.55), .055, .45, dark)
for i in range(5):
    a = i * math.tau / 5
    curve("Chair foot", [(4.5, .1, -3.55), (4.5 + math.cos(a) * .35, .08, -3.55 + math.sin(a) * .35)], .025, dark)
box("Studio wall panel", (4.4, 1.75, -5.84), (4.4, 1.7, .04), dark)
for i in range(14):
    box("Acoustic slat", (2.4 + i * .29, 1.8, -5.78), (.075, 1.75, .05), wood)
text("Studio wall branding", "S U I", (4.4, 2.16, -5.7), .36, light)

# Bedroom: double bed, linen, keepsakes and a standing mirror.
box("Bed frame", (4.6, .27, 3.8), (2.9, .5, 3.3), wood)
box("Mattress", (4.6, .58, 3.8), (2.85, .28, 3.2), cream, .11)
box("Bed cover", (4.6, .74, 3.5), (2.87, .07, 2.5), fabric, .025)
box("Headboard", (4.6, .83, 5.5), (3, 1.1, .14), wood)
for x in (3.9, 5.3):
    box("Bed pillow", (x, .84, 4.95), (.99, .18, .6), cream, .095)
box("Bedside", (2.45, .34, 4.8), (.7, .68, .65), wood)
box("Cassette", (2.32, .72, 4.60), (.3, .06, .18), dark)
box("Mirror frame", (6.82, 1.3, 1.6), (.09, 2.35, .96), brass)
box("Mirror surface", (6.75, 1.3, 1.6), (.02, 2.2, .8), glass)
text("Bedroom whisper", "REMEMBER YOUR NAME", (4.5, 2.2, 5.86), .095, paper, (math.pi / 2, 0, math.pi))

# Repetition corridor: framed doors, inset panels, practical fixtures.
box("Hall floor", (-3, -.055, 12), (2.2, .11, 12), wood)
box("Hall ceiling", (-3, 2.98, 12), (2.45, .12, 12), cream)
for x in (-4.2, -1.8):
    box("Hall wall", (x, 1.5, 12), (.18, 3, 12), plaster)
    box("Hall dado", (x + (.11 if x < -3 else -.11), .5, 12), (.06, .95, 12), dark)
for z in (8.1, 11.7, 15.3):
    for x in (-4.09, -1.91):
        box("Hall frame", (x, 1.35, z), (.07, 1.6, .72), brass)
        box("Hall door", (x + (.04 if x < -3 else -.04), 1.35, z), (.035, 1.49, .62), wood)
    box("Hall lamp mount", (-3, 2.87, z), (.4, .05, .4), brass)
    box("Hall lamp diffuser", (-3, 2.81, z), (.33, .06, .33), light)
box("Exit surround", (-3, 1.5, 18), (2.42, 3, .15), dark)
box("Exit panel", (-3, 1.22, 17.89), (1.6, 2.4, .07), blue)
text("Exit text", "ON AIR", (-3, 2.55, 17.79), .19, light, (math.pi / 2, 0, math.pi))

# Lamps, picture frames and small lived-in details.
cylinder("Floor lamp base", (-4.3, .08, 1.7), .16, .08, brass)
cylinder("Floor lamp stem", (-4.3, .65, 1.7), .023, 1.1, brass)
cylinder("Floor lamp shade", (-4.3, 1.28, 1.7), .23, .33, cream)
ellipsoid("Floor lamp bulb", (-4.3, 1.18, 1.7), (.08, .08, .08), light)
cylinder("Bedside lamp base", (2.59, .715, 4.94), .11, .07, brass)
cylinder("Bedside lamp stem", (2.59, .96, 4.94), .018, .45, brass)
cylinder("Bedside lamp shade", (2.59, 1.23, 4.94), .17, .26, cream)
ellipsoid("Bedside lamp bulb", (2.59, 1.16, 4.94), (.065, .065, .065), light)
for x, y in [(-5.8, 1.9), (-4.9, 1.55), (-.8, 2.1)]:
    box("Picture frame", (x, y, 5.83), (.65, .85, .06), brass)
    box("Picture print", (x, y, 5.78), (.55, .75, .02), violet)
    text("Picture word", "STAY", (x, y + .1, 5.75), .09, paper, (math.pi / 2, 0, math.pi))
for x, z in [(-6, 2), (6.3, -1.3)]:
    cylinder("Plant pot", (x, .2, z), .19, .4, cream)
    for i in range(8):
        a = i * math.tau / 8
        stem = [(x, .3, z), (x + math.sin(a) * .2, .65, z + math.cos(a) * .2), (x + math.sin(a) * .34, .9, z + math.cos(a) * .34)]
        curve("Plant stem", stem, .011, leaves)
        leaf = ellipsoid("Leaf", stem[-1], (.1, .23, .025), leaves)
        leaf.rotation_euler = (.4, a, 0)

reports = [export("apartment", (-.8, 1.6, 3.8), (-4.5, 1.2, -1.5))]

# Use the current character authoring pipeline for every full rebuild.
sys.path.insert(0, str(Path(__file__).resolve().parent))
from build_sui_v2 import build_character
reports.append(build_character(OUT))
(OUT / "manifest.json").write_text(json.dumps({"author": "Blender 4.5 LTS / original local bpy authoring", "units": "meters", "runtime_up": "Y", "assets": reports}, indent=2), encoding="utf-8")
print("ASSET_REPORT=" + json.dumps(reports))
