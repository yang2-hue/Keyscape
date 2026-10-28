"""Lunar habitat module, authored for the Space key.

Blender Z up / front -Y exports to glTF Y up / front +Z, so the module is built
along X with its walkway side on +Y. Emissive parts are separate materials
(`HabitatWindowGlow`, `HabitatLamp`) because the browser animates their
intensity when the interior lights come on.

Usage:  blender -b -P scripts/blender/author-lunar-base.py
"""
import bpy, math, os, json
import numpy as np

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '../..'))
OUT = os.path.join(ROOT, 'outputs/art-lunar')
DEST = os.path.join(ROOT, 'public/models/lunar')
os.makedirs(OUT, exist_ok=True)
os.makedirs(DEST, exist_ok=True)

bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)


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


def noise(scale, rng, n=256):
    grid = rng.random((scale, scale))
    axis = np.linspace(0, scale - 1, n)
    rows = np.array([np.interp(axis, np.arange(scale), row) for row in grid])
    return np.array([np.interp(axis, np.arange(scale), col) for col in rows.T]).T


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


def textured(mat, base, grain, variation, roughness, normal_scale):
    """Bake albedo / roughness / normal into packed images: procedural nodes do
    not survive the glTF export, packed maps do."""
    p = mat.node_tree.nodes['Principled BSDF']
    albedo = np.clip(np.array(base) * (1 + (grain[:, :, None] - .5) * variation), 0, 1)
    al = raster(mat, 'hull albedo', albedo, True)
    mat.node_tree.links.new(al.outputs['Color'], p.inputs['Base Color'])
    rr = np.repeat(np.clip(roughness + (grain - .5) * .16, 0, 1)[:, :, None], 3, axis=2)
    ro = raster(mat, 'hull roughness', rr)
    mat.node_tree.links.new(ro.outputs['Color'], p.inputs['Roughness'])
    gy, gx = np.gradient(grain)
    norm = np.dstack((-gx * normal_scale, -gy * normal_scale, np.ones_like(gx)))
    norm /= np.linalg.norm(norm, axis=2, keepdims=True)
    no = raster(mat, 'hull normal', norm * .5 + .5)
    nm = mat.node_tree.nodes.new('ShaderNodeNormalMap')
    nm.inputs['Strength'].default_value = .55
    mat.node_tree.links.new(no.outputs['Color'], nm.inputs['Color'])
    mat.node_tree.links.new(nm.outputs['Normal'], p.inputs['Normal'])


rng = np.random.default_rng(28)
coarse = noise(6, rng)
mid = noise(28, rng)
fine = rng.random((256, 256))

hull = material('LunarHullPaint', (.80, .78, .74), .74)
textured(hull, (.80, .78, .74), coarse * .6 + mid * .25 + fine * .15, .16, .74, .8)
trim = material('LunarTrimAlloy', (.62, .60, .56), .48, .25)
textured(trim, (.62, .60, .56), mid * .5 + fine * .5, .12, .46, .7)
metal = material('LunarMachinedMetal', (.40, .42, .45), .34, .9)
dark = material('LunarDarkMetal', (.16, .17, .19), .46, .7)
radiator = material('LunarRadiator', (.72, .70, .66), .62, .15)
textured(radiator, (.72, .70, .66), np.clip(.5 + .12 * np.sin(np.arange(256)[None, :] * .5) + (fine - .5) * .1, 0, 1), .14, .58, .9)
glow = material('HabitatWindowGlow', (.30, .26, .20), .32, .0, emit=(1.0, .74, .44), emit_strength=2.2)
lamp = material('HabitatLamp', (.95, .88, .74), .5, .0, emit=(1.0, .80, .56), emit_strength=3.0)


def cylinder(name, loc, r1, r2, depth, mat, axis='X', verts=48, bevel=.0018):
    bpy.ops.mesh.primitive_cylinder_add(vertices=verts, radius=r1, depth=depth, location=loc)
    o = bpy.context.object
    o.name = name
    if r2 != r1:
        bpy.ops.object.mode_set(mode='EDIT')
        bpy.ops.mesh.select_all(action='SELECT')
        bpy.ops.transform.resize(value=(r2 / r1, r2 / r1, 1), orient_type='GLOBAL')
        bpy.ops.object.mode_set(mode='OBJECT')
    if axis == 'X':
        o.rotation_euler = (0, math.pi / 2, 0)
    elif axis == 'Y':
        o.rotation_euler = (math.pi / 2, 0, 0)
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    o.data.materials.append(mat)
    if bevel:
        mod = o.modifiers.new('Edge break', 'BEVEL')
        mod.width = bevel
        mod.segments = 2
        bpy.ops.object.modifier_apply(modifier=mod.name)
    return o


def torus(name, loc, radius, thickness, mat, axis='X'):
    bpy.ops.mesh.primitive_torus_add(location=loc, major_radius=radius, minor_radius=thickness,
                                     major_segments=48, minor_segments=10)
    o = bpy.context.object
    o.name = name
    if axis == 'X':
        o.rotation_euler = (0, math.pi / 2, 0)
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    o.data.materials.append(mat)
    return o


def cube(name, loc, dims, mat, bevel=.0015, rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc)
    o = bpy.context.object
    o.name = name
    o.dimensions = dims
    o.rotation_euler = rot
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    o.data.materials.append(mat)
    if bevel:
        mod = o.modifiers.new('Edge break', 'BEVEL')
        mod.width = bevel
        mod.segments = 2
        bpy.ops.object.modifier_apply(modifier=mod.name)
    return o


def uv_sphere(name, loc, radius, mat, scale=(1, 1, 1)):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=32, ring_count=18, radius=radius, location=loc)
    o = bpy.context.object
    o.name = name
    o.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    o.data.materials.append(mat)
    return o


def join(name, objects):
    bpy.ops.object.select_all(action='DESELECT')
    for o in objects:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]
    bpy.ops.object.join()
    merged = bpy.context.object
    merged.name = name
    return merged


R = .185
LENGTH = .44
parts = []

# ---- pressure hull: three bays with a recessed seam between them ----------
for i, x in enumerate((-.145, 0, .145)):
    bay = cylinder(f'HullBay{i}', (x, 0, 0), R, R, .127, hull, bevel=.006)
    parts.append(bay)
    seam = torus(f'HullSeam{i}', (x + .068, 0, 0), R - .004, .007, trim)
    parts.append(seam)
# West cap: hemisphere with a bolted hatch.
dome = uv_sphere('HabitatDome', (-.22, 0, 0), R, hull, scale=(1.02, 1, 1))
parts.append(dome)
ring = torus('HatchRing', (-.352, 0, 0), .052, .008, trim)
parts.append(ring)
hatch = cylinder('HatchPlate', (-.362, 0, 0), .05, .05, .012, hull, bevel=.003)
parts.append(hatch)
for k in range(8):
    a = k / 8 * math.tau
    parts.append(uv_sphere(f'HatchBolt{k}', (-.371, math.cos(a) * .062, math.sin(a) * .062), .005, metal))
# East collar that mates with the airlock.
parts.append(cylinder('EastCollar', (.232, 0, 0), .152, .152, .03, trim, bevel=.003))
parts.append(cylinder('EastLiner', (.247, 0, 0), .13, .13, .012, dark, bevel=.002))

# ---- windows: recessed frames with a glowing pane on both sides ----------
for i, x in enumerate((-.145, 0, .145)):
    for side in (-1, 1):
        frame = cube(f'WindowFrame{i}{side}', (x, side * (R - .004), .0), (.085, .016, .105), trim,
                     bevel=.002, rot=(0, 0, 0))
        parts.append(frame)
        pane = cube(f'WindowPane{i}{side}', (x, side * (R + .004), 0), (.066, .006, .085), glow, bevel=.001)
        parts.append(pane)

# ---- radiators, tanks, mast --------------------------------------------
for side in (-1, 1):
    parts.append(cube(f'Radiator{side}', (.03, side * .17, .24), (.26, .12, .008), radiator,
                      bevel=.002, rot=(side * .22, 0, 0)))
    parts.append(cube(f'RadiatorSpine{side}', (.03, side * .17, .246), (.24, .012, .006), dark, bevel=.001))
    parts.append(cylinder(f'Tank{side}', (.08, side * .12, .16), .024, .024, .1, hull, axis='Y', bevel=.002))
    parts.append(torus(f'TankBand{side}', (.08, side * .12, .16), .025, .003, trim, axis='Y'))

parts.append(cylinder('Mast', (-.06, 0, .255), .004, .005, .16, metal, axis='Z', bevel=.0008))
parts.append(cylinder('MastShort', (.02, .02, .225), .003, .004, .1, metal, axis='Z', bevel=.0008))
parts.append(uv_sphere('Dish', (.06, -.01, .285), .03, trim, scale=(1, 1, .45)))
parts.append(uv_sphere('Beacon', (-.06, 0, .34), .011, lamp))
parts.append(cube('AntennaFoot', (-.06, 0, .19), (.05, .05, .014), dark, bevel=.002))

# ---- ladder rungs and a service box -----------------------------------
for k in range(4):
    parts.append(cube(f'Rung{k}', (.16, .13, -.12 + k * .055), (.012, .07, .006), metal, bevel=.001))
for side in (-1, 1):
    parts.append(cube(f'Rail{side}', (.16, .13 + side * .035, -.02), (.012, .006, .2), metal, bevel=.001))
parts.append(cube('ServiceBox', (-.06, -.17, -.02), (.09, .045, .07), trim, bevel=.002))
parts.append(cube('ServicePanel', (-.06, -.195, -.02), (.07, .006, .05), dark, bevel=.001))

body = join('LunarHabitat', parts)
# Smooth shading with an angle threshold: the dome must not read as facets, but
# panel seams and hatch bolts keep their edges.
bpy.context.view_layer.objects.active = body
try:
    bpy.ops.object.shade_smooth_by_angle(angle=math.radians(38))
except Exception:
    bpy.ops.object.shade_smooth()
# Joining inherits the first part's origin; move the origin to the world origin so
# the exported mesh keeps the coordinates the scene expects.
bpy.context.scene.cursor.location = (0, 0, 0)
bpy.ops.object.origin_set(type='ORIGIN_CURSOR')
body.location = (0, 0, 0)

# ---- export -----------------------------------------------------------
bpy.ops.object.select_all(action='SELECT')
glb = os.path.join(DEST, 'lunar-habitat.glb')
bpy.ops.export_scene.gltf(filepath=glb, export_format='GLB', export_yup=True,
                          export_apply=True, export_image_format='AUTO')
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT, 'lunar-habitat.blend'))

points = [body.matrix_world @ v.co for v in body.data.vertices]
stats = {
    'file': glb,
    'bytes': os.path.getsize(glb),
    'triangles': sum(len(p.vertices) - 2 for p in body.data.polygons),
    'bounds_blender': {
        'min': [round(min(v[i] for v in points), 4) for i in range(3)],
        'max': [round(max(v[i] for v in points), 4) for i in range(3)],
    },
    'materials': [m.name for m in body.data.materials],
}
with open(os.path.join(OUT, 'lunar-habitat.json'), 'w') as fh:
    json.dump(stats, fh, indent=2)
print(json.dumps(stats, indent=2))
