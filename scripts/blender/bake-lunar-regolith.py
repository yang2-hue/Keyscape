"""Bake the lunar regolith surface maps.

Run with:  blender -b -P scripts/blender/bake-lunar-regolith.py

Regolith is not sand and it is not clay. It is a compacted, angular, very fine
dust lying on a surface that has been hit for four billion years. Three things
have to be in the maps at once for that to read:

* grain at the pixel scale, so even a grazing sun breaks the surface up;
* gravel, the size the eye actually names "soil";
* impact pits with a real bowl and rim, because a surface with no history reads
  as noise no matter how much of it there is.

The height field is built here because numpy makes a periodic field cheap, and a
periodic field is what makes the tile seamless — no seams to hide, no mirrored
repeat that starts to look symmetrical. Albedo, normal and roughness all derive
from that one field, so they can never disagree, which is the usual reason a
"detailed" surface still reads as plastic.
"""

import os
import numpy as np
import bpy

SIZE = 1024
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT = os.path.join(ROOT, 'public', 'textures', 'lunar')
os.makedirs(OUT, exist_ok=True)

rng = np.random.default_rng(20261028)


def periodic_noise(period):
    """Value noise on a wrapping lattice. Period must divide SIZE."""
    lattice = rng.random((period, period))
    coords = np.arange(SIZE) * (period / SIZE)
    i0 = np.floor(coords).astype(np.int64)
    frac = coords - i0
    ease = frac * frac * (3.0 - 2.0 * frac)
    a0 = i0 % period
    a1 = (i0 + 1) % period
    v00 = lattice[np.ix_(a0, a0)]
    v01 = lattice[np.ix_(a0, a1)]
    v10 = lattice[np.ix_(a1, a0)]
    v11 = lattice[np.ix_(a1, a1)]
    sx = ease[None, :]
    sy = ease[:, None]
    top = v00 * (1.0 - sx) + v01 * sx
    bottom = v10 * (1.0 - sx) + v11 * sx
    return top * (1.0 - sy) + bottom * sy


def fbm(base_period, octaves, gain=0.5):
    total = np.zeros((SIZE, SIZE))
    amplitude, norm, period = 1.0, 0.0, base_period
    for _ in range(octaves):
        total += amplitude * periodic_noise(period)
        norm += amplitude
        amplitude *= gain
        period *= 2
    return total / norm


def window(cx, cy, span):
    """Index arrays for a square window that wraps around the tile."""
    ys = np.arange(cy - span, cy + span + 1) % SIZE
    xs = np.arange(cx - span, cx + span + 1) % SIZE
    dy = np.arange(-span, span + 1)[:, None].astype(np.float64)
    dx = np.arange(-span, span + 1)[None, :].astype(np.float64)
    return ys, xs, np.hypot(dy, dx)


print('building fields …')
broad = fbm(3, 5)
warp = fbm(44, 3)
grain = fbm(96, 3)

# Layered relief: soft dunes, a medium undulation, then the grain. A ridged
# component was tried and removed — `1-|2n-1|` creases on the lattice lines, and
# the lines are axis aligned, so the tile ends up crossed by faint straight
# scratches that no amount of tiling hides.
height = 0.34 * (broad - 0.5) + 0.10 * (fbm(10, 3) - 0.5) + 0.05 * (fbm(24, 3) - 0.5)
tint = np.ones((SIZE, SIZE))
flat = np.zeros((SIZE, SIZE), dtype=bool)


def add_stones(count, radius_range, amplitude):
    """Clasts, half buried and irregular.

    A sphere is what makes procedural gravel look like bubbles: the silhouette
    is too round and the profile too high. The outline is therefore warped by the
    low-frequency field, and the dome is squashed as if the stone had settled
    into the dust.
    """
    for _ in range(count):
        r = int(rng.integers(radius_range[0], radius_range[1] + 1))
        cx, cy = int(rng.integers(0, SIZE)), int(rng.integers(0, SIZE))
        span = int(r * 1.5) + 2
        ys, xs, dist = window(cx, cy, span)
        d = (dist / r) / (1.0 + 0.55 * (warp[np.ix_(ys, xs)] - 0.5))
        inside = d < 1.0
        if not inside.any():
            continue
        # Flat top, near-vertical wall at the base. A `1-d*d` dome is smooth
        # everywhere, and a smooth field normal-maps into soft dimples — the
        # reason the first attempt read as clay. A clast meets the dust at an
        # angle, so the profile has to break at the rim.
        dome = np.clip(1.0 - d, 0.0, 1.0) ** 0.42
        # Facets: a clast is broken, not cast.
        dome *= 1.0 + 0.55 * (grain[np.ix_(ys, xs)] - 0.5)
        dome *= amplitude * (r / 20.0)
        patch = height[np.ix_(ys, xs)]
        height[np.ix_(ys, xs)] = np.where(inside, patch + dome, patch)
        shade = rng.uniform(0.975, 1.035)
        tpatch = tint[np.ix_(ys, xs)]
        tint[np.ix_(ys, xs)] = np.where(inside, shade, tpatch)
        fpatch = flat[np.ix_(ys, xs)]
        flat[np.ix_(ys, xs)] = np.where(inside, True, fpatch)


def add_craters(count, radius_range, depth_range):
    for _ in range(count):
        r = int(rng.integers(radius_range[0], radius_range[1] + 1))
        cx, cy = int(rng.integers(0, SIZE)), int(rng.integers(0, SIZE))
        depth = rng.uniform(*depth_range) * (r / 16.0)
        ys, xs, dist = window(cx, cy, int(r * 2.1) + 2)
        d = dist / r
        bowl = -np.clip(1.0 - d, 0.0, 1.0) ** 0.5 * depth
        rim = depth * 0.5 * np.exp(-((d - 1.06) ** 2) / 0.05)
        ejecta = depth * 0.10 * np.exp(-((d - 1.7) ** 2) / 0.9)
        patch = height[np.ix_(ys, xs)]
        after = patch + (bowl + rim + ejecta) * (d < 2.6)
        height[np.ix_(ys, xs)] = after
        # Fresh ejecta is brighter than the compacted floor.
        tpatch = tint[np.ix_(ys, xs)]
        tint[np.ix_(ys, xs)] = np.where((d > 1.0) & (d < 2.2) & (after > patch), 1.05, tpatch)


# Coarse first, then two generations of grit: a graded surface, not one size.
# Sizes are bounded by the boulders in the scene: a 40 px clast in a 1024 tile
# that spans 1.45 units is 6 cm across, the same as a placed rock, and the eye
# reads the repetition immediately. 20 px is the ceiling here.
add_stones(90, (9, 20), 0.5)
add_stones(520, (4, 10), 0.4)
add_stones(1500, (2, 5), 0.3)
# Micro-gravel. Without this the field between the visible clasts is a flat
# plane, and a flat plane is exactly what reads as "no texture at all".
add_stones(4200, (1, 3), 0.22)
add_craters(26, (14, 40), (0.45, 0.9))
add_craters(170, (6, 16), (0.3, 0.7))

# The grain has to survive the 0..1 normalisation that follows; at 0.03 it
# normalised to 1.5% of the range and the normal map came out as a flat plane.
height += 0.11 * (grain - 0.5)

# Dust ponds: patches where the fines have settled and buried the gravel flat.
pond = fbm(4, 3)
pond_mask = np.clip((pond - 0.58) * 8.0, 0.0, 1.0) * 0.75
height = height * (1.0 - pond_mask * np.where(flat, 0.9, 0.22)) + 0.02 * pond_mask
tint *= 1.0 + 0.05 * pond_mask

low, high = height.min(), height.max()
height = (height - low) / (high - low)

# ---------------------------------------------------------------- normal ----
GY, GX = np.gradient(height)
STRENGTH = 3.6
nx = -GX * STRENGTH
ny = GY * STRENGTH
nz = np.ones_like(height)
norm = np.sqrt(nx * nx + ny * ny + nz * nz)
normal = np.stack([nx / norm * 0.5 + 0.5, ny / norm * 0.5 + 0.5, nz / norm * 0.5 + 0.5], axis=-1)

# ----------------------------------------------------------------- albedo ---
# Albedo carries colour and the broadest variation only. Pushing height into it
# as well double-counts the lighting and turns every clast into a grey blob.
# Only a little of the very low frequency survives: at 2.5 repeats across the key
# a period-3 field turns into wide diagonal bands, and bands read as a printing
# error, not as ground. Macro variation belongs to the vertex colours.
# Albedo is deliberately quiet. Regolith varies by a few percent across a whole
# site; the "camo" look in the first pass came from pushing ±10% of patchiness
# plus a height term into the colour, which no real dust does.
patch = fbm(6, 3)
patchiness = (patch - patch.min()) / (patch.max() - patch.min())
base = 0.365 + 0.028 * patchiness
base *= 1.0 + 0.045 * (height - 0.5) * 2.0
base *= tint
base *= 1.0 + 0.05 * pond_mask
albedo_linear = np.stack([base * 1.000, base * 0.978, base * 0.944], axis=-1)
albedo_linear = np.clip(albedo_linear, 0.0, 1.0)


def to_srgb(value):
    return np.where(value <= 0.0031308, value * 12.92,
                    1.055 * np.power(np.maximum(value, 0.0), 1 / 2.4) - 0.055)


albedo = to_srgb(albedo_linear)

# -------------------------------------------------------------- roughness ---
# Dust is matte; the tops of clasts are a touch smoother because they are swept.
roughness = np.clip(0.985 - 0.10 * height, 0.80, 1.0)


def save(name, rgb, colorspace):
    """Write an 8-bit PNG with no colour management applied: the arrays are
    already in the space the file is supposed to contain."""
    data = np.empty((SIZE, SIZE, 4), dtype=np.float32)
    data[:, :, :3] = np.clip(rgb, 0.0, 1.0)
    data[:, :, 3] = 1.0
    image = bpy.data.images.new(name, width=SIZE, height=SIZE, alpha=False)
    image.colorspace_settings.name = colorspace
    image.pixels.foreach_set(data.ravel())
    image.file_format = 'PNG'
    image.filepath_raw = os.path.join(OUT, name + '.png')
    image.save()
    bpy.data.images.remove(image)
    print('wrote', name)


save('regolith-albedo', albedo, 'Non-Color')
save('regolith-normal', normal, 'Non-Color')
save('regolith-rough', np.repeat(roughness[:, :, None], 3, axis=2), 'Non-Color')
print('albedo srgb range', round(float(albedo.min()), 3), round(float(albedo.max()), 3))
