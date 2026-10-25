import { Component, Suspense, useEffect, useRef, useState, type ComponentRef, type ReactNode } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, OrthographicCamera, SoftShadows, useProgress } from '@react-three/drei';
import { StudioShadows } from './studio-shadows';
import { EffectComposer, SSAO, Bloom, Vignette } from '@react-three/postprocessing';
import * as THREE from 'three';
import ArtKey, { StudioEnvironment, useSoftwareRenderer, type WorkId } from './ArtKey';
import CloudGateStudy from './CloudGateStudy';
import { disposeArtwork, loadArtwork } from './model';
import Harbor from './CoastalStudy';
import CrescentStudy from './CrescentStudy';
import { nextView, workIndexFromSearch, type View } from './gallery-state';

const works = [
  { id: 'harbor' as WorkId, name: '潮汐之间', en: 'Between the tides', theme: '灯塔 · 渔港', note: '把海岸的一个午后，收藏在指尖。', image: '/references/harbor.webp', thumb: '/references/harbor-thumb.webp' },
  { id: 'crescent' as WorkId, name: '月湾环抱', en: 'Crescent bay', theme: '月牙 · 泻湖', note: '一颗月牙形的岛，把浅浅的湾抱在怀里。', image: '/references/crescent.webp', thumb: '/references/crescent-thumb.webp' },
  { id: 'gate' as WorkId, name: '云门拱语', en: 'Cloud gate', theme: '拱洞 · 谷雾', note: '两道砂岩斜脊在头顶会合，横桥正是那一横。', image: '/references/cloudgate.webp', thumb: '/references/cloudgate-thumb.webp' },
  { id: 'grotto' as WorkId, name: '蓝洞来信', en: 'A letter from the blue', theme: '石拱 · 秘境', note: '穿过石拱，让目光沉入另一片蓝。', image: '/references/grotto.webp', thumb: '/references/grotto-thumb.webp' },
];
const WORK_IDS = works.map(work => work.id);

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

/** A render failure used to be permanent: the boundary never reset, so the
 * visitor had to reload the page. Resetting whenever the artwork changes keeps
 * the rest of the gallery reachable after one study fails. */
class SceneBoundary extends Component<{ children: ReactNode; resetKey: string }, { failed: boolean; key: string }> {
  state = { failed: false, key: '' };
  static getDerivedStateFromError() { return { failed: true }; }
  static getDerivedStateFromProps(props: { resetKey: string }, state: { failed: boolean; key: string }) {
    return props.resetKey === state.key ? null : { failed: false, key: props.resetKey };
  }
  render() {
    return this.state.failed ? <div className="scene-fallback" role="alert"><p>3D 展厅暂时无法打开</p><span>请使用支持 WebGL 的浏览器，并开启硬件加速。切到其他作品可以继续浏览。</span><button onClick={() => window.location.reload()}>重新打开</button></div> : this.props.children;
  }
}

function CameraRig({ view, reduced, orthographic }: { view: View; reduced: boolean; orthographic:boolean }) {
  const size = useThree(state => state.size);
  const invalidate = useThree(state => state.invalidate);
  const controls = useRef<ComponentRef<typeof OrbitControls>>(null);
  const moving = useRef(false);
  const goal = useRef(new THREE.Vector3(4.8, 3.25, 5.5));
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
        // Default to the same viewing direction as the three-quarter camera.
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
          minZoom: ctl.minZoom,
          maxZoom: ctl.maxZoom,
        };
      },
    };
    return () => { if (debug.__galleryCamera) delete debug.__galleryCamera; };
  }, [invalidate]);
  useEffect(() => {
    if(orthographic){goal.current.set(5.6,5.7,6.2);zoomGoal.current=baseZoom*(view.kind==='close'?1.25:1);}
    else if (view.kind === 'close') goal.current.set(3.65, 2.35, 4.1);
    else goal.current.set(4.8, 3.25, 5.5);
    if(!orthographic)goal.current.multiplyScalar(Math.max(1, Math.min(1.7, 1.1 * size.height / size.width)));
    target.current.set(0, view.kind === 'close' ? 0.48 : 0.20, 0);
    moving.current = true;
    invalidate();
  }, [view, size.width, size.height,orthographic,baseZoom,invalidate]);
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
  return <>{orthographic&&<OrthographicCamera makeDefault position={[5.6,5.7,6.2]} zoom={baseZoom} near={.1} far={80}/>}
    <OrbitControls ref={controls} makeDefault enablePan={false} minDistance={4.1} maxDistance={16} minZoom={baseZoom*.65} maxZoom={baseZoom*1.9} minPolarAngle={0.25} maxPolarAngle={1.42} enableDamping dampingFactor={0.075} onStart={() => { moving.current = false; }} />
  </>;
}

function Atmosphere({ evening, rainy,night=false }: { evening: boolean; rainy: boolean;night?:boolean }) {
  const scene=useThree(state=>state.scene);
  const software = useSoftwareRenderer();
  const ambient = useRef<THREE.AmbientLight>(null);
  const sun = useRef<THREE.DirectionalLight>(null);
  const fill = useRef<THREE.DirectionalLight>(null);
  const color = useRef(new THREE.Color()).current;
  useFrame((_, dt) => {
    const delta = Math.min(dt, 0.05);
    scene.environmentIntensity=THREE.MathUtils.damp(scene.environmentIntensity,night?.12:.35,3,delta);
    if (ambient.current) {
      ambient.current.intensity = THREE.MathUtils.damp(ambient.current.intensity, night ? .14 : rainy ? 0.65 : evening ? 0.24 : 0.35, 3, delta);
      color.set(rainy ? '#b3cbd4' : evening ? '#b5c6e5' : '#fff7e9');
      ambient.current.color.lerp(color, 1 - Math.exp(-3 * delta));
    }
    if (sun.current) {
      sun.current.intensity = THREE.MathUtils.damp(sun.current.intensity, night ? .18 : rainy ? 0.7 : evening ? 1.3 : 2, 3, delta);
      color.set(rainy ? '#c3d7de' : evening ? '#ffbd86' : '#fff2d7');
      sun.current.color.lerp(color, 1 - Math.exp(-3 * delta));
    }
    if (fill.current) fill.current.intensity = THREE.MathUtils.damp(fill.current.intensity, night ? .17 : rainy ? 0.8 : 0.6, 3, delta);
  });
  return <>
    <ambientLight ref={ambient} intensity={0.35} />
    <hemisphereLight intensity={night?.16:.45} color="#fff5e1" groundColor="#b6c9bc" />
    <directionalLight ref={sun} position={[-3, 7, 4]} intensity={2} castShadow shadow-mapSize={software ? [1024, 1024] : [2048, 2048]} shadow-camera-left={-3} shadow-camera-right={3} shadow-camera-top={3} shadow-camera-bottom={-3} shadow-normalBias={0.012} shadow-bias={-0.0002} shadow-radius={3} />
    <directionalLight ref={fill} position={[4, 3, -4]} intensity={0.6} color="#a5d6e3" />
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

/** Keeps requesting frames for a short window after a state change, so the
 * damped lighting/weather transitions still animate under `frameloop="demand"`.
 * Without this, toggling dusk while paused would freeze halfway through. */
function DemandPump({ boost }: { boost: string }) {
  const invalidate = useThree(state => state.invalidate);
  const gl = useThree(state => state.gl);
  const frameloop = useThree(state => state.frameloop);
  const until = useRef(0);
  const frames = useRef(0);
  useEffect(() => { until.current = performance.now() + 1600; invalidate(); }, [boost, invalidate]);
  // Written outside useFrame so the mode is observable even when the loop has
  // already stopped (the whole point of demand rendering).
  useEffect(() => { if (import.meta.env.DEV) gl.domElement.dataset.renderMode = frameloop; }, [frameloop, gl]);
  useFrame(() => {
    frames.current++;
    if (import.meta.env.DEV) gl.domElement.dataset.renderFrames = String(frames.current);
    if (performance.now() < until.current) invalidate();
  });
  return null;
}

function PostChain() {
  const software = useSoftwareRenderer();
  return <>{!software && <SoftShadows size={12} samples={8} focus={.25} />}<EffectComposer multisampling={software ? 0 : 4} enableNormalPass>
    <SSAO samples={8} radius={.075} intensity={.8} luminanceInfluence={.8} bias={.025} />
    <Bloom intensity={.06} luminanceThreshold={1.3} mipmapBlur />
    <Vignette offset={.12} darkness={.08} />
  </EffectComposer></>;
}

function GalleryScene({ work, playing, evening, rainy, view, reduced, imported, onReady }: { work: WorkId; playing: boolean; evening: boolean; rainy: boolean; view: View; reduced: boolean; imported: THREE.Group | null; onReady: () => void }) {
  return <Canvas shadows dpr={[1, 2]} frameloop={playing ? 'always' : 'demand'} camera={{ position: [4.8, 3.25, 5.5], fov: 35, near: 0.1, far: 80 }} gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }} onCreated={({ gl }) => { gl.toneMapping = THREE.ACESFilmicToneMapping; onReady(); }} fallback={<div className="scene-fallback">当前浏览器不支持 3D 展示。</div>}>
    <QualityProfile />
    <DemandPump boost={`${work}:${view.kind}:${view.serial}:${evening ? 1 : 0}:${rainy ? 1 : 0}:${imported ? 'imported' : 'built-in'}`} />
    <Atmosphere evening={evening} rainy={rainy} night={work==='crescent'&&evening&&!imported} />
    <Suspense fallback={null}>
      <StudioEnvironment />
      {imported ? <primitive object={imported} dispose={null} /> : work === 'harbor' ? <Harbor playing={playing} evening={evening} rainy={rainy} /> : work === 'crescent' ? <CrescentStudy playing={playing} evening={evening} rainy={rainy} /> : work === 'gate' ? <CloudGateStudy playing={playing} evening={evening} rainy={rainy} /> : <ArtKey work={work} playing={playing} evening={evening} />}
      <StudioShadows key={`${work}-${imported?.uuid ?? 'built-in'}`} frames={1} position={[0, -0.83, 0]} opacity={0.35} scale={12} blur={2.7} far={5} resolution={256} color="#555345" />
    </Suspense>
    <CameraRig view={view} reduced={reduced} orthographic={(work==='harbor'||work==='crescent'||work==='gate')&&!imported}/>
    {(work==='harbor'||work==='crescent'||work==='gate')&&!imported&&<PostChain />}
  </Canvas>;
}

function ReferenceDialog({ name, image, onClose }: { name: string; image: string; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { dialog.current?.showModal(); return () => dialog.current?.close(); }, []);
  return <dialog ref={dialog} className="reference-dialog" onCancel={onClose} onClick={e => { if (e.target === e.currentTarget) onClose(); }} aria-label={`${name}美术参考`}>
    <div className="dialog-head"><div><span className="eyebrow">ART DIRECTION</span><h2>希望抵达的细节</h2></div><button autoFocus className="round-button" aria-label="关闭参考图" onClick={onClose}>×</button></div>
    <img src={image} alt={`${name}单键概念图：微缩海岸、透明水体与精细的水下世界`} />
    <p>已认可的 V3 美术参考 · 这是一张概念图。渔港正在按参考作品重建分离的程序化场景，蓝洞仍为早期习作；实际场景与概念图的精度仍有差距。</p>
  </dialog>;
}

export default function App() {
  const [index, setIndex] = useState(() => workIndexFromSearch(window.location.search, WORK_IDS));
  const [playing, setPlaying] = useState(true);
  const [evening, setEvening] = useState(false);
  const [rainy, setRainy] = useState(false);
  const [reference, setReference] = useState(false);
  const [ready, setReady] = useState(false);
  const [view, setView] = useState<View>({ kind: 'home', serial: 0 });
  const [imported, setImported] = useState<THREE.Group | null>(null);
  const [fileName, setFileName] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const fileInput = useRef<HTMLInputElement>(null);
  const request = useRef(0);
  const reduced = useReducedMotion();
  const work = works[index];
  const assetProgress = useProgress();
  const weatherAvailable = (work.id === 'harbor' || work.id === 'crescent' || work.id === 'gate') && !imported;

  useEffect(() => () => { if (imported) disposeArtwork(imported); }, [imported]);
  useEffect(() => () => { request.current++; }, []);
  const changeWork = (next: number) => {
    request.current++;
    setLoading(false); setImported(null); setMessage('');
    setIndex((next + works.length) % works.length);
    setView(v => nextView(v, 'home'));
  };
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLElement && ['INPUT', 'BUTTON', 'DIALOG'].includes(event.target.tagName)) return;
      if (reference) return;
      if (event.key === 'ArrowRight') changeWork(index + 1);
      if (event.key === 'ArrowLeft') changeWork(index - 1);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [index, reference]);

  async function importFile(file: File) {
    const token = ++request.current;
    setLoading(true); setMessage('');
    try {
      const model = await loadArtwork(file);
      if (token !== request.current) { disposeArtwork(model); return; }
      setImported(model); setFileName(file.name.replace(/\.glb$/i, ''));
      setView(v => nextView(v, 'home'));
      setMessage('模型已载入，仅在本机预览。');
    } catch (error) {
      if (token === request.current) setMessage(error instanceof Error ? error.message : '模型读取失败，请检查文件。');
    } finally { if (token === request.current) setLoading(false); }
  }

  return <main className={`gallery ${evening ? 'evening' : ''} ${rainy && weatherAvailable ? 'rainy' : ''} ${evening && work.id === 'crescent' && !imported ? 'night' : ''}`}>
    <header className="masthead"><a className="wordmark" href="/" aria-label="Keyscape 首页">keyscape<span>✳</span></a><span className="edition">EXPERIMENTS IN MINIATURE <i /> VOL. 001</span><button className="text-button import-button" onClick={() => fileInput.current?.click()} disabled={loading}>{loading ? '正在读取…' : '导入作品'} <span aria-hidden>↗</span></button></header>
    <input ref={fileInput} hidden type="file" accept=".glb" aria-label="选择 GLB 模型" onChange={event => { const file = event.target.files?.[0]; if (file) void importFile(file); event.target.value = ''; }} />

    <section className="art-stage" aria-label="可旋转的三维艺术键" onDragOver={event => event.preventDefault()} onDrop={event => { event.preventDefault(); const file = event.dataTransfer.files[0]; if (file) void importFile(file); }}>
      <SceneBoundary resetKey={`${work.id}:${imported?.uuid ?? 'built-in'}`}><GalleryScene work={work.id} playing={playing && !reduced} evening={evening} rainy={rainy && weatherAvailable} view={view} reduced={reduced} imported={imported} onReady={() => setReady(true)} /></SceneBoundary>
      {(!ready || assetProgress.active) && <div className="loading" role="status">正在布置展厅… {Math.round(assetProgress.progress)}%</div>}
    </section>

    <div className="vertical-caption" aria-hidden="true">A SMALL KEY. AN ENTIRE WORLD.</div>
    <section className="art-caption" aria-live="polite" aria-atomic="true">
      <div className="work-number"><span>{imported ? 'YOUR ARTWORK' : `0${index + 1} / COLLECTION STUDIES`}</span><i /></div>
      <h1 key={imported ? fileName : work.id}>{imported ? fileName : work.name}</h1>
      <p className="english-title">{imported ? 'Your world, in the making.' : work.en}</p>
      <p className="work-description">{imported ? '拖动，慢慢发现它的每一面。' : work.note}</p>
      <span className="study-label">{imported ? '本地模型预览' : work.id === 'harbor' ? '海湾微缩 · 午后潮汐' : work.id === 'crescent' ? '月湾微缩 · 开放泻湖' : work.id === 'gate' ? '云门微缩 · 拱洞谷雾' : '石拱秘境 · 交互习作'}</span>
    </section>

    <aside className="side-tools" aria-label="观察作品">
      <button className="round-button" aria-label="拉近观察" title="拉近观察" onClick={() => setView(v => nextView(v, 'close'))}>＋</button>
      <button className="round-button" aria-label="恢复初始视角" title="恢复初始视角" onClick={() => setView(v => nextView(v, 'home'))}>↺</button>
      {!imported && <button className="reference-trigger" onClick={() => setReference(true)}><img src={work.thumb} alt="" /><span>美术参考 ↗</span></button>}
    </aside>

    <footer className="gallery-footer">
      <nav className="work-switcher" aria-label="选择作品">
        <button className="nav-arrow" aria-label="上一件作品" onClick={() => changeWork(index - 1)}>←</button>
        {works.map((item, i) => <button key={item.id} className={`work-tab ${index === i && !imported ? 'active' : ''}`} aria-pressed={index === i && !imported} onClick={() => changeWork(i)}><span className="tab-number">0{i + 1}</span><span>{item.theme}</span></button>)}
        <button className="nav-arrow" aria-label="下一件作品" onClick={() => changeWork(index + 1)}>→</button>
      </nav>
      <span className="gesture-hint">拖动旋转 <b>·</b> 滚轮拉近 <b>·</b> 触摸探索</span>
      <div className="mood-controls"><button className="text-button" aria-pressed={evening} onClick={() => setEvening(!evening)}><span aria-hidden>{evening ? '◐' : '☼'}</span> {evening ? (work.id==='crescent'&&!imported?'夜航':'暮色') : '日光'}</button>{weatherAvailable && <button className="text-button" aria-label={rainy ? '切换为晴天' : '切换为小雨'} aria-pressed={rainy} onClick={() => setRainy(!rainy)}>{rainy ? '☂ 小雨' : '⛅ 晴天'}</button>}<span className="control-divider" /><button className="text-button" aria-pressed={!playing || reduced} disabled={reduced} onClick={() => setPlaying(!playing)}>{reduced ? '静态模式' : playing ? 'Ⅱ 暂停动态' : '▷ 继续动态'}</button></div>
    </footer>
    {message && <div className="toast" role="status">{message}<button aria-label="关闭提示" onClick={() => setMessage('')}>×</button></div>}
    {reference && <ReferenceDialog name={work.name} image={work.image} onClose={() => setReference(false)} />}
  </main>;
}
