import * as THREE from 'three';
import { LUNAR, SITE, lunarHeight, roundedRectPoint, spacebarOutline } from './lunar-layout';
import { makeLunarMaterials, type LunarMaterials } from './lunar-materials';
import { seeded } from './coastal-materials';

type Quality = 'full' | 'software';

const VARIANTS = {
  regolith: ['#adaba6', '#a4a19c', '#b6b3ad', '#9b9893'],
  boulder: ['#a3a09a', '#94918c', '#b0ada7', '#8a8782'],
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

/** A quiet plant: three overlapping blobs, no texture, read as mass at this
 * scale. Kept as a shared geometry and instanced per bed. */
function plantGeometry() {
  const parts: THREE.BufferGeometry[] = [];
  const random = seeded(77);
  for (let i = 0; i < 3; i++) {
    const g = new THREE.IcosahedronGeometry(1, 1);
    g.scale(.9 + random() * .3, .7 + random() * .35, .9 + random() * .3);
    g.translate((random() - .5) * .9, .5 + random() * .5, (random() - .5) * .9);
    parts.push(g);
  }
  const merged = mergeGeometries(parts);
  parts.forEach(p => p.dispose());
  return merged;
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

export function createLunarBase(time: { value: number }, quality: Quality = 'full', assets: { habitat?: THREE.Object3D } = {}): LunarBase {
  const root = new THREE.Group();
  root.name = 'LunarGreenhouse';
  root.rotation.y = LUNAR.rotation;
  const own = makeLunarMaterials(quality);
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
  const segX = quality === 'full' ? 300 : 170, segZ = quality === 'full' ? 120 : 70;
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
    const shade = .96 + .05 * Math.sin(x * 21 + z * 17) - craterDepth(h) * 2.6;
    const base = palette[i % palette.length];
    const c = base.clone().multiplyScalar(Math.max(.46, Math.min(1.02, shade)));
    colors.push(c.r, c.g, c.b);
  }
  plane.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  plane.computeVertexNormals();
  const regolithMaterial = m.regolith.clone();
  regolithMaterial.vertexColors = true;
  regolithMaterial.color.set('#ffffff');
  const terrain = mesh(plane, regolithMaterial, 'LunarTerrain');
  terrain.receiveShadow = true; terrain.castShadow = false;
  root.add(terrain);

  // ---- scattered rock ---------------------------------------------------
  const boulderGeometry = new THREE.IcosahedronGeometry(1, 2);
  const boulderPositions = boulderGeometry.attributes.position;
  for (let i = 0; i < boulderPositions.count; i++) {
    const v = new THREE.Vector3().fromBufferAttribute(boulderPositions, i);
    const n = 1 + .22 * Math.sin(v.x * 5.3 + v.z * 4.1) + .14 * Math.sin(v.y * 7.7);
    v.multiplyScalar(n);
    boulderPositions.setXYZ(i, v.x, v.y * .72, v.z);
  }
  boulderGeometry.computeVertexNormals();
  track(boulderGeometry);
  // Instanced tint comes from `instanceColor`; enabling vertexColors here would
  // look for a colour attribute the boulder geometry does not have and render
  // the whole field black.
  const boulderMaterial = m.boulder.clone();
  boulderMaterial.color.set('#ffffff');

  const boulderSpots: { x: number; z: number; s: number }[] = [];
  for (let i = 0; i < 46; i++) {
    const angle = random() * Math.PI * 2;
    const rx = LUNAR.halfWidth - .09, rz = LUNAR.halfDepth - .07;
    const x = Math.cos(angle) * rx * (.72 + random() * .26);
    const z = Math.sin(angle) * rz * (.7 + random() * .28);
    if (Math.abs(z) < .42 && x > -1.05 && x < 1.35) continue;
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

  // Pebbles: the crater rims and the open regolith are covered in them at this
  // scale, and they are the cheapest way to stop the surface looking like clay.
  const pebbleSpots: { x: number; z: number; s: number }[] = [];
  for (let i = 0; i < 320; i++) {
    const x = (random() - .5) * 3.5, z = (random() - .5) * 1.32;
    if (Math.abs(z) < .34 && x > -.95 && x < 1.35) continue;
    pebbleSpots.push({ x, z, s: .006 + random() * .016 });
  }
  const pebbles = new THREE.InstancedMesh(boulderGeometry, boulderMaterial, pebbleSpots.length);
  pebbles.name = 'LunarPebbles';
  pebbles.castShadow = true; pebbles.receiveShadow = true;
  pebbleSpots.forEach((spot, i) => {
    pos.set(spot.x, lunarHeight(spot.x, spot.z) + spot.s * .3, spot.z);
    quaternion.setFromEuler(new THREE.Euler(random() * .8, random() * Math.PI * 2, random() * .6));
    scale.set(spot.s, spot.s * (.5 + random() * .4), spot.s * (.8 + random() * .4));
    matrix.compose(pos, quaternion, scale);
    pebbles.setMatrixAt(i, matrix);
    pebbles.setColorAt(i, color.set(VARIANTS.boulder[i % VARIANTS.boulder.length]));
  });
  root.add(pebbles);

  // ---- habitat module ---------------------------------------------------
  // Authored in Blender (scripts/blender/author-lunar-base.py): three hull bays
  // with recessed seams, a bolted hatch, radiators, tanks and a mast. Falls back
  // to nothing if the asset is missing, which is why the study still builds.
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
  const airlock = new THREE.Group();
  airlock.name = 'LunarAirlock';
  airlock.position.set(SITE.airlock.x, LUNAR.pad + SITE.habitat.radius, SITE.airlock.z);
  const tube = mesh(new THREE.CylinderGeometry(.082, .082, .2, 24), m.hullWarm);
  tube.rotation.z = Math.PI / 2;
  airlock.add(tube);
  const ring = mesh(new THREE.TorusGeometry(.086, .008, 6, 24), m.trim);
  ring.rotation.y = Math.PI / 2;
  ring.position.x = -.1;
  airlock.add(ring);
  const doorFrame = mesh(new THREE.BoxGeometry(.02, .15, .15), m.trim);
  doorFrame.position.set(.102, 0, 0);
  airlock.add(doorFrame);
  // Door leaves slide apart along Z.
  const doors = { left: new THREE.Group(), right: new THREE.Group() };
  for (const side of ['left', 'right'] as const) {
    const sign = side === 'left' ? -1 : 1;
    const leaf = mesh(new THREE.BoxGeometry(.012, .128, .062), m.hull);
    leaf.position.z = sign * .032;
    doors[side].add(leaf);
    const handle = mesh(new THREE.BoxGeometry(.014, .026, .006), m.metal);
    handle.position.set(.008, 0, sign * .052);
    doors[side].add(handle);
    doors[side].position.set(.106, 0, 0);
    airlock.add(doors[side]);
  }
  // The door sits in a recess between two modules, so a click almost always
  // lands on the habitat or the greenhouse behind it. An invisible proxy gives
  // the hatch a reliable target.
  const doorHit = new THREE.Mesh(
    new THREE.BoxGeometry(.16, .2, .2),
    new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }),
  );
  doorHit.name = 'LunarAirlock';
  doorHit.position.set(.02, 0, 0);
  airlock.add(doorHit);
  const doorGlow = mesh(new THREE.PlaneGeometry(.052, .11), m.lamp.clone());
  doorGlow.material = (doorGlow.material as THREE.MeshStandardMaterial);
  (doorGlow.material as THREE.MeshStandardMaterial).emissiveIntensity = 0;
  doorGlow.position.set(.108, 0, 0);
  doorGlow.rotation.y = Math.PI / 2;
  airlock.add(doorGlow);
  root.add(airlock);

  // ---- greenhouse -------------------------------------------------------
  const greenhouse = new THREE.Group();
  greenhouse.name = 'LunarGreenhouseShell';
  const gh = SITE.greenhouse;
  greenhouse.position.set(gh.x, LUNAR.pad, gh.z);
  const plinth = mesh(new THREE.BoxGeometry(gh.length + .06, gh.plinth, gh.radius * 2 + .06), m.bed);
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
  for (const side of [-1, 1]) {
    const bed = mesh(new THREE.BoxGeometry(gh.length - .08, .042, .1), m.bed);
    bed.position.set(0, gh.plinth + .021, side * .105);
    beds.add(bed);
    const soil = mesh(new THREE.BoxGeometry(gh.length - .1, .01, .082), m.soil);
    soil.position.set(0, gh.plinth + .042, side * .105);
    beds.add(soil);
    // Two heights of planting: a low crop and a taller row that reaches up the
    // glazing, which is what makes a greenhouse read as one.
    const rows = [{ count: 20, size: [.013, .022], y: .046 }, { count: 9, size: [.026, .05], y: .046, tall: true }];
    for (const row of rows) for (let i = 0; i < row.count; i++) {
      const step = (gh.length - .12) / row.count;
      const x = -(gh.length - .12) / 2 + step * (i + .5) + (row.tall ? step * .4 : 0);
      const plant = new THREE.Mesh(plantGeo, leafMaterials[(i + (side > 0 ? 1 : 0) + (i % 2)) % 3]);
      const s0 = row.size[0] + random() * (row.size[1] - row.size[0]);
      plant.scale.set(s0, s0 * (row.tall ? 2.4 : .8 + random() * .8), s0);
      plant.position.set(x + (random() - .5) * .012, gh.plinth + row.y, side * .105 + (random() - .5) * .028);
      plant.rotation.y = random() * Math.PI * 2;
      plant.castShadow = true;
      plants.add(plant);
    }
    // Trellis wires the tall row climbs on.
    for (const h of [.09, .14]) {
      const wire = mesh(new THREE.BoxGeometry(gh.length - .14, .0022, .0022), m.metal);
      wire.position.set(0, gh.plinth + h, side * .105);
      beds.add(wire);
    }
    // One grow bar per bed. Its material is animated with the interior level, so
    // it is a clone we keep a handle on.
    const barMaterial = m.lamp.clone();
    barMaterial.emissiveIntensity = .3;
    const bar = mesh(new THREE.BoxGeometry(gh.length - .16, .006, .01), barMaterial);
    bar.position.set(0, gh.plinth + gh.radius - .05, side * .07);
    beds.add(bar);
    growBarMaterials.push(barMaterial);
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
  panels.position.set(SITE.solar.x, LUNAR.pad, SITE.solar.z);
  const pylon = mesh(new THREE.CylinderGeometry(.008, .012, .17, 8), m.metal);
  pylon.position.y = .085;
  panels.add(pylon);
  const arm = mesh(new THREE.BoxGeometry(.05, .012, .30), m.darkMetal);
  arm.position.y = .17;
  panels.add(arm);
  const junction = mesh(new THREE.BoxGeometry(.05, .035, .04), m.hullWarm);
  junction.position.set(.04, .05, .05);
  panels.add(junction);
  for (const side of [-1, 1]) {
    const frame = mesh(new THREE.BoxGeometry(.30, .008, .16), m.darkMetal);
    frame.position.set(0, .19, side * .12);
    frame.rotation.x = side * .42;
    panels.add(frame);
    const cells = mesh(new THREE.BoxGeometry(.285, .004, .146), m.panel);
    cells.position.set(0, .196, side * .12);
    cells.rotation.x = side * .42;
    panels.add(cells);
    const strut = mesh(new THREE.BoxGeometry(.012, .012, .09), m.metal);
    strut.position.set(0, .155, side * .075);
    strut.rotation.x = side * .42;
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
