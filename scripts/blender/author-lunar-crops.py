"""Author the greenhouse crops.

Run with:  blender -b -P scripts/blender/author-lunar-crops.py

Three crops, each a leaf mesh and a stem mesh, exported at 1.0 unit tall with the
base on the origin so the scene can instance them at whatever size the beds need.

The leaves are real curved ribbons — four columns with a V cross-section and a
droop along the length — not alpha cards and not spheres. At the size these are
seen (a few millimetres on screen) the silhouette is the only thing that reads,
and a card's silhouette is a rectangle that vanishes edge-on.
"""

import math
import os
import random

import bpy
from mathutils import Matrix, Vector

random.seed(7)

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT = os.path.join(ROOT, 'public', 'models', 'lunar')
os.makedirs(OUT, exist_ok=True)

# Wipe the default scene.
bpy.ops.wm.read_factory_settings(use_empty=True)


def material(name, colour, roughness=0.82):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get('Principled BSDF')
    bsdf.inputs['Base Color'].default_value = (*colour, 1.0)
    bsdf.inputs['Roughness'].default_value = roughness
    bsdf.inputs['Metallic'].default_value = 0.0
    # Leaves are single-sided geometry; glTF needs the doubleSided flag or every
    # second leaf disappears depending on which way the camera faces.
    mat.use_backface_culling = False
    return mat


LEAF = material('CropLeaf', (0.105, 0.196, 0.078))
STEM = material('CropStem', (0.113, 0.157, 0.078))


def leaf_mesh(length, width, droop, cup, twist=0.0):
    """A ribbon that grows along +Y, droops toward -Z and cups across its width."""
    cols, rows = 4, 7
    verts = []
    for r in range(rows + 1):
        t = r / rows
        w = width * (math.sin(math.pi * min(1.0, t ** 0.72)) ** 0.55)
        for c in range(cols):
            u = c / (cols - 1) * 2.0 - 1.0
            x = u * w
            y = length * t
            z = -droop * t * t + cup * (u * u) * w * 1.4 + twist * u * t * width
            verts.append((x, y, z))
    faces = []
    for r in range(rows):
        for c in range(cols - 1):
            a = r * cols + c
            faces.append((a, a + 1, a + cols + 1, a + cols))
    return verts, faces


def stems_mesh(segments, height, radius, taper=0.55, lean=(0.0, 0.0)):
    """A slightly tapered, slightly leaning cylinder."""
    sides = 8
    verts, faces = [], []
    for s in range(segments + 1):
        t = s / segments
        r = radius * (1.0 - taper * t)
        y = height * t + lean[0] * t * t
        z = lean[1] * t * t
        for i in range(sides):
            a = i / sides * math.tau
            verts.append((math.cos(a) * r, y, math.sin(a) * r + z))
    for s in range(segments):
        for i in range(sides):
            a = s * sides + i
            b = s * sides + (i + 1) % sides
            faces.append((a, b, b + sides, a + sides))
    return verts, faces


class Builder:
    """Collects primitives into one mesh per part, then emits two objects."""

    def __init__(self):
        self.leaves = {'verts': [], 'faces': []}
        self.stems = {'verts': [], 'faces': []}

    def push(self, bucket, verts, faces, matrix):
        offset = len(bucket['verts'])
        bucket['verts'].extend([tuple(matrix @ Vector(v)) for v in verts])
        bucket['faces'].extend([tuple(i + offset for i in f) for f in faces])
        return offset

    def leaf(self, verts, faces, matrix):
        return self.push(self.leaves, verts, faces, matrix)

    def stem(self, verts, faces, matrix):
        return self.push(self.stems, verts, faces, matrix)


def build(name, leaf_parts, stem_parts):
    objects = []
    for suffix, bucket, mat in (('Leaf', leaf_parts, LEAF), ('Stem', stem_parts, STEM)):
        if not bucket['verts']:
            continue
        mesh = bpy.data.meshes.new(f'{name}_{suffix}')
        mesh.from_pydata(bucket['verts'], [], bucket['faces'])
        mesh.validate()
        mesh.update()
        mesh.materials.append(mat)
        for polygon in mesh.polygons:
            polygon.use_smooth = True
        obj = bpy.data.objects.new(f'{name}_{suffix}', mesh)
        bpy.context.collection.objects.link(obj)
        objects.append(obj)
    return objects


def ring_of_leaves(count, radius, length, width, tilt_deg, droop, cup, start_angle=0.0, jitter=0.0):
    """Leaves arranged around a point, each tilted out from vertical."""
    parts = []
    for i in range(count):
        angle = start_angle + i / count * math.tau + random.uniform(-jitter, jitter)
        tilt = math.radians(tilt_deg + random.uniform(-6, 6))
        # The leaf grows along +Y; rotate it out from vertical, then around Z.
        rot = (Matrix.Rotation(angle, 4, 'Z')
               @ Matrix.Rotation(math.radians(90) - tilt, 4, 'X')
               @ Matrix.Translation((random.uniform(-radius, radius) * 0.25, 0, 0)))
        parts.append((rot, leaf_mesh(length * random.uniform(0.85, 1.15),
                                     width * random.uniform(0.9, 1.15),
                                     droop, cup)))
    return parts


def compose(parts, origin=(0, 0, 0)):
    """Yield (matrix, verts, faces) with the assembly placed at `origin`."""
    base = Matrix.Translation(origin)
    for rot, (verts, faces) in parts:
        yield base @ rot, verts, faces


# --- 1. Leafy crop: two rings of broad leaves over a stub -------------------
def crop_leafy():
    builder = Builder()
    outer = ring_of_leaves(9, 0.02, 0.42, 0.11, 34, 0.14, 0.5, jitter=0.2)
    inner = ring_of_leaves(6, 0.01, 0.30, 0.085, 62, 0.10, 0.55, start_angle=0.4, jitter=0.2)
    for matrix, verts, faces in list(compose(outer)) + list(compose(inner)):
        builder.leaf(verts, faces, matrix)
    verts, faces = stems_mesh(4, 0.14, 0.012)
    builder.stem(verts, faces, Matrix.Identity(4))
    return build('CropLeafy', builder.leaves, builder.stems)


# --- 2. Stalk crop: a vertical stem, pods, leaves up the stem ---------------
def crop_stalk():
    builder = Builder()
    leaf_verts, leaf_faces = leaf_mesh(0.26, 0.055, 0.09, 0.4)
    height = 0.78
    verts, faces = stems_mesh(8, height, 0.010, taper=0.45, lean=(0.01, 0.0))
    builder.stem(verts, faces, Matrix.Identity(4))
    for i, t in enumerate((0.22, 0.38, 0.54, 0.70)):
        angle = i * 2.1 + 0.3
        rot = (Matrix.Translation((0, height * t, 0))
               @ Matrix.Rotation(angle, 4, 'Y')
               @ Matrix.Rotation(math.radians(58), 4, 'X'))
        builder.leaf(leaf_verts, leaf_faces, rot)
    # Two pods, hanging from the top third.
    for i, t in enumerate((0.62, 0.74)):
        angle = math.radians(120 + i * 140)
        pod_verts, pod_faces = leaf_mesh(0.10, 0.038, -0.01, 0.9)
        rot = (Matrix.Translation((math.cos(angle) * 0.02, height * t, math.sin(angle) * 0.02))
               @ Matrix.Rotation(angle, 4, 'Z')
               @ Matrix.Rotation(math.radians(150), 4, 'X'))
        builder.leaf(pod_verts, pod_faces, rot)
    return build('CropStalk', builder.leaves, builder.stems)


# --- 3. Herb crop: a dense tuft of narrow blades ---------------------------
def crop_herb():
    builder = Builder()
    for i in range(22):
        angle = i / 22 * math.tau + random.uniform(-0.12, 0.12)
        tilt = math.radians(random.uniform(8, 34))
        rot = (Matrix.Rotation(angle, 4, 'Z')
               @ Matrix.Rotation(math.radians(90) - tilt, 4, 'X'))
        verts, faces = leaf_mesh(random.uniform(0.26, 0.44), random.uniform(0.012, 0.02),
                                 random.uniform(0.06, 0.16), 0.15)
        builder.leaf(verts, faces, rot)
    return build('CropHerb', builder.leaves, builder.stems)


objects = []
objects += crop_leafy()
objects += crop_stalk()
objects += crop_herb()

bpy.ops.object.select_all(action='DESELECT')
for obj in objects:
    obj.select_set(True)
bpy.context.view_layer.objects.active = objects[0]

path = os.path.join(OUT, 'lunar-crops.glb')
bpy.ops.export_scene.gltf(
    filepath=path,
    export_format='GLB',
    use_selection=True,
    export_apply=True,
    export_yup=True,
    export_materials='EXPORT',
)

for obj in objects:
    obj.data.calc_loop_triangles()
print('objects:', [o.name for o in objects])
print('triangles:', sum(len(o.data.loop_triangles) for o in objects))
print('bytes:', os.path.getsize(path))
