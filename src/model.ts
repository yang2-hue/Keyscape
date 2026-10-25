import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// Local imports must be self-contained so replacing an artwork never depends on a remote URL.
export async function loadArtwork(file: File): Promise<THREE.Group> {
  if (!file.name.toLowerCase().endsWith('.glb')) throw new Error('请选择贴图已内嵌的 .glb 文件。');
  if (file.size > 50 * 1024 * 1024) throw new Error('这份模型超过 50 MB，请先压缩后再试。');
  const buffer = await file.arrayBuffer();
  const data = new DataView(buffer);
  if (buffer.byteLength < 20 || data.getUint32(0, true) !== 0x46546c67 || data.getUint32(4, true) !== 2) {
    throw new Error('无法识别此 GLB，请重新导出 glTF 2.0 二进制文件。');
  }
  const length = data.getUint32(12, true);
  if (data.getUint32(16, true) !== 0x4e4f534a || length > buffer.byteLength - 20) throw new Error('模型文件不完整。');
  let json: { buffers?: { uri?: string }[]; images?: { uri?: string }[] };
  try { json = JSON.parse(new TextDecoder().decode(new Uint8Array(buffer, 20, length))); }
  catch { throw new Error('模型描述无法读取，请重新导出。'); }
  if ([...(json.buffers ?? []), ...(json.images ?? [])].some(item => item.uri && !item.uri.startsWith('data:'))) {
    throw new Error('模型包含外部资源，请将贴图和缓冲数据内嵌到 GLB。');
  }
  const manager = new THREE.LoadingManager();
  manager.setURLModifier(url => {
    if (!url.startsWith('blob:') && !url.startsWith('data:')) throw new Error('模型引用了外部资源，请内嵌后重试。');
    return url;
  });
  const gltf = await new GLTFLoader(manager).parseAsync(buffer, '');
  const object = gltf.scene;
  const box = new THREE.Box3().setFromObject(object);
  const size = box.getSize(new THREE.Vector3());
  const span = Math.max(size.x, size.y, size.z);
  if (box.isEmpty() || !Number.isFinite(span) || span < 0.00001) {
    disposeArtwork(object);
    throw new Error('模型中没有可见的几何体。');
  }
  const root = new THREE.Group();
  const center = box.getCenter(new THREE.Vector3());
  const scale = 3.3 / span;
  // Wrap instead of overwriting transforms authored by the artist.
  root.scale.setScalar(scale);
  root.position.set(-center.x * scale, 0.35 - center.y * scale, -center.z * scale);
  object.traverse(child => {
    if (child instanceof THREE.Mesh) { child.castShadow = true; child.receiveShadow = true; }
  });
  root.add(object);
  return root;
}

export function disposeArtwork(root: THREE.Object3D) {
  const resources = new Set<{ dispose(): void }>();
  root.traverse(child => {
    if (!(child instanceof THREE.Mesh) && !(child instanceof THREE.Points) && !(child instanceof THREE.Line)) return;
    resources.add(child.geometry);
    for (const material of Array.isArray(child.material) ? child.material : [child.material]) {
      resources.add(material);
      for (const value of Object.values(material)) if (value instanceof THREE.Texture) resources.add(value);
    }
  });
  resources.forEach(resource => resource.dispose());
}
