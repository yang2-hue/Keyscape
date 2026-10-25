import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { HARBOR, type Heightfield } from './harbor-layout';

/** Rain is a local, cheap effect: 150 falling line segments plus rings on the
 * water surface. It reads the same heightfield as the fish and the boat, so
 * drops never fall through the island and rings only appear on water. */
export function Weather({ field, rainy, playing }: { field: Heightfield; rainy: boolean; playing: boolean }) {
  const lines = useRef<THREE.LineSegments>(null);
  const rings = useRef<THREE.InstancedMesh>(null);
  const amount = useRef(0);
  const time = useRef(0);
  const data = useMemo(() => {
    const drops = new Float32Array(150 * 6);
    const seeds = Array.from({ length: 150 }, (_, i) => ({ x: Math.sin(i * 127.1) * 1.5, z: Math.sin(i * 311.7 + 2) * 1.5, phase: (i * 0.61803398875) % 1 }));
    const water = seeds.filter(d => Math.abs(d.x) < 1.4 && Math.abs(d.z) < 1.4 && field.sample(d.x, d.z) < HARBOR.water - 0.06).slice(0, 35);
    const dummy = new THREE.Object3D();
    return { drops, seeds, water, dummy };
  }, [field]);
  useFrame((_, dt) => {
    const delta = Math.min(dt, 0.05);
    amount.current = THREE.MathUtils.damp(amount.current, rainy ? 1 : 0, 3, delta);
    if (playing) time.current += delta;
    if (lines.current) {
      lines.current.visible = amount.current > 0.005;
      const material = lines.current.material as THREE.LineBasicMaterial;
      material.opacity = amount.current * 0.36;
      for (let i = 0; i < data.seeds.length; i++) {
        const drop = data.seeds[i];
        const floor = Math.max(HARBOR.water, field.sample(drop.x, drop.z));
        const y = floor + ((drop.phase - time.current * 0.75) % 1 + 1) % 1 * 2.5;
        data.drops.set([drop.x, y, drop.z, drop.x + 0.024, Math.max(floor, y - 0.12), drop.z + 0.015], i * 6);
      }
      lines.current.geometry.attributes.position.needsUpdate = true;
    }
    if (rings.current) {
      rings.current.visible = amount.current > 0.005;
      (rings.current.material as THREE.MeshBasicMaterial).opacity = amount.current * 0.3;
      data.water.forEach((drop, i) => {
        const age = ((time.current * 0.7 + drop.phase) % 1);
        const scale = 0.02 + age * 0.15;
        data.dummy.position.set(drop.x, HARBOR.water + 0.013, drop.z);
        data.dummy.rotation.set(-Math.PI / 2, 0, 0);
        data.dummy.scale.setScalar(age > 0.85 ? 0 : scale);
        data.dummy.updateMatrix();
        rings.current!.setMatrixAt(i, data.dummy.matrix);
      });
      rings.current.instanceMatrix.needsUpdate = true;
    }
  });
  return <group>
    <lineSegments ref={lines} frustumCulled={false} renderOrder={5}>
      <bufferGeometry><bufferAttribute attach="attributes-position" args={[data.drops, 3]} /></bufferGeometry>
      <lineBasicMaterial color="#c6e1e1" transparent opacity={0} depthWrite={false} />
    </lineSegments>
    <instancedMesh ref={rings} args={[undefined, undefined, data.water.length]} frustumCulled={false} renderOrder={4}>
      <ringGeometry args={[0.92, 1, 40]} />
      <meshBasicMaterial color="#dbf5e9" transparent opacity={0} depthWrite={false} side={THREE.DoubleSide} />
    </instancedMesh>
  </group>;
}
