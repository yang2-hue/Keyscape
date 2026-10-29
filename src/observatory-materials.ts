import * as THREE from 'three';
import { seeded } from './coastal-materials';

/** Ground maps for the Q hillside.
 *
 * The old surface was vertex colour alone: one flat wash of #6d6a63 with no
 * normal and no roughness break, which is why it read as a slab of clay no
 * matter how the light moved. A tiled triple (albedo / normal / roughness)
 * gives the soil a scale the eye can lock onto at half a metre.
 *
 * Everything here has to tile exactly. The map repeats five times across the
 * key, so a lattice that does not wrap would leave eight visible seams — the
 * surface would read as a woven mat. The noise below is therefore periodic on
 * an integer lattice, and every stamped stone is drawn nine times, once per
 * wrapped neighbourhood, so stones crossing an edge come back on the far side.
 */

const wrap = (value: number, period: number) => ((value % period) + period) % period;

/** Value noise on a lattice that closes on itself after `cells` steps. */
function periodic(u: number, v: number, cells: number, seed: number) {
  const x = u * cells, y = v * cells;
  const xi = Math.floor(x), yi = Math.floor(y);
  const fx = x - xi, fy = y - yi;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const at = (i: number, j: number) => {
    let h = Math.imul(wrap(i, cells), 374761393)
      ^ Math.imul(wrap(j, cells), 668265263)
      ^ Math.imul(seed, 1274126177);
    h = Math.imul(h ^ (h >>> 13), 1103515245);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  };
  const a = at(xi, yi), b = at(xi + 1, yi), c = at(xi, yi + 1), d = at(xi + 1, yi + 1);
  const top = a + (b - a) * sx, bottom = c + (d - c) * sx;
  return top + (bottom - top) * sy;
}

/** Sum of periodic octaves: each one has an integer period, so the total is
 * periodic too. `cells` is the fundamental; octaves double it. */
function fbm(u: number, v: number, cells: number, octaves: number, seed: number) {
  let sum = 0, amp = 1, norm = 0, c = cells;
  for (let o = 0; o < octaves; o++) {
    sum += amp * periodic(u, v, c, seed + o * 1013);
    norm += amp; amp *= .55; c *= 2;
  }
  return sum / norm;
}

export type GroundMaps = { map: THREE.Texture; normal: THREE.Texture; rough: THREE.Texture };

function canvasFrom(data: Uint8ClampedArray, n: number) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = n;
  const ctx = canvas.getContext('2d')!;
  // Copy into the context's own buffer: the constructor rejects a view whose
  // backing store TypeScript cannot prove is a plain ArrayBuffer.
  const image = ctx.createImageData(n, n);
  image.data.set(data);
  ctx.putImageData(image, 0, 0);
  return canvas;
}

export function groundMaps(quality: 'full' | 'software' = 'full'): GroundMaps {
  const n = quality === 'full' ? 512 : 256;
  const height = new Float32Array(n * n);
  const stone = new Float32Array(n * n);
  const grain = new Float32Array(n * n);
  const random = seeded(2026102912);

  // ---- soil relief ------------------------------------------------------
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const u = x / n, v = y / n, i = y * n + x;
    height[i] = .52 * fbm(u, v, 3, 4, 19)
      + .30 * fbm(u, v, 9, 3, 71)
      + .18 * fbm(u, v, 27, 2, 131);
    grain[i] = fbm(u, v, 96, 1, 211);
  }

  // ---- stones -----------------------------------------------------------
  // Scale discipline: this tile covers about three quarters of a unit, so one
  // pixel is roughly a millimetre and a half. Anything painted larger than a
  // thumbnail has a modelled twin lying next to it, and the two scales fight.
  // The map therefore carries sand and chips; cobbles are geometry.
  const stamp = (cx: number, cy: number, rx: number, ry: number, rot: number, lift: number) => {
    const cos = Math.cos(rot), sin = Math.sin(rot);
    const reach = Math.ceil(Math.max(rx, ry)) + 1;
    for (let dy = -reach; dy <= reach; dy++) for (let dx = -reach; dx <= reach; dx++) {
      const lx = (dx * cos + dy * sin) / rx;
      const ly = (-dx * sin + dy * cos) / ry;
      const d2 = lx * lx + ly * ly;
      if (d2 >= 1) continue;
      const profile = Math.sqrt(1 - d2);
      const i = wrap(cy + dy, n) * n + wrap(cx + dx, n);
      // Stones push the soil aside rather than stacking on top of each other.
      height[i] += lift * profile * (1 - stone[i] * .72);
      stone[i] = Math.max(stone[i], profile);
    }
  };

  // A thin scatter of half-buried pebbles, then a dense bed of grit.
  for (let k = 0; k < 150; k++) {
    const rx = 1.6 + Math.pow(random(), 2.2) * 3.6;
    stamp(random() * n, random() * n, rx, rx * (.55 + random() * .5), random() * Math.PI, .10 + random() * .13);
  }
  for (let k = 0; k < 3400; k++) {
    const r = .45 + random() * 1.05;
    stamp(random() * n, random() * n, r, r * (.7 + random() * .5), random() * Math.PI, .03 + random() * .05);
  }

  // ---- dry cracks -------------------------------------------------------
  // Two contour networks at different scales: the wide one reads as dried mud
  // pans, the fine one as hairline fissures between them.
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const u = x / n, v = y / n, i = y * n + x;
    const broad = Math.max(0, 1 - Math.abs(periodic(u, v, 7, 307) - .5) / .03);
    const fine = Math.max(0, 1 - Math.abs(periodic(u, v, 19, 509) - .5) / .04);
    height[i] -= (.032 * broad * broad + .014 * fine * fine) * (1 - stone[i]);
  }

  // ---- shade ------------------------------------------------------------
  const albedo = new Uint8ClampedArray(n * n * 4);
  const normal = new Uint8ClampedArray(n * n * 4);
  const rough = new Uint8ClampedArray(n * n * 4);
  const at = (x: number, y: number) => height[wrap(y, n) * n + wrap(x, n)];

  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const i = y * n + x, o = i * 4;
    const u = x / n, v = y / n;
    // Central differences. Row order runs down the canvas while the texture's
    // V runs up, so the vertical derivative flips sign once, here.
    const du = (at(x + 1, y) - at(x - 1, y)) * .5;
    const dv = (at(x, y + 1) - at(x, y - 1)) * .5;
    const slope = Math.hypot(du, dv);
    const rockness = stone[i];
    const damp = 1 - Math.min(1, height[i] * 1.7);

    // Luminance: facets brighten, hollows darken, grit sprinkles. Kept tight —
    // a wide range turns the tile into a pebble mosaic instead of dirt.
    let lum = .84
      + Math.min(.10, slope * 22)
      + rockness * .06
      - damp * .05
      + (grain[i] - .5) * .10;
    lum = Math.max(.62, Math.min(1.04, lum));

    // A slow warm/cool drift keeps the tile from reading as one grey wash.
    const warmth = fbm(u, v, 5, 2, 401) - .5;
    albedo[o] = lum * (1 + warmth * .13) * 255;
    albedo[o + 1] = lum * (1 + warmth * .01) * 255;
    albedo[o + 2] = lum * (1 - warmth * .15) * 255;
    albedo[o + 3] = 255;

    const s = 15;
    const nx = -du * s, ny = dv * s, len = Math.hypot(nx, ny, 1);
    normal[o] = (nx / len * .5 + .5) * 255;
    normal[o + 1] = (ny / len * .5 + .5) * 255;
    normal[o + 2] = (1 / len * .5 + .5) * 255;
    normal[o + 3] = 255;

    // Stone faces are scoured and catch a little sheen; the dust between them
    // stays dead matte, and the crack floors hold the most.
    const value = .96 - rockness * .12 - damp * .06;
    rough[o] = rough[o + 1] = rough[o + 2] = value * 255;
    rough[o + 3] = 255;
  }

  // Four repeats across the key: a 512 tile then covers ~0.74 units, which
  // puts a cobble at roughly the size of the modelled ones beside it.
  const map = new THREE.CanvasTexture(canvasFrom(albedo, n));
  map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = map.wrapT = THREE.RepeatWrapping;
  map.repeat.set(4, 3);
  map.anisotropy = 8;

  const normalMap = new THREE.CanvasTexture(canvasFrom(normal, n));
  normalMap.wrapS = normalMap.wrapT = THREE.RepeatWrapping;
  normalMap.repeat.copy(map.repeat);
  normalMap.anisotropy = 8;

  const roughnessMap = new THREE.CanvasTexture(canvasFrom(rough, n));
  roughnessMap.wrapS = roughnessMap.wrapT = THREE.RepeatWrapping;
  roughnessMap.repeat.copy(map.repeat);
  roughnessMap.anisotropy = 8;

  return { map, normal: normalMap, rough: roughnessMap };
}

/** Fine moulded-plastic grain for the keycap shell. A keycap side is a single
 * vertical surface lit only by ambient, so it renders as one flat value no
 * matter the colour; a little isotropic micro-normal is what stops it reading
 * as a painted band. Amplitude is deliberately tiny — this is matte PBT, not
 * sandpaper. */
export function plasticGrain(size = 256): THREE.Texture {
  const height = new Float32Array(size * size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const u = x / size, v = y / size;
    height[y * size + x] = .55 * fbm(u, v, 24, 3, 617)
      + .45 * fbm(u, v, 61, 2, 733);
  }
  const data = new Uint8ClampedArray(size * size * 4);
  const at = (x: number, y: number) => height[wrap(y, size) * size + wrap(x, size)];
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const o = (y * size + x) * 4;
    const du = (at(x + 1, y) - at(x - 1, y)) * .5;
    const dv = (at(x, y + 1) - at(x, y - 1)) * .5;
    const s = 6;
    const nx = -du * s, ny = dv * s, len = Math.hypot(nx, ny, 1);
    data[o] = (nx / len * .5 + .5) * 255;
    data[o + 1] = (ny / len * .5 + .5) * 255;
    data[o + 2] = (1 / len * .5 + .5) * 255;
    data[o + 3] = 255;
  }
  const texture = new THREE.CanvasTexture(canvasFrom(data, size));
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(3, 3);
  texture.anisotropy = 8;
  return texture;
}

/** A rock, not a lump. A displaced sphere reads as dough because every point
 * moves along its own radius; real stone has fracture planes, so one side is
 * planed flat and the remainder is broken by a few incommensurate waves. */
export function rockGeometry(seed: number, quality: 'full' | 'software' = 'full') {
  const geometry = new THREE.SphereGeometry(1, quality === 'full' ? 26 : 16, quality === 'full' ? 18 : 11);
  const positions = geometry.attributes.position;
  const random = seeded(seed);
  const phase = random() * Math.PI * 2;
  const cut = new THREE.Vector3(random() - .5, .35 + random() * .5, random() - .5).normalize();
  const cutHeight = .42 + random() * .2;
  const v = new THREE.Vector3();
  for (let i = 0; i < positions.count; i++) {
    v.fromBufferAttribute(positions, i);
    const lump = .17 * Math.sin(v.x * 4.1 + v.y * 1.7 + phase)
      + .12 * Math.sin(v.z * 5.3 - v.x * 2.9 + phase * 1.7)
      + .07 * Math.sin(v.y * 8.1 + v.z * 3.3 - phase)
      + .04 * Math.sin(v.x * 14.7 - v.z * 11.1);
    v.multiplyScalar(1 + lump);
    // A fracture plane through one shoulder: flatten whatever stands above it.
    const above = v.dot(cut) - cutHeight;
    if (above > 0) v.addScaledVector(cut, -above * .8);
    positions.setXYZ(i, v.x, v.y * (.58 + random() * .16), v.z);
  }
  geometry.computeVertexNormals();
  return geometry;
}
