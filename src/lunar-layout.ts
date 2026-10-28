import * as THREE from 'three';

/** The spacebar is 6.25u long, but a 6.25:1 slab leaves no room for a section
 * through a habitat. 3.64 x 1.44 keeps the long, low silhouette of a spacebar
 * while giving the modules something to stand on. */
export const LUNAR = {
  halfWidth: 1.82,
  halfDepth: 0.72,
  corner: 0.26,
  /** Cream keycap body: top surface at 0, bottom at -base. */
  base: 0.22,
  /** Modules stand on this pad; terrain is flattened to it. */
  pad: 0.024,
  rotation: 0.28,
  center: { x: 0.42, z: 0 },
};

/** Where each structure lives, in study coordinates (X = long axis). */
export const SITE = {
  crater: { x: -1.3, z: 0.02, radius: 0.36, depth: 0.17 },
  craterSmall: { x: 1.44, z: -0.3, radius: 0.15, depth: 0.05 },
  habitat: { x: -0.34, z: 0.02, radius: 0.185, length: 0.44 },
  airlock: { x: 0.06, z: 0.02 },
  greenhouse: { x: 0.76, z: 0.02, radius: 0.25, length: 0.98, plinth: 0.05 },
  solar: { x: -0.92, z: 0.3 },
  walkway: { z: 0.27 },
};

const smooth = (value: number, a: number, b: number) => {
  const t = Math.max(0, Math.min(1, (value - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** Push a plane vertex onto the rounded rectangle outline, the same way the
 * coastal study maps its square keycap. */
export function roundedRectPoint(x: number, z: number): [number, number] {
  const { halfWidth: hw, halfDepth: hd, corner: r } = LUNAR;
  const dx = Math.max(0, Math.abs(x) - (hw - r));
  const dz = Math.max(0, Math.abs(z) - (hd - r));
  const length = Math.hypot(dx, dz);
  if (length <= r) return [x, z];
  const k = r / length;
  return [Math.sign(x) * (hw - r + dx * k), Math.sign(z) * (hd - r + dz * k)];
}

/** Closed outline of the keycap, walked anticlockwise. */
export function spacebarOutline() {
  const { halfWidth: hw, halfDepth: hd, corner: r } = LUNAR;
  const points: THREE.Vector2[] = [];
  const corners = [[1, 1], [-1, 1], [-1, -1], [1, -1]];
  for (let c = 0; c < 4; c++) {
    const [sx, sz] = corners[c];
    const cx = sx * (hw - r), cz = sz * (hd - r);
    const start = c === 0 ? 0 : c === 1 ? Math.PI / 2 : c === 2 ? Math.PI : Math.PI * 1.5;
    for (let i = 0; i <= 10; i++) {
      const angle = start + i * (Math.PI / 2) / 10;
      points.push(new THREE.Vector2(cx + Math.cos(angle) * r, cz + Math.sin(angle) * r));
    }
  }
  return points;
}

/** Terrain: a shallow regolith bed, one hero crater at the west end, a small
 * secondary crater at the east end, and a flat pad under the modules. */
export function lunarHeight(x: number, z: number) {
  let h = 0.014 * Math.sin(x * 3.1 + Math.cos(z * 4.6)) + 0.008 * Math.sin(z * 7.2 - x * 2.4);
  // Hero crater with a raised rim: inside dips, rim rises, outside falls back.
  const crater = (cx: number, cz: number, radius: number, depth: number) => {
    const d = Math.hypot(x - cx, z - cz) / radius;
    if (d > 1.9) return 0;
    const bowl = -depth * (1 - smooth(d, 0.55, 1.05));
    const rim = depth * 0.55 * Math.exp(-((d - 1.02) ** 2) / 0.06);
    return bowl + rim;
  };
  h += crater(SITE.crater.x, SITE.crater.z, SITE.crater.radius, SITE.crater.depth);
  h += crater(SITE.craterSmall.x, SITE.craterSmall.z, SITE.craterSmall.radius, SITE.craterSmall.depth);
  // A low ridge behind the modules: without it the surface reads as a flat
  // plate of sand rather than a section of regolith.
  h += .05 * Math.exp(-((z + .58) ** 2) / .012) * smooth(x + 1.9, -1.2, .4) * (1 - smooth(x, 1.1, 1.7));
  // Flatten the build pad; the transition is wide so no crease appears.
  const padMask = (1 - smooth(Math.abs(x - 0.42), 1.02, 1.34)) * (1 - smooth(Math.abs(z), 0.5, 0.66));
  h = h * (1 - padMask) + LUNAR.pad * padMask;
  return h;
}
