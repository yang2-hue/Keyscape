import {test} from 'node:test';
import assert from 'node:assert/strict';
import {advanceGull,gullPose,GULL_FLIGHT_SECONDS,type GullPoint} from '../src/harbor-gull-motion.ts';

const anchor:GullPoint=[-.07887,.28,-.38265],center:readonly [number,number]=[-.22,.06];

test('gull trip starts and ends on its post with folded wings and continuous joins',()=>{
  const rest=gullPose(0,false,anchor,center),start=gullPose(0,true,anchor,center),end=gullPose(GULL_FLIGHT_SECONDS,true,anchor,center);
  for(const p of [start,end])for(const key of ['x','y','z','spread','wingSweep','wingFlap'] as const)assert.ok(Math.abs(p[key]-rest[key])<1e-10,key);
  for(const t of [1.2,6.4]){
    const a=gullPose(t-1e-5,true,anchor,center),b=gullPose(t+1e-5,true,anchor,center);
    assert.ok(Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z)<1e-5,'position must not jump between vertical and orbit segments');
    assert.ok(Math.abs(Math.atan2(Math.sin(a.yaw-b.yaw),Math.cos(a.yaw-b.yaw)))<1e-5,'bearing must stay continuous');
  }
});

test('gull stays above the lagoon away from cottage and lighthouse terrain',()=>{
  for(let i=0;i<=800;i++){
    const p=gullPose(GULL_FLIGHT_SECONDS*i/800,true,anchor,center);
    assert.ok(Math.hypot(p.x-center[0],p.z-center[1])<.48,'flight circle must stay inside the lagoon');
    assert.ok(p.y>=anchor[1]&&p.y<=.85,'no sinking into dock or excessive height');
    if(p.phase==='orbit')assert.ok(p.y>=.77,'cruise must clear the boat cabin and mast');
  }
});

test('pause and hidden page freeze both flight progress and wing pose',()=>{
  const s={flying:true,elapsed:2.2,completed:0};
  const before=gullPose(s.elapsed,s.flying,anchor,center);
  for(let i=0;i<100;i++){advanceGull(s,1,false,true);advanceGull(s,1,true,false);advanceGull(s,0,true,true);}
  assert.equal(s.elapsed,2.2);assert.deepEqual(gullPose(s.elapsed,s.flying,anchor,center),before);
  advanceGull(s,100,true,true);assert.equal(s.elapsed,2.25,'a stalled frame cannot teleport the bird');
});

test('landing completes once and idle frames do not add trips',()=>{
  const s={flying:true,elapsed:GULL_FLIGHT_SECONDS-.01,completed:0};
  advanceGull(s,.05,true,true);assert.equal(s.flying,false);assert.equal(s.elapsed,GULL_FLIGHT_SECONDS);assert.equal(s.completed,1);
  for(let i=0;i<100;i++)advanceGull(s,.05,true,true);
  assert.equal(s.completed,1);assert.deepEqual(gullPose(s.elapsed,s.flying,anchor,center),gullPose(0,false,anchor,center));
});
