import * as THREE from 'three';
import { OBS, SITE, bridgePath, observatoryHeight, observatoryInset, observatorySurfaceHeight, outlinePoint } from './observatory-layout';
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
  /** Red apex beacon, pulsed at night. */
  beaconMaterial: THREE.MeshStandardMaterial;
  /** The rusted barrel, toppled on click. */
  barrel: THREE.Object3D | null;
  /** The water cistern, drips on click. */
  cistern: THREE.Object3D | null;
  lamps: THREE.PointLight[];
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
    cap: own(material(PALETTE.cap, .7)),
    capTrim: own(material(PALETTE.capTrim, .74)),
    bridgeStone: own(material('#96907f', .88)),
    window: own(new THREE.MeshStandardMaterial({ color: '#3a2c1c', emissive: new THREE.Color(PALETTE.warm), emissiveIntensity: .1, roughness: .5 })),
    lamp: own(new THREE.MeshStandardMaterial({ color: '#4c4335', emissive: new THREE.Color('#ffbd73'), emissiveIntensity: 0, roughness: .5 })),
  };

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
  // Match the terrain grid's actual boundary, including rounded-corner samples.
  const outline:THREE.Vector2[]=[];
  const edge=(x:number,z:number)=>{const p=outlinePoint(x,z);outline.push(new THREE.Vector2(...p));};
  for(let i=0;i<segZ;i++)edge(OBS.halfWidth,-OBS.halfDepth+2*OBS.halfDepth*i/segZ);
  for(let i=0;i<segX;i++)edge(OBS.halfWidth-2*OBS.halfWidth*i/segX,OBS.halfDepth);
  for(let i=0;i<segZ;i++)edge(-OBS.halfWidth,OBS.halfDepth-2*OBS.halfDepth*i/segZ);
  for(let i=0;i<segX;i++)edge(-OBS.halfWidth+2*OBS.halfWidth*i/segX,-OBS.halfDepth);
  {
    const position: number[] = [], normal: number[] = [], uv: number[] = [], index: number[] = [];
    for (let i = 0; i < outline.length; i++) {
      const a = outline[i], b = outline[(i + 1) % outline.length];
      const dx = b.x - a.x, dz = b.y - a.y, len = Math.hypot(dx, dz) || 1;
      const nx = dz / len, nz = -dx / len;
      const base = position.length / 3;
      position.push(a.x, 0, a.y, b.x, 0, b.y, b.x, -OBS.base, b.y, a.x, -OBS.base, a.y);
      for (let k = 0; k < 4; k++) normal.push(nx, 0, nz);
      uv.push(0, 1, 1, 1, 1, 0, 0, 0);
      index.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(position, 3));
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normal, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geometry.setIndex(index);
    add(geometry, m.cap, 'QKeycapBody');
  }
  {
    const bottom = track(new THREE.ShapeGeometry(new THREE.Shape(outline), 2));
    bottom.rotateX(Math.PI / 2);
    const mesh = add(bottom, m.capTrim, 'QKeycapBottom');
    mesh.position.y = -OBS.base;
  }

  // ---- terrain ----------------------------------------------------------
  {
    const plane = track(new THREE.PlaneGeometry(OBS.halfWidth * 2, OBS.halfDepth * 2, segX, segZ));
    plane.rotateX(-Math.PI / 2);
    const position = plane.attributes.position;
    const colors: number[] = [];
    const base = new THREE.Color(PALETTE.rock);
    const light = new THREE.Color(PALETTE.rockLight);
    for (let i = 0; i < position.count; i++) {
      const [x, z] = outlinePoint(position.getX(i), position.getZ(i));
      const h = observatorySurfaceHeight(x,z);
      position.setXYZ(i, x, h, z);
      const tint = THREE.MathUtils.clamp(0.5 + 0.9 * (h - OBS.pad), 0, 1);
      const c = base.clone().lerp(light, tint * .55);
      // Damp the gorge floor: dust and shadow collect there.
      const c2 = c.multiplyScalar(0.78 + 0.22 * THREE.MathUtils.clamp(h / 0.12, 0, 1));
      colors.push(c2.r, c2.g, c2.b);
    }
    plane.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    plane.computeVertexNormals();
    const terrainMaterial = own(new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: .95, vertexColors: true }));
    const terrain = add(plane, terrainMaterial, 'QTerrain');
    terrain.castShadow = false;
  }

  // ---- rock field -------------------------------------------------------
  {
    const rockGeometry = track(new THREE.SphereGeometry(1, 18, 12));
    const positions = rockGeometry.attributes.position;
    for (let i = 0; i < positions.count; i++) {
      const v = new THREE.Vector3().fromBufferAttribute(positions, i);
      const n = 1 + .24 * Math.sin(v.x * 3.9 + v.z * 3.1) + .13 * Math.sin(v.y * 5.3 + v.x * 2.3);
      v.multiplyScalar(n);
      positions.setXYZ(i, v.x, v.y * .72, v.z);
    }
    rockGeometry.computeVertexNormals();
    const random = seeded(20261029);
    const spots: { x: number; z: number; s: number }[] = [];
    for (let i = 0; i < 90; i++) {
      const angle = random() * Math.PI * 2;
      const x = Math.cos(angle) * (OBS.halfWidth - .12) * (.62 + random() * .34);
      const z = Math.sin(angle) * (OBS.halfDepth - .10) * (.62 + random() * .34);
      const nearDrum = Math.hypot(x - SITE.drum.x, z - SITE.drum.z) < SITE.drum.radius * 1.04;
      const nearDuty = Math.abs(x - SITE.duty.x) < .30 && Math.abs(z - SITE.duty.z) < .28;
      const onBridge = Math.abs(x - (SITE.bridge.door.x + SITE.bridge.landing.x) / 2) < .34
        && Math.abs(z - (SITE.bridge.door.z + SITE.bridge.landing.z) / 2) < .30;
      if (nearDrum || nearDuty || onBridge) continue;
      const size=.035+random()*.075;
      if(observatoryInset(x,z)<size*1.5+.015)continue;
      spots.push({x,z,s:size});
    }
    const instanced = new THREE.InstancedMesh(rockGeometry, m.rock, spots.length);
    instanced.name = 'QRocks';
    instanced.castShadow = true; instanced.receiveShadow = true;
    const matrix = new THREE.Matrix4(), quat = new THREE.Quaternion(), scale = new THREE.Vector3(), pos = new THREE.Vector3();
    spots.forEach((spot, i) => {
      pos.set(spot.x, observatorySurfaceHeight(spot.x, spot.z) + spot.s * .42, spot.z);
      quat.setFromEuler(new THREE.Euler(spot.s * 2.1, spot.s * 7.3, spot.s * 1.7));
      scale.set(spot.s, spot.s * .82, spot.s * 1.05);
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
    shell.material = own(new THREE.MeshStandardMaterial({ color: PALETTE.plaster, roughness: .88, side: THREE.DoubleSide }));
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
  // A second ring of small windows above the string course, so the drum does not
  // read as a blank cylinder from the far side.
  [1.6, 3.2, 4.8].forEach((angle, i) => {
    const group = new THREE.Group();
    group.position.set(drum.x + Math.cos(angle) * drum.radius, .42, drum.z + Math.sin(angle) * drum.radius);
    group.rotation.y = -angle;
    root.add(group);
    const frame = put(group, new THREE.BoxGeometry(.014, .10, .12), m.plasterShadow, `QDrumUpperWindow${i}`);
    frame.position.x = .006;
    const pane = put(group, new THREE.PlaneGeometry(.07, .06), m.window);
    pane.position.x = .016;
    pane.rotation.y = Math.PI / 2;
  });
  // Door on the rim, facing the bridge.
  const doorAngle = Math.atan2(SITE.bridge.door.z - drum.z, SITE.bridge.door.x - drum.x);
  {
    const door = new THREE.Group();
    door.name = 'QDoor';
    door.position.set(drum.x + Math.cos(doorAngle) * drum.radius, 0, drum.z + Math.sin(doorAngle) * drum.radius);
    door.rotation.y = -doorAngle;
    root.add(door);
    const frame = put(door, new THREE.BoxGeometry(.025, .30, .24), m.plasterShadow, 'QDoorFrame');
    frame.position.set(0, .15, 0);
    const leaf = put(door, new THREE.BoxGeometry(.02, .26, .19), m.wood, 'QDoorLeaf');
    leaf.position.set(.012, .14, 0);
    const glass = put(door, new THREE.PlaneGeometry(.13, .07), m.window, 'QDoorGlass');
    glass.position.set(.026, .225, 0);
    glass.rotation.y = Math.PI / 2;
  }
  // Three shuttered windows around the drum.
  [0.9, 2.4, 4.1].forEach((angle, i) => {
    const group = new THREE.Group();
    group.position.set(drum.x + Math.cos(angle) * drum.radius, .34, drum.z + Math.sin(angle) * drum.radius);
    group.rotation.y = -angle;
    root.add(group);
    const shutter = put(group, new THREE.BoxGeometry(.016, .17, .15), i === 1 ? m.window : m.plasterShadow, `QDrumWindow${i}`);
    shutter.position.x = .006;
    const sill = put(group, new THREE.BoxGeometry(.05, .02, .18), m.plasterShadow);
    sill.position.set(.012, -.093, 0);
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
  {
    const path = bridgePath(10);
    const bridge = new THREE.Group();
    bridge.name = 'QBridge';
    root.add(bridge);
    for (let i = 0; i < path.length - 1; i++) {
      const a = path[i], b = path[i + 1];
      const dx = b.x - a.x, dz = b.z - a.z;
      const length = Math.hypot(dx, dz);
      const angle = Math.atan2(dz, dx);
      const mid = new THREE.Vector3().addVectors(a, b).multiplyScalar(.5);
      const deck = put(bridge, new THREE.BoxGeometry(length + .02, .06, SITE.bridge.halfWidth * 2), m.bridgeStone);
      deck.position.copy(mid);
      deck.rotation.y = -angle;
      for (const side of [-1, 1]) {
        const wall = put(bridge, new THREE.BoxGeometry(length + .02, .12, .035), m.bridgeStone);
        wall.position.set(mid.x, mid.y + .08, mid.z);
        wall.rotation.y = -angle;
        wall.translateZ(side * SITE.bridge.halfWidth);
      }
    }
    // Landing: a round pad that overhangs the keycap lip, carried on a corbel.
    const landing = put(bridge, new THREE.CylinderGeometry(SITE.bridge.landingRadius, SITE.bridge.landingRadius, .06, 28), m.bridgeStone, 'QBridgeLanding');
    landing.position.set(SITE.bridge.landing.x, SITE.bridge.deckY - .02, SITE.bridge.landing.z);
    const parapet = put(bridge, new THREE.TorusGeometry(SITE.bridge.landingRadius - .012, .007, 6, 28), m.iron);
    parapet.rotation.x = Math.PI / 2;
    parapet.position.set(SITE.bridge.landing.x, SITE.bridge.deckY + .12, SITE.bridge.landing.z);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      if (Math.cos(a) > .30) continue;
      const post = put(bridge, new THREE.CylinderGeometry(.005, .005, .12, 5), m.iron);
      post.position.set(SITE.bridge.landing.x + Math.cos(a) * (SITE.bridge.landingRadius - .012), SITE.bridge.deckY + .06, SITE.bridge.landing.z + Math.sin(a) * (SITE.bridge.landingRadius - .012));
    }
    const corbel = put(bridge, new THREE.CylinderGeometry(.11, .05, .26, 16), m.bridgeStone);
    corbel.position.set(SITE.bridge.landing.x, SITE.bridge.deckY - .18, SITE.bridge.landing.z);
    // Two piers standing in the gorge.
    for (const t of [.34, .66]) {
      const p = new THREE.Vector3().lerpVectors(path[0], path[path.length - 1], t);
      const ground = observatoryHeight(p.x, p.z);
      const height = Math.max(.08, p.y - ground);
      const pier = put(bridge, new THREE.BoxGeometry(.10, height, .10), m.bridgeStone);
      pier.position.set(p.x, ground + height / 2, p.z);
    }
  }

  // ---- external stair ---------------------------------------------------
  {
    const stair = new THREE.Group();
    stair.name = 'QStair';
    root.add(stair);
    const { startAngle, sweep, steps, width, radius } = SITE.stair;
    for (let i = 0; i < steps; i++) {
      const t = i / steps;
      const angle = startAngle + sweep * t;
      const rise = SITE.gallery * (i + 1) / steps;
      const tread = put(stair, new THREE.BoxGeometry(width, .035, .20), m.rock);
      tread.position.set(drum.x + Math.cos(angle) * radius, rise, drum.z + Math.sin(angle) * radius);
      tread.rotation.y = -angle + Math.PI / 2;
    }
    // A masonry stringer under the treads closes the floating gap and gives the
    // stair a footing; it hugs the drum wall and steps down with the treads.
    for (let i = 0; i < steps; i++) {
      const t = i / steps;
      const angle = startAngle + sweep * t;
      const rise = SITE.gallery * (i + 1) / steps;
      const block = put(stair, new THREE.BoxGeometry(.06, Math.max(.04, rise), .16), m.rock);
      block.position.set(drum.x + Math.cos(angle) * (radius - width / 2 - .01), rise / 2, drum.z + Math.sin(angle) * (radius - width / 2 - .01));
      block.rotation.y = -angle + Math.PI / 2;
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

  // ---- conifers ---------------------------------------------------------
  {
    const random = seeded(771);
    const spots = [
      [-1.15, -0.62], [-1.02, 0.18], [0.94, -0.86], [1.16, -0.30], [0.30, -0.92],
    ];
    for (const [x, z] of spots) {
      const tree = new THREE.Group();
      const h = .20 + random() * .14;
      tree.position.set(x, observatoryHeight(x, z), z);
      root.add(tree);
      const trunk = put(tree, new THREE.CylinderGeometry(.008, .012, h * .45, 6), m.wood);
      trunk.position.y = h * .22;
      for (let i = 0; i < 3; i++) {
        const cone = put(tree, new THREE.ConeGeometry(.075 - i * .018, h * .5, 9), own(material('#2f4030', .9)));
        cone.position.y = h * (.35 + i * .22);
      }
    }
  }

  // ---- ground scrub -----------------------------------------------------
  // Tussocks of dry grass and low moss break the bare rock and sell the 'empty
  // hill station' feel without cluttering the access paths.
  {
    const random = seeded(2026102902);
    const tuftGeometry = (() => {
      // A small clump of tapered blades, the same cheap approach as the olive
      // foliage: thin cards beat blobs at this scale.
      const blades = 9;
      const pos: number[] = [], idx: number[] = [];
      for (let b = 0; b < blades; b++) {
        const a = random() * Math.PI * 2;
        const h = .04 + random() * .06;
        const w = .008 + random() * .006;
        const dx = Math.cos(a), dz = Math.sin(a), sx = -dz, sz = dx;
        const base = pos.length / 3;
        for (let s = 0; s < 2; s++) {
          const t = s;
          pos.push(dx * t * h * .6 + sx * w, t * h, dz * t * h * .6 + sz * w);
          pos.push(dx * t * h * .6 - sx * w, t * h, dz * t * h * .6 - sz * w);
        }
        idx.push(base, base + 2, base + 1, base + 1, base + 2, base + 3);
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setIndex(idx);
      g.computeVertexNormals();
      return g;
    })();
    const grassMat = own(material('#5b6a44', .95));
    const mossMat = own(material('#4c5a3c', .98));
    const n = quality === 'full' ? 120 : 50;
    for (let i = 0; i < n; i++) {
      const x = (random() - .5) * (OBS.halfWidth * 2 - .3);
      const z = (random() - .5) * (OBS.halfDepth * 2 - .26);
      if (Math.hypot(x - SITE.drum.x, z - SITE.drum.z) < SITE.drum.radius * 1.02) continue;
      if (Math.abs(x - SITE.bridge.door.x) < .3 && Math.abs(z - SITE.bridge.door.z) < .3) continue;
      const tuft = new THREE.Mesh(tuftGeometry, random() < .5 ? grassMat : mossMat);
      tuft.position.set(x, observatoryHeight(x, z), z);
      tuft.rotation.y = random() * Math.PI * 2;
      const s = .5 + random() * 1.1;
      tuft.scale.setScalar(s);
      tuft.castShadow = true;
      root.add(tuft);
    }
  }

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
    barrelRef.position.set(SITE.drum.x - .60, .06, SITE.drum.z + .72);
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
  beacon.position.set(drum.x, SITE.dome.spring + SITE.dome.radius + .20, drum.z);
  const beaconLight = new THREE.PointLight('#ff2a1a', 0, .9, 1.8);
  beaconLight.position.copy(beacon.position);
  root.add(beaconLight);

  const dispose = () => {
    geometries.forEach(geometry => geometry.dispose());
    materials.forEach(material => material.dispose());
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
    barrel: barrelRef,
    cistern: cisternRef,
    lamps,
    dispose,
  };
}
