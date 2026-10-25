import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { loadArtwork, disposeArtwork } from '../src/model.ts';

function glb(json: object, binary?: Buffer) {
  const text = Buffer.from(JSON.stringify(json));
  const padded = Buffer.alloc(Math.ceil(text.length / 4) * 4, 0x20); text.copy(padded);
  const payload = binary ? Buffer.alloc(Math.ceil(binary.length / 4) * 4) : null;
  if (payload && binary) binary.copy(payload);
  const out = Buffer.alloc(20 + padded.length + (payload ? 8 + payload.length : 0));
  out.writeUInt32LE(0x46546c67, 0); out.writeUInt32LE(2, 4); out.writeUInt32LE(out.length, 8);
  out.writeUInt32LE(padded.length, 12); out.writeUInt32LE(0x4e4f534a, 16); padded.copy(out, 20);
  if (payload) { const offset = 20 + padded.length; out.writeUInt32LE(payload.length, offset); out.writeUInt32LE(0x004e4942, offset + 4); payload.copy(out, offset + 8); }
  return new File([out], 'test.glb');
}

test('rejects malformed files and externally linked resources', async () => {
  await assert.rejects(loadArtwork(new File(['broken'], 'bad.glb')), /无法识别/);
  await assert.rejects(loadArtwork(new File(['x'], 'bad.obj')), /请选择/);
  await assert.rejects(loadArtwork(glb({ asset: { version: '2.0' }, buffers: [{ uri: 'https://example.com/private.bin', byteLength: 12 }] })), /外部资源/);
});

test('rejects an empty scene without replacing an existing artwork', async () => {
  await assert.rejects(loadArtwork(glb({ asset: { version: '2.0' }, scene: 0, scenes: [{ nodes: [] }], nodes: [] })), /没有可见/);
});

test('normalizes off-centre assets without overwriting authored transforms', async () => {
  const points = new Float32Array([0, 0, 0, 2, 0, 0, 0, 2, 0]);
  const file = glb({ asset: { version: '2.0' }, scene: 0, scenes: [{ nodes: [0] }], nodes: [{ mesh: 0, translation: [100, 50, -20] }], meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }], buffers: [{ byteLength: points.byteLength }], bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: points.byteLength }], accessors: [{ bufferView: 0, componentType: 5126, count: 3, type: 'VEC3', min: [0, 0, 0], max: [2, 2, 0] }] }, Buffer.from(points.buffer));
  const model = await loadArtwork(file);
  const box = new THREE.Box3().setFromObject(model);
  const center = box.getCenter(new THREE.Vector3());
  assert.ok(Math.abs(center.x) < 0.00001);
  assert.ok(Math.abs(center.y - 0.35) < 0.00001);
  assert.ok(Math.abs(center.z) < 0.00001);
  assert.ok(Math.abs(box.getSize(new THREE.Vector3()).x - 3.3) < 0.00001);
  assert.equal(model.children[0].children[0].position.x, 100);
  disposeArtwork(model);
});

test('disposes point and line geometry, materials and textures',()=>{
  const root=new THREE.Group(),texture=new THREE.Texture();
  const points=new THREE.Points(new THREE.BufferGeometry(),new THREE.PointsMaterial({map:texture}));
  const line=new THREE.Line(new THREE.BufferGeometry(),new THREE.LineBasicMaterial());
  root.add(points,line);
  const disposed=new Set<object>();
  for(const resource of [points.geometry,points.material,line.geometry,line.material,texture]){
    const dispose=resource.dispose.bind(resource);
    resource.dispose=()=>{disposed.add(resource);dispose();};
  }
  disposeArtwork(root);
  assert.equal(disposed.size,5);
});
