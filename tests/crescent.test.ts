import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { crescentHeight, CRESCENT, BERTH, createLighthouseBeam } from '../src/crescent-bay.ts';
import { HARBOR,roundedSquarePoint,buildHeightfield } from '../src/harbor-layout.ts';
import { MAIN_PATH,HOUSE_PATHS,SHORE_STAIRS,LANDING,TERRACE,stairTreads,accessClearance,COTTAGES,islandPoint } from '../src/crescent-access.ts';

test('Float32 rounded edges preserve interior vertices and do not create long triangles',()=>{
  for(const n of [112,128])for(const sign of [-1,1]){
    let previous: [number,number]|undefined;
    for(let i=0;i<=n;i++){
      const x=Math.fround(-1.57+3.14*i/n),p=roundedSquarePoint(x,Math.fround(sign*1.57));
      if(Math.abs(x)<1.4)assert.equal(p[0],x);
      if(previous)assert.ok(Math.hypot(p[0]-previous[0],p[1]-previous[1])<.04);
      previous=p;
    }
  }
});

test('shore stairway descends continuously and lands at dock height',()=>{
  const steps=stairTreads();
  assert.equal(SHORE_STAIRS[0].y,TERRACE);
  assert.equal(steps.at(-1)!.b.y,LANDING.y);
  for(let i=0;i<steps.length;i++){
    const s=steps[i];assert.ok(s.top>=s.b.y-1e-9&&s.top-s.b.y<=.018001);
    assert.ok(Math.hypot(s.b.x-s.a.x,s.b.z-s.a.z)>=.020,'tread must have useful depth');
    if(i){assert.deepEqual(steps[i-1].b,s.a);assert.ok(steps[i-1].top>=s.top-1e-9);}
  }
});

test('every cottage has an inward entrance connected to the main road',()=>{
  COTTAGES.forEach((c,i)=>{
    const route=HOUSE_PATHS[i],front=islandPoint(c.a,c.r-c.d/2-.015);
    assert.deepEqual(route[1],front);
    assert.ok(Math.min(...MAIN_PATH.map(p=>Math.hypot(p.x-route[0].x,p.z-route[0].z)))<.015);
    assert.ok(accessClearance(front.x,front.z)<1e-6);
    assert.ok(Math.abs(crescentHeight(front.x,front.z)-TERRACE)<.012);
  });
});

test('main walking route has dry ground without intervening terrain spikes',()=>{
  for(const p of MAIN_PATH){const h=crescentHeight(p.x,p.z);assert.ok(h>HARBOR.water+.2);assert.ok(h<=TERRACE+.006);assert.ok(h>TERRACE-.06);}
});

test('the channel on the opening side stays open water, never an O', () => {
  // Mid-band radius straight out on the +z opening side must be deep channel.
  const channel = crescentHeight(CRESCENT.cx, CRESCENT.cz + 1.0);
  assert.ok(channel < HARBOR.water - 0.25, `channel bed ${channel} should be well below water`);
  // And further out in the same direction, still open sea.
  assert.ok(crescentHeight(CRESCENT.cx, CRESCENT.cz + 1.35) < HARBOR.water);
});

test('the crescent arc raises real land opposite the opening', () => {
  const land = crescentHeight(CRESCENT.cx, CRESCENT.cz - 1.0);
  assert.ok(land > HARBOR.water + 0.2, `far-side crest ${land} should stand above water`);
  // Lagoon interior is submerged but shallower than the outer sea.
  const lagoon = crescentHeight(CRESCENT.cx, CRESCENT.cz);
  const outer = crescentHeight(CRESCENT.cx, CRESCENT.cz - 1.5);
  assert.ok(lagoon < HARBOR.water - 0.2, 'lagoon bed must stay submerged for swimming');
  assert.ok(lagoon > outer, 'lagoon should be shallower than the outer sea');
});

test('boat berth water is deep enough across the hull line', () => {
  // The terrain plane is exactly crescentHeight, and the berth area carries
  // no heightfield props (reef ring and jetty both keep their distance).
  // Scene-level confirmation (swim loop, props clearance) happens in the
  // browser check via the fishCount/boatHeave instrumentation.
  for (const dx of [-0.18, 0, 0.18]) {
    const bed = crescentHeight(BERTH.x + dx, BERTH.z);
    assert.ok(bed < HARBOR.water - 0.13, `berth bed ${bed} too shallow at dx=${dx}`);
  }
});

test('lighthouse beam stays visual-only and never raises the water heightfield',()=>{
  const {beam,material}=createLighthouseBeam(),root=new THREE.Group();root.add(beam);
  const field=buildHeightfield(root,HARBOR.size,64);
  assert.equal(beam.userData.ignoreHeightfield,true);
  assert.ok(field.heights.every(height=>height===HARBOR.bottom));
  beam.geometry.dispose();material.dispose();
});
