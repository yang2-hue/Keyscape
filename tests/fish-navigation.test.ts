import {test} from 'node:test';
import assert from 'node:assert/strict';
import {swimFish,type FishState} from '../src/fish-navigation.ts';
test('fish turns around a rock without jumps or frame-to-frame heading reversals',()=>{
  const s:FishState={x:-.3,z:0,heading:0,speed:.12,velocity:.12,turn:0};
  const safe=(x:number,z:number)=>Math.hypot(x,z)<.7&&Math.hypot(x-.05,z)>.12;
  let travelled=0,blocked=0;
  for(let i=0;i<3600;i++){
    const x=s.x,z=s.z,h=s.heading;
    swimFish(s,1/60,{safe,time:i/60,phase:0,fear:i>1200&&i<1400?1:0,away:0});
    const d=Math.hypot(s.x-x,s.z-z);travelled+=d;
    assert.ok(d<.005,'no positional projection');assert.ok(safe(s.x,s.z),'never enters rock or shore');
    assert.ok(Math.abs(s.heading-h)<=1.6/60+1e-9,'bounded turning speed');
    blocked=d<1e-7?blocked+1:0;assert.ok(blocked<600,'does not remain stuck');
  }
  assert.ok(travelled>1,'continues exploring after avoidance');
});
test('paused fish state is unchanged, including its avoidance commitment',()=>{
  const s:FishState={x:0,z:0,heading:1,speed:.1,velocity:.1,turn:.2,hold:.4,avoid:2};
  const before={...s};swimFish(s,0,{safe:()=>false,time:20,phase:0,fear:1,away:2});assert.deepEqual(s,before);
});
test('a boat encroaching on a fish permits gradual escape without projection',()=>{
  const s:FishState={x:.1,z:0,heading:Math.PI,speed:.12,velocity:.1,turn:0};
  for(let i=0;i<600;i++){
    const radius=Math.hypot(s.x,s.z),threshold=Math.min(.195,Math.max(0,radius-.001));
    const x=s.x,z=s.z;
    swimFish(s,1/60,{safe:(px,pz)=>Math.hypot(px,pz)>threshold,time:i/60,phase:0,fear:0,away:0});
    assert.ok(Math.hypot(s.x-x,s.z-z)<.003);
  }
  assert.ok(Math.hypot(s.x,s.z)>.195,'escapes the encroaching hull');
});
