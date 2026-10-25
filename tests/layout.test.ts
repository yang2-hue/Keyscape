import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { buildHeightfield, keycapOutline, roundedSquarePoint, HARBOR } from '../src/harbor-layout.ts';

test('instanced obstacles contribute their authored transforms and decorative instances can be skipped',()=>{
  const geometry=new THREE.BoxGeometry(.3,.4,.3),material=new THREE.MeshBasicMaterial();
  const rocks=new THREE.InstancedMesh(geometry,material,2);
  rocks.position.set(.1,0,.2);
  rocks.setMatrixAt(0,new THREE.Matrix4().makeTranslation(-.8,.3,-.3));
  rocks.setMatrixAt(1,new THREE.Matrix4().makeTranslation(.6,-.1,.4));
  let field=buildHeightfield(rocks,3.2,64);
  assert.ok(Math.abs(field.sample(-.7,-.1)-.5)<.00001);
  assert.ok(Math.abs(field.sample(.7,.6)-.1)<.00001);
  assert.equal(field.sample(0,0),HARBOR.bottom);
  rocks.userData.ignoreHeightfield=true;
  field=buildHeightfield(rocks,3.2,64);
  assert.equal(field.sample(-.7,-.1),HARBOR.bottom);
  geometry.dispose();material.dispose();
});

test('heightfield respects transforms and the highest overlapping surface', () => {
  const group = new THREE.Group();
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 3.2), new THREE.MeshBasicMaterial());
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -0.3;
  group.add(floor);
  const rock = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.5, 0.7), new THREE.MeshBasicMaterial());
  rock.position.set(0.6, 0.25, 0.6);
  group.add(rock);
  const field = buildHeightfield(group, 3.2, 32);
  assert.ok(Math.abs(field.sample(-0.5, -0.5) + 0.3) < 0.0001);
  assert.ok(Math.abs(field.sample(0.6, 0.6) - 0.5) < 0.0001);
  floor.geometry.dispose(); rock.geometry.dispose();
});

test('the shared keycap outline stays inside the keycap square and uniformly sampled',()=>{
  const points=keycapOutline();
  // 4 edges x 13 samples: the water volume and the resin base both rely on it.
  assert.equal(points.length,52);
  const maxX=Math.max(...points.map(p=>Math.abs(p.x))),maxZ=Math.max(...points.map(p=>Math.abs(p.y)));
  assert.ok(maxX<=1.58&&maxZ<=1.58,`outline ${maxX}/${maxZ} escapes the keycap square`);
  assert.ok(maxX>1.55&&maxZ>1.55,'outline must fill the keycap, not shrink');
  // The outline is four corner arcs joined by straight edges, so consecutive
  // samples are either arc steps (short) or a corner-to-corner edge jump that
  // must stay axis aligned. Four such jumps means a rounded square, not a blob.
  let edges=0;
  for(let i=0;i<points.length;i++){
    const a=points[i],b=points[(i+1)%points.length];
    const gap=Math.hypot(b.x-a.x,b.y-a.y);
    if(gap<.1)continue;
    const axisAligned=Math.abs(a.x-b.x)<1e-6||Math.abs(a.y-b.y)<1e-6;
    assert.ok(axisAligned,`long diagonal step at ${i}: ${a.x},${a.y} -> ${b.x},${b.y}`);
    edges++;
  }
  assert.equal(edges,4,'a keycap outline has exactly four straight edges');
  // A rounded square, not a circle: the mid-edge points must sit on the edge.
  assert.ok(Math.abs(points[0].x-1.41)<.001||Math.abs(points[0].y-1.41)<.001);
});

test('the rounded square clamp preserves interior coordinates',()=>{
  for(const x of [0,0.5,-1.2,1.4]){
    const [px]=roundedSquarePoint(Math.fround(x),0);
    assert.equal(px,Math.fround(x));
  }
});
