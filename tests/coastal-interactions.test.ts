import {test} from 'node:test';
import assert from 'node:assert/strict';
import {cottageLightTarget,toggleCottageLight} from '../src/coastal-interactions.ts';

test('manual cottage lighting persists across weather until returned to auto',()=>{
  assert.equal(cottageLightTarget(null,false),false);
  assert.equal(cottageLightTarget(null,true),true);
  const manual=toggleCottageLight(null,true);
  assert.equal(manual,false);
  assert.equal(cottageLightTarget(manual,true),false);
  assert.equal(cottageLightTarget(manual,false),false);
  assert.equal(toggleCottageLight(manual,false),true);
});

