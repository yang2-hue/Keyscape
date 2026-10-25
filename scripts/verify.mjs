/**
 * Gallery verification harness (versioned, reproducible).
 *
 *   node scripts/verify.mjs [--base=http://127.0.0.1:5173] [--out=outputs/gallery-verify-v10]
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
 *
 * The software renderer runs at a few frames per second, so damped values are
 * waited for rather than sampled after a fixed sleep.
 */
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const args = new Map(process.argv.slice(2).map(a => {
  const [k, ...rest] = a.replace(/^--/, '').split('=');
  return [k, rest.join('=') || 'true'];
}));
const BASE = args.get('base') ?? 'http://127.0.0.1:5173';
const OUT = args.get('out') ?? 'outputs/gallery-verify-v10';
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

async function framesIn(page, ms) {
  const before = Number((await dataset(page)).renderFrames ?? 0);
  await page.waitForTimeout(ms);
  return Number((await dataset(page)).renderFrames ?? 0) - before;
}

/** Event-based fallback: some frames take longer than a fixed sleep window on
 * the software renderer. */
async function framesAdvance(page, min, timeout = 30000) {
  const before = Number((await dataset(page)).renderFrames ?? 0);
  try {
    await page.waitForFunction(([start, need]) => Number(document.querySelector('canvas')?.dataset.renderFrames ?? 0) - start >= need, [before, min], { timeout, polling: 100 });
    return true;
  } catch { return false; }
}

/** Jump the exhibition to a preset and freeze the loop there (DEV only). The
 * canvas dataset only updates on a rendered frame, so wait for the preset to be
 * picked up before measuring anything. */
async function preset(page, index) {
  const state = await page.evaluate(i => window.__galleryCycle.set(i), index);
  await page.waitForFunction(weather => document.querySelector('canvas')?.dataset.weather === weather, state.weather, { timeout: 60000 }).catch(() => {});
  return state;
}

/** Wait until the render loop has gone quiet, so a straggler frame from the
 * click that paused it cannot be counted as activity. */
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

const { chromium } = await loadPlaywright();
fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader'] });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.on('pageerror', e => results.errors.push(`pageerror: ${e.message}`));
  page.on('console', m => { if (m.type() === 'error') results.errors.push(`console: ${m.text()}`); });

  // 1. Boot, title, no leftover collection or reference chrome.
  await page.goto(`${BASE}/?dwell=6`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.querySelector('canvas')?.dataset.study === 'procedural-crescent-v09', null, { timeout: 300000 });
  const heading = (await page.locator('h1').innerText()).trim();
  check('study boots with its own title', heading === '月湾环抱', heading);
  const captionText = (await page.locator('.art-caption').innerText()).trim();
  check('caption carries no filler copy', captionText === '月湾环抱', captionText);
  check('no collection chrome left', await page.locator('.work-switcher, .vertical-caption, .work-number, .work-description, .weather-switch').count() === 0);
  check('art direction reference is gone', await page.locator('.reference-trigger, .reference-dialog').count() === 0);

  // 2. Daylight: the lighthouse is architecture, not a lamp.
  const darkByDay = await waitFor(page, 'lanternEmissive', 'v < 0.03', 90000);
  const day = await dataset(page);
  check('daylight leaves the lamp room unlit', darkByDay && num(day, 'beaconStrength') < 0.02 && num(day, 'searchLightIntensity') < 0.05, {
    lanternEmissive: num(day, 'lanternEmissive'), beaconStrength: num(day, 'beaconStrength'), searchLight: num(day, 'searchLightIntensity'),
  });
  await page.screenshot({ path: path.join(OUT, 'crescent-main.png') });

  // 3. Clickable landmarks: the tower lights up, the boat sets off, the water
  //    both ripples and scatters the fish.
  const tower = (await page.evaluate(() => window.__galleryLandmarks.screen())).lighthouse;
  await page.mouse.click(tower[0], tower[1]);
  const flashed = await waitFor(page, 'flash', 'v > 1', 30000);
  const lit = await waitFor(page, 'lanternEmissive', 'v > 0.5', 60000);
  check('clicking the lighthouse lights it by day', flashed && lit, { flash: num(await dataset(page), 'flash'), lantern: num(await dataset(page), 'lanternEmissive') });

  await waitFor(page, 'flash', 'v === 0', 180000);
  const boatAt = (await page.evaluate(() => window.__galleryLandmarks.screen())).boat;
  await page.mouse.click(boatAt[0], boatAt[1]);
  const touring = await waitFor(page, 'boatTour', 'v >= 0', 30000);
  const moving = touring && await waitFor(page, 'boatTour', 'v > 0.02', 60000);
  check('clicking the boat sends it on a lap', moving, { tour: num(await dataset(page), 'boatTour') });

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
    // The impulse is queued by the click, but the counters only move when the
    // solver runs on a rendered frame.
    await page.waitForFunction(() => Number(document.querySelector('canvas')?.dataset.waveImpulses) > 0, null, { timeout: 60000 }).catch(() => {});
    await page.waitForFunction(() => Number(document.querySelector('canvas')?.dataset.fishScared) > 0, null, { timeout: 60000 }).catch(() => {});
    const d = await dataset(page);
    splash.impulses = d.waveImpulses;
    splash.scared = d.fishScared;
  }
  check('clicking the lagoon raises a wave and scatters the fish', Number(splash?.impulses ?? 0) > 0 && Number(splash?.scared ?? 0) > 0, splash ?? scanned.slice(0, 4));

  // 4. The exhibition advances by itself and offers no controls.
  const before = await page.evaluate(() => window.__galleryCycle.state());
  let advanced = false;
  try {
    await page.waitForFunction(step => window.__galleryCycle.state().step !== step, before.step, { timeout: 30000 });
    advanced = true;
  } catch { advanced = false; }
  const after = await page.evaluate(() => window.__galleryCycle.state());
  check('the exhibition advances on its own', advanced && after.step !== before.step, { from: before.step, to: after.step, dwell: before.dwell });

  // 5. Every preset reaches its fog density and background class. The loop is
  //    frozen from here, so a slow renderer cannot walk it out from under us.
  const presets = [
    { index: 1, kind: 'overcast', fog: 0.018, shot: 'weather-overcast.png' },
    { index: 3, kind: 'mist', fog: 0.075, shot: 'weather-mist.png' },
    { index: 2, kind: 'rain', fog: 0.03, shot: 'weather-rain.png' },
  ];
  const measured = {};
  for (const item of presets) {
    const state = await preset(page, item.index);
    const reached = await waitFor(page, 'fogDensity', `Math.abs(v - ${item.fog}) < ${(item.fog * 0.12).toFixed(5)}`);
    const d = await dataset(page);
    const background = await page.locator('main.gallery').getAttribute('class');
    measured[item.kind] = { fog: num(d, 'fogDensity'), weather: d.weather, className: background, state };
    check(`${item.kind}: fog and lights reach the preset`, reached && d.weather === item.kind && background.includes(`weather-${item.kind}`), measured[item.kind]);
    await page.screenshot({ path: path.join(OUT, item.shot) });
  }
  check('fog thickens from overcast through rain to mist',
    measured.overcast.fog < measured.rain.fog && measured.rain.fog < measured.mist.fog,
    { overcast: measured.overcast.fog, rain: measured.rain.fog, mist: measured.mist.fog });

  // 6. Night lights the beacon; going back to daylight switches it off again.
  await preset(page, 5);
  await page.waitForFunction(() => document.querySelector('main.gallery')?.classList.contains('night'), null, { timeout: 30000 });
  const beaconLit = await waitFor(page, 'lanternEmissive', 'v > 1.2', 180000);
  const night = await dataset(page);
  check('night lights the beacon', beaconLit && num(night, 'searchLightIntensity') > 2, { lanternEmissive: num(night, 'lanternEmissive'), searchLight: num(night, 'searchLightIntensity') });
  check('night turns the sweep beam on', await waitFor(page, 'beaconStrength', 'v > 0.9', 180000), { beaconStrength: num(await dataset(page), 'beaconStrength') });
  await page.screenshot({ path: path.join(OUT, 'crescent-night.png') });

  await preset(page, 0);
  await page.waitForFunction(() => !document.querySelector('main.gallery')?.classList.contains('night'), null, { timeout: 30000 });
  check('daylight switches the beacon off again', await waitFor(page, 'lanternEmissive', 'v < 0.03', 180000), { lanternEmissive: num(await dataset(page), 'lanternEmissive') });

  // 7. Playing renders continuously; pausing switches the loop to demand.
  await page.waitForFunction(() => document.querySelector('canvas')?.dataset.renderMode === 'always', null, { timeout: 30000 });
  const playingFrames = await framesIn(page, 2500);
  check('playing renders continuously', playingFrames > 0, `${playingFrames} frames in 2.5s (software renderer)`);

  await page.getByRole('button', { name: /暂停动态/ }).click();
  await page.waitForFunction(() => document.querySelector('canvas')?.dataset.renderMode === 'demand', null, { timeout: 30000 });
  await settle(page);
  const pausedFrames = await framesIn(page, 2500);
  check('paused stops rendering', pausedFrames === 0, `${pausedFrames} frames in 2.5s`);
  const frozen = await dataset(page);
  await page.waitForTimeout(700);
  check('paused freezes animation time', frozen.boatTime === (await dataset(page)).boatTime, frozen.boatTime);

  // 8. A preset change while paused still finishes its transition.
  await preset(page, 3);
  check('paused transitions still complete', await waitFor(page, 'fogDensity', 'v > 0.06', 180000), { fog: num(await dataset(page), 'fogDensity') });

  await preset(page, 0);
  await page.getByRole('button', { name: /继续动态/ }).click();
  await page.waitForFunction(() => document.querySelector('canvas')?.dataset.renderMode === 'always', null, { timeout: 30000 });
  check('resuming restarts the loop', (await framesIn(page, 1500)) > 0 || await framesAdvance(page, 2), 'frames advanced');

  // 9. Mobile layout keeps 44px tap targets and never overflows.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(2000);
  const sizes = await page.evaluate(() => [...document.querySelectorAll('.round-button, .mood-controls .text-button')].map(el => {
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
