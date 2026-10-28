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

/** Impact craters, west to east: one hero crater, a secondary, and three
 * satellites that make the west end read as a cratered field rather than a
 * single hole. */
export const CRATERS = [
  { x: -1.3, z: 0.02, radius: 0.36, depth: 0.16 },
  { x: 1.44, z: -0.3, radius: 0.15, depth: 0.05 },
  { x: -1.56, z: -0.28, radius: 0.075, depth: 0.026 },
  { x: -1.65, z: 0.26, radius: 0.055, depth: 0.018 },
  { x: 1.56, z: 0.3, radius: 0.06, depth: 0.02 },
];

/** Where each structure lives, in study coordinates (X = long axis). */
export const SITE = {
  crater: CRATERS[0],
  craterSmall: CRATERS[1],
  habitat: { x: -0.34, z: 0.02, radius: 0.185, length: 0.44 },
  airlock: { x: 0.06, z: 0.02 },
  greenhouse: { x: 0.76, z: 0.02, radius: 0.25, length: 0.98, plinth: 0.05 },
  solar: { x: -0.64, z: 0.5 },
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

const hash2 = (i: number, j: number) => {
  const n = Math.sin(i * 127.1 + j * 311.7) * 43758.5453;
  return n - Math.floor(n);
};

/** Gradient noise, not value noise.
 *
 * Value noise interpolates the lattice *values*, so its iso-lines follow the
 * lattice and every octave leaves a faint checkerboard. On a large flat surface
 * under a directional light that reads as diagonal corduroy — visible in the
 * renders no matter how small the amplitude. Gradient noise only uses the
 * lattice for directions, so it has no preferred axis. */
export function noise2(x: number, z: number) {
  const i = Math.floor(x), j = Math.floor(z);
  const fx = x - i, fz = z - j;
  const u = fx * fx * fx * (fx * (fx * 6 - 15) + 10);
  const v = fz * fz * fz * (fz * (fz * 6 - 15) + 10);
  const grad = (ix: number, iz: number, dx: number, dz: number) => {
    const a = hash2(ix, iz) * Math.PI * 2;
    return Math.cos(a) * dx + Math.sin(a) * dz;
  };
  const n00 = grad(i, j, fx, fz), n10 = grad(i + 1, j, fx - 1, fz);
  const n01 = grad(i, j + 1, fx, fz - 1), n11 = grad(i + 1, j + 1, fx - 1, fz - 1);
  return (n00 * (1 - u) + n10 * u) * (1 - v) + (n01 * (1 - u) + n11 * u) * v;
}

/** Terrain: a shallow regolith bed, one hero crater at the west end, a small
 * secondary crater at the east end, and a flat pad under the modules. */
export function lunarHeight(x: number, z: number) {
  let h = 0.014 * Math.sin(x * 3.1 + Math.cos(z * 4.6)) + 0.008 * Math.sin(z * 7.2 - x * 2.4);
  // A fresh simple crater is not a smooth dish. It has a flat floor, a wall that
  // steepens to a narrow crest standing above the surrounding ground, and then
  // an ejecta apron that thins out over about one radius.
  const crater = (cx: number, cz: number, radius: number, depth: number) => {
    const dx = x - cx, dz = z - cz;
    const d = Math.hypot(dx, dz) / radius;
    if (d > 2.1) return 0;
    const angle = Math.atan2(dz, dx);
    const bowl = -depth * (1 - smooth(d, 0.34, 0.97));
    // The crest is a narrow ridge just outside the wall; a wide gaussian here is
    // what made the old crater read as a dimple instead of an impact.
    // Its height and radius vary with angle, because a real rim is never a circle.
    const wobble = 1 + .08 * Math.sin(angle * 3.1 + cx * 7) + .05 * Math.sin(angle * 7.3 + cz * 5);
    const rim = depth * .5 * wobble * Math.exp(-((d - 1.05 * wobble) ** 2) / 0.011);
    // Radial striations down the inner wall: slumping leaves grooves running
    // toward the floor, and they are what stops the bowl reading as plaster.
    const band = 1 - smooth(Math.abs(d - .76), .05, .26);
    // Slump grooves: shallow, low-count, and only on the upper wall. Higher
    // counts turned the bowl into a pleated curtain in grazing light.
    const striae = band * depth * .045 * (Math.sin(angle * 11 + d * 6) + .5 * Math.sin(angle * 19 + 1.7));
    // Ejecta rays: a few directions threw further than the rest.
    const rays = 1 + .55 * Math.sin(angle * 5.2 + 1.1) * Math.sin(angle * 2.7 - .4);
    const ejecta = depth * .16 * rays * (1 - smooth(d, 1.08, 1.95));
    return bowl + rim + striae + ejecta;
  };
  for (const craterSite of CRATERS) {
    h += crater(craterSite.x, craterSite.z, craterSite.radius, craterSite.depth);
  }
  // A low ridge behind the modules: without it the surface reads as a flat
  // plate of sand rather than a section of regolith.
  h += .05 * Math.exp(-((z + .58) ** 2) / .012) * smooth(x + 1.9, -1.2, .4) * (1 - smooth(x, 1.1, 1.7));
  // Flatten the build pad; the transition is wide so no crease appears.
  const padMask = (1 - smooth(Math.abs(x - 0.42), 1.02, 1.34)) * (1 - smooth(Math.abs(z), 0.5, 0.66));
  h = h * (1 - padMask) + LUNAR.pad * padMask;
  // Grain: two octaves of noise on the open ground only. The pad has to stay
  // flat — a bump under a doorstep reads as a modelling error, not as dust.
  // Sheared domains per octave: sampling the same lattice twice on the same axes
  // leaves visible diagonal banding, which is what value noise is famous for.
  // Three octaves, each on its own sheared domain: the mesh is 0.0096 units per
  // cell, so 34 is the highest frequency that still resolves (about 3 cells).
  const grain =
    noise2(x * 7.5 + z * 2.1, z * 7.5 - x * 1.9) * .010 +
    noise2(x * 17 - z * 4.3, z * 17 + x * 3.9) * .0055 +
    noise2(x * 34 + z * 7.7, z * 34 - x * 6.1) * .0024;
  h += grain * (1 - padMask);
  return h;
}
