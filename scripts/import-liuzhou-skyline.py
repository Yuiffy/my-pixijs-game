"""Import actual OSM river banks, hill footprints, and bridge axes for Liuzhou."""
from pathlib import Path
from urllib.request import urlopen
import json
import math
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
CACHE = ROOT / "tmp/liuzhou"
CACHE.mkdir(parents=True, exist_ok=True)
SOURCES = {
    "skyline-core.osm": "map?bbox=109.375,24.296,109.425,24.34",
    "skyline-north.osm": "map?bbox=109.375,24.338,109.495,24.39",
    "skyline-east.osm": "map?bbox=109.44,24.26,109.505,24.338",
    "skyline-river.osm": "relation/8382768/full",
    "skyline-riverbank.osm": "relation/7774579/full",
    "skyline-riverbank-east.osm": "relation/19894936/full",
}
nodes, ways, relations = {}, {}, {}
for filename, request in SOURCES.items():
    path = CACHE / filename
    if not path.exists():
        with urlopen(f"https://api.openstreetmap.org/api/0.6/{request}", timeout=60) as response:
            path.write_bytes(response.read())
    tree = ET.parse(path).getroot()
    nodes.update({n.attrib["id"]: n for n in tree.findall("node")})
    ways.update({w.attrib["id"]: w for w in tree.findall("way")})
    relations.update({r.attrib["id"]: r for r in tree.findall("relation")})


def tags(e):
    return {t.attrib["k"]: t.attrib["v"] for t in e.findall("tag")}


def point(id):
    p = nodes[id]
    return [round((float(p.attrib["lon"]) - 109.41225) * 101458, 2),
            round((24.31415 - float(p.attrib["lat"])) * 111320, 2)]


def points(w):
    return [point(n.attrib["ref"]) for n in w.findall("nd")]


def rings(relation, role):
    remaining = [[n.attrib["ref"] for n in ways[m.attrib["ref"]].findall("nd")]
                 for m in relation.findall("member") if m.attrib.get("role", "outer") == role]
    result = []
    while remaining:
        current = remaining.pop(0)
        while current[0] != current[-1]:
            found = False
            for i, candidate in enumerate(remaining):
                if candidate[0] == current[-1]:
                    current += candidate[1:]
                elif candidate[-1] == current[-1]:
                    current += candidate[-2::-1]
                else:
                    continue
                remaining.pop(i)
                found = True
                break
            if not found:
                raise ValueError(f"Unclosed river polygon {relation.attrib['id']}")
        result.append([point(n) for n in current[:-1]])
    return result


polygons = []
for id in ["7774579", "19894936"]:
    relation = relations[id]
    outers, holes = rings(relation, "outer"), rings(relation, "inner")
    for outer in outers:
        polygons.append({"id": id, "outer": outer, "holes": holes})
for id in ["148333481", "48990959", "67471139"]:
    if id in ways:
        polygons.append({"id": id, "outer": points(ways[id])[:-1], "holes": []})

bridge_styles = {
    "柳江大桥": "beam", "红光大桥": "suspension", "文昌桥": "beam",
    "壶东大桥": "beam", "壶西大桥": "beam", "广雅大桥": "arch",
    "双冲大桥": "beam", "三门江大桥": "beam", "河东大桥": "beam",
    "鹧鸪江大桥": "suspension", "白沙大桥": "cable", "凤凰岭大桥": "covered",
    "官塘大桥": "arch", "静兰大桥": "beam", "阳和大桥": "beam",
    "洛维大桥": "beam", "文惠桥": "arch",
}
bridges = []
for name, style in bridge_styles.items():
    matches = [w for w in ways.values() if tags(w).get("name") == name and tags(w).get("man_made") == "bridge"]
    if not matches:
        matches = [w for w in ways.values() if tags(w).get("name") == name and tags(w).get("bridge")]
    if not matches:
        continue
    # The actual bridge footprint, where present, avoids including approach viaducts.
    selected = max(matches, key=lambda w: max(math.dist(a, b) for a in points(w) for b in points(w)))
    pts = points(selected)
    cx = sum(p[0] for p in pts) / len(pts)
    cz = sum(p[1] for p in pts) / len(pts)
    xx = sum((p[0] - cx) ** 2 for p in pts)
    zz = sum((p[1] - cz) ** 2 for p in pts)
    xz = sum((p[0] - cx) * (p[1] - cz) for p in pts)
    angle = math.atan2(2 * xz, xx - zz) / 2
    dx, dz = math.cos(angle), math.sin(angle)
    along = [(p[0] - cx) * dx + (p[1] - cz) * dz for p in pts]
    across = [-(p[0] - cx) * dz + (p[1] - cz) * dx for p in pts]
    offset = (min(across) + max(across)) / 2
    a = [round(cx + min(along) * dx - offset * dz, 2), round(cz + min(along) * dz + offset * dx, 2)]
    b = [round(cx + max(along) * dx - offset * dz, 2), round(cz + max(along) * dz + offset * dx, 2)]
    bridges.append({"id": selected.attrib["id"], "name": name, "style": style, "a": a, "b": b,
                    "width": round(max(10, min(42, max(across) - min(across))), 1) if tags(selected).get("man_made") else 24})
rail = ways["42347053"]
rail_pts = points(rail)
bridges.append({"id": "42347053", "name": "柳州铁路桥", "style": "truss", "a": rail_pts[0], "b": rail_pts[-1], "width": 8})

hills = []
for id in ["205387375", "598802728"]:
    pts = points(ways[id])
    hills.append({"id": id, "name": tags(ways[id])["name"], "x": round((min(p[0] for p in pts) + max(p[0] for p in pts)) / 2, 2),
                  "z": round((min(p[1] for p in pts) + max(p[1] for p in pts)) / 2, 2), "footprint": pts})
for id in ["7498479190", "11079091086"]:
    p = point(id)
    hills.append({"id": id, "name": tags(nodes[id])["name"], "x": p[0], "z": p[1], "footprint": []})

river = [points(ways[m.attrib["ref"]]) for m in relations["8382768"].findall("member") if m.attrib["type"] == "way"]
# Context geometry is visual-only; mapped centres and footprints are retained.
context_roads = []
context_buildings = []
for w in ways.values():
    t = tags(w)
    pts = points(w)
    if not pts or any(abs(p[0]) > 12500 or abs(p[1]) > 14000 for p in pts):
        continue
    if t.get("highway") in ["primary", "secondary", "tertiary", "residential", "pedestrian"] and not t.get("bridge"):
        context_roads.append({"id": w.attrib["id"], "name": t.get("name", ""), "width": {"primary": 22, "secondary": 16, "tertiary": 12, "pedestrian": 6}.get(t["highway"], 7), "points": pts})
    if t.get("building"):
        cx = (min(p[0] for p in pts) + max(p[0] for p in pts)) / 2
        cz = (min(p[1] for p in pts) + max(p[1] for p in pts)) / 2
        width = max(p[0] for p in pts) - min(p[0] for p in pts)
        depth = max(p[1] for p in pts) - min(p[1] for p in pts)
        if width < 5 or depth < 5 or width > 160 or depth > 160:
            continue
        try:
            height = float(t.get("height", "").replace(" m", ""))
        except ValueError:
            try:
                height = float(t.get("building:levels", "")) * 3.2
            except ValueError:
                height = 18
        context_buildings.append({"id": w.attrib["id"], "x": round(cx, 2), "z": round(cz, 2), "w": round(width, 2), "d": round(depth, 2), "h": min(150, height)})

output = {"attribution": "© OpenStreetMap contributors", "license": "ODbL-1.0", "fetched": "2026-10-24",
          "origin": [109.41225, 24.31415], "units": "metres; x east, z south",
          "sources": [f"https://api.openstreetmap.org/api/0.6/{request}" for request in SOURCES.values()],
          "contextRoads": context_roads, "contextBuildings": context_buildings, "riverPolygons": polygons, "riverCenterlines": river, "bridges": bridges, "hills": hills}
for target in [ROOT / "src/components/liuzhou/skyline-map.json", ROOT / "public/games/liuzhou/skyline-map.json"]:
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(output, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
print(json.dumps({"polygons": len(polygons), "bridges": len(bridges), "hills": hills}, ensure_ascii=False))
