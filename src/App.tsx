import { Component, Suspense, useEffect, useRef, useState, type ComponentRef, type CSSProperties, type ReactNode } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, OrthographicCamera, SoftShadows, useProgress } from '@react-three/drei';
import { StudioShadows } from './studio-shadows';
import { EffectComposer, SSAO, Bloom, Vignette } from '@react-three/postprocessing';
import * as THREE from 'three';
import { StudioEnvironment, useSoftwareRenderer } from './studio';
import CrescentStudy from './CrescentStudy';
import LunarStudy, { LunarAtmosphere } from './LunarStudy';
import ObservatoryStudy, { ObservatoryAtmosphere } from './ObservatoryStudy';
import { nextView, type View } from './gallery-state';
import { WEATHERS, weatherParams,KEY_LIGHT_POSITION, type WeatherKind } from './weather-model';
import { LUNAR_MOMENTS, lunarSurface, type LunarMoment } from './lunar-weather';
import { OBSERVATORY_MOMENTS, observatorySurface, type ObservatoryMoment } from './observatory-weather';

export type World = 'coastal' | 'space' | 'observatory';

/** The three keys in the exhibition. The label is also the switcher, so the
 * chrome stays at one line. */
const WORKS: { id: World; label: string }[] = [
  { id: 'coastal', label: 'C / COASTAL' },
  { id: 'space', label: 'SPACE / LUNAR' },
  { id: 'observatory', label: 'Q / OBSERVATORY' },
];
/** How much world each key needs in frame; the spacebar is longer and flatter,
 * so it can be shown larger without clipping. */
const FRAME: Record<World, { width: number; height: number; floor: number; camera: [number, number, number] }> = {
  coastal: { width: 5.2, height: 4.8, floor: -0.83, camera: [5.6, 5.7, 6.2] },
  // The spacebar is long and flat: a lower eye keeps the slab from reading as a
  // cream brick, and the extra distance fits 3.64 units of key in frame.
  space: { width: 3.95, height: 2.95, floor: -0.24, camera: [5.0, 3.9, 6.6] },
  // Q is a tall, dense object: a shallower eye keeps the dome from flattening,
  // and the square key needs height as much as width.
  observatory: { width: 4.0, height: 3.05, floor: -0.34, camera: [4.7, 4.5, 5.2] },
};

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

/** Holds each moment for `DWELL_MS`, then moves on only while playing.
 * Pause, reduced motion and hidden tabs cancel the timer. Resuming starts a
 * fresh dwell for the current moment, synchronized with the tick's sweep. */
type MomentState = { id?: string; weather?: string; night: boolean };
function useAutoCycle(running: boolean, states: readonly MomentState[]) {
  const length = states.length;
  const [step, setStep] = useState(0);
  const [revision, setRevision] = useState(0);
  // Bumped whenever the dwell timer is (re)armed, so the tick's sweep restarts
  // with it. Without this the CSS animation would keep running while the tab is
  // hidden and reach the end of a moment that never started.
  const [run, setRun] = useState(0);
  const held = useRef(false);
  const cancelCycle = useRef<() => void>(() => {});
  useEffect(() => {
    let timer = 0;
    cancelCycle.current = () => window.clearTimeout(timer);
    const arm = () => {
      window.clearTimeout(timer);
      setRun(value => value + 1);
      timer = window.setTimeout(() => {
        if (!held.current && !document.hidden && running) setStep(value => (value + 1) % length);
      }, DWELL_MS);
    };
    const onVisibility = () => {
      if (document.hidden || !running || held.current) window.clearTimeout(timer);
      else arm();
    };
    if (!document.hidden && !held.current && running) arm();
    document.addEventListener('visibilitychange', onVisibility);
    return () => { window.clearTimeout(timer); document.removeEventListener('visibilitychange', onVisibility); };
  }, [step, revision, running, length]);
  // Dev-only handle: the evidence harness has to reach a given moment without
  // waiting through the whole loop, and has to freeze the loop while it takes
  // screenshots. Never present in a production build.
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const debug = window as unknown as Record<string, unknown>;
    debug.__galleryCycle = {
      set(index: number) {
        const next = ((index % length) + length) % length;
        held.current = true;
        // Cancel synchronously: waiting for React's effect cleanup lets an
        // already armed timer overtake this requested preset on slow renders.
        cancelCycle.current();
        setStep(next);
        setRevision(value => value + 1);
        // Report the *requested* state: reading `step` here would still see the
        // previous render's value.
        return { step: next, ...states[next], dwell: DWELL_MS };
      },
      resume() { held.current = false; setRevision(value => value + 1); },
      state() { return { step, ...states[step], dwell: DWELL_MS, running }; },
      states,
    };
    return () => { delete debug.__galleryCycle; };
  }, [step, running, length, states]);
  // Switching keys changes how many moments there are; never leave the index
  // pointing past the end of the new list.
  useEffect(() => { if (step >= length) setStep(0); }, [step, length]);
  return { step, run };
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

function CameraRig({ view, reduced, frame, focusY }: { view: View; reduced: boolean; frame: { width: number; height: number; camera: [number, number, number] }; focusY: [number, number] }) {
  const size = useThree(state => state.size);
  const invalidate = useThree(state => state.invalidate);
  const controls = useRef<ComponentRef<typeof OrbitControls>>(null);
  const moving = useRef(false);
  const goal = useRef(new THREE.Vector3(5.6, 5.7, 6.2));
  const target = useRef(new THREE.Vector3(0, 0.35, 0));
  const baseZoom=Math.min(size.width/frame.width,size.height/frame.height);
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
    goal.current.set(...frame.camera);zoomGoal.current=baseZoom*(view.kind==='close'?1.25:1);
    target.current.set(0, view.kind === 'close' ? focusY[1] : focusY[0], 0);
    moving.current = true;
    invalidate();
  }, [view, baseZoom, focusY, invalidate]);
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
    <OrthographicCamera makeDefault position={frame.camera} zoom={baseZoom} near={.1} far={80}/>
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
  // JSX initializes the rig once. Feeding changing targets back through props
  // would snap the lights before the per-frame damping could interpolate.
  const initial=useRef(weatherParams(weather,night)).current;
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
    if (hemi.current) {
      hemi.current.intensity=THREE.MathUtils.damp(hemi.current.intensity,p.hemisphere,3,delta);
      color.set(p.skyColor);hemi.current.color.lerp(color,1-Math.exp(-3*delta));
      color.set(p.groundColor);hemi.current.groundColor.lerp(color,1-Math.exp(-3*delta));
    }
    if (fill.current) {
      fill.current.intensity=THREE.MathUtils.damp(fill.current.intensity,p.fill,3,delta);
      color.set(p.fillColor);fill.current.color.lerp(color,1-Math.exp(-3*delta));
    }
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
      d.ambientIntensity=String(ambient.current?.intensity??0);
      d.hemisphereIntensity=String(hemi.current?.intensity??0);
      d.fillIntensity=String(fill.current?.intensity??0);
      d.environmentIntensity=String(scene.environmentIntensity);
    }
  });
  return <>
    <fogExp2 ref={fog} attach="fog" args={FOG_INIT} />
    <ambientLight name="GalleryAmbient" ref={ambient} intensity={initial.ambient} color={initial.ambientColor} />
    <hemisphereLight name="GallerySky" ref={hemi} intensity={initial.hemisphere} color={initial.skyColor} groundColor={initial.groundColor} />
    <directionalLight name="GalleryKey" ref={sun} position={KEY_LIGHT_POSITION} intensity={initial.sun} color={initial.sunColor} castShadow shadow-mapSize={software ? [1024, 1024] : [4096, 4096]} shadow-camera-left={-3} shadow-camera-right={3} shadow-camera-top={3} shadow-camera-bottom={-3} shadow-camera-near={.5} shadow-camera-far={18} shadow-normalBias={.003} shadow-bias={-.00008} shadow-radius={3} />
    <directionalLight name="GalleryRim" ref={fill} position={[4, 3, -4]} intensity={initial.fill} color={initial.fillColor} />
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

function PostChain({ space = false }: { space?: boolean }) {
  const software = useSoftwareRenderer();
  return <>{!software && <SoftShadows size={8} samples={16} focus={.18} />}<EffectComposer multisampling={software ? 0 : 4} enableNormalPass>
    <SSAO samples={software ? 8 : 24} radius={.07} intensity={1.05} luminanceInfluence={.85} bias={.02} />
    <Bloom intensity={space ? .16 : .07} luminanceThreshold={space ? 1.5 : 1.25} mipmapBlur />
    <Vignette offset={space ? .2 : .12} darkness={space ? .55 : .08} />
  </EffectComposer></>;
}

function GalleryScene({ playing, world, night, weather, moment, observatoryMoment, view, reduced, onReady }: { playing: boolean; world: World; night: boolean; weather: WeatherKind; moment: LunarMoment; observatoryMoment: ObservatoryMoment; view: View; reduced: boolean; onReady: () => void }) {
  const frame = FRAME[world];
  const space = world === 'space';
  const observatory = world === 'observatory';
  return <Canvas shadows dpr={[1, 2]} frameloop={playing ? 'always' : 'demand'} camera={{ position: [5.6, 5.7, 6.2], near: 0.1, far: 80 }} gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }} onCreated={({ gl }) => { gl.toneMapping = THREE.ACESFilmicToneMapping; gl.toneMappingExposure = 1.12; onReady(); }} fallback={<div className="scene-fallback">当前浏览器不支持 3D 展示。</div>}>
    <QualityProfile />
    <DemandPump boost={`${world}:${view.kind}:${view.serial}:${space ? moment : observatory ? observatoryMoment : `${night ? 1 : 0}:${weather}`}`} playing={playing} />
    {space ? <LunarAtmosphere moment={moment} /> : observatory ? <ObservatoryAtmosphere moment={observatoryMoment} /> : <Atmosphere night={night} weather={weather} />}
    <Suspense fallback={null}>
      <StudioEnvironment />
      {space ? <LunarStudy playing={playing} moment={moment} /> : observatory ? <ObservatoryStudy playing={playing} moment={observatoryMoment} /> : <CrescentStudy playing={playing} night={night} weather={weather} />}
      <StudioShadows frames={1} position={[0, frame.floor, 0]} opacity={space ? .5 : observatory ? .42 : .35} scale={12} blur={2.7} far={5} resolution={512} color={space ? '#191a1d' : observatory ? '#2a2823' : '#555345'} />
    </Suspense>
    <CameraRig view={view} reduced={reduced} frame={frame} focusY={space ? [.16, .34] : observatory ? [.5, .72] : [.2, .48]} />
    <PostChain space={space || observatory} />
  </Canvas>;
}

export default function App() {
  const [playing, setPlaying] = useState(true);
  const reduced = useReducedMotion();
  const running = playing && !reduced;
  const [world, setWorld] = useState<World>(() => {
    const requested = new URLSearchParams(window.location.search).get('work');
    return requested === 'space' ? 'space' : requested === 'observatory' ? 'observatory' : 'coastal';
  });
  const cycle = world === 'space' ? LUNAR_MOMENTS : world === 'observatory' ? OBSERVATORY_MOMENTS : CYCLE;
  const { step, run } = useAutoCycle(running, cycle);
  const moments = cycle.length;
  const [ready, setReady] = useState(false);
  const [view, setView] = useState<View>({ kind: 'home', serial: 0 });
  const assetProgress = useProgress();

  const coastal = CYCLE[Math.min(step, CYCLE.length - 1)];
  const lunar = LUNAR_MOMENTS[Math.min(step, LUNAR_MOMENTS.length - 1)];
  const observatory = OBSERVATORY_MOMENTS[Math.min(step, OBSERVATORY_MOMENTS.length - 1)];
  const night = world === 'space' ? lunar.night : world === 'observatory' ? observatory.night : coastal.night;
  const label = world === 'space'
    ? `月球 · ${lunar.label}`
    : world === 'observatory'
      ? `天文台 · ${observatory.label}`
      : `${night ? '晚上' : '早上'} · ${WEATHERS.find(item => item.id === coastal.weather)?.title ?? '晴天'}`;
  const surface = world === 'space'
    ? `space ${lunarSurface(lunar.id)}`
    : world === 'observatory'
      ? `observatory ${observatorySurface(observatory.id)}`
      : `${night ? 'night ' : ''}weather-${coastal.weather}`;
  const progress = Math.round(assetProgress.progress);

  const pick = (next: World) => {
    if (next === world) return;
    setWorld(next);
    setView(v => nextView(v, 'home'));
  };

  return <main className={`gallery ${surface}`} data-motion={running ? 'running' : 'paused'} data-world={world} style={{ '--dwell': `${DWELL_MS}ms` } as CSSProperties}>
    <header className="masthead"><a className="wordmark" href={import.meta.env.BASE_URL} aria-label="Keyscape 首页">keyscape</a><span className="edition">INTERACTIVE STUDIES / 001</span></header>

    <section className="art-stage" aria-label="可旋转的三维艺术键">
      <SceneBoundary><GalleryScene playing={running} world={world} night={night} weather={coastal.weather} moment={lunar.id} observatoryMoment={observatory.id} view={view} reduced={reduced} onReady={() => setReady(true)} /></SceneBoundary>
      {(!ready || assetProgress.active) && <div className="loading" role="status">
        <span className="loading-row"><span>正在布置展厅</span><span className="loading-value">{progress}%</span></span>
        <span className="loading-track"><span className="loading-fill" style={{ transform: `scaleX(${progress / 100})` }} /></span>
      </div>}
    </section>

    <footer className="gallery-footer">
      <div className="work-switch" role="group" aria-label="选择作品">
        {WORKS.map(work => <button key={work.id} className="work-option" aria-pressed={work.id === world} onClick={() => pick(work.id)}>{work.label}</button>)}
      </div>
      <div className="transport" role="group" aria-label="作品控制">

      {/* The exhibition runs on its own, so the frame has to say where in the
          loop it is. The label reads it, the ticks count it. */}
      <div className="moment">
        <span className="moment-label" aria-live="polite">{label}</span>
        <ol className="moment-steps" aria-hidden="true">
          {Array.from({ length: moments }, (_, index) => <li key={index} className={index < step ? 'done' : index === step ? 'now' : ''}>
            {index === step ? <span key={`${step}:${run}`} className="moment-fill" /> : null}
          </li>)}
        </ol>
      </div>

      <div className="controls">
        <button className="pill-button" aria-label={reduced ? '静态模式' : playing ? '暂停动态' : '继续动态'} title={reduced ? '静态模式' : playing ? '暂停动态' : '继续动态'} data-paused={!playing || reduced} disabled={reduced} onClick={() => setPlaying(!playing)}>
          <svg viewBox="0 0 24 24" aria-hidden="true">{!playing || reduced ? <path d="M8 5v14l11-7z" /> : <path d="M7 5h3v14H7zm7 0h3v14h-3z" />}</svg>
        </button>
        <button className="icon-button" aria-label="恢复初始视角" title="恢复初始视角" onClick={() => setView(v => nextView(v, 'home'))}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 9a7 7 0 1 1-.1 6M5 4v5h5" /></svg></button>
      </div>
      </div>
      <p className="gesture-hint">拖动旋转 <b>·</b> 点击探索</p>
    </footer>
  </main>;
}
