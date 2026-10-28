import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CRATERS, LUNAR, SITE, lunarHeight, roundedRectPoint, spacebarOutline } from '../src/lunar-layout.ts';

test('the spacebar outline is a closed rounded rectangle', () => {
  const points = spacebarOutline();
  assert.ok(points.length >= 40, `expected a smooth outline, got ${points.length} points`);
  for (const p of points) {
    assert.ok(Math.abs(p.x) <= LUNAR.halfWidth + 1e-6, `x ${p.x} escapes the key`);
    assert.ok(Math.abs(p.y) <= LUNAR.halfDepth + 1e-6, `z ${p.y} escapes the key`);
  }
  // Steps are either arc samples (short) or the four straight edges, whose
  // length is fixed by the key's proportions. A coarse corner would produce a
  // step that is neither, and the outline would cut across the skin.
  const straight = [2 * (LUNAR.halfWidth - LUNAR.corner), 2 * (LUNAR.halfDepth - LUNAR.corner)];
  const steps: number[] = [];
  for (let i = 1; i < points.length; i++) {
    steps.push(Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y));
  }
  steps.push(Math.hypot(points[0].x - points.at(-1)!.x, points[0].y - points.at(-1)!.y));
  for (const step of steps) {
    const onArc = step < 0.12;
    const onEdge = straight.some(length => Math.abs(step - length) < length * 0.01);
    assert.ok(onArc || onEdge, `step ${step.toFixed(3)} is neither an arc sample nor a straight edge`);
  }
});

test('the corners keep the declared radius instead of collapsing to a point', () => {
  const [x, z] = roundedRectPoint(LUNAR.halfWidth, LUNAR.halfDepth);
  const dx = Math.abs(x) - (LUNAR.halfWidth - LUNAR.corner);
  const dz = Math.abs(z) - (LUNAR.halfDepth - LUNAR.corner);
  assert.ok(Math.abs(Math.hypot(dx, dz) - LUNAR.corner) < 1e-6, 'corner point is not on the arc');
  // Interior points are left untouched.
  const [ix, iz] = roundedRectPoint(0.2, 0.1);
  assert.equal(ix, 0.2);
  assert.equal(iz, 0.1);
});

test('the hero crater is a bowl with a raised rim', () => {
  const { x, z, radius, depth } = SITE.crater;
  const centre = lunarHeight(x, z);
  const rim = lunarHeight(x + radius * 1.02, z);
  const outside = lunarHeight(x + radius * 1.8, z);
  assert.ok(centre < -depth * 0.6, `crater floor ${centre.toFixed(3)} is too shallow`);
  assert.ok(rim > outside, 'the rim has to stand above the ground behind it');
  assert.ok(outside < 0.05, 'the crater must not lift the surrounding ground');
});

test('the modules stand on flat ground, not on a slope', () => {
  for (const site of [SITE.habitat, SITE.airlock, SITE.greenhouse]) {
    for (const dx of [-0.06, 0, 0.06]) {
      const near = lunarHeight(site.x + dx, site.z);
      assert.ok(Math.abs(near - LUNAR.pad) < 0.01, `pad under (${site.x + dx}, ${site.z}) sits at ${near.toFixed(3)}`);
    }
  }
});

test('the regolith stays inside a thin slab everywhere on the key', () => {
  let lowest = Infinity, highest = -Infinity;
  for (let x = -LUNAR.halfWidth; x <= LUNAR.halfWidth; x += 0.05) {
    for (let z = -LUNAR.halfDepth; z <= LUNAR.halfDepth; z += 0.05) {
      const h = lunarHeight(x, z);
      lowest = Math.min(lowest, h);
      highest = Math.max(highest, h);
    }
  }
  assert.ok(lowest > -0.22, `terrain dips below the keycap body at ${lowest.toFixed(3)}`);
  // A crater rim is allowed to stand above the surrounding ground.
  assert.ok(highest < 0.16, `terrain piles up past the rim at ${highest.toFixed(3)}`);
});

test('the open regolith has grain, so it is not a polished plane', () => {
  // Two centimetres apart on open ground: the surface must actually move. A
  // perfectly smooth plane is what made the first version read as clay, and the
  // texture maps alone cannot break a silhouette.
  let total = 0, samples = 0;
  for (let x = -1.6; x < 1.6; x += 0.07) {
    for (let z = -0.6; z < 0.6; z += 0.07) {
      const awayFromBuild = Math.abs(z) > 0.42 || x < -1.1 || x > 1.5;
      if (!awayFromBuild) continue;
      total += Math.abs(lunarHeight(x + 0.02, z) - lunarHeight(x, z));
      samples++;
    }
  }
  const mean = total / samples;
  assert.ok(mean > 0.0004, `open ground barely moves (mean ${mean.toFixed(5)} over 2 cm)`);
});

test('grain is suppressed under the modules so nothing intrudes on the pad', () => {
  // The step from the pad to the first grain ridge would be a crack in the
  // doorstep; the flattening mask has to win everywhere the builds sit.
  for (const site of [SITE.habitat, SITE.airlock, SITE.greenhouse]) {
    for (let dx = -0.1; dx <= 0.1; dx += 0.05) {
      for (let dz = -0.06; dz <= 0.06; dz += 0.06) {
        const h = lunarHeight(site.x + dx, site.z + dz);
        assert.ok(Math.abs(h - LUNAR.pad) < 0.012, `(${(site.x + dx).toFixed(2)}, ${(site.z + dz).toFixed(2)}) sits at ${h.toFixed(3)}`);
      }
    }
  }
  // The array is a mast on level ground: a slope would lean it, and a bowl would
  // bury it. Both are checked because the site has moved twice already.
  assert.ok(Math.abs(lunarHeight(SITE.solar.x, SITE.solar.z) - LUNAR.pad) < 0.02, 'the solar site has to be level');
  for (const crater of CRATERS) {
    const gap = Math.hypot(SITE.solar.x - crater.x, SITE.solar.z - crater.z);
    assert.ok(gap > crater.radius * 1.4, `the solar array sits inside the crater at ${crater.x}, ${crater.z}`);
  }
});
