# Model sources

## coastal-limestone.glb

- Source: [Coast Rocks 05, Poly Haven](https://polyhaven.com/a/coast_rocks_05)
- License: [CC0](https://polyhaven.com/license)
- Downloaded from the official Poly Haven API/file service, 2026-10-26. Powered by Poly Haven.
- Original source preserved locally under `work/art-v21/source/coast_rocks_05/` (not committed).
- Blender processing: 771,724 polygons reduced to 10,000 triangles, origin and dimensions normalized, PBR images resized to 1K, diffuse color adapted to pale limestone while retaining photographed detail. Embedded textures, no Draco/meshopt extension required.
- Construction: `scripts/blender/prepare-coastal-rocks.py`. Packed editable file: `outputs/art-v21/coastal-rocks.blend` (local).

## mediterranean-olive.glb

- Created locally for Keyscape in Blender, 2026-10-26; no downloaded tree geometry or textures.
- Tapered branches and 2,610 individually cupped leaves. Source: `scripts/blender/author-olive-tree.py`.
- Packed editable file: `outputs/art-v21/olive-tree.blend` (local).

## coastal-cottage.glb and coastal-lighthouse.glb

- Created locally for Keyscape in Blender, 2026-10-26; no downloaded building geometry or textures.
- Script: `scripts/blender/author-coastal-architecture.py`; editable working files and logs: `outputs/art-v22/`.
- The cottage has a separate window mesh for live dusk lighting. The lighthouse is a static shell with a separately named door; its beacon animation and real-time lights are added by the app.

## fishing-boat.glb and timber-dock.glb

- Created locally for Keyscape in Blender, 2026-10-26; no downloaded boat/dock geometry or textures.
- Script: `scripts/blender/author-harbor-props.py`; editable files and actual logs: `outputs/art-v23/`.
- The boat is a static asset animated by the existing app. The dock aligns to the existing shore landing; both are validated against the existing collision bounds.

These assets are integrated with the procedural terrain and dynamic scene. They are not a complete exported island. The five locally authored assets are distributed under the root MIT license; the Poly Haven derivative retains CC0.
