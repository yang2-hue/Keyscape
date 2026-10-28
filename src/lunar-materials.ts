import * as THREE from 'three';
import { seeded } from './coastal-materials';

/** Regolith is not sand: it is fine, angular, and holds a footprint. The map
 * therefore carries small bright grains over a mid-grey base plus a handful of
 * soft dark patches where the surface is compacted. */
function regolithSurface(kind: 'dust' | 'hull') {
  const n = 256, canvas = document.createElement('canvas');
  canvas.width = canvas.height = n;
  const ctx = canvas.getContext('2d')!;
  const random = seeded(kind === 'dust' ? 411 : 907);
  ctx.fillStyle = kind === 'dust' ? '#c6c0b5' : '#e8e4da';
  ctx.fillRect(0, 0, n, n);
  const image = ctx.getImageData(0, 0, n, n);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const i = (y * n + x) * 4;
    const broad = Math.sin(x * .011 + Math.cos(y * .013) * 1.7) * Math.cos(y * .009 + x * .006) * 2.4;
    const grain = (random() - .5) * (kind === 'dust' ? 34 : 12);
    for (let c = 0; c < 3; c++) image.data[i + c] = Math.max(0, Math.min(255, image.data[i + c] + broad + grain));
  }
  ctx.putImageData(image, 0, 0);
  if (kind === 'dust') {
    // Gravel and micro-craters.
    for (let k = 0; k < 90; k++) {
      const r = .6 + random() * 2.4;
      ctx.fillStyle = random() > .5 ? `rgba(255,252,246,${.05 + random() * .12})` : `rgba(96,90,80,${.05 + random() * .1})`;
      ctx.beginPath(); ctx.arc(random() * n, random() * n, r, 0, Math.PI * 2); ctx.fill();
    }
    for (let k = 0; k < 26; k++) {
      const r = 3 + random() * 9;
      ctx.strokeStyle = `rgba(120,114,104,${.06 + random() * .06})`;
      ctx.lineWidth = .7; ctx.beginPath(); ctx.arc(random() * n, random() * n, r, 0, Math.PI * 2); ctx.stroke();
    }
  } else {
    // Hull: quiet panel breaks, so the modules are not featureless white tubes.
    for (let k = 0; k < 26; k++) {
      ctx.strokeStyle = `rgba(120,116,106,${.06 + random() * .06})`;
      ctx.lineWidth = .6; ctx.beginPath(); ctx.moveTo(0, k * 10 + 4); ctx.lineTo(n, k * 10 + 4); ctx.stroke();
    }
  }
  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = map.wrapT = THREE.RepeatWrapping;
  map.anisotropy = 8;
  return { map, normal: normalFrom(image, n, kind === 'dust' ? .5 : .18) };
}

function normalFrom(image: ImageData, n: number, strength: number) {
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = n;
  const ctx = canvas.getContext('2d')!;
  const out = ctx.createImageData(n, n);
  const at = (x: number, y: number) => image.data[((y + n) % n * n + (x + n) % n) * 4];
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const i = (y * n + x) * 4;
    const nx = -(at(x + 1, y) - at(x - 1, y)) * strength;
    const ny = -(at(x, y + 1) - at(x, y - 1)) * strength;
    const nz = 255, len = Math.hypot(nx, ny, nz) || 1;
    out.data[i] = Math.round((nx / len * .5 + .5) * 255);
    out.data[i + 1] = Math.round((ny / len * .5 + .5) * 255);
    out.data[i + 2] = Math.round((nz / len * .5 + .5) * 255);
    out.data[i + 3] = 255;
  }
  ctx.putImageData(out, 0, 0);
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = 8;
  return texture;
}

/** Baked regolith maps out of Blender (scripts/blender/bake-lunar-regolith.py).
 * They replace the canvas noise below whenever they are available: a 1024 tile
 * carries gravel and impact pits at a size the eye can actually resolve, which
 * 256 px of per-pixel noise never did — it averaged out to flat clay the moment
 * the surface was more than a metre away on screen. */
export type RegolithMaps = { albedo: THREE.Texture; normal: THREE.Texture; rough: THREE.Texture };

/** Greys read as "3D clay" without a cool highlight; every surface here leans
 * very slightly warm so the sun can stay neutral white. */
export function makeLunarMaterials(quality: 'full' | 'software' = 'full', baked?: RegolithMaps) {
  const dust = regolithSurface('dust'), hull = regolithSurface('hull');
  dust.map.repeat.set(4, 2); dust.normal.repeat.set(4, 2);
  hull.map.repeat.set(8, 2); hull.normal.repeat.set(8, 2);

  // The plane's UV runs once across 3.64 x 1.44 units, so 2.5 x 1 repeats give
  // near-square tiles of 1.45 units. The baked tile is periodic, so no seam.
  const detail = baked ? (() => {
    const map = baked.albedo.clone();
    map.colorSpace = THREE.SRGBColorSpace;
    map.wrapS = map.wrapT = THREE.RepeatWrapping;
    map.repeat.set(3.4, 1.36);
    map.anisotropy = 8;
    const normal = baked.normal.clone();
    normal.colorSpace = THREE.NoColorSpace;
    normal.wrapS = normal.wrapT = THREE.RepeatWrapping;
    normal.repeat.set(3.4, 1.36);
    normal.anisotropy = 8;
    const rough = baked.rough.clone();
    rough.colorSpace = THREE.NoColorSpace;
    rough.wrapS = rough.wrapT = THREE.RepeatWrapping;
    rough.repeat.set(3.4, 1.36);
    return { map, normal, rough };
  })() : null;

  const standard = (color: string, roughness = .92, extra: THREE.MeshStandardMaterialParameters = {}) =>
    new THREE.MeshStandardMaterial({ color, roughness, metalness: 0, ...extra });

  const materials = {
    // Colour in the baked map, tint in the material, macro variation in vertex
    // colours. Keeping the three jobs apart is what stops the surface reading as
    // a photograph of dirt pasted onto a slab.
    regolith: detail
      ? standard('#b9babb', 1, { map: detail.map, normalMap: detail.normal, normalScale: new THREE.Vector2(2.2, 2.2), roughnessMap: detail.rough })
      : standard('#807d78', .97, { map: dust.map, normalMap: dust.normal, normalScale: new THREE.Vector2(1.6, 1.6) }),
    boulder: detail
      ? standard('#ffffff', 1, { map: detail.map, normalMap: detail.normal, normalScale: new THREE.Vector2(1.1, 1.1), roughnessMap: detail.rough })
      : standard('#928f8a', .96, { map: dust.map, normalMap: dust.normal, normalScale: new THREE.Vector2(1.1, 1.1) }),
    hull: standard('#efece3', .74, { map: hull.map, normalMap: hull.normal, normalScale: new THREE.Vector2(.5, .5) }),
    hullWarm: standard('#ded6c6', .78, { map: hull.map }),
    trim: standard('#c9c3b6', .6, { metalness: .15 }),
    metal: standard('#a3a8ae', .32, { metalness: .88 }),
    darkMetal: standard('#4a4f55', .45, { metalness: .7 }),
    panel: standard('#3b4d68', .34, { metalness: .7 }),
    panelGlow: standard('#3a4a5e', .35, { metalness: .5, emissive: '#22303f', emissiveIntensity: .3 }),
    window: standard('#5d5a4e', .35, { emissive: '#ffca82', emissiveIntensity: 0 }),
    lamp: standard('#f3e6cf', .5, { emissive: '#ffcf94', emissiveIntensity: 1.6 }),
    bed: standard('#6d6558', .95),
    leafA: standard('#4d6b3b', .9, { side: THREE.DoubleSide }),
    leafB: standard('#5d7a45', .9, { side: THREE.DoubleSide }),
    leafC: standard('#3f5a33', .92, { side: THREE.DoubleSide }),
    soil: standard('#4b4136', .98),
    // Single sided on purpose: a double-sided transparent vault is two sheets of
    // glass stacked in the same pixels, and the crops behind it turn to soup.
    glass: quality === 'full'
      ? new THREE.MeshPhysicalMaterial({ color: '#dcecee', roughness: .04, metalness: 0, transmission: .9, thickness: .02, ior: 1.45, transparent: true, opacity: .38, side: THREE.FrontSide, depthWrite: false })
      : new THREE.MeshStandardMaterial({ color: '#e2f0f1', roughness: .05, metalness: 0, transparent: true, opacity: .14, side: THREE.FrontSide, depthWrite: false }),
    glassRoof: quality === 'full'
      ? new THREE.MeshPhysicalMaterial({ color: '#e2eeee', roughness: .1, transmission: .8, thickness: .02, transparent: true, opacity: .3, side: THREE.FrontSide, depthWrite: false })
      : new THREE.MeshStandardMaterial({ color: '#e6f1f1', roughness: .1, transparent: true, opacity: .12, side: THREE.FrontSide, depthWrite: false }),
  };

  return {
    materials,
    dispose() {
      Object.values(materials).forEach(m => m.dispose());
      dust.map.dispose(); dust.normal.dispose(); hull.map.dispose(); hull.normal.dispose();
      detail?.map.dispose(); detail?.normal.dispose(); detail?.rough.dispose();
    },
  };
}

export type LunarMaterials = ReturnType<typeof makeLunarMaterials>['materials'];
