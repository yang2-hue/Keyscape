import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { legLayerTransform, GATE, gateFootprint, updateGateMist } from '../src/cloud-gate.ts';

test('the triangle below the meeting point stays open (never filled)', () => {
  // Below the crossbar the inner faces must leave a visible opening.
  for (let k = 0; k <= 10; k++) {
    const t = k / 16, layer = legLayerTransform(t, 1);
    const innerFace = Math.abs(layer.x) - layer.w / 2;
    assert.ok(innerFace >= .14, `leg layer ${k} inner face ${innerFace.toFixed(3)} fills the opening`);
  }
  // Above the bar the legs may converge, but never cross before the apex.
  for (let k = 11; k < 16; k++) {
    const t = k / 16, layer = legLayerTransform(t, 1);
    assert.ok(Math.abs(layer.x) - layer.w / 2 >= -.02, `leg layer ${k} crosses the axis early`);
  }
});

test('the legs actually meet at the apex', () => {
  const left = legLayerTransform(1, -1), right = legLayerTransform(1, 1);
  const gap = Math.abs(left.x - right.x) - left.w;
  assert.ok(gap <= .02, `apex gap ${gap.toFixed(3)} leaves the legs unjoined`);
  assert.ok(right.y > GATE.bridgeY + .35, 'apex must rise well above the crossbar');
});

test('the bridge crosses between the legs below the apex', () => {
  assert.ok(GATE.bridgeY > .5 && GATE.bridgeY < GATE.apexY - .35, `bridge y ${GATE.bridgeY} misplaces the crossbar`);
  const at = legLayerTransform((GATE.bridgeY + .1) / GATE.apexY, 1);
  assert.ok(at.x > .28, 'bridge span must reach the legs');
});

test('the gate sits on the standard keycap footprint', () => {
  const points = gateFootprint();
  assert.ok(points.length > 40, 'footprint outline too coarse');
  const xs = points.map(p => Math.abs(p.x)), zs = points.map(p => Math.abs(p.y));
  assert.ok(Math.max(...xs) <= 1.58 && Math.max(...zs) <= 1.58, 'footprint exceeds the keycap square');
});

test('weather updates the mist uniform used by the fragment shader',()=>{
  const material=new THREE.ShaderMaterial({uniforms:{uOpacity:{value:.5}}});
  const expected=THREE.MathUtils.damp(.5,.8,2.5,1/60);
  const value=updateGateMist(material,true,false,1/60);
  assert.equal(value,expected);
  assert.equal(material.uniforms.uOpacity.value,expected);
  assert.equal(material.opacity,expected);
  material.dispose();
});
