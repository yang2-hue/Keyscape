"""Observatory parts for the Q key: ribbed dome halves, an equatorial fork
telescope and a small duty room.

The dome halves are authored with their **base ring on z=0 and the axis at the
origin**, because the browser slides them along the slit. The telescope is two
objects: the fork sits on the drum floor, the tube is authored around its own
altitude axis so the browser can rotate it without a second pivot.

Blender Z up / front -Y exports to glTF Y up / front +Z.

Usage:  blender -b -P scripts/blender/author-observatory.py
"""
import bpy, math, os, json
import numpy as np

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '../..'))
OUT = os.path.join(ROOT, 'outputs/art-observatory')
DEST = os.path.join(ROOT, 'public/models/observatory')
os.makedirs(OUT, exist_ok=True)
os.makedirs(DEST, exist_ok=True)

bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)

R = 0.92
SPRING = 0.0  # dome local base


def material(name, color, rough=.9, metal=0.0, emit=None, emit_strength=0.0):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    p = m.node_tree.nodes.get('Principled BSDF')
    p.inputs['Base Color'].default_value = (*color, 1)
    p.inputs['Roughness'].default_value = rough
    p.inputs['Metallic'].default_value = metal
    if emit:
        p.inputs['Emission Color'].default_value = (*emit, 1)
        p.inputs['Emission Strength'].default_value = emit_strength
    return m


def raster(mat, label, rgb, color=False):
    n = rgb.shape[0]
    im = bpy.data.images.new(mat.name + ' ' + label, width=n, height=n)
    im.colorspace_settings.name = 'Linear Rec.709' if color else 'Non-Color'
    rgba = np.ones((n, n, 4), dtype=np.float32)
    rgba[:, :, :3] = rgb
    im.pixels.foreach_set(rgba.ravel())
    im.pack()
    node = mat.node_tree.nodes.new('ShaderNodeTexImage')
    node.image = im
    node.label = label
    return node


def noisy(shape, rng, octaves=4):
    out = np.zeros(shape, dtype=np.float32)
    amp, total = 1.0, 0.0
    for o in range(octaves):
        n = 4 * 2 ** o
        grid = rng.random((n, n)).astype(np.float32)
        axis = np.linspace(0, n - 1, shape[0])
        rows = np.array([np.interp(axis, np.arange(n), row) for row in grid])
        field = np.array([np.interp(axis, np.arange(n), col) for col in rows.T]).T
        out += field * amp
        total += amp
        amp *= .5
    return out / total


def textured_plaster(mat, base, rng):
    """Aged stucco: strong grain, grime that gathers at the bottom, and vertical
    rust/water streaks running down from the copper and the eaves. The streaks
    are what read as 'abandoned', not just 'off-white'."""
    n = 512
    y, x = np.mgrid[0:n, 0:n] / (n - 1)
    broad = noisy((n, n), rng, 3)
    grain = noisy((n, n), rng, 6)
    # Grime: darker toward the ground, patchy like soot and moss.
    grime = np.clip((1.0 - y) * 1.4 + (broad - .5) * .8, 0, 1)
    # Vertical streaks: a few channels where rain has run rust and dust down.
    streaks = np.zeros((n, n), dtype=np.float32)
    for _ in range(7):
        sx = rng.random()
        width = .004 + rng.random() * .014
        falloff = rng.random() * .6 + .3
        col = np.exp(-((x - sx) ** 2) / (2 * width ** 2))
        col *= np.clip(1.0 - y * falloff, 0, 1)
        streaks += col * (.4 + rng.random() * .8)
    streaks = np.clip(streaks, 0, 1)
    # Compose albedo: base plaster, darkened by grime, tinted by rust streaks.
    alb = np.array(base)[None, None, :] * (1 + (broad[:, :, None] - .5) * .22)
    alb *= (1 - grime[:, :, None] * .30)
    rust = np.array([.55, .30, .16])[None, None, :]
    alb = alb * (1 - streaks[:, :, None] * .55) + rust * (streaks[:, :, None] * .55)
    alb = np.clip(alb, 0, 1)
    al = raster(mat, 'plaster albedo', alb, True)
    p = mat.node_tree.nodes['Principled BSDF']
    mat.node_tree.links.new(al.outputs['Color'], p.inputs['Base Color'])
    rough = np.repeat(np.clip(.82 + (grain - .5) * .24 + streaks * .1, 0, 1)[:, :, None], 3, axis=2)
    ro = raster(mat, 'plaster roughness', rough)
    mat.node_tree.links.new(ro.outputs['Color'], p.inputs['Roughness'])
    gy, gx = np.gradient(broad * .7 + grain * .3)
    norm = np.dstack((-gx * 34, -gy * 34, np.ones_like(gx)))
    norm /= np.linalg.norm(norm, axis=2, keepdims=True)
    no = raster(mat, 'plaster normal', norm * .5 + .5)
    nm = mat.node_tree.nodes.new('ShaderNodeNormalMap')
    nm.inputs['Strength'].default_value = .8
    mat.node_tree.links.new(no.outputs['Color'], nm.inputs['Color'])
    mat.node_tree.links.new(nm.outputs['Normal'], p.inputs['Normal'])


rng = np.random.default_rng(20261029)
plaster = material('QPlaster', (0.86, 0.83, 0.76), .9)
textured_plaster(plaster, (0.86, 0.83, 0.76), rng)
plaster_dark = material('QPlasterShade', (0.52, 0.49, 0.43), .92)
copper = material('QCopper', (0.42, 0.24, 0.13), .45, .85)
iron = material('QIron', (0.055, 0.058, 0.06), .62, .55)
brass = material('QBrass', (0.52, 0.36, 0.14), .34, .9)
glass = material('QGlass', (0.03, 0.05, 0.075), .12, .2)
slate = material('QSlate', (0.11, 0.12, 0.13), .78, .06)
wood = material('QWood', (0.26, 0.16, 0.09), .72)
glow = material('QDutyGlow', (0.24, 0.14, 0.06), .6, emit=(1.0, .55, .22), emit_strength=1.2)


def select_only(obj):
    bpy.ops.object.select_all(action='DESELECT')
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj


def cube(name, loc, size, mat, bevel=.0, rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc, rotation=rot)
    obj = bpy.context.object
    obj.name = name
    obj.scale = size
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.data.materials.append(mat)
    if bevel > 0:
        mod = obj.modifiers.new('bevel', 'BEVEL')
        mod.width = bevel
        mod.segments = 2
        mod.limit_method = 'ANGLE'
        bpy.context.view_layer.objects.active = obj
        bpy.ops.object.modifier_apply(modifier=mod.name)
    return obj


def rib_segment(name, center, tangent, normal, size, mat):
    """A thin box on the dome surface: its long axis follows `tangent`, its
    thin axis points along the surface `normal`. The scale is folded into the
    world matrix so no separate local scale survives to confuse the export."""
    import mathutils
    t = mathutils.Vector(tangent).normalized()
    n = mathutils.Vector(normal).normalized()
    b = t.cross(n).normalized()
    rot = mathutils.Matrix.Identity(3)
    rot.col[0] = t
    rot.col[1] = n
    rot.col[2] = b
    scale = mathutils.Matrix.Diagonal((size[0], size[1], size[2], 1.0))
    world = mathutils.Matrix.Translation(center) @ rot.to_4x4() @ scale
    bpy.ops.mesh.primitive_cube_add(size=1, location=(0, 0, 0))
    obj = bpy.context.object
    obj.name = name
    obj.matrix_world = world
    obj.data.materials.append(mat)
    return obj


def cylinder(name, loc, radius, depth, mat, verts=28, rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_cylinder_add(radius=radius, depth=depth, vertices=verts, location=loc, rotation=rot)
    obj = bpy.context.object
    obj.name = name
    obj.data.materials.append(mat)
    return obj


def sphere(name, loc, radius, mat, segments=24, rings=16):
    bpy.ops.mesh.primitive_uv_sphere_add(radius=radius, segments=segments, ring_count=rings, location=loc)
    obj = bpy.context.object
    obj.name = name
    obj.data.materials.append(mat)
    return obj


def join(name, parts):
    bpy.ops.object.select_all(action='DESELECT')
    for part in parts:
        part.select_set(True)
    bpy.context.view_layer.objects.active = parts[0]
    bpy.ops.object.join()
    obj = bpy.context.object
    obj.name = name
    bpy.context.scene.cursor.location = (0, 0, 0)
    bpy.ops.object.origin_set(type='ORIGIN_CURSOR')
    obj.location = (0, 0, 0)
    return obj


def smooth(obj, angle=36):
    select_only(obj)
    try:
        bpy.ops.object.shade_smooth_by_angle(angle=math.radians(angle))
    except Exception:
        bpy.ops.object.shade_smooth()


# ---- dome halves -------------------------------------------------------
def dome_half(side):
    """side = +1 is the east half (x >= 0). Radius R, base on z=0."""
    bpy.ops.mesh.primitive_uv_sphere_add(radius=R, segments=64, ring_count=32, location=(0, 0, 0))
    shell = bpy.context.object
    shell.name = 'Shell'
    # Keep the upper half and one side of the meridian cut.
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='DESELECT')
    bpy.ops.object.mode_set(mode='OBJECT')
    for v in shell.data.vertices:
        v.select = (v.co.z < -1e-4) or (v.co.x * side < -1e-4)
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.delete(type='VERT')
    bpy.ops.object.mode_set(mode='OBJECT')
    # Thickness: a shell with an inner skin reads solid at the cut edge.
    mod = shell.modifiers.new('solidify', 'SOLIDIFY')
    mod.thickness = .018
    mod.offset = -1
    bpy.context.view_layer.objects.active = shell
    bpy.ops.object.modifier_apply(modifier=mod.name)
    shell.data.materials.append(plaster)

    parts = [shell]
    # Meridian ribs: continuous raised strips from the base ring to the apex,
    # each built as a few long segments laid along the meridian tangent. A rib
    # sticks out radially by ~0.012 and runs the full length of the meridian so
    # the dome reads as a real ribbed shell, not a plain hemisphere.
    # The west half keeps x <= 0, so its meridian range is (pi/2, 3pi/2). Reusing
    # the east range here put every west rib and rivet on the far side of the
    # dome: they stayed hidden while the shell was shut and appeared as a drift
    # of loose plates the moment it slid open.
    phi0 = -math.pi / 2 if side > 0 else math.pi / 2
    for i in range(1, 7):
        phi = phi0 + math.pi * (i / 7)
        for k in range(6):
            t0 = (k) / 6 * (math.pi / 2)
            t1 = (k + 1) / 6 * (math.pi / 2)
            tm = (t0 + t1) / 2
            x = (R + .006) * math.sin(tm) * math.cos(phi)
            y = (R + .006) * math.sin(tm) * math.sin(phi)
            z = (R + .006) * math.cos(tm)
            tangent = (
                math.cos(tm) * math.cos(phi),
                math.cos(tm) * math.sin(phi),
                -math.sin(tm),
            )
            normal = (math.sin(tm) * math.cos(phi), math.sin(tm) * math.sin(phi), math.cos(tm))
            # Length matches the chord of one 15-degree step (0.240) with a little
            # overlap, thickness leaves the rib ~0.02 proud of the shell, and the
            # width is a rib's width. At (.06, .055, .04) each piece was a cube
            # the size of a rivet plate and the dome read as covered in debris.
            seg = rib_segment(f'Rib{i}_{k}', (x, y, z), tangent, normal, (.255, .030, .030), plaster_dark)
            parts.append(seg)
    # Rivet bands: two horizontal rings of copper rivets.
    for t in (math.radians(24), math.radians(58)):
        for k in range(11):
            phi = phi0 + math.pi * (k / 10)
            x = (R + .012) * math.sin(t) * math.cos(phi)
            y = (R + .012) * math.sin(t) * math.sin(phi)
            z = (R + .012) * math.cos(t)
            parts.append(sphere(f'Rivet{t:.2f}_{k}', (x, y, z), .0065, copper, 8, 6))
    # Copper flashing along the cut edge (the meridian the halves meet on).
    for k in range(16):
        t = (k + .5) / 16 * (math.pi / 2)
        z = (R + .006) * math.cos(t)
        y = (R + .006) * math.sin(t)
        parts.append(cube(f'Seam{k}', (0.0, y, z), (.026, .012, .058), copper, bevel=.0012,
                          rot=(t, 0, 0)))
    # Hinge blocks at the base, and a lightning rod at the apex.
    for y in (-.42, .42):
        parts.append(cube(f'Hinge{y}', (0, y, .03), (.05, .05, .06), iron, bevel=.003))
    parts.append(cylinder('RodBase', (0, 0, R + .01), .035, .03, iron))
    parts.append(cylinder('Rod', (0, 0, R + .08), .006, .16, iron, 8))
    parts.append(sphere('RodTip', (0, 0, R + .17), .012, brass, 10, 8))

    obj = join('DomeEast' if side > 0 else 'DomeWest', parts)
    smooth(obj, 34)
    return obj


dome_east = dome_half(1)
dome_west = dome_half(-1)

# ---- telescope ---------------------------------------------------------
fork_parts = []
fork_parts.append(cylinder('Pier', (0, 0, .26), .13, .52, plaster_dark, 24))
fork_parts.append(cylinder('PierCap', (0, 0, .532), .17, .024, iron, 24))
fork_parts.append(cylinder('Head', (0, 0, .56), .20, .035, iron, 28))
for side in (-1, 1):
    fork_parts.append(cube(f'Arm{side}', (side * .17, 0, .67), (.06, .13, .22), iron, bevel=.006))
    fork_parts.append(cylinder(f'ArmBoss{side}', (side * .17, 0, .575), .075, .05, brass, 16))
fork_parts.append(cylinder('Axle', (0, 0, .76), .026, .42, iron, 12, rot=(0, math.pi / 2, 0)))
fork_parts.append(cylinder('DriveGear', (.19, .10, .60), .055, .022, brass, 20, rot=(math.pi / 2, 0, 0)))
fork_parts.append(cylinder('Handwheel', (-.22, .08, .58), .045, .014, brass, 18, rot=(0, math.pi / 2, 0)))
fork_parts.append(cube('CounterweightRod', (-.06, -.14, .62), (.012, .012, .18), iron, bevel=.001))
fork_parts.append(cylinder('Weight', (-.06, -.14, .52), .06, .05, iron, 16))
fork = join('TelescopeFork', fork_parts)
smooth(fork, 30)

tube_parts = []
tube_parts.append(cylinder('Barrel', (0, 0, 0), .13, .96, iron, 32, rot=(0, math.pi / 2, 0)))
for x in (-.30, 0.0, .30):
    tube_parts.append(cylinder(f'Ring{x}', (x, 0, 0), .146, .028, brass, 32, rot=(0, math.pi / 2, 0)))
tube_parts.append(cylinder('Cell', (-.48, 0, 0), .148, .05, iron, 32, rot=(0, math.pi / 2, 0)))
tube_parts.append(cylinder('Mirror', (-.505, 0, 0), .108, .006, glass, 32, rot=(0, math.pi / 2, 0)))
tube_parts.append(cylinder('DewShield', (.47, 0, 0), .142, .10, plaster_dark, 32, rot=(0, math.pi / 2, 0)))
# Finder scope, offset from the main tube.
tube_parts.append(cylinder('Finder', (.06, .17, .13), .026, .30, brass, 14, rot=(0, math.pi / 2, 0)))
tube_parts.append(cylinder('FinderCell', (.21, .17, .13), .032, .03, iron, 14, rot=(0, math.pi / 2, 0)))
for x in (-.09, .19):
    tube_parts.append(cube(f'FinderBracket{x}', (x, .09, .10), (.016, .05, .05), iron, bevel=.002, rot=(.6, 0, 0)))
# Focuser and eyepiece on the back of the cell.
tube_parts.append(cylinder('Focuser', (-.36, -.17, -.09), .032, .10, brass, 14, rot=(.7, 0, 0)))
tube = join('TelescopeTube', tube_parts)
smooth(tube, 30)

# ---- duty room --------------------------------------------------------
room_parts = []
room_parts.append(cube('Walls', (0, 0, .14), (.38, .34, .28), plaster, bevel=.004))
room_parts.append(cube('DoorFrame', (0, .171, .115), (.13, .012, .23), plaster_dark, bevel=.002))
room_parts.append(cube('Door', (0, .178, .105), (.095, .008, .20), wood, bevel=.002))
room_parts.append(cube('WindowFrame', (.10, .173, .17), (.13, .012, .10), plaster_dark, bevel=.002))
room_parts.append(cube('WindowPane', (.10, .180, .17), (.105, .004, .078), glow))
for side in (-1, 1):
    room_parts.append(cube(f'Roof{side}', (0, side * .095, .315), (.44, .23, .022), slate, bevel=.002,
                           rot=(side * .58, 0, 0)))
room_parts.append(cube('Ridge', (0, 0, .365), (.44, .035, .022), slate, bevel=.002))
room_parts.append(cylinder('Chimney', (-.12, -.06, .40), .035, .20, plaster_dark, 12))
room_parts.append(cylinder('ChimneyPot', (-.12, -.06, .505), .028, .03, iron, 12))
room_parts.append(cube('Sill', (.10, .186, .115), (.14, .022, .012), plaster_dark, bevel=.002))
room = join('DutyRoom', room_parts)
smooth(room, 30)

# ---- export -----------------------------------------------------------
for obj in (dome_east, dome_west, fork, tube, room):
    select_only(obj)
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)

bpy.ops.object.select_all(action='SELECT')
glb = os.path.join(DEST, 'observatory.glb')
bpy.ops.export_scene.gltf(filepath=glb, export_format='GLB', export_yup=True,
                          export_apply=True, export_image_format='AUTO')
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT, 'observatory.blend'))

stats = {
    'file': glb,
    'bytes': os.path.getsize(glb),
    'objects': {},
}
for obj in (dome_east, dome_west, fork, tube, room):
    points = [obj.matrix_world @ v.co for v in obj.data.vertices]
    stats['objects'][obj.name] = {
        'triangles': sum(len(p.vertices) - 2 for p in obj.data.polygons),
        'bounds': {
            'min': [round(min(v[i] for v in points), 4) for i in range(3)],
            'max': [round(max(v[i] for v in points), 4) for i in range(3)],
        },
        'materials': [m.name for m in obj.data.materials],
    }
with open(os.path.join(OUT, 'observatory.json'), 'w') as fh:
    json.dump(stats, fh, indent=2)
print(json.dumps(stats, indent=2))
