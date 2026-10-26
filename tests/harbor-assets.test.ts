import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {CRESCENT,PIER_HEAD,PIER_ANGLE,DOCK} from '../src/crescent-bay.ts';
import {LANDING} from '../src/crescent-access.ts';

function positions(name:string){
 const bytes=readFileSync(new URL(`../public/models/harbor/${name}.glb`,import.meta.url));
 const length=bytes.readUInt32LE(12),doc=JSON.parse(bytes.subarray(20,20+length).toString());
 const bin=bytes.subarray(28+length),out:number[][]=[];
 for(const mesh of doc.meshes)for(const primitive of mesh.primitives){
  const a=doc.accessors[primitive.attributes.POSITION],v=doc.bufferViews[a.bufferView];
  assert.equal(a.componentType,5126);assert.equal(a.type,'VEC3');
  for(let i=0;i<a.count;i++){
   const offset=(v.byteOffset??0)+(a.byteOffset??0)+i*(v.byteStride??12);
   out.push([bin.readFloatLE(offset),bin.readFloatLE(offset+4),bin.readFloatLE(offset+8)]);
  }
 }
 assert.ok(out.length>100);assert.ok(out.every(p=>p.every(Number.isFinite)));return out;
}

test('entire published boat including trim fits the unchanged collision envelope',()=>{
 const vertices=positions('fishing-boat');
 for(const [x,,z] of vertices){assert.ok(Math.abs(x)*.85<=.09,`boat wider than guard: ${x}`);assert.ok(Math.abs(z)*.85<=.265,`boat longer than guard: ${z}`);}
 assert.ok(vertices.some(p=>p[1]<-.04),'keel must extend below the waterline');
 assert.ok(vertices.some(p=>p[1]>.2),'model must include the actual mast and cabin');
});

test('published dock fits its obstacle footprint and joins the shore landing',()=>{
 const sx=CRESCENT.cx+Math.cos(PIER_ANGLE)*(CRESCENT.rIn-.01),sz=CRESCENT.cz+Math.sin(PIER_ANGLE)*(CRESCENT.rIn-.01);
 const ex=CRESCENT.cx+Math.cos(PIER_ANGLE)*PIER_HEAD,ez=CRESCENT.cz+Math.sin(PIER_ANGLE)*PIER_HEAD;
 const angle=Math.atan2(ex-sx,ez-sz);
 assert.ok(Math.hypot(sx-LANDING.x,sz-LANDING.z)<1e-6);
 assert.ok(Math.abs(.13-LANDING.y)<1e-6);
 const vertices=positions('timber-dock');
 for(const [x,,z] of vertices){
  const px=sx+x*Math.cos(angle)+z*Math.sin(angle),pz=sz-x*Math.sin(angle)+z*Math.cos(angle);
  assert.ok(DOCK.some(b=>px>=b.x0-.001&&px<=b.x1+.001&&pz>=b.z0-.001&&pz<=b.z1+.001),`dock extends beyond guard at ${px},${pz}`);
 }
 assert.ok(vertices.some(p=>p[1]<-.3),'piers must extend into the seabed');
 assert.ok(vertices.some(p=>Math.abs(p[1])<1e-6),'deck top must be at its landing origin');
});
