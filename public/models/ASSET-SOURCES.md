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
- Updated 2026-10-28 with Blender 5.4.0 Alpha: embedded plaster/stone/wood albedo, normal and roughness maps; continuous closed gable, roof edges, shutters, copper lantern roof and curved masonry. Final bounding boxes match the previous assets. Latest editable files and comparison renders: `outputs/art-v29/` (local). The two cottage instances use independent live window materials.

## harbor-gull.glb

- Created locally for Keyscape in Blender on 2026-10-28; MIT, no downloaded geometry or textures.
- Source: `scripts/blender/author-harbor-gull.py`. Editable source and preview: `outputs/gull-v29/` (local).
- 1,796 triangles, 60,224 bytes. Left/right shoulder pivots `GullWingLeft` and `GullWingRight`; Y up, +Z forward, foot origin at Y=0.
- The app animates the wing pivots and a bounded flight above the lagoon. Geometry and materials remain owned by the shared GLTF cache.

## fishing-boat.glb and timber-dock.glb

- Created locally for Keyscape in Blender, 2026-10-26; no downloaded boat/dock geometry or textures.
- Script: `scripts/blender/author-harbor-props.py`; editable files and actual logs: `outputs/art-v23/`.
- The boat is a static asset animated by the existing app. The dock aligns to the existing shore landing; both are validated against the existing collision bounds.

These assets are integrated with the procedural terrain and dynamic scene. They are not a complete exported island. The six locally authored assets are distributed under the root MIT license; the Poly Haven derivative retains CC0.

## observatory.glb

- Created locally for Keyscape in Blender 5.4.0 Alpha, 2026-10-29; no downloaded geometry or textures.
- Script: `scripts/blender/author-observatory.py`; editable source and stats: `outputs/art-observatory/` (local).
- Five named nodes: `DomeEast`, `DomeWest` (ribbed half-shells, base ring on their local origin, meridian on the X axis), `TelescopeFork` (pier + equatorial fork, pier base at origin), `TelescopeTube` (barrel along X, origin at the altitude axis), `DutyRoom` (walls + gable roof + chimney + a `QDutyGlow` window pane).
- The app slides the two dome halves apart to open them, drives `QDutyGlow` emissive with the lamp state, and rotates the fork (azimuth) and tube (altitude) for the aim presets. Geometry and materials are owned by the shared GLTF cache.

## alpine-flora.glb

- Created locally for Keyscape in Blender 5.4.0 Alpha, 2026-10-29; no downloaded geometry or textures.
- Script: `scripts/blender/author-alpine-flora.py`; editable source and mesh report: `outputs/art-q-flora/` (local).
- Three objects, base at the origin, Z up, study units: `Tussock` (a dry grass clump, 1,056 triangles), `Juniper` (a prostrate shrub, 540 triangles), `Pine` (a wind-shaped conifer, 1,736 triangles).
- Replaced nine flat quads per grass clump and three stacked cones per tree on the Q hillside. The app instances each object with an `InstancedMesh` and bends it with the shared wind shader, which reads local Y, so the origin at the base is what keeps the plant planted.
- Geometry and materials are owned by the shared GLTF cache; the wind shader is applied to per-instance clones of the materials.
