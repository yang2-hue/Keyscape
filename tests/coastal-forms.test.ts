import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {crescentHeight} from '../src/crescent-bay.ts';
import {accessClearance} from '../src/crescent-access.ts';
import {roundedSquarePoint,buildHeightfield} from '../src/harbor-layout.ts';
import {sculptCliffs} from '../src/coastal-forms.ts';
import {closeTerrainVolume} from '../src/terrain-volume.ts';

test('rock relief preserves walking corridors and remains inside the keycap',()=>{
  const g=new THREE.PlaneGeometry(3.14,3.14,176,176);g.rotateX(-Math.PI/2);
  const p=g.attributes.position;
  for(let i=0;i<p.count;i++){const [x,z]=roundedSquarePoint(p.getX(i),p.getZ(i));p.setXYZ(i,x,crescentHeight(x,z),z);}
  const before=new Float32Array(p.array);sculptCliffs(g);
  let changed=0,protectedCount=0;
  for(let i=0;i<p.count;i++){
    const x=p.getX(i),y=p.getY(i),z=p.getZ(i);
    assert.ok(Number.isFinite(x)&&Number.isFinite(y)&&Number.isFinite(z));
    assert.ok(Math.abs(x)<=1.570001&&Math.abs(z)<=1.570001);
    if(accessClearance(before[i*3],before[i*3+2])<.075){
      assert.equal(x,before[i*3]);assert.equal(y,before[i*3+1]);assert.equal(z,before[i*3+2]);protectedCount++;
    }
    if(x!==before[i*3]||y!==before[i*3+1]||z!==before[i*3+2])changed++;
  }
  assert.ok(changed>100,'the check must exercise a real cliff surface');
  assert.ok(protectedCount>100,'the check must include the actual access network');
  g.dispose();
});

test('terrain closure is a watertight solid with outward walls and an unchanged top',()=>{
  const top=new THREE.PlaneGeometry(1,1,8,8);top.rotateX(-Math.PI/2);
  const p=top.attributes.position;
  for(let i=0;i<p.count;i++)p.setY(i,.1+.05*Math.sin(p.getX(i)*5)*Math.cos(p.getZ(i)*4));
  top.computeVertexNormals();const solid=closeTerrainVolume(top,-.65);
  try{
    const points=solid.attributes.position,faces=solid.index!,edgeCounts=new Map<string,number>();
    for(let i=0;i<p.count;i++)for(let k=0;k<3;k++)assert.equal(points.array[i*3+k],p.array[i*3+k]);
    const id=(i:number)=>[points.getX(i),points.getY(i),points.getZ(i)].map(v=>v.toFixed(6)).join(',');
    for(let i=0;i<faces.count;i+=3)for(let k=0;k<3;k++){
      const a=id(faces.getX(i+k)),b=id(faces.getX(i+(k+1)%3)),edge=a<b?a+'|'+b:b+'|'+a;
      edgeCounts.set(edge,(edgeCounts.get(edge)??0)+1);
    }
    assert.ok([...edgeCounts.values()].every(n=>n===2),'every geometric edge must have exactly two incident faces');
    const m=new THREE.Mesh(solid,new THREE.MeshBasicMaterial()),ray=new THREE.Raycaster(new THREE.Vector3(-1,-.3,0),new THREE.Vector3(1,0,0));
    const hit=ray.intersectObject(m)[0];
    assert.ok(hit&&hit.point.x>-.5&&hit.point.x<-.49,'wall must face outward and lie inside the water boundary');
    m.material.dispose();
  }finally{top.dispose();solid.dispose();}
});

test('closing the actual coast leaves water depths and the sea channel unchanged',()=>{
  const top=new THREE.PlaneGeometry(3.14,3.14,176,176);top.rotateX(-Math.PI/2);const p=top.attributes.position;
  for(let i=0;i<p.count;i++){const [x,z]=roundedSquarePoint(p.getX(i),p.getZ(i));p.setXYZ(i,x,crescentHeight(x,z),z);}
  sculptCliffs(top);top.computeVertexNormals();const solid=closeTerrainVolume(top,-.65),material=new THREE.MeshBasicMaterial();
  const root=(g:THREE.BufferGeometry)=>{const r=new THREE.Group();r.add(new THREE.Mesh(g,material));return r;};
  try{assert.deepEqual(buildHeightfield(root(solid),3.2,112).heights,buildHeightfield(root(top),3.2,112).heights);}
  finally{top.dispose();solid.dispose();material.dispose();}
});
