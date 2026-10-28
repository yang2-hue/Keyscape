import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { createLunarBase } from './lunar-base';
import { LUNAR_MOMENTS, type LunarMoment, type LunarPreset } from './lunar-weather';
import { useSoftwareRenderer } from './studio';

type Landmark = 'LunarAirlock' | 'LunarGreenhouseShell' | 'LunarSolarArray' | '';

function landmarkOf(object: THREE.Object3D): Landmark {
  let node: THREE.Object3D | null = object;
  while (node) {
    if (node.name === 'LunarAirlock' || node.name === 'LunarGreenhouseShell' || node.name === 'LunarSolarArray') return node.name as Landmark;
    node = node.parent;
  }
  return '';
}

/** Lights, fog and background for the lunar moment, damped exactly like the
 * coastal rig so a change of moment is a transition and not a cut. */
export function LunarAtmosphere({ moment }: { moment: LunarMoment }) {
  const scene = useThree(state => state.scene);
  const gl = useThree(state => state.gl);
  const preset = LUNAR_MOMENTS.find(item => item.id === moment) ?? LUNAR_MOMENTS[0];
  const initial = useRef(preset).current;
  const ambient = useRef<THREE.AmbientLight>(null);
  const sun = useRef<THREE.DirectionalLight>(null);
  const fill = useRef<THREE.DirectionalLight>(null);
  const hemi = useRef<THREE.HemisphereLight>(null);
  const fog = useRef<THREE.FogExp2>(null);
  const color = useRef(new THREE.Color()).current;
  const keyTarget = useRef(new THREE.Vector3(...initial.key));

  useFrame((_, dt) => {
    const delta = Math.min(dt, 0.05);
    const p = LUNAR_MOMENTS.find(item => item.id === moment) ?? preset;
    scene.environmentIntensity = THREE.MathUtils.damp(scene.environmentIntensity, p.env, 3, delta);
    if (ambient.current) {
      ambient.current.intensity = THREE.MathUtils.damp(ambient.current.intensity, p.ambient, 3, delta);
      ambient.current.color.lerp(color.set(p.ambientColor), 1 - Math.exp(-3 * delta));
    }
    if (sun.current) {
      sun.current.intensity = THREE.MathUtils.damp(sun.current.intensity, p.sun, 3, delta);
      sun.current.color.lerp(color.set(p.sunColor), 1 - Math.exp(-3 * delta));
      // A terminator sun has to travel: keep the direction damped as well.
      keyTarget.current.lerp(new THREE.Vector3(...p.key), 1 - Math.exp(-1.7 * delta));
      sun.current.position.copy(keyTarget.current);
    }
    if (hemi.current) {
      hemi.current.intensity = THREE.MathUtils.damp(hemi.current.intensity, p.hemisphere, 3, delta);
      hemi.current.color.lerp(color.set(p.skyColor), 1 - Math.exp(-3 * delta));
      hemi.current.groundColor.lerp(color.set(p.groundColor), 1 - Math.exp(-3 * delta));
    }
    if (fill.current) {
      fill.current.intensity = THREE.MathUtils.damp(fill.current.intensity, p.fill, 3, delta);
      fill.current.color.lerp(color.set(p.fillColor), 1 - Math.exp(-3 * delta));
    }
    if (fog.current) {
      fog.current.density = THREE.MathUtils.damp(fog.current.density, p.fog, 3, delta);
      fog.current.color.lerp(color.set(p.fogColor), 1 - Math.exp(-3 * delta));
    }
    if (import.meta.env.DEV) {
      const d = gl.domElement.dataset;
      d.moment = moment;
      d.night = String(p.night);
      d.sunIntensity = String(sun.current?.intensity ?? 0);
      d.fogDensity = String(fog.current?.density ?? 0);
      d.environmentIntensity = String(scene.environmentIntensity);
    }
  });

  return <>
    <fogExp2 ref={fog} attach="fog" args={['#0a0c10', 0]} />
    <ambientLight name="LunarAmbient" ref={ambient} intensity={initial.ambient} color={initial.ambientColor} />
    <hemisphereLight name="LunarSky" ref={hemi} intensity={initial.hemisphere} color={initial.skyColor} groundColor={initial.groundColor} />
    <directionalLight
      name="LunarSun" ref={sun} position={initial.key} intensity={initial.sun} color={initial.sunColor}
      castShadow shadow-mapSize={[4096, 4096]}
      shadow-camera-left={-2.4} shadow-camera-right={2.4} shadow-camera-top={1.6} shadow-camera-bottom={-1.6}
      shadow-camera-near={.5} shadow-camera-far={22} shadow-normalBias={.004} shadow-bias={-.00006} shadow-radius={2}
    />
    <directionalLight name="LunarEarthshine" ref={fill} position={[3.2, 2.4, -3.6]} intensity={initial.fill} color={initial.fillColor} />
  </>;
}

/** A starfield on a shell far behind the key. It is geometry, not a background
 * image, so it parallaxes when the viewer orbits. */
function Stars({ level }: { level: number }) {
  const points = useRef<THREE.Points>(null);
  const geometry = useMemo(() => {
    const count = 900, positions = new Float32Array(count * 3), sizes = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      const u = Math.random() * Math.PI * 2, v = Math.acos(2 * Math.random() - 1), r = 9 + Math.random() * 2.2;
      positions[i * 3] = Math.sin(v) * Math.cos(u) * r;
      positions[i * 3 + 1] = Math.cos(v) * r * .55 + 1.2;
      positions[i * 3 + 2] = Math.sin(v) * Math.sin(u) * r;
      sizes[i] = .7 + Math.random() * 1.6;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    g.setAttribute('size', new THREE.BufferAttribute(sizes, 1));
    return g;
  }, []);
  const material = useMemo(() => new THREE.PointsMaterial({ color: '#dfe8f6', size: .028, sizeAttenuation: true, transparent: true, opacity: 0, depthWrite: false, fog: false }), []);
  useEffect(() => () => { geometry.dispose(); material.dispose(); }, [geometry, material]);
  useFrame((_, dt) => {
    material.opacity = THREE.MathUtils.damp(material.opacity, level * .95, 2.2, Math.min(dt, .05));
    if (points.current) points.current.rotation.y += dt * .004;
  });
  return <points ref={points} geometry={geometry} material={material} frustumCulled={false} />;
}

/** Dust lifted off the regolith during the dusty moment. Cheap points: they
 * drift and fade, and never pretend to be weather the Moon cannot have. */
function Dust({ level }: { level: number }) {
  const cloud = useRef<THREE.Points>(null);
  const { geometry, material } = useMemo(() => {
    const count = 260, positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      positions[i * 3] = (Math.random() - .5) * 4.4;
      positions[i * 3 + 1] = Math.random() * .55;
      positions[i * 3 + 2] = (Math.random() - .5) * 1.7;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const m = new THREE.PointsMaterial({ color: '#cfc2ac', size: .012, sizeAttenuation: true, transparent: true, opacity: 0, depthWrite: false });
    return { geometry: g, material: m };
  }, []);
  useEffect(() => () => { geometry.dispose(); material.dispose(); }, [geometry, material]);
  useFrame((state, dt) => {
    material.opacity = THREE.MathUtils.damp(material.opacity, level * .55, 2, Math.min(dt, .05));
    if (cloud.current) {
      cloud.current.position.x = Math.sin(state.clock.elapsedTime * .12) * .12;
      cloud.current.position.y = Math.sin(state.clock.elapsedTime * .3) * .012;
    }
  });
  return <points ref={cloud} geometry={geometry} material={material} />;
}

/** Open/closed airlock, warm interior, sun-tracking panels and a plant canopy
 * that moves just enough to show the greenhouse is alive. */
export default function LunarStudy({ playing, moment }: { playing: boolean; moment: LunarMoment }) {
  const gl = useThree(state => state.gl);
  const invalidate = useThree(state => state.invalidate);
  const camera = useThree(state => state.camera);
  const software = useSoftwareRenderer();
  const time = useMemo(() => ({ value: 0 }), []);
  const habitat = useGLTF(`${import.meta.env.BASE_URL}models/lunar/lunar-habitat.glb`);
  const base = useMemo(() => createLunarBase(time, software ? 'software' : 'full', { habitat: habitat.scene }), [time, software, habitat.scene]);

  const preset: LunarPreset = LUNAR_MOMENTS.find(item => item.id === moment) ?? LUNAR_MOMENTS[0];
  const open = useRef(0);
  const openTarget = useRef(false);
  const manual = useRef<boolean | null>(null);
  const lampLevel = useRef(preset.interior);
  const panelTilt = useRef(0);
  const elapsed = useRef(0);
  const hovering = useRef(false);

  useEffect(() => () => { base.dispose(); }, [base]);
  useEffect(() => { if (!playing) { hovering.current = false; document.body.style.cursor = ''; } }, [playing]);

  const toggle = (landmark: Landmark) => {
    if (!playing) return;
    if (landmark === 'LunarAirlock') openTarget.current = !openTarget.current;
    else if (landmark === 'LunarGreenhouseShell') manual.current = !(manual.current ?? preset.interior > .5);
    else if (landmark === 'LunarSolarArray') panelTilt.current = panelTilt.current > .1 ? 0 : .26;
    invalidate();
  };

  // Dev-only anchors so the browser harness can click a real module instead of
  // guessing where it landed on screen.
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const debug = window as unknown as Record<string, unknown>;
    debug.__lunarLandmarks = {
      positions() {
        const v = new THREE.Vector3(), out: Record<string, [number, number, number]> = {};
        for (const name of ['LunarHabitat', 'LunarAirlock', 'LunarGreenhouseShell', 'LunarSolarArray']) {
          const node = base.root.getObjectByName(name);
          if (node) { node.getWorldPosition(v); out[name] = [v.x, v.y, v.z]; }
        }
        return out;
      },
      screen() {
        const rect = gl.domElement.getBoundingClientRect();
        const out: Record<string, [number, number]> = {};
        const project = (x: number, y: number, z: number): [number, number] => {
          const v = new THREE.Vector3(x, y, z).project(camera);
          return [rect.left + (v.x * .5 + .5) * rect.width, rect.top + (-v.y * .5 + .5) * rect.height];
        };
        const p = new THREE.Vector3();
        for (const [name, dy] of [['LunarAirlock', .0], ['LunarGreenhouseShell', .18], ['LunarSolarArray', .12]] as const) {
          const node = base.root.getObjectByName(name);
          if (node) { node.getWorldPosition(p); out[name] = project(p.x, p.y + dy, p.z); }
        }
        return out;
      },
      state() {
        return {
          door: Number(open.current.toFixed(3)),
          lamp: Number(lampLevel.current.toFixed(3)),
          manual: manual.current,
          tilt: Number(panelTilt.current.toFixed(3)),
        };
      },
    };
    return () => { delete debug.__lunarLandmarks; };
  }, [base, camera, gl]);

  useFrame((_, dt) => {
    const delta = Math.min(dt, 0.05);
    if (playing) elapsed.current += delta;
    const t = elapsed.current;

    open.current = THREE.MathUtils.damp(open.current, openTarget.current ? 1 : 0, 5, delta);
    base.doors.left.position.z = -.032 - open.current * .05;
    base.doors.right.position.z = .032 + open.current * .05;
    base.doorLight.emissiveIntensity = open.current * 2.6;

    const target = manual.current === null ? preset.interior : manual.current ? 1 : 0;
    lampLevel.current = THREE.MathUtils.damp(lampLevel.current, target, 3, delta);
    base.lampMaterial.emissiveIntensity = .2 + lampLevel.current * 1.5;
    base.windowMaterial.emissiveIntensity = lampLevel.current * 1.5;
    for (const light of base.interiorLights) light.intensity = lampLevel.current * .42;
    for (const bar of base.growBars) bar.emissiveIntensity = .18 + lampLevel.current * .55;

    base.panels.rotation.z = THREE.MathUtils.damp(base.panels.rotation.z, panelTilt.current + (preset.id === 'terminator' ? .18 : 0), 2.4, delta);
    // The canopy leans together: a small, slow movement reads as air handling.
    base.plants.rotation.z = Math.sin(t * .55) * .006 + Math.sin(t * .23) * .004;

    if (import.meta.env.DEV) {
      const d = gl.domElement.dataset;
      d.lunarDoor = String(open.current);
      d.lunarLamp = String(lampLevel.current);
      d.lunarManual = manual.current === null ? 'auto' : String(manual.current);
    }
  });

  const onMove = (event: ThreeEvent<PointerEvent>) => {
    const landmark = landmarkOf(event.object);
    if (!!landmark !== hovering.current) {
      hovering.current = !!landmark;
      document.body.style.cursor = landmark ? 'pointer' : '';
    }
  };
  const onOut = () => { hovering.current = false; document.body.style.cursor = ''; };
  const onClick = (event: ThreeEvent<MouseEvent>) => {
    const landmark = landmarkOf(event.object);
    if (!landmark) return;
    event.stopPropagation();
    toggle(landmark);
  };

  return <>
    <primitive object={base.root} dispose={null} onClick={onClick} onPointerMove={onMove} onPointerOut={onOut} />
    <Stars level={preset.stars} />
    <Dust level={preset.dust} />
  </>;
}
