import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as THREE from 'three';
import {addCoastalArt} from '../src/coastal-asset-details.ts';
import {crescentHeight} from '../src/crescent-bay.ts';
import {ACCESS_ROUTES} from '../src/crescent-access.ts';
import {buildHeightfield} from '../src/harbor-layout.ts';

test('published scan placements preserve walking routes and keycap bounds',()=>{
  // Read the actual exported mesh, not a mock primitive. These GLB buffers are
  // embedded, uncompressed and tightly packed by the Blender export script.
  const bytes=readFileSync(new URL('../public/models/coast-rocks/coastal-limestone.glb',import.meta.url));
  const length=bytes.readUInt32LE(12),doc=JSON.parse(bytes.subarray(20,20+length).toString());
  const bin=bytes.subarray(28+length),primitive=doc.meshes[0].primitives[0];
  const geometry=new THREE.BufferGeometry();
  const read=(id:number)=>{
    const accessor=doc.accessors[id],view=doc.bufferViews[accessor.bufferView];
    assert.ok(!view.byteStride,'test reader requires tightly packed attributes');
    const width=accessor.type==='VEC3'?3:accessor.type==='VEC2'?2:1;
    const offset=(view.byteOffset??0)+(accessor.byteOffset??0),count=accessor.count*width;
    const raw=bin.subarray(offset,offset+count*(accessor.componentType===5123?2:4));
    const buffer=Uint8Array.from(raw).buffer;
    return accessor.componentType===5126?new Float32Array(buffer):accessor.componentType===5123?new Uint16Array(buffer):new Uint32Array(buffer);
  };
  geometry.setAttribute('position',new THREE.BufferAttribute(read(primitive.attributes.POSITION),3));
  geometry.setAttribute('normal',new THREE.BufferAttribute(read(primitive.attributes.NORMAL),3));
  geometry.setAttribute('uv',new THREE.BufferAttribute(read(primitive.attributes.TEXCOORD_0),2));
  geometry.setIndex(new THREE.BufferAttribute(read(primitive.indices),1));
  const sourceMaterial=new THREE.MeshStandardMaterial(),root=new THREE.Group();
  const dispose=addCoastalArt(root,{rock:new THREE.Mesh(geometry,sourceMaterial),olive:new THREE.Group()},crescentHeight);
  try{
    assert.ok(root.userData.artAssets.scanOutcrops>=10);
    const scan=root.getObjectByName('ScannedCoastalOutcrops') as THREE.Mesh;
    const positions=scan.geometry.attributes.position;
    for(let i=0;i<positions.count;i++){
      assert.ok(Number.isFinite(positions.getY(i)));
      assert.ok(Math.abs(positions.getX(i))<=1.57001&&Math.abs(positions.getZ(i))<=1.57001);
    }
    const field=buildHeightfield(root,3.2,112);
    for(const route of ACCESS_ROUTES)for(const p of route){
      assert.ok(field.sample(p.x,p.z)<=p.y+.025,`scan blocks route at ${p.x},${p.z}`);
    }
    for(let r=.55;r<1.5;r+=.03)assert.ok(field.sample(-.22,.06+r)<.08,'scan closes the sea channel');
  }finally{dispose();geometry.dispose();sourceMaterial.dispose();}
});
