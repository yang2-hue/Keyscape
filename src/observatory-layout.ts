import * as THREE from 'three';
import { noise2 } from './lunar-layout.ts';

/** Q is a square-ish 1u key turned landscape: 2.96 x 2.22 in study units. The
 * observatory drum takes 62% of that width, so the letter reads as a bowl with
 * a stub tail instead of a building that happens to stand on a key. */
export const OBS = {
  halfWidth: 1.48,
  halfDepth: 1.11,
  corner: 0.34,
  /** Cream keycap body: top surface at 0, bottom at -base. */
  base: 0.30,
  /** Terrain settles to this height; the drum and the bridge are measured from it. */
  pad: 0.02,
  /** A slight turn gives the bowl a silhouette instead of a perfect circle. */
  rotation: 0.62,
};

export const SITE = {
  drum: { x: -0.40, z: -0.10, radius: 0.92, wall: 0.08, eaves: 0.74 },
  /** The halves part outward and tilt: rim-hinging swings a quarter sphere
   * clear of the drum and reads as a flying shell, which is not a mechanism. */
  dome: { spring: 0.68, radius: 0.92, slide: 0.22, tilt: 0.32 },
  gallery: 0.62,
  duty: { x: 0.74, z: -0.40, width: 0.38, depth: 0.34, eaves: 0.28, ridge: 0.40 },
  /** The tail: door on the drum's rim, a short deck, and a round landing that
   * overhangs the keycap lip. Tail length is measured rim to landing edge. */
  bridge: { door: { x: 0.26, z: 0.54 }, landing: { x: 0.86, z: 0.96 }, landingRadius: 0.19, halfWidth: 0.14, deckY: 0.20 },
  gorge: { x: 0.64, z: 0.78, rx: 0.26, rz: 0.15, depth: 0.055 },
  stair: { startAngle: 2.30, sweep: 1.05, steps: 10, width: 0.26, radius: 1.00 },
  telescope: { pierTop: 0.52, axis: 0.76, tube: 0.96, tubeRadius: 0.13, mirror: 0.21 },
};

const smooth = (value: number, a: number, b: number) => {
  const t = Math.max(0, Math.min(1, (value - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** Same rounding the coastal and lunar keys use: push a plane vertex onto the
 * rounded rectangle outline so the terrain shares the keycap footprint. */
export function outlinePoint(x: number, z: number): [number, number] {
  const { halfWidth: hw, halfDepth: hd, corner: r } = OBS;
  const dx = Math.max(0, Math.abs(x) - (hw - r));
  const dz = Math.max(0, Math.abs(z) - (hd - r));
  const length = Math.hypot(dx, dz);
  if (length <= r) return [x, z];
  const k = r / length;
  return [Math.sign(x) * (hw - r + dx * k), Math.sign(z) * (hd - r + dz * k)];
}

/** Closed outline walked anticlockwise, for the keycap side wall. */
export function observatoryOutline() {
  const { halfWidth: hw, halfDepth: hd, corner: r } = OBS;
  const points: THREE.Vector2[] = [];
  const corners = [
    [hw - r, -(hd - r), -Math.PI / 2],
    [hw - r, hd - r, 0],
    [-(hw - r), hd - r, Math.PI / 2],
    [-(hw - r), -(hd - r), Math.PI],
  ] as const;
  for (const [cx, cz, start] of corners) {
    for (let i = 0; i <= 10; i++) {
      const a = start + (i / 10) * (Math.PI / 2);
      points.push(new THREE.Vector2(cx + Math.cos(a) * r, cz + Math.sin(a) * r));
    }
  }
  return points;
}

/** Distance to the gorge rim, normalised: <1 is inside the cut. */
export function gorgeDepth(x: number, z: number) {
  const { x: gx, z: gz, rx, rz, depth } = SITE.gorge;
  const d = Math.hypot((x - gx) / rx, (z - gz) / rz);
  // A shallow drainage hollow under the walkway, never a hole through the key.
  const wall = 1 - smooth(d, 0.15, 1.0);
  return depth * wall;
}

/** Terrain height. Three things must stay true: the drum sits on a flat pad,
 * the bridge has air under it, and the keycap wall never shows a gap. */
export function observatoryHeight(x: number, z: number) {
  const { drum } = SITE;
  let h = OBS.pad;
  // A rocky ridge climbs to the north-west and a lower shelf falls to the
  // south; the drum sits on a shoulder between them so the world is a hillside,
  // not a slab.
  h += 0.16 * smooth(z, -0.30, -1.05) * (0.55 + 0.45 * noise2(x * 1.9 + 3.1, z * 1.9 - 1.9));
  h += 0.06 * smooth(-x, 0.35, 1.35) * (0.6 + 0.4 * noise2(x * 2.1 - 2.2, z * 2.1 + 4.0));
  h -= 0.05 * smooth(z, 0.55, 1.05);
  // Stepped rock ledges on the north face: a couple of shallow terraces break
  // the long slope into believable strata.
  h += 0.022 * (0.5 + 0.5 * Math.sin(z * 7.0 + x * 3.0)) * smooth(z, -0.35, -1.0);
  // Grain. Gradient noise only: value noise leaves its lattice on a grazing key.
  h += 0.018 * (noise2(x * 2.9 + 1.7, z * 2.9 - 2.4) - 0.5);
  h += 0.010 * (noise2(x * 6.7 - 5.1, z * 6.7 + 3.3) - 0.5);
  h += 0.005 * (noise2(x * 13.1 + 8.3, z * 13.1 - 6.7) - 0.5);
  // The gorge under the tail.
  h -= gorgeDepth(x, z);
  // Flatten under the building, the duty room and the landing so nothing tilts.
  const padMask = Math.max(
    1 - smooth(Math.hypot(x - drum.x, z - drum.z), drum.radius * 0.96, drum.radius * 1.06),
    1 - smooth(Math.hypot(x - SITE.duty.x, z - SITE.duty.z), 0.26, 0.34),
    1 - smooth(Math.hypot(x - SITE.bridge.landing.x, z - SITE.bridge.landing.z), 0.17, 0.21),
  );
  return THREE.MathUtils.lerp(h, OBS.pad, Math.max(0, Math.min(1, padMask)));
}

/** Deck samples from the door to the landing, used by both the mesh and the
 * walkability test so the two can never drift apart. */
export function bridgePath(steps = 8) {
  const { door, landing } = SITE.bridge;
  const points: THREE.Vector3[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    // Straight run with a gentle sag: a dead-straight deck reads as a plank.
    const sag = Math.sin(t * Math.PI) * 0.02;
    points.push(new THREE.Vector3(
      THREE.MathUtils.lerp(door.x, landing.x, t),
      SITE.bridge.deckY - sag,
      THREE.MathUtils.lerp(door.z, landing.z, t),
    ));
  }
  return points;
}

/** Sky is the only thing Q and the lunar study share verbatim; exposure lives
 * in the moment presets. */
export type ObservatoryMaterialSpec = {
  plaster: THREE.MeshStandardMaterial;
  copper: THREE.MeshStandardMaterial;
  iron: THREE.MeshStandardMaterial;
  brass: THREE.MeshStandardMaterial;
  slate: THREE.MeshStandardMaterial;
  glass: THREE.MeshStandardMaterial;
  wood: THREE.MeshStandardMaterial;
  rock: THREE.MeshStandardMaterial;
  cap: THREE.MeshStandardMaterial;
  window: THREE.MeshStandardMaterial;
};

/** Signed inset from the rounded footprint; includes the object's full radius. */
export function observatoryInset(x:number,z:number){
  return Math.min(OBS.halfWidth-Math.abs(x),OBS.halfDepth-Math.abs(z),OBS.corner-Math.hypot(Math.max(0,Math.abs(x)-(OBS.halfWidth-OBS.corner)),Math.max(0,Math.abs(z)-(OBS.halfDepth-OBS.corner))));
}
export function observatorySurfaceHeight(x:number,z:number){
  return observatoryHeight(x,z)*smooth(observatoryInset(x,z),0,.08);
}
