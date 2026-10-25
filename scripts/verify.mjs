/**
 * Gallery verification harness (versioned, reproducible).
 *
 *   node scripts/verify.mjs [--base=http://127.0.0.1:5173] [--out=outputs/gallery-verify-v09]
 *
 * Requires a running dev server (`pnpm dev`). Playwright is resolved from the
 * project first, then from PLAYWRIGHT_MODULE, then from the local Codex runtime
 * cache used by earlier one-off scripts. Chrome defaults to the system install;
 * override with CHROME_PATH.
 *
 * The software renderer in CI runs at a few frames per second, so render-loop
 * assertions check the R3F frameloop mode plus frame deltas instead of assuming
 * 60 fps, and damped-value assertions wait for the value rather than sleeping.
 */
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const args = new Map(process.argv.slice(2).map(a => {
  const [k, ...rest] = a.replace(/^--/, '').split('=');
  return [k, rest.join('=') || 'true'];
}));
const BASE = args.get('base') ?? 'http://127.0.0.1:5173';
const OUT = args.get('out') ?? 'outputs/gallery-verify-v09';
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

/** Frames rendered in the next `ms`, read from the DEV frame counter. */
async function framesIn(page, ms) {
  const before = Number((await dataset(page)).renderFrames ?? 0);
  await page.waitForTimeout(ms);
  return Number((await dataset(page)).renderFrames ?? 0) - before;
}

/** Wait until `min` more frames have been rendered. Event based, because the
 * software renderer can drop to well under one frame per second. */
async function framesAdvance(page, min, timeout = 20000) {
  const before = Number((await dataset(page)).renderFrames ?? 0);
  try {
    await page.waitForFunction(([start, need]) => Number(document.querySelector('canvas')?.dataset.renderFrames ?? 0) - start >= need, [before, min], { timeout, polling: 100 });
    return true;
  } catch { return false; }
}

/** Wait for a numeric dataset value to reach a threshold. */
async function waitFor(page, key, predicate, timeout = 180000) {
  try {
    await page.waitForFunction(([k, src]) => {
      const value = Number(document.querySelector('canvas')?.dataset[k]);
      return Number.isFinite(value) && new Function('v', `return (${src})`)(value);
    }, [key, predicate], { timeout, polling: 150 });
    return true;
  } catch { return false; }
}

const { chromium } = await loadPlaywright();
fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader'] });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.on('pageerror', e => results.errors.push(`pageerror: ${e.message}`));
  page.on('console', m => { if (m.type() === 'error') results.errors.push(`console: ${m.text()}`); });

  // 1. The single study boots, and the caption is the artwork name only.
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.querySelector('canvas')?.dataset.study === 'procedural-crescent-v09', null, { timeout: 240000 });
  const heading = (await page.locator('h1').innerText()).trim();
  check('study boots with its own title', heading === '月湾环抱', heading);
  const captionText = (await page.locator('.art-caption').innerText()).trim();
  check('caption carries no filler copy', captionText === '月湾环抱', captionText);
  check('legacy collection chrome is gone', await page.locator('.work-switcher, .vertical-caption, .work-number, .work-description').count() === 0);

  // 2. Water click raises an impulse (the feature that kept regressing).
  await page.waitForFunction(() => Number(document.querySelector('canvas')?.dataset.waveReads) > 3, null, { timeout: 240000 });
  const box = await page.locator('canvas').boundingBox();
  let splash = null;
  const scanned = [];
  for (let fy = 0.42; fy <= 0.86 && !splash; fy += 0.055) {
    for (let fx = 0.22; fx <= 0.80 && !splash; fx += 0.055) {
      await page.mouse.click(box.x + box.width * fx, box.y + box.height * fy);
      const d = await dataset(page);
      scanned.push({ fx: +fx.toFixed(2), fy: +fy.toFixed(2), gate: d.splashGate, depth: d.splashDepth });
      if (d.splashAccepted === '1') splash = { fx: +fx.toFixed(2), fy: +fy.toFixed(2), point: d.splashPoint, depth: d.splashDepth, impulses: d.waveImpulses };
    }
  }
  if (splash) {
    // The impulse is queued immediately but only counted once the wave solver
    // consumes it on a rendered frame (a few seconds under SwiftShader).
    await page.waitForFunction(() => Number(document.querySelector('canvas')?.dataset.waveImpulses) > 0, null, { timeout: 60000 }).catch(() => {});
    splash.impulses = (await dataset(page)).waveImpulses;
  }
  check('clicking the lagoon raises a wave impulse', Number(splash?.impulses ?? 0) > 0, splash ?? scanned.slice(0, 4));

  // 3. Daylight: the lighthouse is architecture, not a lamp.
  const dayReady = await waitFor(page, 'lanternEmissive', 'v < 0.03');
  const day = await dataset(page);
  check('daylight leaves the lamp room unlit', dayReady && num(day, 'beaconStrength') < 0.02 && num(day, 'searchLightIntensity') < 0.05, {
    lanternEmissive: num(day, 'lanternEmissive'), beaconStrength: num(day, 'beaconStrength'), searchLight: num(day, 'searchLightIntensity'),
  });
  await page.screenshot({ path: path.join(OUT, 'crescent-main.png') });

  // 4. Weather presets: each one drives the fog and the lights, and the
  //    background class follows so the CSS behind the canvas matches the fog.
  const presets = [
    // Order matters for the screenshots: rain is last so its drops never
    // linger over a later preset's frame.
    { label: '阴天', kind: 'overcast', fog: 0.018, shot: 'weather-overcast.png' },
    { label: '海雾', kind: 'mist', fog: 0.075, shot: 'weather-mist.png' },
    { label: '小雨', kind: 'rain', fog: 0.03, shot: 'weather-rain.png' },
  ];
  const measured = {};
  for (const preset of presets) {
    await page.getByRole('button', { name: preset.label }).click();
    // Two-sided: coming down from a thicker preset would otherwise pass the
    // `>= target` test before the fade even starts.
    const reached = await waitFor(page, 'fogDensity', `Math.abs(v - ${preset.fog}) < ${(preset.fog * 0.12).toFixed(5)}`);
    const d = await dataset(page);
    const background = await page.locator('main.gallery').getAttribute('class');
    measured[preset.kind] = { fog: num(d, 'fogDensity'), sun: num(d, 'sunIntensity'), weather: d.weather, className: background };
    check(`${preset.label}: fog and lights reach the preset`, reached && d.weather === preset.kind && background.includes(`weather-${preset.kind}`), measured[preset.kind]);
    await page.screenshot({ path: path.join(OUT, preset.shot) });
  }
  check('fog thickens from overcast through rain to mist',
    measured.overcast.fog < measured.rain.fog && measured.rain.fog < measured.mist.fog,
    { overcast: measured.overcast.fog, rain: measured.rain.fog, mist: measured.mist.fog });

  await page.getByRole('button', { name: '晴天' }).click();
  const cleared = await waitFor(page, 'fogDensity', 'v < 0.004');
  check('returning to clear removes the haze', cleared, { fog: num(await dataset(page), 'fogDensity') });

  // 5. Night: the beacon lights up and the looping sweep resumes.
  await page.getByRole('button', { name: /日光/ }).click();
  await page.waitForFunction(() => document.querySelector('main.gallery')?.classList.contains('night'), null, { timeout: 30000 });
  const lit = await waitFor(page, 'lanternEmissive', 'v > 1.2');
  const night = await dataset(page);
  check('night lights the beacon', lit && num(night, 'searchLightIntensity') > 2, { lanternEmissive: num(night, 'lanternEmissive'), searchLight: num(night, 'searchLightIntensity') });
  const beam = await waitFor(page, 'beaconStrength', 'v > 0.9');
  check('night turns the sweep beam on', beam, { beaconStrength: num(await dataset(page), 'beaconStrength') });
  await page.screenshot({ path: path.join(OUT, 'crescent-night.png') });
  await page.getByRole('button', { name: /夜航/ }).click();
  await page.waitForFunction(() => !document.querySelector('main.gallery')?.classList.contains('night'), null, { timeout: 30000 });
  const darkAgain = await waitFor(page, 'lanternEmissive', 'v < 0.03');
  check('daylight switches the beacon off again', darkAgain, { lanternEmissive: num(await dataset(page), 'lanternEmissive') });

  // 6. Playing renders continuously; pausing switches the loop to demand.
  await page.waitForFunction(() => document.querySelector('canvas')?.dataset.renderMode === 'always', null, { timeout: 30000 });
  const playingFrames = await framesIn(page, 2500);
  check('playing renders continuously', playingFrames > 0 || await framesAdvance(page, 2, 30000), `${playingFrames} frames in 2.5s (software renderer), then waited for 2 more`);

  await page.getByRole('button', { name: /暂停动态/ }).click();
  await page.waitForFunction(() => document.querySelector('canvas')?.dataset.renderMode === 'demand', null, { timeout: 30000 });
  await page.waitForTimeout(2500); // let the demand pump window expire
  const pausedFrames = await framesIn(page, 2500);
  check('paused stops rendering', pausedFrames === 0, `${pausedFrames} frames in 2.5s`);
  const frozen = await dataset(page);
  await page.waitForTimeout(700);
  check('paused freezes animation time', frozen.boatTime === (await dataset(page)).boatTime, frozen.boatTime);

  // 7. A paused weather change must still finish its transition: this is what
  //    the frame-counted demand pump exists for.
  await page.getByRole('button', { name: '海雾' }).click();
  const mistWhilePaused = await waitFor(page, 'fogDensity', 'v > 0.05');
  check('paused weather change completes', mistWhilePaused, { fog: num(await dataset(page), 'fogDensity') });
  await page.getByRole('button', { name: '晴天' }).click();
  await page.getByRole('button', { name: /继续动态/ }).click();
  await page.waitForFunction(() => document.querySelector('canvas')?.dataset.renderMode === 'always', null, { timeout: 30000 });
  check('resuming restarts the loop', (await framesIn(page, 1500)) > 0 || await framesAdvance(page, 2), 'frames advanced');

  // 8. Mobile layout keeps 44px tap targets and never overflows.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(2000);
  const sizes = await page.evaluate(() => [...document.querySelectorAll('.round-button, .weather-switch button, .mood-controls .text-button')].map(el => {
    const r = el.getBoundingClientRect();
    return { label: (el.textContent ?? '').trim().slice(0, 8), w: Math.round(r.width), h: Math.round(r.height) };
  }).filter(s => s.w > 0 && s.h > 0));
  const smallest = Math.min(...sizes.map(s => Math.min(s.w, s.h)));
  check('mobile tap targets reach 44px', smallest >= 44, { smallest, count: sizes.length, sizes: sizes.filter(s => Math.min(s.w, s.h) < 44) });
  const overflow = await page.evaluate(() => {
    const el = document.querySelector('.mood-controls');
    return el ? Math.max(0, el.scrollWidth - el.clientWidth) : -1;
  });
  check('mobile controls do not overflow', overflow >= 0 && overflow <= 1, `${overflow}px`);
  await page.screenshot({ path: path.join(OUT, 'crescent-mobile.png') });

  check('no page errors', results.errors.length === 0, results.errors.slice(0, 3));
  results.data = { playingFrames, pausedFrames, splash, weather: measured, mobileSizes: sizes.length, smallestTapTarget: smallest };
} finally {
  await browser.close();
  results.passed = failures === 0;
  fs.writeFileSync(path.join(OUT, 'check.json'), JSON.stringify(results, null, 2));
  console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`} -> ${OUT}/check.json`);
  process.exitCode = failures === 0 ? 0 : 1;
}
