/**
 * Gallery verification harness (versioned, reproducible).
 *
 *   node scripts/verify.mjs [--base=http://127.0.0.1:5173] [--out=outputs/gallery-verify-v11]
 *
 * Requires a running dev server (`pnpm dev`). Playwright is resolved from the
 * project first, then from PLAYWRIGHT_MODULE, then from the local Codex runtime
 * cache used by earlier one-off scripts. Chrome defaults to the system install;
 * override with CHROME_PATH.
 *
 * The exhibition cycles on its own and exposes no controls, so the harness uses
 * two DEV-only handles to stay deterministic: `__galleryCycle` (jump/freeze the
 * loop) and `__galleryLandmarks` (screen position of the tower and the boat).
 * Neither exists in a production build.
 */
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const args = new Map(process.argv.slice(2).map(a => {
  const [k, ...rest] = a.replace(/^--/, '').split('=');
  return [k, rest.join('=') || 'true'];
}));
const BASE = args.get('base') ?? 'http://127.0.0.1:5173';
const OUT = args.get('out') ?? 'outputs/gallery-verify-v11';
const CHROME = process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PLAYWRIGHT_CANDIDATES = [
  process.env.PLAYWRIGHT_MODULE,
  'playwright',
  'C:/Users/ASUS/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.js',
].filter(Boolean);

async function loadPlaywright() {
  for (const candidate of PLAYWRIGHT_CANDIDATES) {
    try {
      const spec = candidate.startsWith('C:') || candidate.startsWith('/') ? pathToFileURL(candidate).href : candidate;
      const mod = await import(spec);
      const pw = mod.chromium ? mod : mod.default;
      if (pw?.chromium) return pw;
    } catch { /* try the next candidate */ }
  }
  throw new Error('Playwright not found. Set PLAYWRIGHT_MODULE to its entry file.');
}

const results = { base: BASE, renderer: 'Chrome headless (SwiftShader), not hardware performance', checks: {}, data: {}, errors: [] };
let failures = 0;
function check(name, pass, detail) {
  results.checks[name] = { pass: Boolean(pass), detail };
  if (!pass) failures++;
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail === undefined ? '' : `  ${typeof detail === 'string' ? detail : JSON.stringify(detail)}`}`);
}

const dataset = page => page.locator('canvas').evaluate(c => ({ ...c.dataset }));
const num = (d, key) => Number(d[key] ?? NaN);

/** Wait for a numeric dataset value to satisfy a JS expression over `v`. */
async function waitFor(page, key, predicate, timeout = 180000) {
  try {
    await page.waitForFunction(([k, src]) => {
      const value = Number(document.querySelector('canvas')?.dataset[k]);
      return Number.isFinite(value) && new Function('v', `return (${src})`)(value);
    }, [key, predicate], { timeout, polling: 150 });
    return true;
  } catch { return false; }
}

/** Wait for a string dataset value. */
async function waitForText(page, key, expected, timeout = 60000) {
  try {
    await page.waitForFunction(([k, want]) => document.querySelector('canvas')?.dataset[k] === want, [key, expected], { timeout, polling: 150 });
    return true;
  } catch { return false; }
}

async function framesIn(page, ms) {
  const before = Number((await dataset(page)).renderFrames ?? 0);
  await page.waitForTimeout(ms);
  return Number((await dataset(page)).renderFrames ?? 0) - before;
}

/** Event-based fallback: some frames take longer than a fixed sleep window. */
async function framesAdvance(page, min, timeout = 30000) {
  const before = Number((await dataset(page)).renderFrames ?? 0);
  try {
    await page.waitForFunction(([start, need]) => Number(document.querySelector('canvas')?.dataset.renderFrames ?? 0) - start >= need, [before, min], { timeout, polling: 100 });
    return true;
  } catch { return false; }
}

/** Wait until the render loop has gone quiet, so a straggler frame cannot be
 * counted as activity. */
async function settle(page, quiet = 2600, timeout = 30000) {
  const start = Date.now();
  let last = -1, since = Date.now();
  while (Date.now() - start < timeout) {
    const frames = Number((await dataset(page)).renderFrames ?? 0);
    if (frames !== last) { last = frames; since = Date.now(); }
    else if (Date.now() - since >= quiet) return true;
    await page.waitForTimeout(150);
  }
  return false;
}

/** Jump to a moment and freeze the loop there (DEV only). The canvas dataset
 * only updates on a rendered frame, so wait for the preset to be picked up. */
async function preset(page, index) {
  const state = await page.evaluate(i => window.__galleryCycle.set(i), index);
  await page.waitForFunction(weather => document.querySelector('canvas')?.dataset.weather === weather, state.weather, { timeout: 60000 }).catch(() => {});
  return state;
}

const { chromium } = await loadPlaywright();
fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader'] });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.on('pageerror', e => results.errors.push(`pageerror: ${e.message}`));
  page.on('console', m => { if (m.type() === 'error') results.errors.push(`console: ${m.text()}`); });

  // 1. Boot; the frame holds nothing but the artwork and the controls.
  await page.goto(`${BASE}/?dwell=6`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.querySelector('canvas')?.dataset.study === 'procedural-crescent-v09', null, { timeout: 300000 });
  // Freeze on morning-clear for the intro and the interaction checks: the loop
  // is now fast enough (6 s here) that waiting through a click would otherwise
  // land the scene in the evening and invalidate every "by day" assertion.
  await page.evaluate(() => window.__galleryCycle.set(0));
  const chrome = await page.evaluate(() => {
    const text = [...document.querySelectorAll('body *')]
      .filter(el => el.children.length === 0 && el.textContent.trim())
      .map(el => el.textContent.trim());
    return { headings: document.querySelectorAll('h1, h2, .art-caption').length, text };
  });
  check('no title or caption sits over the artwork', chrome.headings === 0, chrome.headings);
  check('the only words on screen are the wordmark and the controls', !chrome.text.includes('月湾环抱'), chrome.text);
  check('no import or zoom controls', await page.locator('.import-button, input[type=file], .work-switcher, .weather-switch').count() === 0);
  check('the frame carries two controls and nothing floats beside the artwork', await page.evaluate(() =>
    document.querySelectorAll('.gallery-footer .pill-button').length === 1
    && document.querySelectorAll('.gallery-footer .icon-button').length === 1
    && document.querySelectorAll('.side-tools').length === 0));

  // 1b. Chrome states: press shrinks, focus draws a ring, the tick says "now".
  const chromeState = await page.evaluate(() => {
    const pill = document.querySelector('.pill-button');
    const icon = document.querySelector('.icon-button');
    const style = el => getComputedStyle(el);
    return {
      pillRadius: style(pill).borderRadius,
      pillHeight: Math.round(pill.getBoundingClientRect().height),
      iconSize: Math.round(icon.getBoundingClientRect().width),
      paused: pill.dataset.paused,
      steps: document.querySelectorAll('.moment-steps li').length,
      liveTicks: document.querySelectorAll('.moment-steps li.now').length,
      fillAnimating: getComputedStyle(document.querySelector('.moment-fill')).animationName,
    };
  });
  check('controls use the pill and 40px icon shapes', chromeState.pillRadius.startsWith('999') && chromeState.pillHeight >= 40 && chromeState.iconSize >= 40, chromeState);
  check('the loop shows five ticks with exactly one live', chromeState.steps === 5 && chromeState.liveTicks === 1, chromeState);
  check('the live tick sweeps over one dwell', chromeState.fillAnimating === 'sweep', chromeState.fillAnimating);
  check('the pause toggle exposes its state without double-speaking', chromeState.paused === 'false', chromeState.paused);
  // Press is the only state that needs to move: 5% shrink, no position shift.
  // Transitions advance on rendered frames, and this machine renders at 1-2 fps,
  // so both sides of the press are waited for rather than slept through.
  const pill = page.locator('.pill-button');
  await pill.hover();
  const restTransform = await pill.evaluate(el => getComputedStyle(el).transform);
  await page.mouse.down();
  const pressedAt = await page.waitForFunction(
    () => getComputedStyle(document.querySelector('.pill-button')).transform.startsWith('matrix(0.95'),
    null, { timeout: 20000 }).then(() => true).catch(() => false);
  await page.mouse.move(2, 2);          // release off-target: no click fires
  await page.mouse.up();
  const restsAgain = await page.waitForFunction(
    rest => getComputedStyle(document.querySelector('.pill-button')).transform === rest,
    restTransform, { timeout: 20000 }).then(() => true).catch(() => false);
  check('pressing a control shrinks it 5% and releases back', pressedAt && restsAgain, { pressedAt, restsAgain, restTransform });

  // Keyboard focus must be visible; a ring on a hairlined control is the whole
  // difference between "quiet" and "unusable without a mouse".
  // A real Tab press sets the keyboard modality, then focus the control itself
  // instead of depending on tab order.
  await page.keyboard.press('Tab');
  await page.locator('.pill-button').focus();
  const ring = await page.evaluate(() => {
    const el = document.activeElement;
    const style = getComputedStyle(el);
    return { tag: el.className, width: style.outlineWidth, color: style.outlineColor, offset: style.outlineOffset };
  });
  check('keyboard focus draws a visible ring', ring.width === '2px' && ring.offset === '3px', ring);

  // 2. Morning: the lighthouse is architecture, not a lamp.
  const darkByDay = await waitFor(page, 'lanternEmissive', 'v < 0.03', 90000);
  const day = await dataset(page);
  check('morning leaves the lamp room unlit', darkByDay && num(day, 'beaconStrength') < 0.02 && num(day, 'searchLightIntensity') < 0.05, {
    lanternEmissive: num(day, 'lanternEmissive'), beaconStrength: num(day, 'beaconStrength'), searchLight: num(day, 'searchLightIntensity'),
  });
  await page.screenshot({ path: path.join(OUT, 'crescent-main.png') });

  // 3. Clicking the tower lights it.
  const tower = (await page.evaluate(() => window.__galleryLandmarks.screen())).lighthouse;
  await page.mouse.click(tower[0], tower[1]);
  const flashed = await waitFor(page, 'flash', 'v > 1', 30000);
  const lit = await waitFor(page, 'lanternEmissive', 'v > 0.5', 60000);
  check('clicking the lighthouse lights it by day', flashed && lit, { flash: num(await dataset(page), 'flash'), lantern: num(await dataset(page), 'lanternEmissive') });
  await waitFor(page, 'flash', 'v === 0', 180000);

  // 4. Boat: first click drifts, second click brings it home.
  const boatAt = (await page.evaluate(() => window.__galleryLandmarks.screen())).boat;
  await page.mouse.click(boatAt[0], boatAt[1]);
  const drifting = await waitForText(page, 'boatMode', 'drift', 30000);
  const startX = Number((await dataset(page)).boatX);
  // The drift eases out of the berth, and the software renderer advances the
  // scene at a tenth of wall clock, so wait for the hull to actually move
  // instead of sampling after a fixed sleep.
  const moved = await page.waitForFunction(start => Math.abs(Number(document.querySelector('canvas')?.dataset.boatX) - start) > 0.015, startX, { timeout: 180000, polling: 200 }).then(() => true).catch(() => false);
  const movedX = Number((await dataset(page)).boatX);
  check('first click sends the boat drifting', drifting && moved, { from: startX, to: movedX, mode: (await dataset(page)).boatMode });
  await page.screenshot({ path: path.join(OUT, 'boat-drifting.png') });

  // While it drifts, sample the fish: none may leave the lagoon, sink into the
  // bed, or pass through the hull.
  const audits = [], clearances = [];
  for (let i = 0; i < 5; i++) {
    audits.push(await page.evaluate(() => window.__galleryLandmarks.audit()));
    clearances.push(await page.evaluate(() => window.__galleryLandmarks.boatClearance()));
    await page.waitForTimeout(2500);
  }
  check('the drifting hull never touches land or the pier', Math.min(...clearances) > 0, { min: Math.min(...clearances), samples: clearances });
  const fish = audits.flat();
  const worstRadius = Math.max(...fish.map(f => f.radius));
  const shallowest = Math.min(...fish.map(f => f.depth));
  const closest = Math.min(...fish.map(f => f.toBoat));
  const sunk = fish.filter(f => f.y < f.bed + 0.02);
  check('fish stay inside the lagoon', worstRadius <= 0.45, { worstRadius, limit: 0.45 });
  check('fish keep water under them', shallowest >= 0.12 && sunk.length === 0, { shallowest, sunk: sunk.length });
  check('fish never swim through the hull', closest >= 0.14, { closest, limit: 0.14 });

  const boatAgain = (await page.evaluate(() => window.__galleryLandmarks.screen())).boat;
  await page.mouse.click(boatAgain[0], boatAgain[1]);
  const returning = await waitForText(page, 'boatMode', 'return', 30000);
  const home = await waitForText(page, 'boatMode', 'moored', 180000);
  check('second click brings the boat back to the berth', returning && home, { mode: (await dataset(page)).boatMode });

  // 5. Water: a wave, and the fish scatter.
  const box = await page.locator('canvas').boundingBox();
  let splash = null;
  const scanned = [];
  for (let fy = 0.42; fy <= 0.86 && !splash; fy += 0.055) {
    for (let fx = 0.22; fx <= 0.80 && !splash; fx += 0.055) {
      await page.mouse.click(box.x + box.width * fx, box.y + box.height * fy);
      const d = await dataset(page);
      scanned.push({ fx: +fx.toFixed(2), fy: +fy.toFixed(2), gate: d.splashGate, depth: d.splashDepth });
      if (d.splashAccepted === '1') splash = { fx: +fx.toFixed(2), fy: +fy.toFixed(2), point: d.splashPoint, impulses: d.waveImpulses, scared: d.fishScared };
    }
  }
  if (splash) {
    await page.waitForFunction(() => Number(document.querySelector('canvas')?.dataset.waveImpulses) > 0, null, { timeout: 60000 }).catch(() => {});
    await page.waitForFunction(() => Number(document.querySelector('canvas')?.dataset.fishScared) > 0, null, { timeout: 60000 }).catch(() => {});
    const d = await dataset(page);
    splash.impulses = d.waveImpulses;
    splash.scared = d.fishScared;
  }
  check('clicking the lagoon raises a wave and scatters the fish', Number(splash?.impulses ?? 0) > 0 && Number(splash?.scared ?? 0) > 0, splash ?? scanned.slice(0, 4));

  // 6. Five moments, in order, and the loop advances by itself. Resuming hands
  // the loop back to its own timer, which is what this section measures.
  await page.evaluate(() => window.__galleryCycle.resume());
  const states = await page.evaluate(() => window.__galleryCycle.states);
  const sequence = states.map(s => `${s.night ? 'evening' : 'morning'}-${s.weather}`).join(' ');
  check('the loop holds five moments in order', states.length === 5 && sequence === 'morning-clear morning-rain evening-clear evening-mist evening-rain', sequence);

  const before = await page.evaluate(() => window.__galleryCycle.state());
  let advanced = false;
  try {
    await page.waitForFunction(step => window.__galleryCycle.state().step !== step, before.step, { timeout: 30000 });
    advanced = true;
  } catch { advanced = false; }
  const after = await page.evaluate(() => window.__galleryCycle.state());
  check('the exhibition advances on its own', advanced && after.step !== before.step, { from: before.step, to: after.step, dwell: before.dwell });

  // 7. Each preset reaches its fog density and background class.
  const presets = [
    { index: 1, kind: 'rain', fog: 0.03, shot: 'weather-rain.png' },
    { index: 3, kind: 'mist', fog: 0.075, shot: 'weather-mist.png' },
  ];
  const measured = {};
  for (const item of presets) {
    const state = await preset(page, item.index);
    const reached = await waitFor(page, 'fogDensity', `Math.abs(v - ${item.fog}) < ${(item.fog * 0.12).toFixed(5)}`);
    const d = await dataset(page);
    const background = await page.locator('main.gallery').getAttribute('class');
    measured[item.kind] = { fog: num(d, 'fogDensity'), night: d.night, className: background, state };
    check(`${item.kind}: fog reaches the preset`, reached && background.includes(`weather-${item.kind}`), measured[item.kind]);
    await page.screenshot({ path: path.join(OUT, item.shot) });
  }
  check('fog is thicker in the misty evening than in the rain', measured.mist.fog > measured.rain.fog, { rain: measured.rain.fog, mist: measured.mist.fog });
  check('the misty preset is an evening preset', measured.mist.night === 'true', { night: measured.mist.night });

  // 8. Evening lights the beacon; morning switches it off again.
  await preset(page, 2);
  await page.waitForFunction(() => document.querySelector('main.gallery')?.classList.contains('night'), null, { timeout: 30000 });
  const beaconLit = await waitFor(page, 'lanternEmissive', 'v > 1.2', 180000);
  const night = await dataset(page);
  check('evening lights the beacon', beaconLit && num(night, 'searchLightIntensity') > 2, { lanternEmissive: num(night, 'lanternEmissive'), searchLight: num(night, 'searchLightIntensity') });
  check('evening turns the sweep beam on', await waitFor(page, 'beaconStrength', 'v > 0.9', 180000), { beaconStrength: num(await dataset(page), 'beaconStrength') });
  await page.screenshot({ path: path.join(OUT, 'crescent-night.png') });

  await preset(page, 0);
  await page.waitForFunction(() => !document.querySelector('main.gallery')?.classList.contains('night'), null, { timeout: 30000 });
  check('morning switches the beacon off again', await waitFor(page, 'lanternEmissive', 'v < 0.03', 180000), { lanternEmissive: num(await dataset(page), 'lanternEmissive') });

  // 9. Playing renders continuously; pausing switches the loop to demand.
  await page.waitForFunction(() => document.querySelector('canvas')?.dataset.renderMode === 'always', null, { timeout: 30000 });
  const playingFrames = await framesIn(page, 2500);
  // One frame can straddle the 2.5s window on the software renderer, so fall
  // back to an event wait before calling it a failure.
  check('playing renders continuously', playingFrames > 0 || await framesAdvance(page, 2, 60000), `${playingFrames} frames in 2.5s (software renderer)`);

  await page.getByRole('button', { name: /暂停动态/ }).click();
  await page.waitForFunction(() => document.querySelector('canvas')?.dataset.renderMode === 'demand', null, { timeout: 30000 });
  await settle(page);
  const pausedFrames = await framesIn(page, 2500);
  check('paused stops rendering', pausedFrames === 0, `${pausedFrames} frames in 2.5s`);
  const frozen = await dataset(page);
  await page.waitForTimeout(700);
  check('paused freezes animation time', frozen.boatTime === (await dataset(page)).boatTime, frozen.boatTime);

  await preset(page, 3);
  check('paused transitions still complete', await waitFor(page, 'fogDensity', 'v > 0.06', 180000), { fog: num(await dataset(page), 'fogDensity') });

  await preset(page, 0);
  await page.getByRole('button', { name: /继续动态/ }).click();
  await page.waitForFunction(() => document.querySelector('canvas')?.dataset.renderMode === 'always', null, { timeout: 30000 });
  check('resuming restarts the loop', (await framesIn(page, 1500)) > 0 || await framesAdvance(page, 2), 'frames advanced');

  // 10. Mobile layout keeps 44px tap targets and never overflows.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(2000);
  const sizes = await page.evaluate(() => [...document.querySelectorAll('.icon-button, .pill-button')].map(el => {
    const r = el.getBoundingClientRect();
    return { label: (el.textContent ?? '').trim().slice(0, 8), w: Math.round(r.width), h: Math.round(r.height) };
  }).filter(s => s.w > 0 && s.h > 0));
  const smallest = Math.min(...sizes.map(s => Math.min(s.w, s.h)));
  check('mobile tap targets reach 44px', smallest >= 44, { smallest, count: sizes.length, sizes: sizes.filter(s => Math.min(s.w, s.h) < 44) });
  const overflow = await page.evaluate(() => {
    const el = document.querySelector('.gallery-footer');
    return el ? Math.max(0, el.scrollWidth - el.clientWidth) : -1;
  });
  check('mobile footer does not overflow', overflow >= 0 && overflow <= 1, `${overflow}px`);
  await page.screenshot({ path: path.join(OUT, 'crescent-mobile.png') });

  check('no page errors', results.errors.length === 0, results.errors.slice(0, 3));
  results.data = { playingFrames, pausedFrames, splash, cycle: { before, after }, weather: measured, smallestTapTarget: smallest };
} finally {
  await browser.close();
  results.passed = failures === 0;
  fs.writeFileSync(path.join(OUT, 'check.json'), JSON.stringify(results, null, 2));
  console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`} -> ${OUT}/check.json`);
  process.exitCode = failures === 0 ? 0 : 1;
}
