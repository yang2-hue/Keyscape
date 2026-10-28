import * as THREE from 'three';
import { CRATERS, LUNAR, SITE, lunarHeight, noise2, roundedRectPoint, spacebarOutline } from './lunar-layout';
import { makeLunarMaterials, type LunarMaterials, type RegolithMaps } from './lunar-materials';
import { seeded } from './coastal-materials';

type Quality = 'full' | 'software';

// Vertex colours are a multiplier on the baked albedo, not a colour in their own
// right: near-white keeps the map's own tone and only adds the macro mottling
// that a 1.45-unit tile cannot carry.
const VARIANTS = {
  regolith: ['#fffdf9', '#f3efe7', '#ffffff', '#eae5db'],
  boulder: ['#cfccc6', '#c1beb8', '#dcd9d3', '#b3b0aa'],
};

/** Open half-cylinder swept along X: the greenhouse shell and its glazing. */
function vaultGeometry(radius: number, length: number, segments = 26, rings = 10) {
  const position: number[] = [], normal: number[] = [], uv: number[] = [], index: number[] = [];
  for (let r = 0; r <= rings; r++) {
    const x = -length / 2 + (length * r) / rings;
    for (let s = 0; s <= segments; s++) {
      const a = (s / segments) * Math.PI;
      const y = Math.sin(a) * radius, z = Math.cos(a) * radius;
      position.push(x, y, z);
      normal.push(0, Math.sin(a), Math.cos(a));
      uv.push(s / segments, r / rings);
    }
  }
  for (let r = 0; r < rings; r++) for (let s = 0; s < segments; s++) {
    const a = r * (segments + 1) + s, b = a + segments + 1;
    index.push(a, b, a + 1, a + 1, b, b + 1);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(position, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normal, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geometry.setIndex(index);
  return geometry;
}

/** A plant is a tuft of tapered blades, not a ball. Blobs read as balloons at
 * this size; nine thin cards give a foliage silhouette for the same triangle
 * count as one low-poly sphere. */
function plantGeometry() {
  const position: number[] = [], index: number[] = [];
  const random = seeded(91);
  const blades = 16;
  for (let b = 0; b < blades; b++) {
    const angle = random() * Math.PI * 2;
    const lean = .25 + random() * .55;
    const height = .6 + random() * .55;
    const halfWidth = .07 + random() * .03;
    const dirX = Math.cos(angle), dirZ = Math.sin(angle);
    const sideX = -dirZ, sideZ = dirX;
    const base = position.length / 3;
    const steps = 3;
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      const width = halfWidth * (1 - t * .85);
      // Bend outward as it rises, so the tuft opens instead of standing rigid.
      const bend = lean * t * t * height;
      const cx = dirX * bend, cy = t * height, cz = dirZ * bend;
      position.push(cx + sideX * width, cy, cz + sideZ * width);
      position.push(cx - sideX * width, cy, cz - sideZ * width);
    }
    for (let s = 0; s < steps; s++) {
      const a = base + s * 2;
      index.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(position, 3));
  geometry.setIndex(index);
  geometry.computeVertexNormals();
  return geometry;
}

function mergeGeometries(parts: THREE.BufferGeometry[]) {
  const position: number[] = [], normal: number[] = [], index: number[] = [];
  let offset = 0;
  for (const part of parts) {
    const p = part.getAttribute('position'), n = part.getAttribute('normal'), idx = part.getIndex();
    for (let i = 0; i < p.count; i++) {
      position.push(p.getX(i), p.getY(i), p.getZ(i));
      normal.push(n.getX(i), n.getY(i), n.getZ(i));
    }
    // IcosahedronGeometry is non-indexed: without generating indices here the
    // merged geometry has no triangles at all and the beds look empty.
    if (idx) for (let i = 0; i < idx.count; i++) index.push(idx.getX(i) + offset);
    else for (let i = 0; i < p.count; i++) index.push(i + offset);
    offset += p.count;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(position, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normal, 3));
  geometry.setIndex(index);
  return geometry;
}

export type LunarBase = {
  root: THREE.Group;
  footprint: THREE.Vector2[];
  /** Emissive materials that react to night, weather and the door. */
  windowMaterial: THREE.MeshStandardMaterial;
  lampMaterial: THREE.MeshStandardMaterial;
  doorLight: THREE.MeshStandardMaterial;
  habitatGlow: THREE.MeshStandardMaterial | null;
  doors: { left: THREE.Group; right: THREE.Group };
  interiorLights: THREE.PointLight[];
  growBars: THREE.MeshStandardMaterial[];
  plants: THREE.Group;
  panels: THREE.Group;
  dispose: () => void;
};

export function createLunarBase(time: { value: number }, quality: Quality = 'full', assets: { habitat?: THREE.Object3D; regolith?: RegolithMaps; crops?: THREE.Object3D } = {}): LunarBase {
  const root = new THREE.Group();
  root.name = 'LunarGreenhouse';
  root.rotation.y = LUNAR.rotation;
  const own = makeLunarMaterials(quality, assets.regolith);
  const m = own.materials;
  const geometries: THREE.BufferGeometry[] = [];
  const random = seeded(20261028);

  const track = <T extends THREE.BufferGeometry>(geometry: T) => { geometries.push(geometry); return geometry; };
  const mesh = (geometry: THREE.BufferGeometry, material: THREE.Material, name?: string) => {
    track(geometry);
    const object = new THREE.Mesh(geometry, material);
    object.castShadow = true; object.receiveShadow = true;
    if (name) object.name = name;
    return object;
  };

  // ---- keycap body ------------------------------------------------------
  // An extruded prism would cap its top face at y=0, and that flat lid shows
  // through the crater as a pale disc. The body is therefore an open shell: a
  // side band plus a bottom plate, so the regolith is the only top surface.
  const outline = spacebarOutline();
  const wall = (() => {
    const position: number[] = [], normal: number[] = [], uv: number[] = [], index: number[] = [];
    for (let i = 0; i < outline.length; i++) {
      const a = outline[i], b = outline[(i + 1) % outline.length];
      const dx = b.x - a.x, dz = b.y - a.y, len = Math.hypot(dx, dz) || 1;
      const nx = dz / len, nz = -dx / len;
      const base = position.length / 3;
      position.push(a.x, 0, a.y, b.x, 0, b.y, b.x, -LUNAR.base, b.y, a.x, -LUNAR.base, a.y);
      for (let k = 0; k < 4; k++) normal.push(nx, 0, nz);
      uv.push(0, 1, 1, 1, 1, 0, 0, 0);
      index.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(position, 3));
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normal, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geometry.setIndex(index);
    return geometry;
  })();
  const body = mesh(wall, m.hull, 'LunarKeycapBody');
  body.castShadow = true; body.receiveShadow = true;
  root.add(body);
  const bottomGeometry = new THREE.ShapeGeometry(new THREE.Shape(outline), 2);
  bottomGeometry.rotateX(Math.PI / 2);
  const bottom = mesh(bottomGeometry, m.trim, 'LunarKeycapBottom');
  bottom.position.y = -LUNAR.base;
  root.add(bottom);

  // ---- terrain ----------------------------------------------------------
  const segX = quality === 'full' ? 380 : 190, segZ = quality === 'full' ? 150 : 76;
  const plane = new THREE.PlaneGeometry(LUNAR.halfWidth * 2, LUNAR.halfDepth * 2, segX, segZ);
  plane.rotateX(-Math.PI / 2);
  const position = plane.attributes.position;
  const colors: number[] = [];
  const palette = VARIANTS.regolith.map(c => new THREE.Color(c));
  const craterDepth = (h: number) => Math.max(0, -h);
  const inset = 1;
  for (let i = 0; i < position.count; i++) {
    const [x, z] = roundedRectPoint(position.getX(i) * inset, position.getZ(i) * inset);
    const h = lunarHeight(x, z);
    position.setXYZ(i, x, h, z);
    // Crater floors and steep rims darken slightly; regolith also mottles.
    // Macro mottling: the tile cannot carry variation at this scale without
    // repeating, so the broad patches live in the vertex colours.
    const shade = .98 + .02 * Math.sin(x * 21 + z * 17)
      + .035 * (noise2(x * 2.6 + 4.2, z * 2.6 - 1.7) - .5)
      + .025 * (noise2(x * 5.9 - 2.3, z * 5.9 + 3.1) - .5)
      // The floor is darker because it is dust-filled and shadowed, not because
      // it is a hole: past ~0.12 of depth the darkening flattens out.
      - Math.min(.16, craterDepth(h) * 1.05);
    const base = palette[i % palette.length];
    const c = base.clone().multiplyScalar(Math.max(.46, Math.min(1.02, shade)));
    colors.push(c.r, c.g, c.b);
  }
  plane.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  plane.computeVertexNormals();
  const regolithMaterial = m.regolith.clone();
  regolithMaterial.vertexColors = true;
  const terrain = mesh(plane, regolithMaterial, 'LunarTerrain');
  terrain.receiveShadow = true; terrain.castShadow = false;
  root.add(terrain);

  // ---- scattered rock ---------------------------------------------------
  // An icosahedron is non-indexed, so `computeVertexNormals` gives every face
  // its own normal and a displaced one reads as crumpled paper. A UV sphere is
  // indexed: the same displacement now shades as one weathered rock.
  const boulderGeometry = new THREE.SphereGeometry(1, 26, 16);
  const boulderPositions = boulderGeometry.attributes.position;
  for (let i = 0; i < boulderPositions.count; i++) {
    const v = new THREE.Vector3().fromBufferAttribute(boulderPositions, i);
    const n = 1 + .26 * Math.sin(v.x * 3.7 + v.z * 2.9) + .15 * Math.sin(v.y * 5.1 + v.x * 2.2)
      + .09 * Math.sin(v.z * 7.3 - v.y * 1.7);
    v.multiplyScalar(n);
    boulderPositions.setXYZ(i, v.x, v.y * .74, v.z);
  }
  boulderGeometry.computeVertexNormals();
  track(boulderGeometry);
  // Instanced tint comes from `instanceColor`; enabling vertexColors here would
  // look for a colour attribute the boulder geometry does not have and render
  // the whole field black.
  const boulderMaterial = m.boulder.clone();
  boulderMaterial.color.set('#ffffff');

  // Nothing stays inside a fresh bowl: the impact cleared it, and a rock sitting
  // in the floor was the most obviously wrong thing about the old crater.
  const inBowl = (x: number, z: number) => CRATERS.some(
    c => Math.hypot(x - c.x, z - c.z) < c.radius * (c.radius > .2 ? 1.02 : 1.3),
  );
  const boulderSpots: { x: number; z: number; s: number }[] = [];
  for (let i = 0; i < 46; i++) {
    const angle = random() * Math.PI * 2;
    const rx = LUNAR.halfWidth - .09, rz = LUNAR.halfDepth - .07;
    const x = Math.cos(angle) * rx * (.72 + random() * .26);
    const z = Math.sin(angle) * rz * (.7 + random() * .28);
    if (Math.abs(z) < .42 && x > -1.05 && x < 1.35) continue;
    if (inBowl(x, z)) continue;
    boulderSpots.push({ x, z, s: .018 + random() * .05 });
  }
  // Rim of the hero crater, and a cluster at the east end like the reference.
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2 + random() * .3;
    const r = SITE.crater.radius * (1.02 + random() * .3);
    boulderSpots.push({ x: SITE.crater.x + Math.cos(a) * r, z: SITE.crater.z + Math.sin(a) * r, s: .016 + random() * .034 });
  }
  for (let i = 0; i < 12; i++) {
    boulderSpots.push({ x: 1.3 + random() * .4, z: (random() - .5) * 1, s: .02 + random() * .05 });
  }
  const boulders = new THREE.InstancedMesh(boulderGeometry, boulderMaterial, boulderSpots.length);
  boulders.name = 'LunarBoulders';
  boulders.castShadow = true; boulders.receiveShadow = true;
  const matrix = new THREE.Matrix4(), quaternion = new THREE.Quaternion(), scale = new THREE.Vector3(), pos = new THREE.Vector3();
  const color = new THREE.Color();
  boulderSpots.forEach((spot, i) => {
    const s = spot.s;
    pos.set(spot.x, lunarHeight(spot.x, spot.z) + s * .42, spot.z);
    quaternion.setFromEuler(new THREE.Euler(random() * .5, random() * Math.PI * 2, random() * .4));
    scale.set(s, s * (.7 + random() * .5), s * (.85 + random() * .4));
    matrix.compose(pos, quaternion, scale);
    boulders.setMatrixAt(i, matrix);
    boulders.setColorAt(i, color.set(VARIANTS.boulder[i % VARIANTS.boulder.length]).multiplyScalar(.92 + random() * .12));
  });
  root.add(boulders);

  // Pebbles. The reference surface is not dust with a few stones on it: it is a
  // dense field of small rubble, and that field is what the eye reads as "soil".
  // Shading alone cannot do it — a normal map has no silhouette and no contact
  // shadow. Instanced, so ~5 000 stones cost one draw call.
  const pebbleGeometry = new THREE.SphereGeometry(1, 9, 7);
  const pebblePositions = pebbleGeometry.attributes.position;
  for (let i = 0; i < pebblePositions.count; i++) {
    const v = new THREE.Vector3().fromBufferAttribute(pebblePositions, i);
    v.multiplyScalar(1 + .18 * Math.sin(v.x * 6.1 + v.z * 4.7) + .1 * Math.sin(v.y * 8.3));
    pebblePositions.setXYZ(i, v.x, v.y * .78, v.z);
  }
  pebbleGeometry.computeVertexNormals();
  track(pebbleGeometry);

  const pebbleSpots: { x: number; z: number; s: number; flat: number }[] = [];
  const clearOfBuild = (x: number, z: number) => !(Math.abs(z) < .31 && x > -1.02 && x < 1.42);
  for (let i = 0; i < 5200; i++) {
    const x = (random() - .5) * 3.54, z = (random() - .5) * 1.36;
    if (!clearOfBuild(x, z)) continue;
    const s = .0022 + Math.pow(random(), 2.6) * .009;
    // A fresh bowl has no boulders in it, but it is not swept clean either: the
    // grit that fell back stays. Without it the interior reads as moulded clay,
    // because the small stones are what carry the surface's texture.
    if (inBowl(x, z) && s > .0055) continue;
    pebbleSpots.push({ x, z, s, flat: .45 + random() * .4 });
  }
  // Compacted clods: flattened lumps an order of magnitude larger, the "dirt"
  // between the stones.
  for (let i = 0; i < 320; i++) {
    const x = (random() - .5) * 3.5, z = (random() - .5) * 1.36;
    if (!clearOfBuild(x, z) || inBowl(x, z)) continue;
    pebbleSpots.push({ x, z, s: .012 + random() * .022, flat: .22 + random() * .18 });
  }
  const pebbles = new THREE.InstancedMesh(pebbleGeometry, boulderMaterial, pebbleSpots.length);
  pebbles.name = 'LunarPebbles';
  pebbles.castShadow = true; pebbles.receiveShadow = true;
  pebbleSpots.forEach((spot, i) => {
    // Sink most of the stone: a sphere resting on the surface reads as a marble,
    // a sphere half buried reads as a clast in dust.
    pos.set(spot.x, lunarHeight(spot.x, spot.z) + spot.s * spot.flat * .35, spot.z);
    quaternion.setFromEuler(new THREE.Euler((random() - .5) * .5, random() * Math.PI * 2, (random() - .5) * .5));
    scale.set(spot.s, spot.s * spot.flat, spot.s * (.8 + random() * .4));
    matrix.compose(pos, quaternion, scale);
    pebbles.setMatrixAt(i, matrix);
    // Slightly darker than the placed boulders: they sit in the dust, not on it.
    pebbles.setColorAt(i, color.set(VARIANTS.boulder[i % VARIANTS.boulder.length]).multiplyScalar(.78 + random() * .16));
  });
  root.add(pebbles);

  // ---- habitat module ---------------------------------------------------
  // Authored in Blender (scripts/blender/author-lunar-base.py): three hull bays
  // with recessed seams, a bolted hatch, radiators, tanks and a mast. Falls back
  // to nothing if the asset is missing, which is why the study still builds.
  /** East extent of the authored module (docs/assets.md): the mesh is centred on
   * its own origin and its docking collar reaches 0.253 along +X — further than
   * `SITE.habitat.length / 2`, which is why the corridor is measured from here. */
  const HABITAT_EAST = .253;
  const habitat = new THREE.Group();
  habitat.name = 'LunarHabitat';
  habitat.position.set(SITE.habitat.x, LUNAR.pad + SITE.habitat.radius, SITE.habitat.z);
  const glowHold: { material: THREE.MeshStandardMaterial | null } = { material: null };
  if (assets.habitat) {
    const module = assets.habitat.clone(true);
    module.name = 'LunarHabitatModule';
    module.traverse(object => {
      if (object instanceof THREE.Mesh) {
        object.castShadow = true; object.receiveShadow = true;
        const material = object.material as THREE.MeshStandardMaterial;
        if (material?.name === 'HabitatWindowGlow') glowHold.material = material;
      }
    });
    habitat.add(module);
  }
  root.add(habitat);

  // ---- airlock and its door --------------------------------------------
  // The corridor bridges two hard points: the docking collar on the module and
  // the greenhouse end wall. It used to be a fixed 0.2-long tube placed by eye,
  // which left a 4.7 cm gap behind it and 11 cm in front — at the default camera
  // distance that reads as a part that fell off.
  const airlock = new THREE.Group();
  airlock.name = 'LunarAirlock';
  const corridorStart = SITE.habitat.x + HABITAT_EAST;
  const corridorEnd = SITE.greenhouse.x - SITE.greenhouse.length / 2;
  const corridorLength = corridorEnd - corridorStart;
  const airlockY = LUNAR.pad + SITE.habitat.radius;
  airlock.position.set((corridorStart + corridorEnd) / 2, airlockY, SITE.airlock.z);
  const tube = mesh(new THREE.CylinderGeometry(.096, .096, corridorLength, 28), m.hullWarm);
  tube.rotation.z = Math.PI / 2;
  airlock.add(tube);
  // Corrugation: two ribs break up an otherwise perfectly smooth pipe.
  for (const t of [-.28, .12]) {
    const rib = mesh(new THREE.TorusGeometry(.099, .006, 6, 24), m.trim);
    rib.rotation.y = Math.PI / 2;
    rib.position.x = corridorLength * t;
    airlock.add(rib);
  }
  const collar = mesh(new THREE.TorusGeometry(.1, .009, 6, 28), m.trim);
  collar.rotation.y = Math.PI / 2;
  collar.position.x = -corridorLength / 2 + .008;
  airlock.add(collar);
  const doorFrame = mesh(new THREE.BoxGeometry(.02, .17, .17), m.trim);
  doorFrame.position.set(corridorLength / 2 + .006, 0, 0);
  airlock.add(doorFrame);
  // Door leaves slide apart along Z.
  const doors = { left: new THREE.Group(), right: new THREE.Group() };
  for (const side of ['left', 'right'] as const) {
    const sign = side === 'left' ? -1 : 1;
    const leaf = mesh(new THREE.BoxGeometry(.012, .15, .072), m.hull);
    leaf.position.z = sign * .037;
    doors[side].add(leaf);
    const handle = mesh(new THREE.BoxGeometry(.014, .028, .006), m.metal);
    handle.position.set(.008, 0, sign * .06);
    doors[side].add(handle);
    doors[side].position.set(corridorLength / 2 + .016, 0, 0);
    airlock.add(doors[side]);
  }
  // The door sits between two modules, so a click almost always lands on the
  // habitat or the greenhouse behind it. An invisible proxy gives the hatch a
  // reliable target.
  const doorHit = new THREE.Mesh(
    new THREE.BoxGeometry(corridorLength + .06, .24, .24),
    new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }),
  );
  doorHit.name = 'LunarAirlock';
  doorHit.position.set(0, 0, 0);
  airlock.add(doorHit);
  const doorGlow = mesh(new THREE.PlaneGeometry(.06, .13), m.lamp.clone());
  doorGlow.material = (doorGlow.material as THREE.MeshStandardMaterial);
  (doorGlow.material as THREE.MeshStandardMaterial).emissiveIntensity = 0;
  doorGlow.position.set(corridorLength / 2 + .022, 0, 0);
  doorGlow.rotation.y = Math.PI / 2;
  airlock.add(doorGlow);
  root.add(airlock);

  // ---- greenhouse -------------------------------------------------------
  const greenhouse = new THREE.Group();
  greenhouse.name = 'LunarGreenhouseShell';
  const gh = SITE.greenhouse;
  greenhouse.position.set(gh.x, LUNAR.pad, gh.z);
  const plinth = mesh(new THREE.BoxGeometry(gh.length + .06, gh.plinth, gh.radius * 2 + .06), m.concrete);
  plinth.position.y = gh.plinth / 2;
  greenhouse.add(plinth);
  // Glass shell and frame ribs.
  const shellGlass = mesh(vaultGeometry(gh.radius, gh.length), m.glass, 'LunarGreenhouseGlass');
  shellGlass.position.y = gh.plinth;
  shellGlass.castShadow = false;
  greenhouse.add(shellGlass);
  const ribs = Math.round(gh.length / .13);
  for (let i = 0; i <= ribs; i++) {
    const rib = mesh(new THREE.TorusGeometry(gh.radius + .002, .0038, 5, 28, Math.PI), m.metal);
    rib.rotation.y = Math.PI / 2;
    rib.position.set(-gh.length / 2 + (gh.length * i) / ribs, gh.plinth, 0);
    greenhouse.add(rib);
  }
  for (const angle of [0, .42, .78, Math.PI / 2]) {
    for (const sign of angle === Math.PI / 2 ? [1] : [-1, 1]) {
      const a = angle * sign;
      const beam = mesh(new THREE.BoxGeometry(gh.length, .006, .006), m.metal);
      beam.position.set(0, gh.plinth + Math.sin(a) * (gh.radius + .001), Math.cos(a) * (gh.radius + .001));
      greenhouse.add(beam);
    }
  }
  // End walls: a glazed gable each side, so the vault reads as closed.
  for (const sign of [-1, 1]) {
    const wall = mesh(vaultGeometry(gh.radius, .012, 26, 1), m.glassRoof);
    wall.rotation.y = Math.PI / 2;
    wall.position.set(sign * (gh.length / 2 - .006), gh.plinth, 0);
    greenhouse.add(wall);
  }
  // Beds and plants.
  const beds = new THREE.Group();
  beds.name = 'LunarPlantBeds';
  const plantGeo = plantGeometry();
  track(plantGeo);
  const growBarMaterials: THREE.MeshStandardMaterial[] = [];
  const plants = new THREE.Group();
  plants.name = 'LunarPlants';
  const leafMaterials = [m.leafA, m.leafB, m.leafC];

  // Crops authored in Blender (scripts/blender/author-lunar-crops.py): a lettuce
  // rosette, a staked vine and a herb tuft, each as a leaf part plus a stem part.
  // Instancing keeps ~80 plants inside six draw calls; the previous version
  // spawned one Mesh per plant and one blade-cluster geometry for all of them,
  // which is why every bed looked like the same grass.
  const cropSource = (name: string) => {
    const source = assets.crops?.getObjectByName(name) as THREE.Mesh | undefined;
    return source ? { geometry: source.geometry as THREE.BufferGeometry, material: source.material as THREE.Material } : null;
  };
  const CROP_HEIGHT = { Leafy: .42, Stalk: .78, Herb: .44 } as const;
  type CropKind = keyof typeof CROP_HEIGHT;
  const cropPalette = ['#ffffff', '#e6f0d8', '#d2e2c2', '#f2f7e8'];
  const placed: { kind: CropKind; matrix: THREE.Matrix4; tint: number }[] = [];
  const place = (kind: CropKind, x: number, y: number, z: number, height: number) => {
    const size = height / CROP_HEIGHT[kind] * (.92 + random() * .16);
    matrix.compose(
      pos.set(x, y, z),
      quaternion.setFromEuler(new THREE.Euler(0, random() * Math.PI * 2, 0)),
      scale.set(size * (.92 + random() * .16), size, size * (.92 + random() * .16)),
    );
    placed.push({ kind, matrix: matrix.clone(), tint: Math.floor(random() * cropPalette.length) });
  };

  for (const side of [-1, 1]) {
    const bed = mesh(new THREE.BoxGeometry(gh.length - .08, .042, .1), m.bed);
    bed.position.set(0, gh.plinth + .021, side * .105);
    beds.add(bed);
    const soil = mesh(new THREE.BoxGeometry(gh.length - .1, .01, .082), m.soil);
    soil.position.set(0, gh.plinth + .042, side * .105);
    beds.add(soil);
    // Two crops per bed: a low row that reads as produce, and a staked row that
    // reaches up the glazing, which is what makes a greenhouse read as one.
    for (let i = 0; i < 24; i++) {
      const step = (gh.length - .14) / 24;
      const x = -(gh.length - .14) / 2 + step * (i + .5);
      const kind: CropKind = i % 3 === 2 ? 'Herb' : 'Leafy';
      place(kind, x + (random() - .5) * .01, gh.plinth + .044, side * .105 + (random() - .5) * .03,
        kind === 'Herb' ? .058 : .052);
    }
    for (let i = 0; i < 9; i++) {
      const step = (gh.length - .2) / 9;
      const x = -(gh.length - .2) / 2 + step * (i + .5);
      place('Stalk', x + (random() - .5) * .014, gh.plinth + .044, side * .105 + (random() - .5) * .026, .105);
    }
    // Trellis wires the staked row climbs on.
    for (const h of [.09, .14]) {
      const wire = mesh(new THREE.BoxGeometry(gh.length - .14, .0022, .0022), m.metal);
      wire.position.set(0, gh.plinth + h, side * .105);
      beds.add(wire);
    }
    // One grow bar per bed. Its material is animated with the interior level, so
    // it is a clone we keep a handle on.
    const barMaterial = m.lamp.clone();
    barMaterial.emissiveIntensity = .22;
    const bar = mesh(new THREE.BoxGeometry(gh.length - .16, .0035, .007), barMaterial);
    bar.position.set(0, gh.plinth + gh.radius * .58, side * .06);
    beds.add(bar);
    growBarMaterials.push(barMaterial);
  }

  for (const kind of Object.keys(CROP_HEIGHT) as CropKind[]) {
    const items = placed.filter(item => item.kind === kind);
    if (!items.length) continue;
    for (const suffix of ['Leaf', 'Stem']) {
      const part = cropSource(`Crop${kind}_${suffix}`);
      if (!part) continue;
      const instanced = new THREE.InstancedMesh(part.geometry, part.material, items.length);
      instanced.name = `LunarCrop${kind}${suffix}`;
      instanced.castShadow = true;
      instanced.receiveShadow = true;
      items.forEach((item, i) => {
        instanced.setMatrixAt(i, item.matrix);
        instanced.setColorAt(i, color.set(cropPalette[item.tint]));
      });
      plants.add(instanced);
    }
  }

  // Hanging vines break the ridge line.
  for (let i = 0; i < 7; i++) {
    const x = -(gh.length - .2) / 2 + random() * (gh.length - .2);
    const vine = new THREE.Mesh(plantGeo, leafMaterials[i % 3]);
    const s0 = .012 + random() * .008;
    vine.scale.set(s0, s0 * 2.6, s0);
    vine.position.set(x, gh.plinth + gh.radius - .08, (random() - .5) * .12);
    plants.add(vine);
  }
  greenhouse.add(beds, plants);
  // Hanging lamps along the ridge.
  const lampGroup = new THREE.Group();
  for (const x of [-.28, 0, .28]) {
    const cord = mesh(new THREE.CylinderGeometry(.0025, .0025, .06, 5), m.darkMetal);
    cord.position.set(x, gh.plinth + gh.radius - .03, 0);
    lampGroup.add(cord);
    const shade = mesh(new THREE.ConeGeometry(.03, .022, 14, 1, true), m.hullWarm);
    shade.position.set(x, gh.plinth + gh.radius - .072, 0);
    shade.rotation.x = Math.PI;
    lampGroup.add(shade);
    const bulb = mesh(new THREE.SphereGeometry(.011, 10, 8), m.lamp);
    bulb.position.set(x, gh.plinth + gh.radius - .082, 0);
    lampGroup.add(bulb);
  }
  greenhouse.add(lampGroup);
  root.add(greenhouse);

  // ---- solar array ------------------------------------------------------
  const panels = new THREE.Group();
  panels.name = 'LunarSolarArray';
  // On the terrain, not on the pad: the array stands outside the flattened
  // area, and at pad height its junction box sat 5 cm under the dust.
  panels.position.set(SITE.solar.x, lunarHeight(SITE.solar.x, SITE.solar.z), SITE.solar.z);
  // A cast base plate so the mast does not look like it is hovering: on rough
  // ground the thin pylon alone gave no contact.
  const footing = mesh(new THREE.CylinderGeometry(.034, .042, .018, 12), m.concrete);
  footing.position.y = .009;
  panels.add(footing);
  // Taller than a panel lying on the ground: at the key's scale a flat array
  // reads as a puddle of dark blue. Standing it up on a mast gives it a
  // silhouette and a shadow, which is the only thing that makes it legible.
  const pylon = mesh(new THREE.CylinderGeometry(.009, .013, .26, 8), m.metal);
  pylon.position.y = .14;
  panels.add(pylon);
  const arm = mesh(new THREE.BoxGeometry(.05, .012, .34), m.darkMetal);
  arm.position.y = .268;
  panels.add(arm);
  const junction = mesh(new THREE.BoxGeometry(.05, .04, .045), m.hullWarm);
  junction.position.set(.05, .05, .06);
  panels.add(junction);
  for (const side of [-1, 1]) {
    const frame = mesh(new THREE.BoxGeometry(.34, .008, .18), m.darkMetal);
    frame.position.set(0, .282, side * .13);
    frame.rotation.x = side * .38;
    panels.add(frame);
    const cells = mesh(new THREE.BoxGeometry(.325, .004, .166), m.panel);
    cells.position.set(0, .288, side * .13);
    cells.rotation.x = side * .38;
    panels.add(cells);
    const strut = mesh(new THREE.BoxGeometry(.012, .012, .10), m.metal);
    strut.position.set(0, .245, side * .085);
    strut.rotation.x = side * .38;
    panels.add(strut);
  }
  root.add(panels);

  // ---- walkway, steps and railing --------------------------------------
  const walkway = new THREE.Group();
  walkway.name = 'LunarWalkway';
  const deckZ = gh.z + gh.radius + .1;
  const deck = mesh(new THREE.BoxGeometry(gh.length - .02, .016, .1), m.trim);
  deck.position.set(gh.x, LUNAR.pad + .05, deckZ);
  walkway.add(deck);
  for (let i = 0; i < 10; i++) {
    const x = gh.x - (gh.length - .06) / 2 + ((gh.length - .06) * i) / 9;
    const post = mesh(new THREE.CylinderGeometry(.0035, .0035, .062, 5), m.metal);
    post.position.set(x, LUNAR.pad + .081, deckZ + .042);
    walkway.add(post);
  }
  const rail = mesh(new THREE.BoxGeometry(gh.length - .02, .005, .005), m.metal);
  rail.position.set(gh.x, LUNAR.pad + .112, deckZ + .042);
  walkway.add(rail);
  // Steps down at the east end.
  for (let i = 0; i < 4; i++) {
    const step = mesh(new THREE.BoxGeometry(.075, .016, .1), m.trim);
    step.position.set(gh.x + gh.length / 2 + .04 + i * .07, LUNAR.pad + .04 - i * .018, deckZ);
    walkway.add(step);
  }
  root.add(walkway);

  // ---- interior light ---------------------------------------------------
  const interiorLights = [
    new THREE.PointLight('#ffc487', 0, .55, 2),
    new THREE.PointLight('#ffc487', 0, .55, 2),
  ];
  interiorLights[0].position.set(gh.x - .2, LUNAR.pad + gh.plinth + .14, gh.z);
  interiorLights[1].position.set(gh.x + .2, LUNAR.pad + gh.plinth + .14, gh.z);
  interiorLights.forEach(l => root.add(l));

  // The authored module carries its own emissive window material; if it is
  // missing, a stand-in keeps the frame animation code working.
  const windowMaterial = glowHold.material ?? new THREE.MeshStandardMaterial({ color: '#3d372f', emissive: '#ffc27a', emissiveIntensity: 0 });
  const lampMaterial = m.lamp;

  return {
    root,
    footprint: outline,
    windowMaterial,
    lampMaterial,
    doorLight: doorGlow.material as THREE.MeshStandardMaterial,
    habitatGlow: glowHold.material,
    doors,
    interiorLights,
    growBars: growBarMaterials,
    plants,
    panels,
    dispose() {
      geometries.forEach(g => g.dispose());
      own.dispose();
      regolithMaterial.dispose();
      boulderMaterial.dispose();
      (doorGlow.material as THREE.Material).dispose();
      doorHit.geometry.dispose();
      (doorHit.material as THREE.Material).dispose();
      plantGeo.dispose();
    },
  };
}
