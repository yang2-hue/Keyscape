import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import { useGLTF, useTexture } from '@react-three/drei';
import * as THREE from 'three';
import { createLunarBase } from './lunar-base';
import { seeded } from './coastal-materials';
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

/** A star has to be a point source, and a point source has no size in world
 * units. `PointsMaterial` with `sizeAttenuation` decides that in the shader by
 * dividing by view depth — but only for a perspective camera. This study uses an
 * orthographic lens, where that branch never runs and a star of size 0.028 stays
 * 0.028 of a pixel: the field was there all along and simply never drew. The
 * shader below keeps the size in device pixels instead, which is also what a
 * star should be.
 *
 * The shell sits 22–28 units out, well behind the key, so it swings a little
 * when the visitor orbits without ever competing with the terrain, and 55% of
 * the field is pulled into a Milky Way band so the sky is not uniform noise. */
function Stars({ level }: { level: number }) {
  const points = useRef<THREE.Points>(null);
  const gl = useThree(state => state.gl);
  const camera = useThree(state => state.camera);
  const field = useMemo(() => {
    // A 3.9-unit frame sees 1/80 of the sphere, so a few hundred stars would put
    // four of them on screen. The count is what buys density; the shell sits
    // close and rides with the camera (a sky has no parallax) so the frame never
    // runs out of them either.
    const count = 12000;
    const positions = new Float32Array(count * 3);
    const sizes = new Float32Array(count);
    const phases = new Float32Array(count);
    const colors = new Float32Array(count * 3);
    const random = seeded(20261028);
    const bandNormal = new THREE.Vector3(.34, .74, -.58).normalize();
    const dir = new THREE.Vector3();
    const hot = new THREE.Color('#b7c8ff'), white = new THREE.Color('#f4f6fb'), warm = new THREE.Color('#ffdfb4');
    const tint = new THREE.Color();
    for (let i = 0; i < count; i++) {
      const inBand = i < count * .55;
      // Rejection sampling onto a band around a great circle; the rest is
      // uniform over the sphere (acos of a uniform variate, not a uniform angle).
      for (let guard = 0; guard < 40; guard++) {
        const u = random() * Math.PI * 2, v = Math.acos(2 * random() - 1);
        dir.set(Math.sin(v) * Math.cos(u), Math.cos(v), Math.sin(v) * Math.sin(u));
        if (!inBand || Math.abs(dir.dot(bandNormal)) < .16) break;
      }
      const radius = 8 + random() * 2.2;
      positions[i * 3] = dir.x * radius;
      positions[i * 3 + 1] = dir.y * radius;
      positions[i * 3 + 2] = dir.z * radius;
      // Most stars sit near one pixel; a handful of first-magnitude ones carry
      // the field, and they are what makes it read as a sky.
      const bright = i % 37 === 0;
      sizes[i] = bright ? 4.0 + random() * 2.0 : 1.35 + Math.pow(random(), 2.2) * 1.9;
      phases[i] = random() * Math.PI * 2;
      const pick = random();
      tint.copy(pick < .62 ? white : pick < .87 ? hot : warm);
      if (inBand) tint.multiplyScalar(.8);
      colors[i * 3] = tint.r; colors[i * 3 + 1] = tint.g; colors[i * 3 + 2] = tint.b;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
    geometry.setAttribute('aPhase', new THREE.BufferAttribute(phases, 1));
    geometry.setAttribute('aColor', new THREE.BufferAttribute(colors, 3));
    const uniforms = {
      uOpacity: { value: 0 },
      uTime: { value: 0 },
      uPixelRatio: { value: 1 },
    };
    const material = new THREE.ShaderMaterial({
      uniforms, transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending,
      vertexShader: `
        attribute float aSize;
        attribute float aPhase;
        attribute vec3 aColor;
        uniform float uOpacity;
        uniform float uTime;
        uniform float uPixelRatio;
        varying vec3 vColor;
        varying float vAlpha;
        void main(){
          gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);
          // Two frequencies keep the field from pulsing in unison.
          float twinkle=.78+.22*sin(uTime*1.15+aPhase*6.2831);
          gl_PointSize=max(1.0,aSize*uPixelRatio*(.9+.1*twinkle));
          vColor=aColor;
          vAlpha=uOpacity*twinkle;
        }`,
      fragmentShader: `
        varying vec3 vColor;
        varying float vAlpha;
        void main(){
          float r=length(gl_PointCoord-.5);
          if(r>.5)discard;
          // Squared falloff: a hard dot reads as a dead pixel, a soft one as glow.
          float core=1.0-smoothstep(0.0,.5,r);
          gl_FragColor=vec4(vColor,vAlpha*core*core);
        }`,
    });
    return { geometry, material, uniforms };
  }, []);
  const { geometry, material, uniforms } = field;
  useEffect(() => () => { geometry.dispose(); material.dispose(); }, [geometry, material]);
  useEffect(() => { uniforms.uPixelRatio.value = gl.getPixelRatio(); }, [gl, uniforms]);
  useFrame((_, dt) => {
    const step = Math.min(dt, .05);
    uniforms.uOpacity.value = THREE.MathUtils.damp(uniforms.uOpacity.value, level, 2.2, step);
    uniforms.uTime.value += step;
    uniforms.uPixelRatio.value = gl.getPixelRatio();
    if (points.current) {
      // Ride with the camera and never occlude: a star is at infinity, so it must
      // not slide behind the key or grow when the visitor zooms in.
      points.current.position.copy(camera.position);
      points.current.rotation.y += step * .0025;
    }
    if (import.meta.env.DEV) gl.domElement.dataset.stars = uniforms.uOpacity.value.toFixed(2);
  });
  return <points ref={points} geometry={geometry} material={material} frustumCulled={false} renderOrder={-1000} />;
}

/** Dust lifted off the regolith during the dusty moment.
 *
 * Same trap as the stars: `sizeAttenuation` does nothing under an orthographic
 * camera, so a PointsMaterial mote of size 0.012 was a hundredth of a pixel and
 * the dusty moment had no dust in it at all. These keep a pixel size and drift on
 * two slow sine fields so the cloud never repeats. */
function Dust({ level }: { level: number }) {
  const cloud = useRef<THREE.Points>(null);
  const gl = useThree(state => state.gl);
  const field = useMemo(() => {
    const count = 460;
    const positions = new Float32Array(count * 3);
    const sizes = new Float32Array(count);
    const phases = new Float32Array(count);
    const random = seeded(80231);
    for (let i = 0; i < count; i++) {
      // Hugging the key, not the whole frame: dust spread across the sky reads as
      // more stars, which is the one thing it must not look like.
      positions[i * 3] = (random() - .5) * 4.0;
      positions[i * 3 + 1] = .015 + Math.pow(random(), 1.9) * .42;
      positions[i * 3 + 2] = (random() - .5) * 1.5;
      sizes[i] = 1.6 + random() * 3.4;
      phases[i] = random() * Math.PI * 2;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
    geometry.setAttribute('aPhase', new THREE.BufferAttribute(phases, 1));
    const uniforms = { uOpacity: { value: 0 }, uTime: { value: 0 }, uPixelRatio: { value: 1 } };
    const material = new THREE.ShaderMaterial({
      uniforms, transparent: true, depthWrite: false,
      vertexShader: `
        attribute float aSize;
        attribute float aPhase;
        uniform float uOpacity;
        uniform float uTime;
        uniform float uPixelRatio;
        varying float vAlpha;
        void main(){
          vec3 p=position;
          // Dust does not fall: it hangs and drifts.
          p.x+=sin(uTime*.21+aPhase)*.06;
          p.y+=sin(uTime*.37+aPhase*1.7)*.03;
          p.z+=cos(uTime*.17+aPhase*.7)*.04;
          gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.0);
          gl_PointSize=max(1.0,aSize*uPixelRatio);
          vAlpha=uOpacity*(.45+.55*sin(uTime*.9+aPhase)*.5+.5);
        }`,
      fragmentShader: `
        varying float vAlpha;
        void main(){
          float r=length(gl_PointCoord-.5);
          if(r>.5)discard;
          float soft=1.0-smoothstep(0.0,.5,r);
          gl_FragColor=vec4(vec3(.78,.71,.60),vAlpha*soft*soft*.42);
        }`,
    });
    return { geometry, material, uniforms };
  }, []);
  const { geometry, material, uniforms } = field;
  useEffect(() => () => { geometry.dispose(); material.dispose(); }, [geometry, material]);
  useFrame((_, dt) => {
    const step = Math.min(dt, .05);
    uniforms.uOpacity.value = THREE.MathUtils.damp(uniforms.uOpacity.value, level, 2, step);
    uniforms.uTime.value += step;
    uniforms.uPixelRatio.value = gl.getPixelRatio();
    if (import.meta.env.DEV) gl.domElement.dataset.dust = uniforms.uOpacity.value.toFixed(2);
  });
  return <points ref={cloud} geometry={geometry} material={material} frustumCulled={false} />;
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
  // Baked regolith maps: albedo, tangent normal and roughness, all from the same
  // height field (scripts/blender/bake-lunar-regolith.py).
  const regolith = useTexture({
    albedo: `${import.meta.env.BASE_URL}textures/lunar/regolith-albedo.png`,
    normal: `${import.meta.env.BASE_URL}textures/lunar/regolith-normal.png`,
    rough: `${import.meta.env.BASE_URL}textures/lunar/regolith-rough.png`,
  });
  const crops = useGLTF(`${import.meta.env.BASE_URL}models/lunar/lunar-crops.glb`);
  const base = useMemo(
    () => createLunarBase(time, software ? 'software' : 'full', { habitat: habitat.scene, regolith, crops: crops.scene }),
    [time, software, habitat.scene, regolith, crops.scene],
  );

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
      /** What the terrain material actually ended up with, so a missing map or a
       * silently ignored normal cannot be mistaken for "the art is flat". */
      ground() {
        const terrain = base.root.getObjectByName('LunarTerrain') as THREE.Mesh | null;
        const material = terrain?.material as THREE.MeshStandardMaterial | undefined;
        return material ? {
          map: !!material.map,
          normalMap: !!material.normalMap,
          roughnessMap: !!material.roughnessMap,
          normalScale: Number(material.normalScale?.x ?? 0),
          repeat: material.map ? [material.map.repeat.x, material.map.repeat.y] : null,
          color: `#${material.color.getHexString()}`,
        } : null;
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
