import { Component, Suspense, useEffect, useRef, useState, type ComponentRef, type ReactNode } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { ContactShadows, OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import ArtKey, { StudioEnvironment, type WorkId } from './ArtKey';
import { disposeArtwork, loadArtwork } from './model';

const works = [
  { id: 'harbor' as WorkId, name: '潮汐之间', en: 'Between the tides', theme: '灯塔 · 渔港', note: '把海岸的一个午后，收藏在指尖。', image: '/references/harbor.png' },
  { id: 'grotto' as WorkId, name: '蓝洞来信', en: 'A letter from the blue', theme: '石拱 · 秘境', note: '穿过石拱，让目光沉入另一片蓝。', image: '/references/grotto.png' },
];

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

class SceneBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    return this.state.failed ? <div className="scene-fallback" role="alert"><p>3D 展厅暂时无法打开</p><span>请使用支持 WebGL 的浏览器，并开启硬件加速。</span><button onClick={() => window.location.reload()}>重新打开</button></div> : this.props.children;
  }
}

type View = { kind: 'home' | 'close'; serial: number };
function CameraRig({ view, reduced }: { view: View; reduced: boolean }) {
  const size = useThree(state => state.size);
  const controls = useRef<ComponentRef<typeof OrbitControls>>(null);
  const moving = useRef(false);
  const goal = useRef(new THREE.Vector3(5.1, 3.8, 6.1));
  const target = useRef(new THREE.Vector3(0, 0.35, 0));
  useEffect(() => {
    if (view.kind === 'close') goal.current.set(3.65, 2.35, 4.1);
    else goal.current.set(5.1, 3.8, 6.1);
    goal.current.multiplyScalar(Math.max(1, Math.min(1.7, 1.1 * size.height / size.width)));
    target.current.set(0, view.kind === 'close' ? 0.48 : 0.35, 0);
    moving.current = true;
  }, [view, size.width, size.height]);
  useFrame((_, dt) => {
    const ctl = controls.current;
    if (!ctl || !moving.current) return;
    const alpha = reduced ? 1 : 1 - Math.exp(-5 * Math.min(dt, 0.05));
    ctl.object.position.lerp(goal.current, alpha);
    ctl.target.lerp(target.current, alpha);
    ctl.update();
    if (ctl.object.position.distanceTo(goal.current) < 0.008) moving.current = false;
  });
  return <OrbitControls ref={controls} makeDefault enablePan={false} minDistance={4.1} maxDistance={16} minPolarAngle={0.15} maxPolarAngle={Math.PI * 0.64} enableDamping dampingFactor={0.075} onStart={() => { moving.current = false; }} />;
}

function GalleryScene({ work, playing, evening, view, reduced, imported, onReady }: { work: WorkId; playing: boolean; evening: boolean; view: View; reduced: boolean; imported: THREE.Group | null; onReady: () => void }) {
  return <Canvas shadows dpr={[1, 1.6]} camera={{ position: [5.1, 3.8, 6.1], fov: 35, near: 0.1, far: 80 }} gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }} onCreated={({ gl }) => { gl.toneMapping = THREE.ACESFilmicToneMapping; onReady(); }} fallback={<div className="scene-fallback">当前浏览器不支持 3D 展示。</div>}>
    <ambientLight intensity={evening ? 0.24 : 0.35} color={evening ? '#b5c6e5' : '#fff7e9'} />
    <directionalLight position={[-3, 7, 4]} intensity={evening ? 1.3 : 2} color={evening ? '#ffbd86' : '#fff2d7'} castShadow shadow-mapSize={[1024, 1024]} shadow-camera-left={-5} shadow-camera-right={5} shadow-camera-top={5} shadow-camera-bottom={-5} shadow-normalBias={0.035} />
    <directionalLight position={[4, 3, -4]} intensity={evening ? 0.65 : 0.6} color="#a5d6e3" />
    <Suspense fallback={null}>
      <StudioEnvironment />
      {imported ? <primitive object={imported} dispose={null} /> : <ArtKey work={work} playing={playing} evening={evening} />}
      <ContactShadows position={[0, -0.83, 0]} opacity={0.35} scale={12} blur={2.7} far={5} resolution={256} color="#555345" />
    </Suspense>
    <CameraRig view={view} reduced={reduced} />
  </Canvas>;
}

function ReferenceDialog({ name, image, onClose }: { name: string; image: string; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { dialog.current?.showModal(); return () => dialog.current?.close(); }, []);
  return <dialog ref={dialog} className="reference-dialog" onCancel={onClose} onClick={e => { if (e.target === e.currentTarget) onClose(); }} aria-label={`${name}美术参考`}>
    <div className="dialog-head"><div><span className="eyebrow">ART DIRECTION</span><h2>希望抵达的细节</h2></div><button autoFocus className="round-button" aria-label="关闭参考图" onClick={onClose}>×</button></div>
    <img src={image} alt={`${name}单键概念图：微缩海岸、透明水体与精细的水下世界`} />
    <p>已认可的 V3 美术参考 · 这是一张概念图。展厅中的程序化场景用于验证交互，最终质感需要专门制作的 3D 资产。</p>
  </dialog>;
}

export default function App() {
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [evening, setEvening] = useState(false);
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

  useEffect(() => () => { if (imported) disposeArtwork(imported); }, [imported]);
  useEffect(() => () => { request.current++; }, []);
  const changeWork = (next: number) => {
    request.current++;
    setLoading(false); setImported(null); setMessage('');
    setIndex((next + works.length) % works.length);
    setView(v => ({ kind: 'home', serial: v.serial + 1 }));
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
      setView(v => ({ kind: 'home', serial: v.serial + 1 }));
      setMessage('模型已载入，仅在本机预览。');
    } catch (error) {
      if (token === request.current) setMessage(error instanceof Error ? error.message : '模型读取失败，请检查文件。');
    } finally { if (token === request.current) setLoading(false); }
  }

  return <main className={`gallery ${evening ? 'evening' : ''}`}>
    <header className="masthead"><a className="wordmark" href="/" aria-label="Keyscape 首页">keyscape<span>✳</span></a><span className="edition">EXPERIMENTS IN MINIATURE <i /> VOL. 001</span><button className="text-button import-button" onClick={() => fileInput.current?.click()} disabled={loading}>{loading ? '正在读取…' : '导入作品'} <span aria-hidden>↗</span></button></header>
    <input ref={fileInput} hidden type="file" accept=".glb" aria-label="选择 GLB 模型" onChange={event => { const file = event.target.files?.[0]; if (file) void importFile(file); event.target.value = ''; }} />

    <section className="art-stage" aria-label="可旋转的三维艺术键" onDragOver={event => event.preventDefault()} onDrop={event => { event.preventDefault(); const file = event.dataTransfer.files[0]; if (file) void importFile(file); }}>
      <SceneBoundary><GalleryScene work={work.id} playing={playing && !reduced} evening={evening} view={view} reduced={reduced} imported={imported} onReady={() => setReady(true)} /></SceneBoundary>
      {!ready && <div className="loading" role="status">正在布置展厅…</div>}
    </section>

    <div className="vertical-caption" aria-hidden="true">A SMALL KEY. AN ENTIRE WORLD.</div>
    <section className="art-caption" aria-live="polite" aria-atomic="true">
      <div className="work-number"><span>{imported ? 'YOUR ARTWORK' : `0${index + 1} / COLLECTION STUDIES`}</span><i /></div>
      <h1 key={imported ? fileName : work.id}>{imported ? fileName : work.name}</h1>
      <p className="english-title">{imported ? 'Your world, in the making.' : work.en}</p>
      <p className="work-description">{imported ? '拖动，慢慢发现它的每一面。' : work.note}</p>
      <span className="study-label">{imported ? '本地模型预览' : '交互习作 · 程序化场景'}</span>
    </section>

    <aside className="side-tools" aria-label="观察作品">
      <button className="round-button" aria-label="拉近观察" title="拉近观察" onClick={() => setView(v => ({ kind: 'close', serial: v.serial + 1 }))}>＋</button>
      <button className="round-button" aria-label="恢复初始视角" title="恢复初始视角" onClick={() => setView(v => ({ kind: 'home', serial: v.serial + 1 }))}>↺</button>
      {!imported && <button className="reference-trigger" onClick={() => setReference(true)}><img src={work.image} alt="" /><span>美术参考 ↗</span></button>}
    </aside>

    <footer className="gallery-footer">
      <nav className="work-switcher" aria-label="选择作品">
        <button className="nav-arrow" aria-label="上一件作品" onClick={() => changeWork(index - 1)}>←</button>
        {works.map((item, i) => <button key={item.id} className={`work-tab ${index === i && !imported ? 'active' : ''}`} aria-pressed={index === i && !imported} onClick={() => changeWork(i)}><span className="tab-number">0{i + 1}</span><span>{item.theme}</span></button>)}
        <button className="nav-arrow" aria-label="下一件作品" onClick={() => changeWork(index + 1)}>→</button>
      </nav>
      <span className="gesture-hint">拖动旋转 <b>·</b> 滚轮拉近 <b>·</b> 触摸探索</span>
      <div className="mood-controls"><button className="text-button" aria-pressed={evening} onClick={() => setEvening(!evening)}><span aria-hidden>{evening ? '◐' : '☼'}</span> {evening ? '暮色' : '日光'}</button><span className="control-divider" /><button className="text-button" aria-pressed={!playing || reduced} disabled={reduced} onClick={() => setPlaying(!playing)}>{reduced ? '静态模式' : playing ? 'Ⅱ 暂停动态' : '▷ 继续动态'}</button></div>
    </footer>
    {message && <div className="toast" role="status">{message}<button aria-label="关闭提示" onClick={() => setMessage('')}>×</button></div>}
    {reference && <ReferenceDialog name={work.name} image={work.image} onClose={() => setReference(false)} />}
  </main>;
}
