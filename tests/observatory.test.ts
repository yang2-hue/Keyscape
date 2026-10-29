import assert from 'node:assert/strict';
import test from 'node:test';
import {
  observatoryInset, observatorySurfaceHeight, OBS, SITE, bridgePath, gorgeDepth, observatoryHeight, observatoryOutline, outlinePoint,
} from '../src/observatory-layout.ts';
import { OBSERVATORY_MOMENTS } from '../src/observatory-weather.ts';

const near = (a: number, b: number, tolerance: number, label: string) =>
  assert.ok(Math.abs(a - b) <= tolerance, `${label}: ${a.toFixed(4)} vs ${b.toFixed(4)} (tol ${tolerance})`);

test('key outline closes on the keycap footprint', () => {
  const outline = observatoryOutline();
  assert.ok(outline.length >= 40);
  for (const point of outline) {
    assert.ok(Math.abs(point.x) <= OBS.halfWidth + 1e-6);
    assert.ok(Math.abs(point.y) <= OBS.halfDepth + 1e-6);
    const [x, z] = outlinePoint(point.x, point.y);
    near(x, point.x, 1e-6, 'outline x stays put');
    near(z, point.y, 1e-6, 'outline z stays put');
  }
  // The arcs carry the corners; the straight edges are implied by the jump
  // between one arc's end and the next one's start, including the closing run
  // along the bottom edge.
  const first = outline[0], last = outline[outline.length - 1];
  near(first.y, -OBS.halfDepth, 1e-9, 'outline starts on the front edge');
  near(last.y, -OBS.halfDepth, 1e-9, 'outline ends on the front edge');
  assert.ok(Math.abs(first.x - last.x) > OBS.halfWidth, 'the closing edge spans the bottom');
});

test('the drum fits inside the key with a margin', () => {
  const { x, z, radius } = SITE.drum;
  const left = x - radius + OBS.halfWidth;
  const right = OBS.halfWidth - (x + radius);
  const back = OBS.halfDepth - Math.abs(z - radius);
  const front = OBS.halfDepth - (z + radius);
  assert.ok(Math.min(left, right) > 0.04, `drum must clear the side wall (${Math.min(left, right)})`);
  assert.ok(Math.min(back, front) > 0.05, `drum must clear front/back (${Math.min(back, front)})`);
  // The bowl is the letter: 62% of the key width, not a small hut.
  assert.ok(radius * 2 / (OBS.halfWidth * 2) > 0.60, 'drum must occupy at least 60% of the key width');
});

test('the drum sits on flat ground and the bridge hollow stays shallow and above the base bottom', () => {
  const { x, z, radius } = SITE.drum;
  for (const [dx, dz] of [[0, 0], [radius * 0.7, 0], [0, radius * 0.7], [-radius * 0.6, radius * 0.6]]) {
    near(observatoryHeight(x + dx, z + dz), OBS.pad, 0.004, 'pad is flat under the drum');
  }
  const gorge = observatoryHeight(SITE.gorge.x, SITE.gorge.z);
  assert.ok(gorge < OBS.pad && gorge > -OBS.base+.15, `shallow hollow stays inside the key (${gorge.toFixed(3)})`);
  assert.ok(gorgeDepth(SITE.gorge.x, SITE.gorge.z) <= .06);
  assert.ok(gorgeDepth(SITE.gorge.x + SITE.gorge.rx * 2, SITE.gorge.z) === 0, 'outside the rim there is no cut');
});

test('the bridge is attached at both ends and clears the ground', () => {
  const path = bridgePath(12);
  const { door, landing, landingRadius, deckY } = SITE.bridge;
  near(path[0].x, door.x, 1e-9, 'deck starts at the door');
  near(path[0].z, door.z, 1e-9, 'deck starts at the door');
  near(path[path.length - 1].x, landing.x, 1e-9, 'deck reaches the landing');
  // The door has to sit on the drum wall, not float in front of it.
  const rimDistance = Math.hypot(door.x - SITE.drum.x, door.z - SITE.drum.z);
  near(rimDistance, SITE.drum.radius, 0.01, 'door sits on the drum rim');
  // Air under the deck: a bridge that touches the ground is a path.
  for (const point of path.slice(1, -1)) {
    const ground = observatoryHeight(point.x, point.z);
    assert.ok(deckY - ground > 0.12, `deck must clear the gorge (${(deckY - ground).toFixed(3)} at ${point.x.toFixed(2)})`);
  }
  // The landing overhangs the keycap lip: that overhang is the tail of the Q.
  const overhang = landing.z + landingRadius - OBS.halfDepth;
  assert.ok(overhang > 0.0, `landing must overhang the front lip (${overhang.toFixed(3)})`);
  assert.ok(overhang < 0.12, 'the overhang stays a detail, not a pier');
});

test('the tail stays short enough to read as Q', () => {
  const { door, landing, landingRadius } = SITE.bridge;
  const tail = Math.hypot(landing.x - door.x, landing.z - door.z) - landingRadius;
  assert.ok(tail > 0.25, 'the tail must still be visible');
  assert.ok(tail < 0.75, `the tail must stay short (${tail.toFixed(3)})`);
});

test('the dome parts along the slit and leaves a usable opening', () => {
  const { slide, tilt, radius } = SITE.dome;
  // Half the gap must clear the tube, or the optics look through steel.
  const gap = slide * 2;
  assert.ok(gap > SITE.telescope.tubeRadius * 2 + 0.15, `slit is too narrow (${gap.toFixed(3)})`);
  // A slide large enough to leave the drum ring would read as a loose shell.
  assert.ok(slide < radius * 0.45, 'the halves stay seated on the drum');
  assert.ok(tilt > 0.08 && tilt < 0.45, 'the lean is a gesture, not a hinge');
  // Seam to seam, the two halves never overlap when open.
  assert.ok(gap > 0.2);
});

test('the telescope can reach every preset inside the open dome', () => {
  const { axis, tube } = SITE.telescope;
  const half = tube / 2;
  for (const altitude of [0.42, 0.78, 1.32]) {
    const tipY = axis + Math.sin(altitude) * half;
    assert.ok(tipY < SITE.dome.spring + SITE.dome.radius, 'tube tip must stay inside the dome radius');
    assert.ok(tipY > axis, 'the tube always points up');
  }
  // With the dome closed there is no slit, which is why the aim is gated on `open`.
  assert.ok(SITE.dome.slide * 2 > 0.4, 'the parted slit has to be wide enough for the optics');
});

test('the gallery is reachable from the ground', () => {
  const { steps, sweep, radius, startAngle } = SITE.stair;
  assert.ok(steps >= 8, 'ten steps is a climb, three is a trip hazard');
  const rise = SITE.gallery / steps;
  assert.ok(rise < 0.09, `each tread must be walkable (${rise.toFixed(3)})`);
  assert.ok(sweep > 0.8, 'the stair wraps the drum instead of bolting onto it');
  const top = startAngle + sweep;
  const x = SITE.drum.x + Math.cos(top) * radius;
  const z = SITE.drum.z + Math.sin(top) * radius;
  assert.ok(Math.hypot(x, z) < Math.hypot(OBS.halfWidth, OBS.halfDepth), 'the stair stays on the key');
});

test('four moments, one loop, no duplicate ids', () => {
  const ids = OBSERVATORY_MOMENTS.map(moment => moment.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.equal(ids.length, 4);
  assert.equal(OBSERVATORY_MOMENTS.filter(moment => moment.night).length, 1);
  for (const moment of OBSERVATORY_MOMENTS) {
    assert.ok(moment.stars >= 0 && moment.stars <= 1);
    assert.ok(moment.dust >= 0 && moment.dust <= 1);
    assert.ok(moment.interior >= 0 && moment.interior <= 1);
    assert.equal(moment.key.length, 3);
  }
  // Dawn has to come from the east and dusk from the west, or the loop reads as
  // the same picture four times.
  const dusk = OBSERVATORY_MOMENTS.find(moment => moment.id === 'dusk')!;
  const dawn = OBSERVATORY_MOMENTS.find(moment => moment.id === 'dawn')!;
  assert.ok(dusk.key[0] < 0 && dawn.key[0] > 0);
});

 test('rounded footprint inset excludes stones crossing straight edges and corners',()=>{
   assert.ok(observatoryInset(0,0)>.1);
   assert.ok(observatoryInset(OBS.halfWidth-.01,0)<.025);
   assert.ok(observatoryInset(OBS.halfWidth-.01,OBS.halfDepth-.01)<0);
   for(const p of observatoryOutline())assert.ok(Math.abs(observatorySurfaceHeight(p.x,p.y))<1e-8);
 });

test('daylight observatory presets hide stars while night retains them',()=>{
  for(const id of ['dawn','wind'])assert.equal(OBSERVATORY_MOMENTS.find(p=>p.id===id)!.stars,0);
  assert.equal(OBSERVATORY_MOMENTS.find(p=>p.id==='night')!.stars,1);
});
