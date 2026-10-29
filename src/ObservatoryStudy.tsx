import { Stars } from './LunarStudy';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { createObservatoryBase, type ObservatoryBase } from './observatory-base';
import { OBS, SITE, observatoryHeight } from './observatory-layout';
import { OBSERVATORY_MOMENTS, observatoryPreset, type ObservatoryMoment } from './observatory-weather';
import { seeded } from './coastal-materials';
import { useSoftwareRenderer } from './studio';

/** Same rig as the lunar study, with its own presets: a hill station gets a blue
 * hour and a cold dawn instead of vacuum light. */
export function ObservatoryAtmosphere({ moment }: { moment: ObservatoryMoment }) {
  const scene = useThree(state => state.scene);
  const gl = useThree(state => state.gl);
  const initial = useRef(observatoryPreset(moment)).current;
  const ambient = useRef<THREE.AmbientLight>(null);
  const sun = useRef<THREE.DirectionalLight>(null);
  const fill = useRef<THREE.DirectionalLight>(null);
  const hemi = useRef<THREE.HemisphereLight>(null);
  const fog = useRef<THREE.FogExp2>(null);
  const color = useRef(new THREE.Color()).current;
  const keyTarget = useRef(new THREE.Vector3(...initial.key));

  useFrame((_, dt) => {
    const delta = Math.min(dt, 0.05);
    const p = observatoryPreset(moment);
    scene.environmentIntensity = THREE.MathUtils.damp(scene.environmentIntensity, p.env, 3, delta);
    if (ambient.current) {
      ambient.current.intensity = THREE.MathUtils.damp(ambient.current.intensity, p.ambient, 3, delta);
      ambient.current.color.lerp(color.set(p.ambientColor), 1 - Math.exp(-3 * delta));
    }
    if (sun.current) {
      sun.current.intensity = THREE.MathUtils.damp(sun.current.intensity, p.sun, 3, delta);
      sun.current.color.lerp(color.set(p.sunColor), 1 - Math.exp(-3 * delta));
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
    }
  });

  return <>
    <fogExp2 ref={fog} attach="fog" args={['#0a0c10', 0]} />
    <ambientLight name="QAmbient" ref={ambient} intensity={initial.ambient} color={initial.ambientColor} />
    <hemisphereLight name="QSky" ref={hemi} intensity={initial.hemisphere} color={initial.skyColor} groundColor={initial.groundColor} />
    {/* Tight frustum: the same lesson the lunar study paid for. */}
    <directionalLight
      name="QSun" ref={sun} position={initial.key} intensity={initial.sun} color={initial.sunColor}
      castShadow shadow-mapSize={[4096, 4096]}
      shadow-camera-left={-2.7} shadow-camera-right={2.7} shadow-camera-top={2.0} shadow-camera-bottom={-2.0}
      shadow-camera-near={3} shadow-camera-far={12}
      shadow-normalBias={.006} shadow-bias={-.0001} shadow-radius={2}
    />
    <directionalLight name="QFills" ref={fill} position={[3.4, 2.2, -3.8]} intensity={initial.fill} color={initial.fillColor} />
  </>;
}

/** Airborne grit. Same pixel-sized points as the lunar dust, but it drifts on a
 * slow wind and only exists in the `wind` moment. */
function Grit({ level }: { level: number }) {
  const points = useRef<THREE.Points>(null);
  const gl = useThree(state => state.gl);
  const field = useMemo(() => {
    const count = 260;
    const positions = new Float32Array(count * 3);
    const phases = new Float32Array(count);
    const random = seeded(20261029);
    for (let i = 0; i < count; i++) {
      const x = (random() - .5) * 3.2;
      const z = (random() - .5) * 2.5;
      positions[i * 3] = x;
      positions[i * 3 + 1] = observatoryHeight(x, z) + .04 + random() * .5;
      positions[i * 3 + 2] = z;
      phases[i] = random();
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('aPhase', new THREE.BufferAttribute(phases, 1));
    const uniforms = { uOpacity: { value: 0 }, uTime: { value: 0 }, uPixelRatio: { value: 1 } };
    const material = new THREE.ShaderMaterial({
      uniforms, transparent: true, depthWrite: false,
      vertexShader: `
        attribute float aPhase;
        uniform float uTime; uniform float uPixelRatio;
        void main(){
          vec3 p=position;
          p.x=mod(p.x+uTime*(0.06+aPhase*.05)+1.7,3.4)-1.7;
          p.y+=sin(uTime*.9+aPhase*6.28)*.02;
          gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.0);
          gl_PointSize=max(1.0,(1.1+aPhase*1.4)*uPixelRatio);
        }`,
      fragmentShader: `
        uniform float uOpacity;
        void main(){
          float r=length(gl_PointCoord-.5);
          if(r>.5)discard;
          gl_FragColor=vec4(vec3(.82,.78,.68),uOpacity*(1.0-smoothstep(.1,.5,r))*.55);
        }`,
    });
    return { geometry, material, uniforms };
  }, []);
  useEffect(() => () => { field.geometry.dispose(); field.material.dispose(); }, [field]);
  useFrame((_, dt) => {
    const step = Math.min(dt, .05);
    field.uniforms.uOpacity.value = THREE.MathUtils.damp(field.uniforms.uOpacity.value, level, 2.4, step);
    field.uniforms.uTime.value += step;
    field.uniforms.uPixelRatio.value = gl.getPixelRatio();
  });
  return <points ref={points} geometry={field.geometry} material={field.material} frustumCulled={false} />;
}

type Aim = { altitude: number; azimuth: number };
const AIMS: Aim[] = [
  { altitude: 1.32, azimuth: 0.55 },   // near zenith, slit open
  { altitude: 0.42, azimuth: 2.35 },   // low over the ridge
  { altitude: 0.78, azimuth: -0.85 },  // east, rising
];

export default function ObservatoryStudy({ playing, moment }: { playing: boolean; moment: ObservatoryMoment }) {
  const software = useSoftwareRenderer();
  const preset = observatoryPreset(moment);
  const gltf = useGLTF(`${import.meta.env.BASE_URL}models/observatory/observatory.glb`);
  const assets = useMemo(() => {
    const scene = gltf.scene;
    const find = (name: string) => scene.getObjectByName(name) ?? undefined;
    return {
      domeEast: find('DomeEast'),
      domeWest: find('DomeWest'),
      telescopeFork: find('TelescopeFork'),
      telescopeTube: find('TelescopeTube'),
      dutyRoom: find('DutyRoom'),
    };
  }, [gltf]);
  const base = useMemo<ObservatoryBase>(
    () => createObservatoryBase(software ? 'software' : 'full', assets),
    [software, assets],
  );
  useEffect(() => () => base.dispose(), [base]);
  const gl = useThree(state => state.gl);

  // Intent and animated value are separate: a click sets the target, the frame
  // loop damps toward it, and the DEV handle can report both.
  // Closed by default: the bowl is the letter Q, and an open shell reads as a
  // cracked egg from the gallery camera. The first click is the reveal.
  const open = useRef(0);
  const openTarget = useRef(0);
  const [lamp, setLamp] = useState(false);
  const lampValue = useRef(0);
  const [aim, setAim] = useState(0);
  const aimValue = useRef({ altitude: AIMS[0].altitude, azimuth: AIMS[0].azimuth });
  const busy = useRef(0);
  const intent = useRef<'idle' | 'open' | 'close'>('idle');
  const elapsed = useRef(0);

  const toggleDome = useCallback((event?: ThreeEvent<MouseEvent>) => {
    event?.stopPropagation();
    if (!playing) return;
    openTarget.current = openTarget.current > .5 ? 0 : 1;
    intent.current = openTarget.current > .5 ? 'open' : 'close';
    busy.current = 1;
  }, [playing]);

  const toggleLamp = useCallback((event?: ThreeEvent<MouseEvent>) => {
    event?.stopPropagation();
    if (!playing) return;
    setLamp(value => !value);
  }, [playing]);

  const cycleAim = useCallback((event?: ThreeEvent<MouseEvent>) => {
    event?.stopPropagation();
    if (!playing) return;
    // Closed dome: a short nudge instead of a silent no-op.
    if (open.current < .5) { busy.current = .35; return; }
    setAim(value => (value + 1) % AIMS.length);
    busy.current = 1;
  }, [playing]);

  // Clicking the telescope when it is already aimed starts a slow search sweep:
  // it pans through the sky and settles back. The sweep reads as the observer
  // hunting for a star, and it is interruptible by another click.
  const sweeping = useRef(false);
  const sweepPhase = useRef(0);
  const startSweep = useCallback((event?: ThreeEvent<MouseEvent>) => {
    event?.stopPropagation();
    if (!playing) return;
    if (open.current < .5) { busy.current = .35; return; }
    sweeping.current = !sweeping.current;
    if (sweeping.current) sweepPhase.current = 0;
  }, [playing]);

  // The rusted barrel topples when clicked: a small, satisfying physics beat
  // that sells the abandoned props as real objects, not scenery.
  const barrelTipped = useRef(false);
  const barrelTilt = useRef(0);
  const toggleBarrel = useCallback((event?: ThreeEvent<MouseEvent>) => {
    event?.stopPropagation();
    if (!playing) return;
    barrelTipped.current = !barrelTipped.current;
  }, [playing]);

  useEffect(() => {
    base.root.traverse(object => {
      if (object.name.startsWith('QDome') && (object.name.endsWith('Shell') || object.name.endsWith('Seam'))) {
        object.userData.click = true;
      }
      if (object.name === 'QDutyWalls' || object.name === 'QDutyWindow') object.userData.click = true;
      if (object.name === 'QTelescopeBarrel') object.userData.click = true;
      if (object.name === 'QBarrel') object.userData.click = true;
      if (object.name === 'QCistern') object.userData.click = true;
    });
  }, [base]);

  useFrame((_, dt) => {
    const step = Math.min(dt, .05);
    const active = playing ? 1 : 0;
    if (active) {
      open.current = THREE.MathUtils.damp(open.current, openTarget.current, 1.15, step);
      aimValue.current.altitude = THREE.MathUtils.damp(aimValue.current.altitude, AIMS[aim].altitude, 3.4, step);
      aimValue.current.azimuth = THREE.MathUtils.damp(aimValue.current.azimuth, AIMS[aim].azimuth, 3.4, step);
      busy.current = Math.max(0, busy.current - step);
      elapsed.current += step;
    }
    // The halves part along the slit and lean outward; a rim hinge would swing a
    // quarter sphere clear of the drum and read as a flying shell.
    const angle = open.current * SITE.dome.tilt;
    const slide = open.current * SITE.dome.slide;
    base.domeHalves.forEach((half, index) => {
      const side = index === 0 ? 1 : -1;
      half.position.x = SITE.drum.x + side * slide;
      half.position.y = SITE.dome.spring + open.current * .012;
      half.rotation.z = -side * angle;
    });

    // (telescope aim is driven below, overriding for the search sweep)

    // The lamps come on with the dark whether or not anyone clicks: an
    // observatory with a warm window at dusk is the whole point of the piece.
    const wantsLamp = lamp ? 1 : preset.night ? .9 : preset.id === 'dusk' ? .65 : .12;
    lampValue.current = THREE.MathUtils.damp(lampValue.current, wantsLamp, 2.2, step);
    base.windowMaterial.emissiveIntensity = .06 + lampValue.current * 2.6;
    base.lampMaterial.emissiveIntensity = lampValue.current * 3.2;
    // The Blender window pane carries an emission channel baked into QDutyGlow;
    // drive it directly so the interior reads lit without a second light rig.
    base.glowMaterials.forEach(material => {
      material.emissiveIntensity = .15 + lampValue.current * 2.8;
    });
    base.lamps.forEach(light => { light.intensity = lampValue.current * 1.1; });
    // The red beacon pulses at night only; slow enough to read as a warning
    // light, not a disco strobe.
    const beaconOn = preset.night ? 1 : 0;
    const pulse = .55 + .45 * Math.sin(elapsed.current * 1.7);
    base.beaconMaterial.emissiveIntensity = THREE.MathUtils.damp(
      base.beaconMaterial.emissiveIntensity, beaconOn * (1.6 + pulse * 1.2), 3, step,
    );
    // A search sweep overrides the aim preset: pan smoothly through a wide
    // azimuth while the tube rides a slow sine, then release back to the preset.
    if (active && sweeping.current) {
      sweepPhase.current += step;
      const sweepAzimuth = .3 + Math.sin(sweepPhase.current * .6) * 2.0;
      const sweepAltitude = .7 + Math.sin(sweepPhase.current * .42 + 1.1) * .5;
      base.telescopeFork.rotation.y = THREE.MathUtils.damp(
        base.telescopeFork.rotation.y, sweepAzimuth, 2.2, step,
      );
      base.telescopeTube.rotation.z = THREE.MathUtils.damp(
        base.telescopeTube.rotation.z, sweepAltitude, 2.2, step,
      );
    } else {
      base.telescopeFork.rotation.y = aimValue.current.azimuth;
      base.telescopeTube.rotation.z = aimValue.current.altitude;
    }
    // The rusted barrel topples with a damped fall and settles on its side.
    if (base.barrel) {
      const targetTilt = barrelTipped.current ? Math.PI / 2 : 0;
      barrelTilt.current = THREE.MathUtils.damp(barrelTilt.current, targetTilt, 2.0, step);
      base.barrel.rotation.z = .12 + barrelTilt.current;
      base.barrel.position.y = .06 + barrelTilt.current * .02;
    }
    // The interior light flickers faintly: a still-powered lamp with a dying
    // connection. It only shows after dark, and only a few percent.
    if (lampValue.current > .3 && preset.night) {
      const flicker = 1 + Math.sin(elapsed.current * 13.7) * .06 + Math.sin(elapsed.current * 29.3) * .03;
      base.windowMaterial.emissiveIntensity *= flicker;
    }

    if (import.meta.env.DEV) {
      const d = gl.domElement.dataset;
      d.qDomeOpen = open.current.toFixed(3);
      d.qDomeIntent = intent.current;
      d.qLamp = String(lamp);
      d.qAim = String(aim);
      d.qBusy = busy.current.toFixed(2);
      d.qAltitude = aimValue.current.altitude.toFixed(3);
      d.qAzimuth = aimValue.current.azimuth.toFixed(3);
    }
  });

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const debug = window as unknown as Record<string, unknown>;
    debug.__observatory = {
      state: () => ({
        open: open.current,
        intent: intent.current,
        lamp,
        aim,
        altitude: aimValue.current.altitude,
        azimuth: aimValue.current.azimuth,
        sweeping: sweeping.current,
        barrelTipped: barrelTipped.current,
      }),
      toggleDome: () => toggleDome(),
      toggleLamp: () => toggleLamp(),
      cycleAim: () => cycleAim(),
      startSweep: () => startSweep(),
      toggleBarrel: () => toggleBarrel(),
      landmarks: { drum: SITE.drum, bridge: SITE.bridge, domeSpring: SITE.dome.spring, gallery: SITE.gallery },
      setOpen: (value: number) => { openTarget.current = value; intent.current = value > .5 ? 'open' : 'close'; },
    };
    return () => { delete debug.__observatory; };
  }, [toggleDome, toggleLamp, cycleAim, startSweep, toggleBarrel, lamp, aim]);

  return <>
    <primitive object={base.root} dispose={null} onClick={(event: ThreeEvent<MouseEvent>) => {
      const clicked = (event.object as THREE.Mesh).userData.click ? event.object.name : '';
      if (clicked.startsWith('QDome')) toggleDome(event);
      else if (clicked.startsWith('QDuty')) toggleLamp(event);
      else if (clicked.startsWith('QTelescope')) startSweep(event);
      else if (clicked.startsWith('QBarrel')) toggleBarrel(event);
      else if (clicked.startsWith('QCistern')) toggleBarrel(event);
    }} onPointerOver={(event: ThreeEvent<PointerEvent>) => {
      if ((event.object as THREE.Mesh).userData.click) gl.domElement.style.cursor = 'pointer';
    }} onPointerOut={() => { gl.domElement.style.cursor = ''; }} />
    <Stars level={preset.stars} />
    <Grit level={preset.dust} />
  </>;
}

/** Floor height for anything that has to stand on the terrain. */
export const observatoryGround = (x: number, z: number) => observatoryHeight(x, z) + OBS.pad;

export const OBSERVATORY_MOMENT_IDS = OBSERVATORY_MOMENTS.map(moment => moment.id);
