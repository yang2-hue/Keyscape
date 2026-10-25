import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WEATHERS, weatherParams, isWet, type WeatherKind } from '../src/weather-model.ts';

const IDS = WEATHERS.map(w => w.id);

test('every preset is registered exactly once', () => {
  assert.deepEqual(IDS, ['clear', 'rain', 'mist']);
  assert.equal(new Set(IDS).size, IDS.length);
});

test('fog is absent on a clear sky and thickest in mist, day and night', () => {
  assert.equal(weatherParams('clear', false).fog, 0, 'a clear day must not haze the far sea');
  const day = IDS.map(k => weatherParams(k, false).fog);
  assert.ok(day.every((v, i) => i === 0 || v >= day[i - 1]), `fog must build up across the presets: ${day}`);
  assert.ok(weatherParams('mist', false).fog > weatherParams('rain', false).fog * 2);
  const night = IDS.map(k => weatherParams(k, true).fog);
  assert.ok(night.every(v => v > 0), 'even a clear night keeps a slight atmospheric falloff');
  assert.ok(night.every((v, i) => i === 0 || v >= night[i - 1]));
});

test('night is always darker than day for the same weather', () => {
  for (const kind of IDS as WeatherKind[]) {
    const day = weatherParams(kind, false), night = weatherParams(kind, true);
    assert.ok(night.ambient < day.ambient, `${kind}: ambient`);
    assert.ok(night.sun < day.sun, `${kind}: sun`);
    assert.ok(night.env < day.env, `${kind}: environment`);
  }
});

test('rain and mist keep a readable key light instead of flattening to ambient', () => {
  for (const kind of ['rain', 'mist'] as WeatherKind[]) {
    const p = weatherParams(kind, false);
    assert.ok(p.sun > 0.2, `${kind}: no key light left`);
    assert.ok(p.ambient < p.sun + 0.6, `${kind}: ambient swamps the key light`);
  }
});

test('only rain raises drops and surface rings', () => {
  assert.deepEqual(IDS.filter(isWet), ['rain']);
});
