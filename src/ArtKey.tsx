import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { RoundedBox } from '@react-three/drei';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

export type WorkId = 'harbor' | 'grotto';

function random(seed: number) {
  let value = seed;
  return () => { value = (value * 1664525 + 1013904223) >>> 0; return value / 4294967296; };
}

export function StudioEnvironment() {
  const { gl, scene } = useThree();
  useEffect(() => {
    const room = new RoomEnvironment();
    const generator = new THREE.PMREMGenerator(gl);
    const target = generator.fromScene(room, 0.04);
    const previous = scene.environment;
    const previousIntensity = scene.environmentIntensity;
    scene.environment = target.texture;
    scene.environmentIntensity = 0.35;
    return () => { scene.environment = previous; scene.environmentIntensity = previousIntensity; target.dispose(); generator.dispose(); room.dispose(); };
  }, [gl, scene]);
  return null;
}

function terrainHeight(x: number, z: number) {
  const d = Math.sqrt(((x + 1.13) / 1.05) ** 2 + ((z + 0.5) / 1.18) ** 2);
  return -0.46 + 1.6 * Math.max(0, 1 - d) ** 0.65
    + 0.025 * Math.sin(x * 13 + z * 6) * Math.cos(z * 11);
}

function Terrain() {
  const geometry = useMemo(() => {
    const geo = new THREE.PlaneGeometry(3.14, 3.14, 80, 80);
    geo.rotateX(-Math.PI / 2);
    const positions = geo.attributes.position;
    const colors: number[] = [];
    const sand = new THREE.Color('#d9c9a4');
    const rock = new THREE.Color('#a7a18b');
    for (let i = 0; i < positions.count; i++) {
      const x = positions.getX(i), z = positions.getZ(i), y = terrainHeight(x, z);
      positions.setY(i, y);
      const color = sand.clone().lerp(rock, Math.max(0, Math.min(1, (y - 0.28) * 1.4)));
      color.multiplyScalar(0.96 + Math.sin(x * 65) * Math.cos(z * 72) * 0.04);
      colors.push(color.r, color.g, color.b);
    }
    geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geo.computeVertexNormals();
    return geo;
  }, []);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return <mesh geometry={geometry} receiveShadow><meshStandardMaterial vertexColors roughness={0.87} /></mesh>;
}

const waterVertex = `
  uniform float time;
  varying vec3 vPoint;
  void main() {
    vec3 p = position;
    p.z += sin(p.x * 9.0 + time * 0.65) * 0.007 + cos(p.y * 13.0 + time * 0.45) * 0.005;
    vPoint = p;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  }
`;
const waterFragment = `
  uniform float time;
  uniform float dusk;
  varying vec3 vPoint;
  void main() {
    vec2 p = vPoint.xy;
    float a = sin(p.x * 28.0 + sin(p.y * 14.0 + time * 0.7) * 1.6 + time * 0.6);
    float b = cos(p.y * 32.0 - sin(p.x * 10.0 - time * 0.4) * 1.5);
    float lace = pow(max(0.0, a * b), 9.0);
    float glint = pow(max(0.0, sin(p.x * 43.0 + p.y * 18.0 + time) * cos(p.y * 50.0)), 22.0);
    vec3 blue = mix(vec3(0.045, 0.47, 0.52), vec3(0.035, 0.20, 0.29), dusk);
    vec3 color = mix(blue, vec3(0.82, 0.97, 0.88), lace * 0.8 + glint * 0.7);
    gl_FragColor = vec4(color, 0.12 + lace * 0.29 + glint * 0.3);
  }
`;

function Sea({ playing, evening }: { playing: boolean; evening: boolean }) {
  const shader = useRef<THREE.ShaderMaterial>(null);
  const uniforms = useMemo(() => ({ time: { value: 0 }, dusk: { value: 0 } }), []);
  useFrame((_, dt) => {
    if (!shader.current) return;
    if (playing) uniforms.time.value += Math.min(dt, 0.05);
    uniforms.dusk.value = THREE.MathUtils.damp(uniforms.dusk.value, evening ? 1 : 0, 3, dt);
  });
  return <group>
    <RoundedBox args={[3.19, 0.95, 3.19]} radius={0.085} smoothness={4} position={[0, 0.015, 0]} renderOrder={2}>
      <meshPhysicalMaterial color="#128294" transparent opacity={0.65} roughness={0.1} transmission={0.7} thickness={1.1} attenuationColor="#398b93" attenuationDistance={3.8} ior={1.333} depthWrite={false} envMapIntensity={0.65} />
    </RoundedBox>
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.503, 0]} renderOrder={3}>
      <planeGeometry args={[3.12, 3.12, 64, 64]} />
      <shaderMaterial ref={shader} vertexShader={waterVertex} fragmentShader={waterFragment} uniforms={uniforms} transparent depthWrite={false} side={THREE.DoubleSide} />
    </mesh>
  </group>;
}

function Rock({ position, scale = [0.2, 0.2, 0.2], shade = '#c4bca7' }: { position: [number, number, number]; scale?: [number, number, number]; shade?: string }) {
  return <mesh position={position} scale={scale} castShadow receiveShadow rotation={[position[0], position[2], 0.3]}>
    <dodecahedronGeometry args={[1, 1]} /><meshStandardMaterial color={shade} roughness={0.92} flatShading />
  </mesh>;
}

function LandscapeDetails() {
  const details = useMemo(() => {
    const rand = random(71);
    return Array.from({ length: 145 }, (_, i) => {
      const x = rand() * 3.02 - 1.51, z = rand() * 3.02 - 1.51;
      const y = terrainHeight(x, z);
      const size = (i < 48 ? 0.08 : 0.026) + rand() * (i < 48 ? 0.14 : 0.035);
      return { x, z, y, size, seed: rand() };
    });
  }, []);
  return <group>{details.map((d, i) => {
    if (d.y > 0.78) return null;
    if (i < 85) return <Rock key={i} position={[d.x, d.y + d.size * 0.45, d.z]} scale={[d.size, d.size * 0.7, d.size * 0.8]} shade={d.y < 0 ? '#a3aaa0' : '#c8bea4'} />;
    if (d.y > 0.4) return <Shrub key={i} position={[d.x, d.y, d.z]} scale={0.07 + d.seed * 0.06} />;
    return <group key={i} position={[d.x, d.y, d.z]}>
      {[0, 1, 2, 3].map(n => <mesh key={n} position={[n * 0.012, 0.045, 0]} rotation={[0.15, n, (n - 1.5) * 0.23]}>
        <coneGeometry args={[0.012, 0.16 + d.seed * 0.15, 4]} /><meshStandardMaterial color={i % 4 === 0 ? '#a87b63' : '#557e69'} roughness={0.9} />
      </mesh>)}
    </group>;
  })}</group>;
}

function Shrub({ position, scale = 0.2 }: { position: [number, number, number]; scale?: number }) {
  return <group position={position} scale={scale}>
    <mesh position={[0, 0.7, 0]} castShadow><cylinderGeometry args={[0.09, 0.13, 1.4, 6]} /><meshStandardMaterial color="#79634b" /></mesh>
    {[[-0.45, 1.35, 0.1], [0.35, 1.5, 0], [0, 1.75, -0.2]].map((p, i) => <mesh key={i} position={p as [number, number, number]} scale={[0.8, 0.43, 0.65]} castShadow>
      <icosahedronGeometry args={[0.9, 2]} /><meshStandardMaterial color={['#596747', '#778152', '#6d764a'][i]} roughness={1} flatShading />
    </mesh>)}
  </group>;
}

function Lighthouse({ evening }: { evening: boolean }) {
  return <group position={[-0.94, 0.86, -0.69]}>
    <mesh position={[0, 0.05, 0]} receiveShadow><cylinderGeometry args={[0.25, 0.29, 0.1, 32]} /><meshStandardMaterial color="#aaa18a" roughness={0.9} /></mesh>
    <mesh position={[0, 0.45, 0]} castShadow><cylinderGeometry args={[0.115, 0.19, 0.83, 32]} /><meshStandardMaterial color="#e7dfc9" roughness={0.7} /></mesh>
    {[0.32, 0.55, 0.74].map((y, i) => <mesh key={i} position={[0.012, y, 0.155 - i * 0.018]}><boxGeometry args={[0.04, 0.075, 0.015]} /><meshStandardMaterial color="#3a514f" /></mesh>)}
    <mesh position={[0, 0.9, 0]} castShadow><cylinderGeometry args={[0.2, 0.2, 0.055, 32]} /><meshStandardMaterial color="#c7baa0" /></mesh>
    <mesh position={[0, 1.025, 0]}><cylinderGeometry args={[0.107, 0.107, 0.22, 12]} /><meshPhysicalMaterial color="#d1dcb8" transparent opacity={0.65} roughness={0.2} emissive="#ffb95c" emissiveIntensity={evening ? 3 : 0.25} /></mesh>
    {Array.from({ length: 8 }, (_, i) => { const a = i * Math.PI / 4; return <mesh key={i} position={[Math.cos(a) * 0.12, 1.02, Math.sin(a) * 0.12]}><cylinderGeometry args={[0.009, 0.009, 0.24, 5]} /><meshStandardMaterial color="#5b6359" /></mesh>; })}
    <mesh position={[0, 1.18, 0]} castShadow><coneGeometry args={[0.19, 0.17, 16]} /><meshStandardMaterial color="#9e6440" metalness={0.25} roughness={0.5} /></mesh>
    <mesh position={[0, 1.3, 0]}><sphereGeometry args={[0.025, 8, 8]} /><meshStandardMaterial color="#a27b47" /></mesh>
    {evening && <pointLight position={[0, 1.04, 0.1]} color="#ffb66c" intensity={1.3} distance={3} />}
  </group>;
}

function House({ position, rotation = 0, scale = 1 }: { position: [number, number, number]; rotation?: number; scale?: number }) {
  const roof = useMemo(() => {
    const shape = new THREE.Shape();
    shape.moveTo(-0.25, 0); shape.lineTo(0, 0.19); shape.lineTo(0.25, 0); shape.closePath();
    return new THREE.ExtrudeGeometry(shape, { depth: 0.48, bevelEnabled: false });
  }, []);
  useEffect(() => () => roof.dispose(), [roof]);
  return <group position={position} rotation={[0, rotation, 0]} scale={scale}>
    <mesh position={[0, 0.22, 0]} castShadow receiveShadow><boxGeometry args={[0.42, 0.44, 0.4]} /><meshStandardMaterial color="#e2d4b7" roughness={0.9} /></mesh>
    <mesh geometry={roof} position={[0, 0.44, -0.24]} castShadow><meshStandardMaterial color="#b16b4e" roughness={0.85} /></mesh>
    {[-0.12, 0.12].map(x => <group key={x} position={[x, 0.29, 0.206]}>
      <mesh><boxGeometry args={[0.075, 0.105, 0.015]} /><meshStandardMaterial color="#4c7774" /></mesh>
      <mesh position={[0, 0, 0.011]}><boxGeometry args={[0.009, 0.1, 0.009]} /><meshStandardMaterial color="#cdc4a5" /></mesh>
    </group>)}
    <mesh position={[0.02, 0.08, 0.208]}><boxGeometry args={[0.072, 0.16, 0.016]} /><meshStandardMaterial color="#5d6e61" /></mesh>
    <mesh position={[0.12, 0.59, -0.05]} castShadow><boxGeometry args={[0.05, 0.19, 0.06]} /><meshStandardMaterial color="#c1af91" /></mesh>
  </group>;
}

function Jetty() {
  return <group position={[-0.08, 0.55, 0.28]} rotation={[0, -0.22, 0]}>
    {Array.from({ length: 10 }, (_, i) => <mesh key={i} position={[0, 0, i * 0.065]} castShadow receiveShadow><boxGeometry args={[0.32, 0.035, 0.057]} /><meshStandardMaterial color={i % 2 ? '#aa9773' : '#b9a381'} roughness={0.95} /></mesh>)}
    {[-0.17, 0.17].flatMap(x => [0.04, 0.54].map(z => <mesh key={`${x}-${z}`} position={[x, -0.18, z]} castShadow><cylinderGeometry args={[0.021, 0.026, 0.65, 8]} /><meshStandardMaterial color="#857760" /></mesh>))}
  </group>;
}

function Boat({ playing }: { playing: boolean }) {
  const group = useRef<THREE.Group>(null);
  const clock = useRef(0);
  useFrame((_, dt) => {
    if (playing) clock.current += Math.min(dt, 0.05);
    if (group.current) { group.current.position.y = 0.52 + Math.sin(clock.current * 1.2) * 0.012; group.current.rotation.z = Math.sin(clock.current * 1.1) * 0.025; }
  });
  return <group ref={group} position={[0.51, 0.52, 0.63]} rotation={[0, -0.4, 0]}>
    <mesh scale={[0.2, 0.11, 0.42]} castShadow><sphereGeometry args={[1, 24, 12, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2]} /><meshStandardMaterial color="#2d6063" side={THREE.DoubleSide} roughness={0.65} /></mesh>
    <mesh position={[0, 0.005, 0]} scale={[0.185, 0.025, 0.39]}><sphereGeometry args={[1, 24, 8]} /><meshStandardMaterial color="#c2a179" /></mesh>
    <mesh position={[0, 0.095, -0.08]} castShadow><boxGeometry args={[0.18, 0.18, 0.2]} /><meshStandardMaterial color="#e6dcc2" /></mesh>
    <mesh position={[0, 0.13, 0.024]}><boxGeometry args={[0.12, 0.065, 0.01]} /><meshStandardMaterial color="#4b7377" /></mesh>
    <mesh position={[0, 0.2, -0.08]}><boxGeometry args={[0.22, 0.025, 0.24]} /><meshStandardMaterial color="#eae0c9" /></mesh>
    <mesh position={[0.02, 0.32, 0.14]}><cylinderGeometry args={[0.009, 0.012, 0.64, 8]} /><meshStandardMaterial color="#917c5b" /></mesh>
    <mesh position={[0.2, -0.015, -0.12]}><sphereGeometry args={[0.045, 12, 8]} /><meshStandardMaterial color="#cc7851" /></mesh>
  </group>;
}

function Grotto() {
  return <group position={[-0.18, 0.61, -0.62]}>
    {Array.from({ length: 13 }, (_, i) => {
      const a = i / 12 * Math.PI;
      return <Rock key={i} position={[Math.cos(a) * 0.62, Math.sin(a) * 0.69, Math.sin(i * 3) * 0.07]} scale={[0.22, 0.2, 0.28]} shade={i % 2 ? '#cfc5a8' : '#bbb49e'} />;
    })}
    <Shrub position={[-0.45, 0.5, 0.02]} scale={0.21} />
    <Shrub position={[0.48, 0.36, -0.02]} scale={0.11} />
  </group>;
}

function Fish({ playing }: { playing: boolean }) {
  const group = useRef<THREE.Group>(null);
  const time = useRef(0);
  useFrame((_, dt) => {
    if (playing) time.current += Math.min(dt, 0.05);
    if (group.current) group.current.position.x = Math.sin(time.current * 0.22) * 0.2;
  });
  return <group ref={group}>
    {Array.from({ length: 7 }, (_, i) => <group key={i} position={[0.2 + i % 3 * 0.31, -0.04 + i % 2 * 0.15, 0.9 + Math.floor(i / 3) * 0.18]} rotation={[0, -0.3, 0]}>
      <mesh scale={[0.072, 0.021, 0.019]}><sphereGeometry args={[1, 10, 8]} /><meshStandardMaterial color="#c4d5b2" metalness={0.4} roughness={0.4} /></mesh>
      <mesh position={[-0.08, 0, 0]} rotation={[0, 0, -Math.PI / 2]}><coneGeometry args={[0.026, 0.048, 3]} /><meshStandardMaterial color="#9bb4a5" /></mesh>
    </group>)}
  </group>;
}

export default function ArtKey({ work, playing, evening }: { work: WorkId; playing: boolean; evening: boolean }) {
  return <group rotation={[0, -0.12, 0]}>
    <RoundedBox args={[3.3, 0.24, 3.3]} radius={0.13} smoothness={5} position={[0, -0.58, 0]} castShadow receiveShadow>
      <meshStandardMaterial color="#ded4b9" roughness={0.42} />
    </RoundedBox>
    <RoundedBox args={[2.92, 0.12, 2.92]} radius={0.1} position={[0, -0.74, 0]} castShadow><meshStandardMaterial color="#b8ae97" roughness={0.65} /></RoundedBox>
    <Terrain />
    <LandscapeDetails />
    <Shrub position={[-1.28, 0.8, -0.13]} scale={0.19} />
    <Shrub position={[-1.25, 0.55, 0.41]} scale={0.15} />
    {work === 'harbor' ? <>
      <Lighthouse evening={evening} />
      <House position={[-0.86, 0.65, 0.05]} rotation={-0.15} />
      <House position={[-1.17, 0.69, -0.98]} rotation={0.2} scale={0.68} />
      {Array.from({ length: 9 }, (_, i) => <mesh key={i} position={[-0.58 + i * 0.067, 0.64 - i * 0.012, 0.25]} castShadow receiveShadow><boxGeometry args={[0.079, 0.045, 0.22]} /><meshStandardMaterial color="#bfb49a" roughness={0.9} /></mesh>)}
      <Jetty /><Boat playing={playing} />
    </> : <Grotto />}
    <Fish playing={playing} />
    <Sea playing={playing} evening={evening} />
  </group>;
}
