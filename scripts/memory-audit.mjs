/**
 * GPU resource audit across artwork switches.
 *
 *   node scripts/memory-audit.mjs [--base=http://127.0.0.1:5173] [--rounds=2] [--out=outputs/memory-audit-v02]
 *
 * Requires a running dev server. Reads `renderer.info.memory` after every
 * switch: textures should return to the baseline instead of growing with each
 * round trip. The DevTools protocol GC hook is not used, so this measures GPU
 * allocations only, not JS heap.
 */
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const args = new Map(process.argv.slice(2).map(a => {
  const [k, ...rest] = a.replace(/^--/, '').split('=');
  return [k, rest.join('=') || 'true'];
}));
const BASE = args.get('base') ?? 'http://127.0.0.1:5173';
const ROUNDS = Number(args.get('rounds') ?? 2);
const OUT = args.get('out') ?? 'outputs/memory-audit-v02';
const CHROME = process.env.CHROME_PATH ?? undefined;
const CANDIDATES = [
  process.env.PLAYWRIGHT_MODULE,
  'playwright',
].filter(Boolean);

async function loadPlaywright() {
  for (const candidate of CANDIDATES) {
    try {
      const spec = candidate.startsWith('C:') || candidate.startsWith('/') ? pathToFileURL(candidate).href : candidate;
      const mod = await import(spec);
      const pw = mod.chromium ? mod : mod.default;
      if (pw?.chromium) return pw;
    } catch { /* next */ }
  }
  throw new Error('Playwright not found. Set PLAYWRIGHT_MODULE to its entry file.');
}

// The exhibition holds two keys; the switch is the label row in the footer.
const WORKS = [
  { tab: 'SPACE / LUNAR', world: 'space' },
  { tab: 'C / COASTAL', world: 'coastal' },
];

const { chromium } = await loadPlaywright();
fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--js-flags=--expose-gc'] });
const samples = [];
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  page.on('pageerror', e => samples.push({ error: e.message }));
  await page.goto(`${BASE}/?work=coastal`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__harborDebug?.gl, null, { timeout: 240000 });
  // Keep one reference to the (single) renderer: __harborDebug is removed when a
  // study without water unmounts.
  await page.evaluate(() => { window.__probe = window.__harborDebug.gl; });
  const read = async label => {
    const info = await page.evaluate(() => ({ textures: window.__probe.info.memory.textures, geometries: window.__probe.info.memory.geometries, programs: window.__probe.info.programs?.length ?? -1, renderCalls: window.__probe.info.render.calls }));
    samples.push({ label, ...info });
    console.log(`${label.padEnd(22)} textures=${String(info.textures).padStart(4)}  geometries=${String(info.geometries).padStart(4)}  programs=${info.programs}`);
  };
  await page.waitForTimeout(3000);
  await read('baseline (coastal)');
  for (let round = 1; round <= ROUNDS; round++) {
    for (const work of WORKS) {
      await page.locator('.work-option').filter({ hasText: work.tab }).click();
      await page.waitForFunction(w => document.querySelector('main')?.dataset.world === w, work.world, { timeout: 240000 });
      // Textures and geometries are allocated during the first rendered frames,
      // so wait for the frame counter to move before reading memory.
      const before = Number((await page.evaluate(() => document.querySelector('canvas')?.dataset.renderFrames)) ?? 0);
      await page.waitForFunction(v => Number(document.querySelector('canvas')?.dataset.renderFrames ?? 0) > v + 3, before, { timeout: 120000 }).catch(() => {});
      await page.waitForTimeout(2500);
      await read(`r${round} ${work.world}`);
    }
  }
} finally {
  await browser.close();
  const report = { base: BASE, rounds: ROUNDS, samples, generatedAt: new Date().toISOString() };
  fs.writeFileSync(path.join(OUT, 'memory-audit.json'), JSON.stringify(report, null, 2));
  console.log(`\n-> ${OUT}/memory-audit.json`);
}
