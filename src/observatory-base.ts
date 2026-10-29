import * as THREE from 'three';
import { OBS, SITE, bridgePath, observatoryHeight, observatoryInset, observatorySurfaceHeight, outlinePoint } from './observatory-layout';
import { groundMaps, plasterMaps, plasticGrain, rockGeometry } from './observatory-materials';
import { createDustLayers, createWindUniforms, windify, type WindUniforms } from './observatory-wind';
import { noise2 } from './lunar-layout';
import { seeded } from './coastal-materials';

type Quality = 'full' | 'software';

/** Blender-authored parts loaded from `public/models/observatory/observatory.glb`.
 * The dome halves, telescope and duty room are replaced by these when present;
 * the terrain, keycap, bridge, stair, trees and lamps stay procedural because
 * they need parameter tuning, not baked detail. */
export type ObservatoryAssets = {
  domeEast?: THREE.Object3D;
  domeWest?: THREE.Object3D;
  telescopeFork?: THREE.Object3D;
  telescopeTube?: THREE.Object3D;
  dutyRoom?: THREE.Object3D;
  /** Blender-authored alpine flora (scripts/blender/author-alpine-flora.py). */
  tussock?: THREE.Object3D;
  juniper?: THREE.Object3D;
  pine?: THREE.Object3D;
};

export type ObservatoryBase = {
  root: THREE.Group;
  /** Two dome pivots: slide groups at the drum axis, east and west. */
  domeHalves: THREE.Group[];
  telescopeFork: THREE.Group;
  telescopeTube: THREE.Group;
  /** Window pane and lamp glass: driven by the duty-room lamp state. */
  windowMaterial: THREE.MeshStandardMaterial;
  lampMaterial: THREE.MeshStandardMaterial;
  /** Glow materials found on the Blender duty-room asset (QDutyGlow). */
  glowMaterials: THREE.MeshStandardMaterial[];
  /** Red apex beacon, pulsed at night. It rides the closed dome, so the frame
   * loop hides it while the shell is open — a lamp floating over an empty slit
   * is the first thing the eye finds. */
  beaconMaterial: THREE.MeshStandardMaterial;
  beacon: THREE.Object3D;
  beaconLight: THREE.PointLight;
  /** The rusted barrel, toppled on click. */
  barrel: THREE.Object3D | null;
  /** The water cistern, drips on click. */
  cistern: THREE.Object3D | null;
  lamps: THREE.PointLight[];
  /** Terrain mesh, so the dust sheet can reuse its exact surface. */
  terrain: THREE.Mesh;
  /** Shared clock and gain for every wind-driven thing on the key. */
  wind: WindUniforms;
  dispose: () => void;
};

const PALETTE = {
  plaster: '#ded8c8',
  plasterShadow: '#c9c2b1',
  copper: '#7a5334',
  iron: '#5a5550',
  brass: '#a4823f',
  slate: '#4a5054',
  glass: '#0e1720',
  wood: '#6b4a30',
  rock: '#6d6a63',
  rockLight: '#938e80',
  cap: '#efe9dc',
  capTrim: '#ded7c6',
  warm: '#ffb45e',
};

function material(color: string, roughness: number, metalness = 0) {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness });
}

export function createObservatoryBase(quality: Quality = 'full', assets: ObservatoryAssets = {}): ObservatoryBase {
  const root = new THREE.Group();
  root.name = 'ObservatoryStudy';
  root.rotation.y = OBS.rotation;

  const geometries: THREE.BufferGeometry[] = [];
  const materials: THREE.Material[] = [];
  const textures: THREE.Texture[] = [];
  const wind = createWindUniforms();
  let terrainMesh: THREE.Mesh | null = null;
  const track = <T extends THREE.BufferGeometry>(geometry: T) => { geometries.push(geometry); return geometry; };
  const own = <T extends THREE.Material>(m: T) => { materials.push(m); return m; };

  const m = {
    plaster: own(material(PALETTE.plaster, .88)),
    plasterShadow: own(material(PALETTE.plasterShadow, .92)),
    copper: own(material(PALETTE.copper, .52, .65)),
    iron: own(material(PALETTE.iron, .72, .45)),
    brass: own(material(PALETTE.brass, .38, .8)),
    slate: own(material(PALETTE.slate, .8, .05)),
    glass: own(new THREE.MeshStandardMaterial({ color: PALETTE.glass, roughness: .12, metalness: .35, side: THREE.DoubleSide })),
    wood: own(material(PALETTE.wood, .75)),
    rock: own(material(PALETTE.rock, .92)),
    capTrim: own(material(PALETTE.capTrim, .74)),
    bridgeStone: own(material('#96907f', .88)),
    window: own(new THREE.MeshStandardMaterial({ color: '#3a2c1c', emissive: new THREE.Color(PALETTE.warm), emissiveIntensity: .1, roughness: .5 })),
    lamp: own(new THREE.MeshStandardMaterial({ color: '#4c4335', emissive: new THREE.Color('#ffbd73'), emissiveIntensity: 0, roughness: .5 })),
  };

  // One tile serves the ground; the stonework takes a clone at its own repeat
  // so a metre of parapet and a metre of soil do not share a grain scale.
  const ground = groundMaps(quality);
  textures.push(ground.map, ground.normal, ground.rough);
  const stoneGrain = ground.normal.clone();
  stoneGrain.repeat.set(1.4, 1.4);
  stoneGrain.needsUpdate = true;
  textures.push(stoneGrain);
  for (const stone of [m.bridgeStone, m.rock]) {
    stone.normalMap = stoneGrain;
    stone.normalScale = new THREE.Vector2(.85, .85);
    stone.roughness = .92;
  }
  // The drum is the biggest surface on the key, so it gets its own render maps;
  // the trim bands reuse the normal at a tighter repeat instead of a second bake.
  const plaster = plasterMaps(quality);
  textures.push(plaster.map, plaster.normal, plaster.rough);
  const trimGrain = plaster.normal.clone();
  trimGrain.repeat.set(6, 6);
  trimGrain.needsUpdate = true;
  textures.push(trimGrain);
  m.plasterShadow.normalMap = trimGrain;
  m.plasterShadow.normalScale = new THREE.Vector2(.6, .6);

  const add = (geometry: THREE.BufferGeometry, material: THREE.Material, name?: string) => {
    track(geometry);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = true; mesh.receiveShadow = true;
    if (name) mesh.name = name;
    root.add(mesh);
    return mesh;
  };
  const put = (parent: THREE.Object3D, geometry: THREE.BufferGeometry, material: THREE.Material, name?: string) => {
    track(geometry);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = true; mesh.receiveShadow = true;
    if (name) mesh.name = name;
    parent.add(mesh);
    return mesh;
  };

  // ---- keycap body ------------------------------------------------------
  // Open shell again: an extruded prism would cap the top and that lid would
  // show through the gorge as a pale floor.
  const segX = quality === 'full' ? 260 : 120, segZ = quality === 'full' ? 196 : 88;
  const grain = plasticGrain(quality === 'full' ? 256 : 128);
  textures.push(grain);
  // Match the terrain grid's actual boundary, including rounded-corner samples.
  const outline:THREE.Vector2[]=[];
  const edge=(x:number,z:number)=>{const p=outlinePoint(x,z);outline.push(new THREE.Vector2(...p));};
  for(let i=0;i<segZ;i++)edge(OBS.halfWidth,-OBS.halfDepth+2*OBS.halfDepth*i/segZ);
  for(let i=0;i<segX;i++)edge(OBS.halfWidth-2*OBS.halfWidth*i/segX,OBS.halfDepth);
  for(let i=0;i<segZ;i++)edge(-OBS.halfWidth,OBS.halfDepth-2*OBS.halfDepth*i/segZ);
  for(let i=0;i<segX;i++)edge(-OBS.halfWidth+2*OBS.halfWidth*i/segX,-OBS.halfDepth);
  {
    const position: number[] = [], normal: number[] = [], uv: number[] = [], index: number[] = [], colors: number[] = [];
    let arc = 0;
    for (let i = 0; i < outline.length; i++) {
      const a = outline[i], b = outline[(i + 1) % outline.length];
      const dx = b.x - a.x, dz = b.y - a.y, len = Math.hypot(dx, dz) || 1;
      const nx = dz / len, nz = -dx / len;
      const base = position.length / 3;
      position.push(a.x, 0, a.y, b.x, 0, b.y, b.x, -OBS.base, b.y, a.x, -OBS.base, a.y);
      for (let k = 0; k < 4; k++) normal.push(nx, 0, nz);
      // UVs in world units, not per-quad: a per-quad 0..1 flattens a square
      // grain into a vertical smear on these thin, tall segments.
      uv.push(arc, 0, arc + len, 0, arc + len, OBS.base, arc, OBS.base);
      arc += len;
      // The wall falls off toward the ground: the top edge is the lit lip of
      // the cap and the bottom sits in its own shadow. Two values per quad
      // interpolate into a continuous band around the whole key.
      const top = 1.0, foot = .70;
      colors.push(top, top, top, top, top, top, foot, foot, foot, foot, foot, foot);
      index.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(position, 3));
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normal, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geometry.setIndex(index);
    const shellMaterial = own(new THREE.MeshStandardMaterial({
      color: PALETTE.cap, roughness: .8,
      // A hair of sideways grain: a vertical wall under one ambient term has no
      // shading gradient of its own, so a smooth one renders as a flat band.
      normalMap: grain, normalScale: new THREE.Vector2(.11, .11),
      vertexColors: true,
    }));
    add(geometry, shellMaterial, 'QKeycapBody');
  }
  {
    const bottom = track(new THREE.ShapeGeometry(new THREE.Shape(outline), 2));
    bottom.rotateX(Math.PI / 2);
    const mesh = add(bottom, m.capTrim, 'QKeycapBottom');
    mesh.position.y = -OBS.base;
  }

  // ---- terrain ----------------------------------------------------------
  // Three layers stacked: a tiled detail triple for the grain of the soil, a
  // vertex colour that carries the regions (bare rock, moss, silt, dust), and
  // the height field itself. Any one of them alone reads as clay.
  {
    const plane = track(new THREE.PlaneGeometry(OBS.halfWidth * 2, OBS.halfDepth * 2, segX, segZ));
    plane.rotateX(-Math.PI / 2);
    const position = plane.attributes.position;
    const colors: number[] = [];
    const soil = new THREE.Color('#756f61');
    const dust = new THREE.Color('#9a9280');
    const bare = new THREE.Color('#a29c8b');
    const moss = new THREE.Color('#5a6047');
    const silt = new THREE.Color('#4f4a3e');
    const c = new THREE.Color();
    const slopeAt = (x: number, z: number) => {
      const e = 0.035;
      const dx = observatorySurfaceHeight(x + e, z) - observatorySurfaceHeight(x - e, z);
      const dz = observatorySurfaceHeight(x, z + e) - observatorySurfaceHeight(x, z - e);
      return Math.hypot(dx, dz) / (2 * e);
    };
    for (let i = 0; i < position.count; i++) {
      const [x, z] = outlinePoint(position.getX(i), position.getZ(i));
      const h = observatorySurfaceHeight(x, z);
      position.setXYZ(i, x, h, z);

      const rise = h - OBS.pad;
      const slope = slopeAt(x, z);
      // Region weights. Patches are driven by noise, never by height alone:
      // a height-only ramp is exactly the gradient that made the old surface
      // read as a single moulded sheet.
      const region = noise2(x * 1.15 + 21.3, z * 1.15 - 12.7);
      const patch = noise2(x * 3.4 + 11.4, z * 3.4 - 6.1);
      const mottle = noise2(x * 9.5 - 4.2, z * 9.5 + 8.7);
      const steep = THREE.MathUtils.clamp((slope - 0.28) / 0.55, 0, 1);
      const hollow = THREE.MathUtils.clamp(1 - rise / 0.035, 0, 1);
      // Two fields on opposite sides of the same noise: a stony wash where the
      // region value runs high, and a mat of dry grass where it runs low.
      const scree = THREE.MathUtils.clamp((region - 0.02) / 0.26, 0, 1);
      const meadow = THREE.MathUtils.clamp((-region - 0.04) / 0.28, 0, 1);
      const green = meadow * (1 - steep) * THREE.MathUtils.clamp(1 - rise * 3.2, 0, 1);

      c.copy(soil);
      c.lerp(dust, THREE.MathUtils.clamp((rise + 0.05) / 0.22, 0, 1) * 0.45);
      c.lerp(bare, steep * 0.85 + scree * 0.35);
      c.lerp(moss, green * 0.6);
      c.lerp(silt, hollow * 0.55);
      // Gravel speckle: the detail map supplies the pattern, this just varies
      // how much of it lands on rock versus on dust.
      const fleck = (mottle * 0.45 + patch * 0.35 + 0.5) * 0.14;
      c.multiplyScalar(0.93 + fleck - hollow * 0.05);
      // Contact shading: the ground closes in around every footing.
      const dr = Math.hypot(x - SITE.drum.x, z - SITE.drum.z) - SITE.drum.radius;
      c.multiplyScalar(0.80 + 0.20 * THREE.MathUtils.clamp(dr / 0.22, 0, 1));
      const underBridge = THREE.MathUtils.clamp(
        1 - Math.hypot(x - (SITE.bridge.door.x + SITE.bridge.landing.x) / 2, z - (SITE.bridge.door.z + SITE.bridge.landing.z) / 2) / 0.30, 0, 1,
      );
      c.multiplyScalar(1 - underBridge * 0.24);
      colors.push(c.r, c.g, c.b);
    }
    plane.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    plane.computeVertexNormals();
    const terrainMaterial = own(new THREE.MeshStandardMaterial({
      color: '#ffffff',
      roughness: 1,
      vertexColors: true,
      map: ground.map,
      normalMap: ground.normal,
      normalScale: new THREE.Vector2(1.0, 1.0),
      roughnessMap: ground.rough,
    }));
    const terrain = add(plane, terrainMaterial, 'QTerrain');
    terrain.castShadow = false;
    terrainMesh = terrain;
  }

  // ---- wind -------------------------------------------------------------
  // Two layers that share the flora's clock: dust lying on the terrain, and
  // grit streaking through the air above it. Both are invisible until the wind
  // moment raises `wind.strength`.
  if (terrainMesh) {
    for (const layer of createDustLayers(terrainMesh.geometry, wind, quality)) {
      textures.push(layer.noise);
      own(layer.mesh.material as THREE.Material);
      root.add(layer.mesh);
    }
  }

  // ---- rock field -------------------------------------------------------
  // Three broken-up variants instead of one displaced sphere, so the field has
  // no repeated silhouette. Sizes follow a power law: a handful of heroes, a
  // long tail of chips, which is how scree actually sorts.
  {
    const blockers = (x: number, z: number, size: number) => {
      if (Math.hypot(x - SITE.drum.x, z - SITE.drum.z) < SITE.drum.radius * 1.04) return true;
      if (Math.abs(x - SITE.duty.x) < .30 && Math.abs(z - SITE.duty.z) < .28) return true;
      if (Math.abs(x - (SITE.bridge.door.x + SITE.bridge.landing.x) / 2) < .34
        && Math.abs(z - (SITE.bridge.door.z + SITE.bridge.landing.z) / 2) < .30) return true;
      return observatoryInset(x, z) < size * 1.5 + .015;
    };
    const random = seeded(20261029);
    const variants = [
      { geometry: rockGeometry(4801, quality), color: '#6d675c' },
      { geometry: rockGeometry(9133, quality), color: '#5f5a51' },
      { geometry: rockGeometry(2277, quality), color: '#7b7468' },
    ];
    const buckets: { x: number; z: number; s: number; tilt: number; yaw: number }[][] = [[], [], []];
    const place = (count: number, floor: number, ceiling: number) => {
      for (let i = 0; i < count; i++) {
        const angle = random() * Math.PI * 2;
        const x = Math.cos(angle) * (OBS.halfWidth - .12) * (.62 + random() * .34);
        const z = Math.sin(angle) * (OBS.halfDepth - .10) * (.62 + random() * .34);
        const size = floor + Math.pow(random(), 2.2) * (ceiling - floor);
        if (blockers(x, z, size)) continue;
        buckets[Math.floor(random() * variants.length)].push({ x, z, s: size, tilt: (random() - .5) * .5, yaw: random() * Math.PI * 2 });
      }
    };
    place(quality === 'full' ? 150 : 60, .012, .105);
    // A rubble apron along the tail: the ground under a deck collects what
    // falls off it, and it hides the footing's meeting with the soil.
    for (let i = 0; i < 34; i++) {
      const t = random();
      const x = THREE.MathUtils.lerp(SITE.bridge.door.x, SITE.bridge.landing.x, t) + (random() - .5) * .34;
      const z = THREE.MathUtils.lerp(SITE.bridge.door.z, SITE.bridge.landing.z, t) + (random() - .5) * .30;
      const size = .010 + random() * .026;
      if (blockers(x, z, size)) continue;
      buckets[i % variants.length].push({ x, z, s: size, tilt: (random() - .5) * .7, yaw: random() * Math.PI * 2 });
    }

    const matrix = new THREE.Matrix4(), quat = new THREE.Quaternion(), scale = new THREE.Vector3(), pos = new THREE.Vector3();
    variants.forEach((variant, index) => {
      const spots = buckets[index];
      if (!spots.length) return;
      const rockMat = own(material(variant.color, .93));
      const instanced = new THREE.InstancedMesh(track(variant.geometry), rockMat, spots.length);
      instanced.name = `QRocks${index}`;
      instanced.castShadow = true; instanced.receiveShadow = true;
      spots.forEach((spot, i) => {
        // Sunk a third of the way in: a boulder resting on the surface is the
        // single clearest tell that a rock field was dropped in from above.
        pos.set(spot.x, observatorySurfaceHeight(spot.x, spot.z) + spot.s * .30, spot.z);
        quat.setFromEuler(new THREE.Euler(spot.tilt, spot.yaw, spot.s * 1.7));
        scale.set(spot.s * (.85 + (i % 5) * .06), spot.s * .8, spot.s * 1.06);
        matrix.compose(pos, quat, scale);
        instanced.setMatrixAt(i, matrix);
      });
      instanced.instanceMatrix.needsUpdate = true;
      root.add(instanced);
    });
  }

  // ---- scree and gravel -------------------------------------------------
  // The tiling map supplies colour, not silhouette: without loose stones lying
  // on top, every slope still reads as painted-on texture at close range.
  {
    const random = seeded(2026102914);
    const chip = track(new THREE.IcosahedronGeometry(1, 0));
    const chipMat = own(material('#7d766a', .95));
    const count = quality === 'full' ? 520 : 180;
    const spots: { x: number; z: number; s: number }[] = [];
    for (let i = 0; i < count; i++) {
      const x = (random() - .5) * (OBS.halfWidth * 2 - .16);
      const z = (random() - .5) * (OBS.halfDepth * 2 - .14);
      const s = .005 + Math.pow(random(), 2) * .013;
      if (Math.hypot(x - SITE.drum.x, z - SITE.drum.z) < SITE.drum.radius * 1.01) continue;
      if (observatoryInset(x, z) < s + .02) continue;
      spots.push({ x, z, s });
    }
    const instanced = new THREE.InstancedMesh(chip, chipMat, spots.length);
    instanced.name = 'QGravel';
    instanced.castShadow = false; instanced.receiveShadow = true;
    const matrix = new THREE.Matrix4(), quat = new THREE.Quaternion(), scale = new THREE.Vector3(), pos = new THREE.Vector3();
    spots.forEach((spot, i) => {
      pos.set(spot.x, observatorySurfaceHeight(spot.x, spot.z) + spot.s * .34, spot.z);
      quat.setFromEuler(new THREE.Euler(random() * 3, random() * 6.3, random() * 3));
      scale.set(spot.s, spot.s * .55, spot.s * 1.1);
      matrix.compose(pos, quat, scale);
      instanced.setMatrixAt(i, matrix);
    });
    instanced.instanceMatrix.needsUpdate = true;
    root.add(instanced);
  }

  // ---- drum -------------------------------------------------------------
  const drum = SITE.drum;
  {
    const wall = track(new THREE.CylinderGeometry(drum.radius, drum.radius, drum.eaves, 56, 1, true));
    const shell = add(wall, m.plaster, 'QDrum');
    shell.material = own(new THREE.MeshStandardMaterial({
      color: '#ffffff', roughness: 1, side: THREE.DoubleSide,
      map: plaster.map, normalMap: plaster.normal, normalScale: new THREE.Vector2(.6, .6),
      roughnessMap: plaster.rough,
    }));
    shell.position.set(drum.x, drum.eaves / 2, drum.z);
    // Cornice: a proud band at the eaves, the domes need something to sit on.
    const cornice = track(new THREE.CylinderGeometry(drum.radius + .035, drum.radius + .035, .055, 56));
    const band = add(cornice, m.plasterShadow, 'QDrumCornice');
    band.position.set(drum.x, drum.eaves - .027, drum.z);
    // A base skirt hides the terrain seam.
    const skirt = track(new THREE.CylinderGeometry(drum.radius + .02, drum.radius + .05, .08, 56));
    const footing = add(skirt, m.plasterShadow, 'QDrumFooting');
    footing.position.set(drum.x, .04, drum.z);
    // A stone string course breaks the plain wall into two registers.
    const course = track(new THREE.CylinderGeometry(drum.radius + .012, drum.radius + .012, .035, 56));
    const stringer = add(course, m.plasterShadow, 'QDrumStringCourse');
    stringer.position.set(drum.x, .20, drum.z);
    // A weathered plinth band near the ground.
    const plinth = track(new THREE.CylinderGeometry(drum.radius + .018, drum.radius + .018, .07, 56));
    const plinthBand = add(plinth, m.plasterShadow, 'QDrumPlinth');
    plinthBand.position.set(drum.x, .035, drum.z);
  }
  // ---- openings ---------------------------------------------------------
  // A window is a hole with a wall around it, and the old ones were a glowing
  // rectangle laid flat on the plaster. Every opening here is therefore built
  // the same way: a dark reveal sunk behind the surface, glass at its back, a
  // mullion cross, a proud surround, and a sill with a drip. Depth is the whole
  // trick — a flat panel has no depth, so it reads as a decal at any distance.
  const dark = own(material('#241f19', .96));
  /** Local frame: +x points out of the wall, y is up, z runs along the wall. */
  const opening = (parent: THREE.Object3D, w: number, h: number, name: string, glass = m.window) => {
    // Everything sits *outside* the wall plane. The drum is a closed cylinder,
    // so a recess dug inward is simply hidden by the shell and the only thing
    // that ever showed was the emissive pane — which is exactly why these read
    // as glowing stickers. Depth has to be built outward instead: a dark back
    // plate flush to the plaster, then glass, mullions and a proud surround.
    const back = put(parent, new THREE.BoxGeometry(.006, h + .004, w + .004), dark, `${name}Back`);
    back.position.x = .002;
    back.castShadow = false;
    const pane = put(parent, new THREE.BoxGeometry(.006, h, w), glass, `${name}Glass`);
    pane.position.x = .006;
    // Mullions: one upright, one transom. Two bars turn a bright rectangle into
    // a window at a glance, even when the pane is only ten pixels wide.
    const upright = put(parent, new THREE.BoxGeometry(.010, h, .011), m.plasterShadow);
    upright.position.x = .010;
    const transom = put(parent, new THREE.BoxGeometry(.010, .011, w), m.plasterShadow);
    transom.position.set(.010, h * .10, 0);
    const jamb = .016;
    const bars: [number, number, number, number][] = [
      [(h + jamb) / 2, w + jamb * 2, jamb, 0],
      [-(h + jamb) / 2, w + jamb * 2, jamb, 0],
      [0, jamb, h, -(w + jamb) / 2],
      [0, jamb, h, (w + jamb) / 2],
    ];
    for (const [y, bw, bh, z] of bars) {
      const bar = put(parent, new THREE.BoxGeometry(.024, bh, bw), m.plasterShadow);
      bar.position.set(.012, y, z);
    }
    const sill = put(parent, new THREE.BoxGeometry(.058, .015, w + jamb * 2.4), m.plasterShadow);
    sill.position.set(.026, -(h + jamb) / 2 - .005, 0);
    sill.rotation.z = -.1;
    return pane;
  };

  // A second ring of small windows above the string course, so the drum does not
  // read as a blank cylinder from the far side.
  [1.6, 3.2, 4.8].forEach((angle, i) => {
    const group = new THREE.Group();
    group.position.set(drum.x + Math.cos(angle) * drum.radius, .42, drum.z + Math.sin(angle) * drum.radius);
    group.rotation.y = -angle;
    root.add(group);
    opening(group, .10, .085, `QDrumUpperWindow${i}`);
  });
  // Door on the rim, facing the bridge.
  const doorAngle = Math.atan2(SITE.bridge.door.z - drum.z, SITE.bridge.door.x - drum.x);
  {
    const door = new THREE.Group();
    door.name = 'QDoor';
    door.position.set(drum.x + Math.cos(doorAngle) * drum.radius, 0, drum.z + Math.sin(doorAngle) * drum.radius);
    door.rotation.y = -doorAngle;
    root.add(door);
    // Same construction as the windows: everything outside the wall plane, so
    // the leaf, the panels and the glazed top light are actually in front of the
    // plaster instead of buried behind it.
    const jamb = .02;
    for (const [y, w, h, z] of [
      [.276, .20 + jamb * 2, jamb, 0], [-.004, .20 + jamb * 2, jamb, 0],
      [.136, jamb, .284, -(0.20 + jamb) / 2], [.136, jamb, .284, (0.20 + jamb) / 2],
    ] as const) {
      const bar = put(door, new THREE.BoxGeometry(.026, h, w), m.plasterShadow);
      bar.position.set(.013, y, z);
    }
    const threshold = put(door, new THREE.BoxGeometry(.008, .262, .192), dark, 'QDoorThreshold');
    threshold.position.set(.002, .133, 0);
    threshold.castShadow = false;
    const leaf = put(door, new THREE.BoxGeometry(.016, .256, .186), m.wood, 'QDoorLeaf');
    leaf.position.set(.004, .131, 0);
    const glass = put(door, new THREE.BoxGeometry(.006, .060, .110), m.window, 'QDoorGlass');
    glass.position.set(.014, .212, 0);
    for (const y of [.072, .150]) {
      const panel = put(door, new THREE.BoxGeometry(.006, .048, .118), m.wood, `QDoorPanel${y}`);
      panel.position.set(.013, y, 0);
    }
    const step = put(door, new THREE.BoxGeometry(.09, .022, .27), m.plasterShadow);
    step.position.set(.028, -.012, 0);
  }
  // Three shuttered windows around the drum.
  [0.9, 2.4, 4.1].forEach((angle, i) => {
    const group = new THREE.Group();
    group.position.set(drum.x + Math.cos(angle) * drum.radius, .34, drum.z + Math.sin(angle) * drum.radius);
    group.rotation.y = -angle;
    root.add(group);
    const pane = opening(group, .15, .17, `QDrumWindow${i}`);
    // Two of the three are dark and one is boarded: a row of identically lit
    // holes would read as a lit building, and this one has been empty for years.
    // The lit one is at 0.9 rad because that face turns toward the gallery
    // camera — the previous choice put the only warm window on the far side.
    if (i !== 0) {
      pane.material = dark;
      if (i === 2) {
        const board = put(group, new THREE.BoxGeometry(.014, .075, .21), m.wood, 'QDrumWindowBoard');
        board.position.set(.014, .022, 0);
        board.rotation.x = .11;
      }
    }
  });

  // ---- gallery and dome -------------------------------------------------
  {
    const floor = track(new THREE.RingGeometry(.30, drum.radius - .04, 56));
    floor.rotateX(-Math.PI / 2);
    const deck = add(floor, m.iron, 'QGallery');
    deck.position.set(drum.x, SITE.gallery, drum.z);
    deck.receiveShadow = true;
    const rail = track(new THREE.TorusGeometry(drum.radius - .06, .007, 6, 56));
    rail.rotateX(Math.PI / 2);
    const railing = add(rail, m.iron, 'QGalleryRail');
    railing.position.set(drum.x, SITE.gallery + .16, drum.z);
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      const post = add(track(new THREE.CylinderGeometry(.005, .005, .16, 5)), m.iron);
      post.position.set(drum.x + Math.cos(a) * (drum.radius - .06), SITE.gallery + .08, drum.z + Math.sin(a) * (drum.radius - .06));
    }
  }

  // Two half-domes. When the Blender asset is present the ribbed shell, rivets,
  // copper seam and lightning rod come from it; otherwise a bare half sphere
  // stands in. Both halves share the drum axis and slide apart to open.
  const spring = SITE.dome.spring;
  const domeHalves: THREE.Group[] = [];
  for (const side of [1, -1] as const) {
    const pivot = new THREE.Group();
    pivot.name = side > 0 ? 'QDomeEast' : 'QDomeWest';
    // Both halves share the drum axis; opening translates them apart, so the
    // shell never leaves the building.
    pivot.position.set(drum.x, spring, drum.z);
    root.add(pivot);
    const authored = (side > 0 ? assets.domeEast : assets.domeWest)?.clone(true);
    if (authored) {
      authored.name = side > 0 ? 'QDomeEastShell' : 'QDomeWestShell';
      authored.traverse(object => {
        if ((object as THREE.Mesh).isMesh) { object.castShadow = true; object.receiveShadow = true; }
      });
      // The asset is already a half bowl with its meridian on the world X axis
      // (Blender X survives the Y-up export), so no rotation is needed here.
      pivot.add(authored);
    } else {
      const geometry = track(new THREE.SphereGeometry(SITE.dome.radius, 56, 28, 0, Math.PI, 0, Math.PI / 2));
      const shell = new THREE.Mesh(geometry, own(new THREE.MeshStandardMaterial({
        color: PALETTE.plaster, roughness: .86, side: THREE.DoubleSide,
      })));
      shell.name = side > 0 ? 'QDomeEastShell' : 'QDomeWestShell';
      shell.castShadow = true; shell.receiveShadow = true;
      shell.rotation.y = side * Math.PI / 2;
      pivot.add(shell);
    }
    domeHalves.push(pivot);
  }

  // ---- telescope --------------------------------------------------------
  const fork = new THREE.Group();
  fork.name = 'QTelescopeFork';
  fork.position.set(drum.x, 0, drum.z);
  root.add(fork);
  const tube = new THREE.Group();
  tube.name = 'QTelescopeTube';
  fork.add(tube);
  if (assets.telescopeFork && assets.telescopeTube) {
    const authoredFork = assets.telescopeFork.clone(true);
    authoredFork.traverse(object => { if ((object as THREE.Mesh).isMesh) { object.castShadow = true; object.receiveShadow = true; } });
    // Blender Z-up / front -Y -> glTF Y-up: the asset's local Z is the scene's Y.
    authoredFork.rotation.x = -Math.PI / 2;
    fork.add(authoredFork);
    const authoredTube = assets.telescopeTube.clone(true);
    authoredTube.traverse(object => { if ((object as THREE.Mesh).isMesh) { object.castShadow = true; object.receiveShadow = true; } });
    tube.add(authoredTube);
    // The tube pivots around the altitude axis; the fork carries azimuth.
    tube.position.set(0, SITE.telescope.axis, 0);
  } else {
    const pier = put(fork, new THREE.CylinderGeometry(.13, .17, SITE.telescope.pierTop, 20), m.rock, 'QTelescopePier');
    pier.position.y = SITE.telescope.pierTop / 2 + OBS.pad;
    const head = put(fork, new THREE.CylinderGeometry(.20, .20, .035, 24), m.iron, 'QTelescopeHead');
    head.position.y = SITE.telescope.pierTop + .02;
    for (const side of [-1, 1]) {
      const arm = put(fork, new THREE.BoxGeometry(.06, .26, .10), m.brass);
      arm.position.set(side * .17, SITE.telescope.axis - .10, 0);
    }
    const axle = put(fork, new THREE.CylinderGeometry(.022, .022, .40, 10), m.iron);
    axle.rotation.z = Math.PI / 2;
    axle.position.y = SITE.telescope.axis;
    tube.position.set(0, SITE.telescope.axis, 0);
    const barrel = put(tube, new THREE.CylinderGeometry(SITE.telescope.tubeRadius, SITE.telescope.tubeRadius, SITE.telescope.tube, 24), m.iron, 'QTelescopeBarrel');
    barrel.rotation.z = Math.PI / 2;
    const collarA = put(tube, new THREE.CylinderGeometry(SITE.telescope.tubeRadius + .012, SITE.telescope.tubeRadius + .012, .03, 24), m.brass);
    collarA.rotation.z = Math.PI / 2; collarA.position.x = .30;
    const collarB = collarA.clone(); collarB.position.x = -.30; tube.add(collarB);
    const mirror = put(tube, new THREE.CircleGeometry(SITE.telescope.mirror, 28), m.glass, 'QTelescopeMirror');
    mirror.position.x = -SITE.telescope.tube / 2 + .01;
    mirror.rotation.y = Math.PI / 2;
    const cell = put(tube, new THREE.CylinderGeometry(SITE.telescope.tubeRadius + .02, SITE.telescope.tubeRadius + .02, .02, 24), m.iron);
    cell.rotation.z = Math.PI / 2; cell.position.x = -SITE.telescope.tube / 2 - .01;
    const counterweight = put(tube, new THREE.CylinderGeometry(.075, .075, .06, 16), m.iron);
    counterweight.rotation.z = Math.PI / 2; counterweight.position.x = -SITE.telescope.tube / 2 - .08;
  }

  // ---- duty room --------------------------------------------------------
  const glowMaterials: THREE.MeshStandardMaterial[] = [];
  {
    const room = new THREE.Group();
    room.name = 'QDutyRoom';
    room.position.set(SITE.duty.x, OBS.pad, SITE.duty.z);
    room.rotation.y = .18;
    root.add(room);
    if (assets.dutyRoom) {
      const authored = assets.dutyRoom.clone(true);
      authored.traverse(object => {
        if (!(object as THREE.Mesh).isMesh) return;
        object.castShadow = true; object.receiveShadow = true;
        // The glowing window pane is driven by the lamp state; find it by material.
        const mat = (object as THREE.Mesh).material as THREE.MeshStandardMaterial | THREE.MeshStandardMaterial[];
        const list = Array.isArray(mat) ? mat : [mat];
        list.forEach(material => {
          if (material && material.name === 'QDutyGlow') {
            object.userData.glow = true;
            glowMaterials.push(material);
          }
        });
      });
      room.add(authored);
      // Scale to match the duty-room footprint authored in the layout.
      const targetWidth = SITE.duty.width;
      const box = new THREE.Box3().setFromObject(authored);
      const width = box.max.x - box.min.x;
      const s = width > 0 ? targetWidth / width : 1;
      authored.scale.setScalar(s);
      // The asset's base sits at its origin; drop it onto the pad.
      authored.position.y = OBS.pad;
    } else {
      const walls = put(room, new THREE.BoxGeometry(SITE.duty.width, SITE.duty.eaves, SITE.duty.depth), m.plaster, 'QDutyWalls');
      walls.position.y = SITE.duty.eaves / 2;
      const roofA = put(room, new THREE.BoxGeometry(SITE.duty.width + .06, .022, .22), m.slate);
      roofA.position.set(0, SITE.duty.eaves + .055, -.105);
      roofA.rotation.x = -.62;
      const roofB = roofA.clone(); roofB.position.z = .105; roofB.rotation.x = .62; room.add(roofB);
      const chimney = put(room, new THREE.BoxGeometry(.06, .20, .06), m.plasterShadow);
      chimney.position.set(-.13, SITE.duty.eaves + .14, -.06);
      const pane = put(room, new THREE.PlaneGeometry(.15, .10), m.window, 'QDutyWindow');
      pane.position.set(.045, .17, SITE.duty.depth / 2 + .001);
    }
  }

  // ---- bridge -----------------------------------------------------------
  // A single extruded ribbon with one flat tone was the flattest thing on the
  // key. Real masonry reads through its joints: courses of slightly different
  // stone, a coping that oversails the parapet, and beams you can see from
  // underneath when you stand in the hollow.
  {
    const path = bridgePath(10);
    const bridge = new THREE.Group();
    bridge.name = 'QBridge';
    root.add(bridge);
    const courses = [
      own(material('#9b9583', .9)),
      own(material('#8d8776', .92)),
      own(material('#a49e8c', .88)),
    ];
    const coping = own(material('#b0a996', .86));
    for (let i = 0; i < path.length - 1; i++) {
      const a = path[i], b = path[i + 1];
      const dx = b.x - a.x, dz = b.z - a.z;
      const length = Math.hypot(dx, dz);
      const angle = Math.atan2(dz, dx);
      const mid = new THREE.Vector3().addVectors(a, b).multiplyScalar(.5);
      const tone = courses[i % courses.length];
      const deck = put(bridge, new THREE.BoxGeometry(length + .02, .06, SITE.bridge.halfWidth * 2), tone);
      deck.position.copy(mid);
      deck.rotation.y = -angle;
      for (const side of [-1, 1]) {
        const wall = put(bridge, new THREE.BoxGeometry(length + .02, .11, .034), tone);
        wall.position.set(mid.x, mid.y + .075, mid.z);
        wall.rotation.y = -angle;
        wall.translateZ(side * SITE.bridge.halfWidth);
        // Coping oversails the wall on both faces: the shadow line under it is
        // what separates a parapet from a slab standing on end.
        const cap = put(bridge, new THREE.BoxGeometry(length + .02, .022, .046), coping);
        cap.position.set(mid.x, mid.y + .141, mid.z);
        cap.rotation.y = -angle;
        cap.translateZ(side * SITE.bridge.halfWidth);
      }
    }
    // Landing: a round pad that overhangs the keycap lip, carried on a corbel.
    const landing = put(bridge, new THREE.CylinderGeometry(SITE.bridge.landingRadius, SITE.bridge.landingRadius, .06, 28), m.bridgeStone, 'QBridgeLanding');
    landing.position.set(SITE.bridge.landing.x, SITE.bridge.deckY - .02, SITE.bridge.landing.z);
    const rim = put(bridge, new THREE.CylinderGeometry(SITE.bridge.landingRadius + .008, SITE.bridge.landingRadius + .008, .022, 28), coping);
    rim.position.set(SITE.bridge.landing.x, SITE.bridge.deckY - .006, SITE.bridge.landing.z);
    const parapet = put(bridge, new THREE.TorusGeometry(SITE.bridge.landingRadius - .012, .007, 6, 28), m.iron);
    parapet.rotation.x = Math.PI / 2;
    parapet.position.set(SITE.bridge.landing.x, SITE.bridge.deckY + .12, SITE.bridge.landing.z);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      if (Math.cos(a) > .30) continue;
      const post = put(bridge, new THREE.CylinderGeometry(.005, .005, .12, 5), m.iron);
      post.position.set(SITE.bridge.landing.x + Math.cos(a) * (SITE.bridge.landingRadius - .012), SITE.bridge.deckY + .06, SITE.bridge.landing.z + Math.sin(a) * (SITE.bridge.landingRadius - .012));
    }
    const landingGround=observatorySurfaceHeight(SITE.bridge.landing.x,SITE.bridge.landing.z);
    const footingTop=SITE.bridge.deckY-.05;
    const footingBottom=landingGround-.015;
    const corbel = put(bridge, new THREE.CylinderGeometry(.085, .122, footingTop-footingBottom, 20), m.bridgeStone,'QBridgeFooting');
    corbel.position.set(SITE.bridge.landing.x,(footingTop+footingBottom)/2,SITE.bridge.landing.z);
    // A splayed plinth keeps the pier from reading as a plant pot.
    const plinth = put(bridge, new THREE.CylinderGeometry(.132, .148, .026, 20), m.bridgeStone);
    plinth.position.set(SITE.bridge.landing.x, footingBottom + .013, SITE.bridge.landing.z);
    // Two piers standing in the gorge. They batter outward toward the ground and
    // carry a cap stone, the way a rubble pier is actually built.
    for (const t of [.34, .66]) {
      const p = new THREE.Vector3().lerpVectors(path[0], path[path.length - 1], t);
      const ground = observatorySurfaceHeight(p.x, p.z);
      const height = Math.max(.08, p.y - ground);
      const pier = put(bridge, new THREE.CylinderGeometry(.048, .072, height, 4), m.bridgeStone, 'QBridgePier');
      pier.position.set(p.x, ground + height / 2, p.z);
      pier.rotation.y = Math.PI / 4;
      const cap = put(bridge, new THREE.BoxGeometry(.135, .022, .135), coping);
      cap.position.set(p.x, ground + height - .011, p.z);
    }
  }

  // ---- external stair ---------------------------------------------------
  {
    const stair = new THREE.Group();
    stair.name = 'QStair';
    root.add(stair);
    const { startAngle, sweep, steps, width, radius } = SITE.stair;
    // Each step is a solid block of stone standing on the ground, not a slab
    // floating at its own height. The old version hung ten thin treads with a
    // narrow stringer behind them and the gaps between read as a broken ladder.
    // Solid risers also give the drum a visible buttress from the gallery angle.
    for (let i = 0; i < steps; i++) {
      const angle = startAngle + sweep * ((i + .5) / steps);
      const top = SITE.gallery * (i + 1) / steps;
      const cx = drum.x + Math.cos(angle) * radius;
      const cz = drum.z + Math.sin(angle) * radius;
      const body = put(stair, new THREE.BoxGeometry(width, top - .026, .13), m.rock);
      body.position.set(cx, (top - .026) / 2, cz);
      body.rotation.y = -angle + Math.PI / 2;
      // A pale tread and a nosing that oversails the riser: the shadow under it
      // is what makes a step read as a step at gallery distance.
      const tread = put(stair, new THREE.BoxGeometry(width + .016, .026, .144), m.bridgeStone);
      tread.position.set(cx, top - .013, cz);
      tread.rotation.y = -angle + Math.PI / 2;
    }
    // A stone landing at the bottom ties the stair to the terrain.
    const firstAngle = startAngle;
    const landing = put(stair, new THREE.BoxGeometry(.20, .06, .26), m.bridgeStone);
    landing.position.set(drum.x + Math.cos(firstAngle) * (radius + .02), .03, drum.z + Math.sin(firstAngle) * (radius + .02));
    landing.rotation.y = -firstAngle + Math.PI / 2;
    const railPoints: THREE.Vector3[] = [];
    for (let i = 0; i <= steps; i += 2) {
      const t = i / steps;
      const angle = startAngle + sweep * t;
      const rise = SITE.gallery * Math.max(i, 1) / steps;
      railPoints.push(new THREE.Vector3(drum.x + Math.cos(angle) * (radius + width / 2), rise + .18, drum.z + Math.sin(angle) * (radius + width / 2)));
      const post = put(stair, new THREE.CylinderGeometry(.006, .006, .18, 5), m.iron);
      post.position.set(drum.x + Math.cos(angle) * (radius + width / 2), rise + .09, drum.z + Math.sin(angle) * (radius + width / 2));
    }
    const curve = new THREE.CatmullRomCurve3(railPoints);
    const rail = put(stair, new THREE.TubeGeometry(curve, 28, .007, 6, false), m.iron);
    rail.castShadow = false;
  }

  // ---- flora ------------------------------------------------------------
  // Instanced Blender geometry. The previous trees were three stacked cones on
  // a cylinder and the scrub was nine flat quads: next to a dome with real ribs
  // and ribbed panels they read as origami. Each plant also carries the wind
  // shader, so the whole hillside leans together when the weather turns.
  const scattered = (count: number, minInset: number, seed: number, reject?: (x: number, z: number) => boolean) => {
    const random = seeded(seed);
    const spots: { x: number; z: number; yaw: number; scale: number }[] = [];
    let guard = 0;
    while (spots.length < count && guard++ < count * 40) {
      const x = (random() - .5) * (OBS.halfWidth * 2 - .10);
      const z = (random() - .5) * (OBS.halfDepth * 2 - .09);
      if (observatoryInset(x, z) < minInset) continue;
      if (Math.hypot(x - SITE.drum.x, z - SITE.drum.z) < SITE.drum.radius * 1.015) continue;
      if (Math.abs(x - (SITE.bridge.door.x + SITE.bridge.landing.x) / 2) < .22
        && Math.abs(z - (SITE.bridge.door.z + SITE.bridge.landing.z) / 2) < .20) continue;
      if (Math.abs(x - SITE.duty.x) < .24 && Math.abs(z - SITE.duty.z) < .22) continue;
      if (reject?.(x, z)) continue;
      spots.push({ x, z, yaw: random() * Math.PI * 2, scale: .78 + random() * .44 });
    }
    return spots;
  };

  const instanceFlora = (source: THREE.Object3D | undefined, spots: { x: number; z: number; yaw: number; scale: number }[], name: string, trunkFree = true) => {
    if (!source || !spots.length) return 0;
    source.updateMatrixWorld(true);
    const toLocal = new THREE.Matrix4().copy(source.matrixWorld).invert();
    const meshes: THREE.Mesh[] = [];
    source.traverse(object => { if ((object as THREE.Mesh).isMesh) meshes.push(object as THREE.Mesh); });
    const matrix = new THREE.Matrix4(), local = new THREE.Matrix4();
    const placement = new THREE.Matrix4(), quat = new THREE.Quaternion(), offset = new THREE.Vector3(), scale = new THREE.Vector3();
    for (const mesh of meshes) {
      local.multiplyMatrices(toLocal, mesh.matrixWorld);
      // Sway is measured against the plant's own height, so the shader needs it;
      // the bounding box is the cheapest honest answer.
      mesh.geometry.computeBoundingBox();
      const height = Math.max(.02, mesh.geometry.boundingBox!.max.y);
      const material = windify(mesh.material as THREE.Material, wind, height);
      own(material);
      const instanced = new THREE.InstancedMesh(track(mesh.geometry), material, spots.length);
      instanced.name = `${name}${meshes.indexOf(mesh)}`;
      instanced.castShadow = trunkFree;
      instanced.receiveShadow = true;
      spots.forEach((spot, i) => {
        quat.setFromAxisAngle(new THREE.Vector3(0, 1, 0), spot.yaw);
        offset.set(spot.x, observatorySurfaceHeight(spot.x, spot.z) - .004, spot.z);
        scale.setScalar(spot.scale);
        placement.compose(offset, quat, scale);
        matrix.multiplyMatrices(placement, local);
        instanced.setMatrixAt(i, matrix);
      });
      instanced.instanceMatrix.needsUpdate = true;
      root.add(instanced);
    }
    return spots.length;
  };

  const pineSpots = [
    { x: -1.18, z: -0.58, yaw: .4, scale: .95 }, { x: -1.02, z: 0.22, yaw: 2.1, scale: .78 },
    { x: 0.92, z: -0.86, yaw: 1.2, scale: 1.0 }, { x: 1.16, z: -0.28, yaw: 3.4, scale: .72 },
    { x: 0.26, z: -0.94, yaw: 5.0, scale: .86 }, { x: -1.24, z: -0.14, yaw: 4.2, scale: .66 },
  ];
  instanceFlora(assets.pine, pineSpots, 'QPine');
  instanceFlora(assets.juniper, scattered(quality === 'full' ? 22 : 9, .05, 2026102961), 'QJuniper');
  instanceFlora(assets.tussock, scattered(quality === 'full' ? 110 : 40, .04, 2026102902), 'QTussock');

  // ---- abandoned props --------------------------------------------------
  // A few weathered objects that make the site read as 'left behind', not
  // 'never finished': a water cistern, wooden crates, a rusted barrel, a coil
  // of cable and a leaning equipment rack.
  let barrelRef: THREE.Object3D | null = null;
  let cisternRef: THREE.Object3D | null = null;
  {
    const box = (name: string, x: number, z: number, w: number, h: number, d: number, mat: THREE.Material, rotY = 0) => {
      const mesh = put(root, new THREE.BoxGeometry(w, h, d), mat, name);
      mesh.position.set(x, observatoryHeight(x, z) + h / 2, z);
      mesh.rotation.y = rotY;
      return mesh;
    };
    // Cistern against the drum, catching roof water.
    cisternRef = put(root, new THREE.CylinderGeometry(.09, .10, .18, 16), m.iron, 'QCistern');
    cisternRef.position.set(SITE.drum.x - .98, .10, SITE.drum.z - .55);
    cisternRef.castShadow = true;
    // Crates near the duty room.
    box('QCrateA', SITE.duty.x + .30, SITE.duty.z - .18, .10, .07, .09, m.wood, .5);
    box('QCrateB', SITE.duty.x + .34, SITE.duty.z - .05, .08, .05, .08, m.wood, 1.1);
    // A rusted barrel by the stair base.
    barrelRef = put(root, new THREE.CylinderGeometry(.05, .05, .12, 12), m.iron, 'QBarrel');
    // Clear of the stair: the solid risers now occupy the old spot and the
    // barrel ended up embedded in the bottom steps.
    barrelRef.position.set(1.06, .06, .26);
    barrelRef.rotation.z = .12;
    barrelRef.castShadow = true;
    // A coil of cable and a leaning rack near the bridge door.
    const coil = put(root, new THREE.TorusGeometry(.045, .008, 6, 12), m.iron, 'QCableCoil');
    coil.rotation.x = Math.PI / 2;
    coil.position.set(SITE.bridge.door.x - .18, .02, SITE.bridge.door.z + .10);
    const rack = box('QRack', SITE.bridge.door.x - .30, SITE.bridge.door.z - .16, .14, .02, .05, m.iron);
    rack.position.y = observatoryHeight(SITE.bridge.door.x - .30, SITE.bridge.door.z - .16) + .05;
    rack.rotation.z = .22;
    // A fallen radio dish on the west ridge: the defining relic of an abandoned
    // station. It is deliberately oversized so it reads from the gallery camera,
    // lying face-down with its mast snapped and a cable spooled beside it.
    const dishGroup = new THREE.Group();
    dishGroup.position.set(SITE.drum.x - .98, observatoryHeight(SITE.drum.x - .98, SITE.drum.z - .34), SITE.drum.z - .34);
    root.add(dishGroup);
    const mast = put(dishGroup, new THREE.CylinderGeometry(.02, .035, .42, 10), m.iron, 'QDishMast');
    mast.position.set(0, .20, 0);
    mast.rotation.z = .42;
    const dish = put(dishGroup, new THREE.SphereGeometry(.22, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), m.iron, 'QDish');
    dish.scale.set(1, .45, 1);
    dish.position.set(.18, .10, .04);
    dish.rotation.set(0, .3, -.42);
    const strut = put(dishGroup, new THREE.CylinderGeometry(.008, .008, .20, 6), m.iron, 'QDishStrut');
    strut.position.set(.05, .12, .04);
    strut.rotation.z = -.4;

  }

  // ---- gravel path ------------------------------------------------------
  // A worn path from the stair base around to the duty-room door, so the site
  // has a beaten route and not just scattered rock.
  {
    const pathMat = own(material('#8a8477', .96));
    const random = seeded(2026102903);
    const n = quality === 'full' ? 220 : 90;
    for (let i = 0; i < n; i++) {
      const t = random();
      // Arc from the stair landing, past the drum's south face, to the duty room.
      const ang = -1.9 + t * 2.6;
      const r = SITE.drum.radius + .30 + (random() - .5) * .12;
      const x = SITE.drum.x + Math.cos(ang) * r;
      const z = SITE.drum.z + Math.sin(ang) * r;
      const s = .02 + random() * .025;
      if(observatoryInset(x,z)<s+.025)continue;
      const stone = new THREE.Mesh(track(new THREE.SphereGeometry(1, 6, 4)), pathMat);
      stone.name='QPathStone';
      stone.scale.set(s, s * .5, s);
      stone.position.set(x, observatorySurfaceHeight(x, z) + s * .18, z);
      stone.rotation.y = random() * Math.PI;
      stone.receiveShadow = true;
      root.add(stone);
    }
  }

  // ---- lamps ------------------------------------------------------------
  const lamps: THREE.PointLight[] = [];
  {
    const spots = [
      { x: SITE.bridge.door.x, z: SITE.bridge.door.z, y: .34 },
      { x: SITE.bridge.landing.x, z: SITE.bridge.landing.z, y: SITE.bridge.deckY + .30 },
    ];
    for (const spot of spots) {
      const post = add(track(new THREE.CylinderGeometry(.008, .011, spot.y - OBS.pad, 8)), m.iron);
      post.position.set(spot.x, OBS.pad + (spot.y - OBS.pad) / 2, spot.z);
      const head = add(track(new THREE.BoxGeometry(.07, .08, .07)), m.lamp, 'QPathLamp');
      head.position.set(spot.x, spot.y, spot.z);
      const light = new THREE.PointLight('#ffb96b', 0, 1.6, 1.6);
      light.position.set(spot.x, spot.y, spot.z);
      root.add(light);
      lamps.push(light);
    }
  }

  // ---- red beacon -------------------------------------------------------
  // Observatories keep a red light at the apex at night so anyone on the hill
  // sees the structure without ruining an astronomer's dark adaptation. It is a
  // separate material so the night cycle can pulse it independently.
  const beaconMaterial = own(new THREE.MeshStandardMaterial({
    color: '#4a0f0f', emissive: new THREE.Color('#ff2a1a'), emissiveIntensity: 0, roughness: .4,
  }));
  const beacon = add(track(new THREE.SphereGeometry(.022, 10, 8)), beaconMaterial, 'QBeacon');
  // Sits on the lightning-rod tip, not floating above it.
  beacon.position.set(drum.x, SITE.dome.spring + SITE.dome.radius + .185, drum.z);
  const beaconLight = new THREE.PointLight('#ff2a1a', 0, .9, 1.8);
  beaconLight.position.copy(beacon.position);
  root.add(beaconLight);

  const dispose = () => {
    geometries.forEach(geometry => geometry.dispose());
    materials.forEach(material => material.dispose());
    textures.forEach(texture => texture.dispose());
  };

  return {
    root,
    domeHalves,
    telescopeFork: fork,
    telescopeTube: tube,
    windowMaterial: m.window,
    lampMaterial: m.lamp,
    glowMaterials,
    beaconMaterial,
    beacon,
    beaconLight,
    barrel: barrelRef,
    cistern: cisternRef,
    lamps,
    terrain: terrainMesh!,
    wind,
    dispose,
  };
}
