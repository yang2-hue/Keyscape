import * as THREE from 'three';
import { OBS, SITE, bridgePath, observatoryHeight, observatoryOutline, outlinePoint } from './observatory-layout';
import { seeded } from './coastal-materials';

type Quality = 'full' | 'software';

export type ObservatoryBase = {
  root: THREE.Group;
  /** Two dome pivots: hinge groups at the spring line, east and west. */
  domeHalves: THREE.Group[];
  telescopeFork: THREE.Group;
  telescopeTube: THREE.Group;
  /** Window pane and lamp glass: driven by the duty-room lamp state. */
  windowMaterial: THREE.MeshStandardMaterial;
  lampMaterial: THREE.MeshStandardMaterial;
  lamps: THREE.PointLight[];
  dispose: () => void;
};

const PALETTE = {
  plaster: '#ded8c8',
  plasterShadow: '#c9c2b1',
  copper: '#7a5334',
  iron: '#3a3a38',
  brass: '#a4823f',
  slate: '#4a5054',
  glass: '#0e1720',
  wood: '#6b4a30',
  rock: '#6d6a63',
  rockLight: '#8b877c',
  cap: '#efe9dc',
  capTrim: '#ded7c6',
  warm: '#ffb45e',
};

function material(color: string, roughness: number, metalness = 0) {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness });
}

export function createObservatoryBase(quality: Quality = 'full'): ObservatoryBase {
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
  const outline = observatoryOutline();
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
  const segX = quality === 'full' ? 260 : 120, segZ = quality === 'full' ? 196 : 88;
  {
    const plane = track(new THREE.PlaneGeometry(OBS.halfWidth * 2, OBS.halfDepth * 2, segX, segZ));
    plane.rotateX(-Math.PI / 2);
    const position = plane.attributes.position;
    const colors: number[] = [];
    const base = new THREE.Color(PALETTE.rock);
    const light = new THREE.Color(PALETTE.rockLight);
    for (let i = 0; i < position.count; i++) {
      const [x, z] = outlinePoint(position.getX(i), position.getZ(i));
      const h = observatoryHeight(x, z);
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
      spots.push({ x, z, s: .035 + random() * .075 });
    }
    const instanced = new THREE.InstancedMesh(rockGeometry, m.rock, spots.length);
    instanced.name = 'QRocks';
    instanced.castShadow = true; instanced.receiveShadow = true;
    const matrix = new THREE.Matrix4(), quat = new THREE.Quaternion(), scale = new THREE.Vector3(), pos = new THREE.Vector3();
    spots.forEach((spot, i) => {
      pos.set(spot.x, observatoryHeight(spot.x, spot.z) + spot.s * .42, spot.z);
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
  }
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

  // Two half-domes, hinged at opposite sides of the spring line.
  const spring = SITE.dome.spring;
  const domeHalves: THREE.Group[] = [];
  for (const side of [1, -1] as const) {
    const pivot = new THREE.Group();
    pivot.name = side > 0 ? 'QDomeEast' : 'QDomeWest';
    // Both halves share the drum axis; opening translates them apart, so the
    // shell never leaves the building.
    pivot.position.set(drum.x, spring, drum.z);
    root.add(pivot);
    const geometry = track(new THREE.SphereGeometry(SITE.dome.radius, 56, 28, 0, Math.PI, 0, Math.PI / 2));
    const shell = new THREE.Mesh(geometry, own(new THREE.MeshStandardMaterial({
      color: PALETTE.plaster, roughness: .86, side: THREE.DoubleSide,
    })));
    shell.name = side > 0 ? 'QDomeEastShell' : 'QDomeWestShell';
    shell.castShadow = true; shell.receiveShadow = true;
    // The half sphere spans z>=0; rotate so the cut plane is x=0, then slide it
    // back onto the hinge.
    shell.rotation.y = side * Math.PI / 2;
    pivot.add(shell);
    // Copper flashing along the cut edge: a thin half torus pinned to the meridian.
    const seam = new THREE.Mesh(
      track(new THREE.TorusGeometry(SITE.dome.radius, .012, 6, 40, Math.PI)),
      m.copper,
    );
    seam.name = side > 0 ? 'QDomeEastSeam' : 'QDomeWestSeam';
    seam.rotation.set(0, side * Math.PI / 2, 0);
    seam.castShadow = true;
    pivot.add(seam);
    domeHalves.push(pivot);
  }

  // ---- telescope --------------------------------------------------------
  const fork = new THREE.Group();
  fork.name = 'QTelescopeFork';
  fork.position.set(drum.x, 0, drum.z);
  root.add(fork);
  {
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
  }
  const tube = new THREE.Group();
  tube.name = 'QTelescopeTube';
  tube.position.set(0, SITE.telescope.axis, 0);
  fork.add(tube);
  {
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
  {
    const room = new THREE.Group();
    room.name = 'QDutyRoom';
    room.position.set(SITE.duty.x, OBS.pad, SITE.duty.z);
    room.rotation.y = .18;
    root.add(room);
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
      const head = add(track(new THREE.BoxGeometry(.07, .08, .07)), m.lamp);
      head.position.set(spot.x, spot.y, spot.z);
      const light = new THREE.PointLight('#ffb96b', 0, 1.6, 1.6);
      light.position.set(spot.x, spot.y, spot.z);
      root.add(light);
      lamps.push(light);
    }
  }

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
    lamps,
    dispose,
  };
}
