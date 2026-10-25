import { Component, Suspense, useEffect, useRef, useState, type ComponentRef, type ReactNode } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, OrthographicCamera, SoftShadows, useProgress } from '@react-three/drei';
import { StudioShadows } from './studio-shadows';
import { EffectComposer, SSAO, Bloom, Vignette } from '@react-three/postprocessing';
import * as THREE from 'three';
import { StudioEnvironment, useSoftwareRenderer } from './studio';
import CrescentStudy from './CrescentStudy';
import { nextView, type View } from './gallery-state';
import { WEATHERS, weatherParams, type WeatherKind } from './weather-model';

/** One study, one key. */
const ARTWORK = { name: '月湾环抱' };

/** Five moments, in order: morning clear, morning rain, evening clear, evening
 * fog, evening rain. The exhibition changes on its own — weather and time of
 * day are part of the piece, not a settings panel. */
const CYCLE: { weather: WeatherKind; night: boolean }[] = [
  { weather: 'clear', night: false },
  { weather: 'rain', night: false },
  { weather: 'clear', night: true },
  { weather: 'mist', night: true },
  { weather: 'rain', night: true },
];

/** `?dwell=<seconds>` shortens the hold while developing and while the evidence
 * harness records a full loop. Production always runs the fixed cadence. */
const DEV_DWELL = import.meta.env.DEV ? Number(new URLSearchParams(window.location.search).get('dwell') ?? 0) : 0;
const DWELL_MS = DEV_DWELL > 0 ? DEV_DWELL * 1000 : 20000;

function useReducedMotion() {
  const [reduced, setReduced] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReduced(query.matches);
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);
  return reduced;
}

/** Holds each moment for `DWELL_MS`, then moves on. Timers stop while the tab is
 * hidden, so coming back never lands mid-transition with several changes queued
 * up. */
function useAutoCycle() {
  const [step, setStep] = useState(0);
  const [revision, setRevision] = useState(0);
  const held = useRef(false);
  useEffect(() => {
    let timer = 0;
    const arm = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => setStep(value => (value + 1) % CYCLE.length), DWELL_MS);
    };
    const onVisibility = () => { if (document.hidden) window.clearTimeout(timer); else arm(); };
    if (!document.hidden && !held.current) arm();
    document.addEventListener('visibilitychange', onVisibility);
    return () => { window.clearTimeout(timer); document.removeEventListener('visibilitychange', onVisibility); };
  }, [step, revision]);
  // Dev-only handle: the evidence harness has to reach a given moment without
  // waiting through the whole loop, and has to freeze the loop while it takes
  // screenshots. Never present in a production build.
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const debug = window as unknown as Record<string, unknown>;
    debug.__galleryCycle = {
      set(index: number) {
        const next = ((index % CYCLE.length) + CYCLE.length) % CYCLE.length;
        held.current = true;
        setStep(next);
        setRevision(value => value + 1);
        // Report the *requested* state: reading `step` here would still see the
        // previous render's value.
        return { step: next, ...CYCLE[next], dwell: DWELL_MS };
      },
      resume() { held.current = false; setRevision(value => value + 1); },
      state() { return { step, ...CYCLE[step], dwell: DWELL_MS }; },
      states: CYCLE,
    };
    return () => { delete debug.__galleryCycle; };
  }, [step]);
  return CYCLE[step];
}

/** A render failure used to be permanent: the boundary never reset, so the
 * visitor had to reload the page. */
class SceneBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    return this.state.failed ? <div className="scene-fallback" role="alert"><p>3D 展厅暂时无法打开</p><span>请使用支持 WebGL 的浏览器，并开启硬件加速。</span><button onClick={() => window.location.reload()}>重新打开</button></div> : this.props.children;
  }
}

function CameraRig({ view, reduced }: { view: View; reduced: boolean }) {
  const size = useThree(state => state.size);
  const invalidate = useThree(state => state.invalidate);
  const controls = useRef<ComponentRef<typeof OrbitControls>>(null);
  const moving = useRef(false);
  const goal = useRef(new THREE.Vector3(5.6, 5.7, 6.2));
  const target = useRef(new THREE.Vector3(0, 0.35, 0));
  const baseZoom=Math.min(size.width/5.2,size.height/4.8);
  const zoomGoal=useRef(baseZoom);
  // Dev-only camera handle. The acceptance harness needs reproducible
  // viewpoints (dock landing, cottage door, lighthouse entrance) that a scripted
  // mouse drag cannot hit twice, so it frames a target directly instead.
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const debug = window as unknown as Record<string, unknown>;
    debug.__galleryCamera = {
      frame(pose: { target: [number, number, number]; zoom?: number; distance?: number; dir?: [number, number, number] }) {
        const ctl = controls.current;
        if (!ctl) return false;
        moving.current = false;
        const [tx, ty, tz] = pose.target;
        const distance = pose.distance ?? 8;
        const dir = new THREE.Vector3(...(pose.dir ?? [0.56, 0.55, 0.62])).normalize();
        ctl.object.position.set(tx + dir.x * distance, ty + dir.y * distance, tz + dir.z * distance);
        ctl.target.set(tx, ty, tz);
        if (pose.zoom !== undefined && ctl.object instanceof THREE.OrthographicCamera) {
          ctl.object.zoom = pose.zoom;
          ctl.object.updateProjectionMatrix();
        }
        ctl.update();
        invalidate();
        // Report what actually took effect: OrbitControls clamps target and
        // zoom, and a silently clamped frame would produce misleading evidence.
        return {
          target: ctl.target.toArray(),
          position: ctl.object.position.toArray(),
          zoom: ctl.object instanceof THREE.OrthographicCamera ? ctl.object.zoom : null,
        };
      },
      read() {
        const ctl = controls.current;
        if (!ctl) return null;
        return {
          target: ctl.target.toArray(),
          position: ctl.object.position.toArray(),
          zoom: ctl.object instanceof THREE.OrthographicCamera ? ctl.object.zoom : null,
        };
      },
    };
    return () => { if (debug.__galleryCamera) delete debug.__galleryCamera; };
  }, [invalidate]);
  useEffect(() => {
    goal.current.set(5.6,5.7,6.2);zoomGoal.current=baseZoom*(view.kind==='close'?1.25:1);
    target.current.set(0, view.kind === 'close' ? 0.48 : 0.20, 0);
    moving.current = true;
    invalidate();
  }, [view, baseZoom, invalidate]);
  useFrame((_, dt) => {
    const ctl = controls.current;
    if (!ctl || !moving.current) return;
    // Under `frameloop="demand"` the loop stops when nothing asks for frames,
    // so the camera tween has to request its own next frame until it settles.
    invalidate();
    const alpha = reduced ? 1 : 1 - Math.exp(-5 * Math.min(dt, 0.05));
    ctl.object.position.lerp(goal.current, alpha);
    ctl.target.lerp(target.current, alpha);
    if(ctl.object instanceof THREE.OrthographicCamera){ctl.object.zoom=THREE.MathUtils.lerp(ctl.object.zoom,zoomGoal.current,alpha);ctl.object.updateProjectionMatrix();}
    ctl.update();
    const zoomSettled=!(ctl.object instanceof THREE.OrthographicCamera)||Math.abs(ctl.object.zoom-zoomGoal.current)<.05;
    if (ctl.object.position.distanceTo(goal.current) < 0.008&&ctl.target.distanceTo(target.current)<.008&&zoomSettled) moving.current = false;
  });
  return <>
    <OrthographicCamera makeDefault position={[5.6,5.7,6.2]} zoom={baseZoom} near={.1} far={80}/>
    <OrbitControls ref={controls} makeDefault enablePan={false} minDistance={4.1} maxDistance={16} minZoom={baseZoom*.65} maxZoom={baseZoom*1.9} minPolarAngle={0.25} maxPolarAngle={1.42} enableDamping dampingFactor={0.075} onStart={() => { moving.current = false; }} />
  </>;
}

/** Kept at density 0 and damped from here: rebuilding the fog object on every
 * weather change would pop, and `scene.fog = null` would recompile materials. */
const FOG_INIT: [string, number] = ['#e9e5dc', 0];

/** ~1.7 s at 60 fps, enough for the damped transitions to settle. */
const TRANSITION_FRAMES = 100;

/** Lights, environment and fog, all damped toward the active preset so a change
 * of moment is a transition rather than a cut. */
function Atmosphere({ night, weather }: { night: boolean; weather: WeatherKind }) {
  const scene=useThree(state=>state.scene);
  const gl = useThree(state=>state.gl);
  const software = useSoftwareRenderer();
  const ambient = useRef<THREE.AmbientLight>(null);
  const sun = useRef<THREE.DirectionalLight>(null);
  const fill = useRef<THREE.DirectionalLight>(null);
  const hemi = useRef<THREE.HemisphereLight>(null);
  const fog = useRef<THREE.FogExp2>(null);
  const color = useRef(new THREE.Color()).current;
  const fogColor = useRef(new THREE.Color()).current;
  useFrame((_, dt) => {
    const delta = Math.min(dt, 0.05);
    const p = weatherParams(weather, night);
    scene.environmentIntensity=THREE.MathUtils.damp(scene.environmentIntensity,p.env,3,delta);
    if (ambient.current) {
      ambient.current.intensity = THREE.MathUtils.damp(ambient.current.intensity, p.ambient, 3, delta);
      color.set(p.ambientColor);
      ambient.current.color.lerp(color, 1 - Math.exp(-3 * delta));
    }
    if (sun.current) {
      sun.current.intensity = THREE.MathUtils.damp(sun.current.intensity, p.sun, 3, delta);
      color.set(p.sunColor);
      sun.current.color.lerp(color, 1 - Math.exp(-3 * delta));
    }
    if (hemi.current) hemi.current.intensity = THREE.MathUtils.damp(hemi.current.intensity, night ? .16 : .45, 3, delta);
    if (fill.current) fill.current.intensity = THREE.MathUtils.damp(fill.current.intensity, p.fill, 3, delta);
    if (fog.current) {
      // `fog` stays attached at density 0 for a clear sky instead of being
      // nulled out, which would recompile every material on each change.
      fog.current.density = THREE.MathUtils.damp(fog.current.density, p.fog, 3, delta);
      fogColor.set(p.fogColor);
      fog.current.color.lerp(fogColor, 1 - Math.exp(-3 * delta));
    }
    if (import.meta.env.DEV) {
      const d = gl.domElement.dataset;
      d.weather = weather;
      d.night = String(night);
      d.fogDensity = String(fog.current?.density ?? 0);
      d.sunIntensity = String(sun.current?.intensity ?? 0);
    }
  });
  const p = weatherParams(weather, night);
  return <>
    <fogExp2 ref={fog} attach="fog" args={FOG_INIT} />
    <ambientLight ref={ambient} intensity={p.ambient} color={p.ambientColor} />
    <hemisphereLight ref={hemi} intensity={night?.16:.45} color="#fff5e1" groundColor="#b6c9bc" />
    <directionalLight ref={sun} position={[-3, 7, 4]} intensity={p.sun} color={p.sunColor} castShadow shadow-mapSize={software ? [1024, 1024] : [4096, 4096]} shadow-camera-left={-3} shadow-camera-right={3} shadow-camera-top={3} shadow-camera-bottom={-3} shadow-normalBias={0.012} shadow-bias={-0.0002} shadow-radius={3} />
    <directionalLight ref={fill} position={[4, 3, -4]} intensity={p.fill} color="#a5d6e3" />
  </>;
}

/** Rendered inside the Canvas: drops resolution and MSAA on software renderers
 * (and any device that reports one), keeping the interactive rate usable. */
function QualityProfile() {
  const software = useSoftwareRenderer();
  const setDpr = useThree(state => state.setDpr);
  useEffect(() => { setDpr(software ? [1, 1.25] : [1, 2]); }, [software, setDpr]);
  return null;
}

/** Keeps requesting frames after a state change so the damped lighting and
 * weather transitions still animate under `frameloop="demand"`. The window is
 * counted in frames, not milliseconds: on the software renderer (~2 fps) a
 * 1.6 s wall-clock window would only cover three frames and freeze the
 * transition halfway. */
function DemandPump({ boost, playing }: { boost: string; playing: boolean }) {
  const invalidate = useThree(state => state.invalidate);
  const gl = useThree(state => state.gl);
  const frameloop = useThree(state => state.frameloop);
  const remaining = useRef(0);
  const until = useRef(0);
  const frames = useRef(0);
  useEffect(() => { remaining.current = TRANSITION_FRAMES; until.current = performance.now() + 1600; invalidate(); }, [boost, invalidate]);
  // Pausing cancels the leftover transition window, otherwise the frames that
  // were queued for a fading transition keep the loop alive for seconds.
  useEffect(() => { if (!playing) { remaining.current = 0; until.current = 0; } }, [playing]);
  useEffect(() => { if (import.meta.env.DEV) gl.domElement.dataset.renderMode = frameloop; }, [frameloop, gl]);
  useFrame(() => {
    frames.current++;
    if (import.meta.env.DEV) gl.domElement.dataset.renderFrames = String(frames.current);
    if (remaining.current > 0) { remaining.current--; invalidate(); }
    else if (performance.now() < until.current) invalidate();
  });
  return null;
}

function PostChain() {
  const software = useSoftwareRenderer();
  return <>{!software && <SoftShadows size={8} samples={16} focus={.18} />}<EffectComposer multisampling={software ? 0 : 4} enableNormalPass>
    <SSAO samples={software ? 8 : 24} radius={.07} intensity={1.05} luminanceInfluence={.85} bias={.02} />
    <Bloom intensity={.07} luminanceThreshold={1.25} mipmapBlur />
    <Vignette offset={.12} darkness={.08} />
  </EffectComposer></>;
}

function GalleryScene({ playing, night, weather, view, reduced, onReady }: { playing: boolean; night: boolean; weather: WeatherKind; view: View; reduced: boolean; onReady: () => void }) {
  return <Canvas shadows dpr={[1, 2]} frameloop={playing ? 'always' : 'demand'} camera={{ position: [5.6, 5.7, 6.2], near: 0.1, far: 80 }} gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }} onCreated={({ gl }) => { gl.toneMapping = THREE.ACESFilmicToneMapping; onReady(); }} fallback={<div className="scene-fallback">当前浏览器不支持 3D 展示。</div>}>
    <QualityProfile />
    <DemandPump boost={`${view.kind}:${view.serial}:${night ? 1 : 0}:${weather}`} playing={playing} />
    <Atmosphere night={night} weather={weather} />
    <Suspense fallback={null}>
      <StudioEnvironment />
      <CrescentStudy playing={playing} night={night} weather={weather} />
      <StudioShadows frames={1} position={[0, -0.83, 0]} opacity={0.35} scale={12} blur={2.7} far={5} resolution={512} color="#555345" />
    </Suspense>
    <CameraRig view={view} reduced={reduced} />
    <PostChain />
  </Canvas>;
}

export default function App() {
  const [playing, setPlaying] = useState(true);
  const { weather, night } = useAutoCycle();
  const [ready, setReady] = useState(false);
  const [view, setView] = useState<View>({ kind: 'home', serial: 0 });
  const reduced = useReducedMotion();
  const assetProgress = useProgress();

  const weatherLabel = WEATHERS.find(item => item.id === weather)?.title ?? '晴天';

  return <main className={`gallery ${night ? 'night' : ''} weather-${weather}`}>
    <header className="masthead"><a className="wordmark" href="/" aria-label="Keyscape 首页">keyscape<span>✳</span></a></header>

    <section className="art-stage" aria-label="可旋转的三维艺术键">
      <SceneBoundary><GalleryScene playing={playing && !reduced} night={night} weather={weather} view={view} reduced={reduced} onReady={() => setReady(true)} /></SceneBoundary>
      {(!ready || assetProgress.active) && <div className="loading" role="status">正在布置展厅… {Math.round(assetProgress.progress)}%</div>}
    </section>

    <section className="art-caption" aria-live="polite" aria-atomic="true">
      <h1>{ARTWORK.name}</h1>
    </section>

    <aside className="side-tools" aria-label="观察作品">
      <button className="round-button" aria-label="恢复初始视角" title="恢复初始视角" onClick={() => setView(v => nextView(v, 'home'))}>↺</button>
    </aside>

    <footer className="gallery-footer">
      <span className="gesture-hint">拖动旋转 <b>·</b> 滚轮拉近 <b>·</b> 点击灯塔、小船、水面</span>
      <div className="mood-controls">
        <span className="cycle-state" aria-live="polite">{night ? '晚上' : '早上'} · {weatherLabel}</span>
        <span className="control-divider" />
        <button className="text-button" aria-pressed={!playing || reduced} disabled={reduced} onClick={() => setPlaying(!playing)}>{reduced ? '静态模式' : playing ? 'Ⅱ 暂停动态' : '▷ 继续动态'}</button>
      </div>
    </footer>
  </main>;
}
