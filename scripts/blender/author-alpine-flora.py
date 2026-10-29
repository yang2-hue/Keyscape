"""Alpine flora for the Q key: a dry tussock, a prostrate juniper and a
wind-shaped pine.

The old vegetation was nine flat quads per clump and three stacked cones per
tree, which reads as origami next to a ribbed dome. These are built the way the
olive tree was: real blade geometry, individually placed leaves, no opaque
crown blobs.

Everything is authored with its base at the origin, Z up, in study units (the
same units the key and the observatory use). The app instances them with an
InstancedMesh and bends them with a wind shader that reads local Y, so keeping
the base at the origin is what makes the base stay planted while the tips move.

Usage:  blender -b -P scripts/blender/author-alpine-flora.py
"""
import bpy, math, random, os, json
from mathutils import Vector

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '../..'))
OUT = os.path.join(ROOT, 'outputs/art-q-flora')
DEST = os.path.join(ROOT, 'public/models/alpine-flora')
os.makedirs(OUT, exist_ok=True)
os.makedirs(DEST, exist_ok=True)

bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
random.seed(20261029)


def mat(name, color, rough=.88):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    m.use_backface_culling = False
    p = m.node_tree.nodes.get('Principled BSDF')
    p.inputs['Base Color'].default_value = (*color, 1)
    p.inputs['Roughness'].default_value = rough
    return m


# Linear values, not sRGB: the glTF exporter writes base colour straight through.
# Straw has to sit well above the soil (which is around 0.16 linear) or the dry
# grass disappears into the ground it stands on.
STRAW = [
    mat('QStrawPale', (.44, .35, .16)),
    mat('QStrawMid', (.31, .25, .115)),
    mat('QStrawDark', (.19, .16, .08)),
]
NEEDLE = [
    mat('QNeedleDark', (.030, .055, .030), .9),
    mat('QNeedleLight', (.048, .080, .042), .9),
]
JUNIPER = [
    mat('QJuniperGreen', (.055, .082, .042), .9),
    mat('QJuniperGrey', (.085, .095, .062), .9),
]
BARK = mat('QBark', (.048, .036, .024), .95)


def reset():
    return [], [], []


def add_poly(V, F, M, loop, shade):
    """Append a polygon given as a list of vertex indices already in V."""
    F.append(tuple(loop))
    M.append(shade)


def blade(V, F, M, base, direction, length, width, droop, shade, sections=4):
    """A tapered ribbon that rises steeply and arcs over at the tip.

    A flat quad per blade disappears when the camera lines up with its plane, so
    the section is a shallow V: three vertices across, centre raised. That keeps
    every blade visible from at least one side without paying for real volume.

    The first version sent every blade out along a horizontal vector and added
    height afterwards, which laid the whole clump flat and made it read as a sea
    urchin. Blades leave at their own elevation and only bend over as they run
    out, so the silhouette is a fountain, not a starburst.
    """
    d = Vector(direction)
    if d.length < 1e-5:
        d = Vector((1, 0, 0))
    d.normalize()
    flat = Vector((d.x, d.y, 0))
    if flat.length < 1e-4:
        flat = Vector((1, 0, 0))
    flat.normalize()
    side = Vector((-flat.y, flat.x, 0))
    start = len(V)
    for k in range(sections + 1):
        t = k / sections
        p = (Vector(base) + d * (length * t * (1 - .34 * t))
             + flat * (length * .60 * droop * t * t)
             + Vector((0, 0, -1)) * (length * .46 * droop * t * t))
        w = width * (1 - t) ** .75
        V.append(tuple(p - side * w))
        V.append(tuple(p + Vector((0, 0, w * .6))))
        V.append(tuple(p + side * w))
    for k in range(sections):
        a = start + k * 3
        b = a + 3
        add_poly(V, F, M, (a, b, b + 1, a + 1), shade)
        add_poly(V, F, M, (a + 1, b + 1, b + 2, a + 2), shade)


def needle(V, F, M, base, direction, length, width, shade):
    """A straight tapered blade for conifer foliage: two triangles, no droop."""
    d = Vector(direction).normalized()
    u = d.cross(Vector((0, 0, 1)))
    if u.length < 1e-4:
        u = d.cross(Vector((1, 0, 0)))
    u.normalize()
    start = len(V)
    b = Vector(base)
    V.append(tuple(b - u * width))
    V.append(tuple(b + u * width))
    V.append(tuple(b + d * length + Vector((0, 0, width * .3))))
    add_poly(V, F, M, (start, start + 1, start + 2), shade)


def tube(V, F, M, points, radius, shade, sides=6, taper=.9):
    """Tapered tube along a polyline; used for trunks and branches."""
    pts = [Vector(p) for p in points]
    start = len(V)
    for k, p in enumerate(pts):
        tangent = (pts[min(k + 1, len(pts) - 1)] - pts[max(0, k - 1)])
        if tangent.length < 1e-6:
            tangent = Vector((0, 0, 1))
        tangent.normalize()
        u = tangent.cross(Vector((0, 0, 1)))
        if u.length < 1e-4:
            u = tangent.cross(Vector((1, 0, 0)))
        u.normalize()
        v = tangent.cross(u)
        r = radius * (1 - taper * k / (len(pts) - 1))
        for j in range(sides):
            a = j * math.tau / sides
            V.append(tuple(p + (u * math.cos(a) + v * math.sin(a)) * r))
    for k in range(len(pts) - 1):
        for j in range(sides):
            a = start + k * sides + j
            b = start + k * sides + (j + 1) % sides
            add_poly(V, F, M, (a, b, b + sides, a + sides), shade)


# ---- tussock ----------------------------------------------------------
def tussock():
    V, F, M = reset()
    for _ in range(62):
        a = random.random() * math.tau
        # Two thirds of the blades crowd the crown, the rest splay out and
        # overbalance: a tussock is not a starburst.
        r = (random.random() ** 1.6) * .022
        base = (math.cos(a) * r, math.sin(a) * r, random.random() * .004)
        # Steep leaving angles with a long tail of flatter ones: the clump has a
        # crown of upright blades and a skirt that has already given up.
        el = math.radians(38 + (random.random() ** .6) * 52)
        L = .052 + random.random() ** .8 * .105
        w = .0021 + random.random() * .0015
        droop = .22 + random.random() * .70
        shade = [0, 0, 1, 1, 1, 2][int(random.random() * 6)]
        direction = (math.cos(a) * math.cos(el), math.sin(a) * math.cos(el), math.sin(el))
        blade(V, F, M, base, direction, L, w, droop, shade)
    # A few broken stems: the hillside is grazed and wind-battered.
    for _ in range(8):
        a = random.random() * math.tau
        base = (math.cos(a) * .018, math.sin(a) * .018, 0)
        el = math.radians(52 + random.random() * 30)
        blade(V, F, M, base, (math.cos(a) * math.cos(el), math.sin(a) * math.cos(el), math.sin(el)),
              .048 + random.random() * .03, .0015, 1.5, 2, sections=2)
    return 'Tussock', V, F, M, STRAW


# ---- juniper ----------------------------------------------------------
def juniper():
    V, F, M = reset()
    for s in range(5):
        a = s * 2.39996 + random.uniform(-.3, .3)
        reach = random.uniform(.055, .105)
        lift = random.uniform(.028, .062)
        tip = Vector((math.cos(a) * reach, math.sin(a) * reach, lift))
        stem = [(0, 0, 0),
                tuple(tip * .45 + Vector((0, 0, .012))),
                tuple(tip * .82 + Vector((0, 0, .008))),
                tuple(tip)]
        tube(V, F, M, stem, .0055, 0, sides=5, taper=.7)
        # Needle sprays at three points along the stem, densest at the tip.
        for k, t in enumerate((.55, .8, 1.0)):
            c = (Vector(stem[1]) * (1 - t) + Vector(stem[3]) * t)
            count = 16 + k * 10
            for _ in range(count):
                az = random.random() * math.tau
                el = random.uniform(-.25, 1.25)
                d = Vector((math.cos(az) * math.cos(el), math.sin(az) * math.cos(el), math.sin(el)))
                base = c + d * random.uniform(.002, .012)
                needle(V, F, M, tuple(base), tuple(d), random.uniform(.012, .026),
                       .0022, 0 if random.random() < .5 else 1)
    return 'Juniper', V, F, M, JUNIPER


# ---- pine -------------------------------------------------------------
def pine():
    """Wind-shaped: the trunk leans, the branches are longer on the lee side and
    every whorl sits a little off-centre."""
    V, F, M = reset()
    H = .40
    trunk = [(0, 0, 0), (.004, .006, .10), (.012, .004, .19), (.010, -.006, .27),
             (.018, -.004, .34), (.016, .002, H)]
    tube(V, F, M, trunk, .0125, 0, sides=6, taper=.86)
    for w in range(6):
        t = .18 + w * .135
        z = H * t
        lean = .012 * t / .4
        cx, cy = lean, .004 * math.sin(w * 1.7)
        arms = 4 if w < 4 else 3
        for a in range(arms):
            ang = w * 1.13 + a * math.tau / arms + random.uniform(-.2, .2)
            # Longer toward the south-east, shorter into the wind.
            reach = (.052 + random.random() * .042) * math.cos(ang - .6) * .5 + .048
            reach = max(.026, reach)
            drop = .012 + random.random() * .012
            tip = Vector((cx + math.cos(ang) * reach, cy + math.sin(ang) * reach, z + .012 - drop))
            mid = Vector((cx + math.cos(ang) * reach * .5, cy + math.sin(ang) * reach * .5, z + .004))
            tube(V, F, M, [(cx, cy, z), tuple(mid), tuple(tip)], .0055, 0, sides=5, taper=.75)
            # A foliage pad at the tip, plus a smaller one halfway out.
            for c, scale in ((tip, 1.0), (mid, .62)):
                for _ in range(int(34 * scale)):
                    az = random.random() * math.tau
                    el = random.uniform(-.45, .95)
                    d = Vector((math.cos(az) * math.cos(el), math.sin(az) * math.cos(el), math.sin(el)))
                    base = c + d * random.uniform(.002, .016)
                    needle(V, F, M, tuple(base), tuple(d), random.uniform(.014, .030),
                           .0026, 0 if random.random() < .55 else 1)
    # A crown tuft so the leader does not end in a bare point.
    for _ in range(26):
        az = random.random() * math.tau
        d = Vector((math.cos(az) * .7, math.sin(az) * .7, 1.0)).normalized()
        needle(V, F, M, (.016, .002, H - .006), tuple(d), random.uniform(.014, .026), .0024,
               0 if random.random() < .5 else 1)
    return 'Pine', V, F, M, NEEDLE + [BARK]


def build(name, V, F, M, materials):
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(V, [], F)
    mesh.update()
    for m in materials:
        mesh.materials.append(m)
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    for poly, index in zip(obj.data.polygons, M):
        poly.material_index = index
        poly.use_smooth = True
    return obj


report = {'blender': bpy.app.version_string, 'objects': {}}
for builder in (tussock, juniper, pine):
    name, V, F, M, materials = builder()
    obj = build(name, V, F, M, materials)
    report['objects'][name] = {
        'triangles': sum(poly.loop_total - 2 for poly in obj.data.polygons),
        'vertices': len(obj.data.vertices),
        'height': max(v[2] for v in V),
    }

bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT, 'alpine-flora.blend'))
bpy.ops.export_scene.gltf(filepath=os.path.join(DEST, 'alpine-flora.glb'),
                          export_format='GLB', export_yup=True)
with open(os.path.join(OUT, 'flora-report.json'), 'w') as f:
    json.dump(report, f, indent=2)
print(json.dumps(report, indent=2))
