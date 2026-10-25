import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nextView, workIndexFromSearch } from '../src/gallery-state.ts';

const IDS = ['harbor', 'crescent', 'gate', 'grotto'];

test('deep link resolves every registered work, not just the crescent bay', () => {
  assert.equal(workIndexFromSearch('?work=harbor', IDS), 0);
  assert.equal(workIndexFromSearch('?work=crescent', IDS), 1);
  assert.equal(workIndexFromSearch('?work=gate', IDS), 2);
  assert.equal(workIndexFromSearch('?work=grotto', IDS), 3);
});

test('unknown or missing work ids fall back to the first work', () => {
  assert.equal(workIndexFromSearch('', IDS), 0);
  assert.equal(workIndexFromSearch('?work=', IDS), 0);
  assert.equal(workIndexFromSearch('?work=atlas', IDS), 0);
  assert.equal(workIndexFromSearch('?work=CRESCENT', IDS), 0, 'ids are case sensitive');
});

test('extra query parameters do not disturb work resolution', () => {
  assert.equal(workIndexFromSearch('?view=close&work=gate&utm=x', IDS), 2);
});

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
