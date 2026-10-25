import * as THREE from 'three';

export const HARBOR = { size: 3.2, bottom: -0.75, water: 0.08, rotation: Math.PI / 2 };
/** Clamp only the overflowing corner axes. Float32 straight-edge vertices
 * can exceed 1.57 slightly; preserve their interior coordinate. */
export function roundedSquarePoint(x:number,z:number):[number,number]{
  const dx=Math.max(0,Math.abs(x)-1.41),dz=Math.max(0,Math.abs(z)-1.41),length=Math.hypot(dx,dz);
  if(length<=.16)return [x,z];
  return [Math.sign(x)*(Math.min(Math.abs(x),1.41)+dx/length*.16),Math.sign(z)*(Math.min(Math.abs(z),1.41)+dz/length*.16)];
}
/** The single keycap outline shared by every study. Four straight edges joined
 * by 0.16-radius corners; all studies must use this so the water volume, the
 * resin base and the terrain always agree on the footprint. */
export function keycapOutline(){
  const points:THREE.Vector2[]=[],r=.16,b=1.57-r;
  for(let c=0;c<4;c++)for(let i=0;i<=12;i++){
    const angle=-Math.PI/2+c*Math.PI/2+i*Math.PI/24;
    const x=c<2?b:-b,z=c===1||c===2?b:-b;
    points.push(new THREE.Vector2(x+Math.cos(angle)*r,z+Math.sin(angle)*r));
  }return points;
}

export type Heightfield = { size: number; resolution: number; heights: Float32Array; sample: (x: number, z: number) => number };

/** Rasterize the actual model once; topmost surfaces prevent fish and rain entering land. */
export function buildHeightfield(root: THREE.Object3D, size = HARBOR.size, resolution = 56): Heightfield {
  const heights = new Float32Array(resolution * resolution).fill(HARBOR.bottom);
  const step = size / resolution;
  root.updateMatrixWorld(true);
  root.traverse(object => {
    if (!(object instanceof THREE.Mesh) || object.userData.ignoreHeightfield) return;
    const geometry = object.geometry as THREE.BufferGeometry;
    const position = geometry.getAttribute('position');
    const index = geometry.getIndex();
    const count = index?.count ?? position.count;
    const points = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
    const instance=new THREE.Matrix4(),world=new THREE.Matrix4();
    const instances=object instanceof THREE.InstancedMesh?object.count:1;
    for(let instanceIndex=0;instanceIndex<instances;instanceIndex++) {
    if(object instanceof THREE.InstancedMesh){object.getMatrixAt(instanceIndex,instance);world.multiplyMatrices(object.matrixWorld,instance);}else world.copy(object.matrixWorld);
    for (let i = 0; i < count; i += 3) {
      for (let k = 0; k < 3; k++) points[k].fromBufferAttribute(position, index ? index.getX(i + k) : i + k).applyMatrix4(world);
      const [a, b, c] = points;
      const denominator = (b.z - c.z) * (a.x - c.x) + (c.x - b.x) * (a.z - c.z);
      if (Math.abs(denominator) < 1e-10) continue;
      const minX = Math.max(0, Math.ceil((Math.min(a.x, b.x, c.x) + size / 2) / step - 0.5));
      const maxX = Math.min(resolution - 1, Math.floor((Math.max(a.x, b.x, c.x) + size / 2) / step - 0.5));
      const minZ = Math.max(0, Math.ceil((Math.min(a.z, b.z, c.z) + size / 2) / step - 0.5));
      const maxZ = Math.min(resolution - 1, Math.floor((Math.max(a.z, b.z, c.z) + size / 2) / step - 0.5));
      for (let zi = minZ; zi <= maxZ; zi++) for (let xi = minX; xi <= maxX; xi++) {
        const x = (xi + 0.5) * step - size / 2, z = (zi + 0.5) * step - size / 2;
        const u = ((b.z - c.z) * (x - c.x) + (c.x - b.x) * (z - c.z)) / denominator;
        const v = ((c.z - a.z) * (x - c.x) + (a.x - c.x) * (z - c.z)) / denominator;
        if (u >= -1e-5 && v >= -1e-5 && u + v <= 1.00001) {
          const y = u * a.y + v * b.y + (1 - u - v) * c.y;
          heights[zi * resolution + xi] = Math.max(heights[zi * resolution + xi], y);
        }
      }
    }
    }
  });
  return { size, resolution, heights, sample(x, z) {
    const ix = Math.max(0, Math.min(resolution - 1, Math.floor((x + size / 2) / step)));
    const iz = Math.max(0, Math.min(resolution - 1, Math.floor((z + size / 2) / step)));
    return heights[iz * resolution + ix];
  } };
}

/** Find the largest submerged circle that the coastal study's fish can circle
 * without crossing dry terrain. Returns null when the bay holds no water. */
export function findSwimLoop(field: Heightfield) {
  for (const radius of [0.32, 0.24, 0.16, 0.09]) {
    for (let z = 0.1; z < 1.15; z += 0.12) for (let x = -1.15; x < 0.7; x += 0.12) {
      if (Math.abs(x) + radius + 0.1 > 1.44 || Math.abs(z) + radius * 0.75 + 0.1 > 1.44) continue;
      let valid = true;
      for (const fraction of [0,.35,.65,1]) for (let i = 0; i < 48; i++) {
        const angle = i * Math.PI / 24;
        if (field.sample(x + Math.cos(angle) * radius*fraction, z + Math.sin(angle) * radius * 0.75*fraction) > HARBOR.water - 0.2) { valid = false; break; }
      }
      if (valid) return { x, z, radius };
    }
  }
  return null;
}
