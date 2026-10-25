import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nextView } from '../src/gallery-state.ts';

test('every view change bumps the serial so the camera twin re-runs', () => {
  const home = { kind: 'home' as const, serial: 4 };
  const close = nextView(home, 'close');
  assert.equal(close.kind, 'close');
  assert.equal(close.serial, 5);
  const reset = nextView(close, 'home');
  assert.equal(reset.kind, 'home');
  assert.equal(reset.serial, 6, 'resetting twice must still trigger a new target');
  assert.equal(home.serial, 4, 'the previous view object stays untouched');
});
