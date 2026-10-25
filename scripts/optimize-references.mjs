/**
 * Convert the art-direction reference PNGs to webp (full + thumbnail).
 *
 *   node scripts/optimize-references.mjs [--dir=public/references] [--full=1600] [--thumb=480] [--quality=0.82]
 *
 * Uses headless Chrome as the encoder through canvas.toDataURL, so the project
 * does not need an image library. The source PNG is passed as a data URL, which
 * keeps the canvas untainted without needing a running server.
 */
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const args = new Map(process.argv.slice(2).map(a => {
  const [k, ...rest] = a.replace(/^--/, '').split('=');
  return [k, rest.join('=') || 'true'];
}));
const DIR = args.get('dir') ?? 'public/references';
const FULL = Number(args.get('full') ?? 1600);
const THUMB = Number(args.get('thumb') ?? 480);
const QUALITY = Number(args.get('quality') ?? 0.82);
const CHROME = process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const CANDIDATES = [
  process.env.PLAYWRIGHT_MODULE,
  'playwright',
  'C:/Users/ASUS/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.js',
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

const files = fs.readdirSync(DIR).filter(f => f.toLowerCase().endsWith('.png'));
if (!files.length) throw new Error(`No PNG files in ${DIR}`);

const { chromium } = await loadPlaywright();
const browser = await chromium.launch({ executablePath: CHROME, headless: true });
try {
  const page = await browser.newPage();
  await page.goto('about:blank');
  const rows = [];
  for (const file of files) {
    const source = path.join(DIR, file);
    const base = file.replace(/\.png$/i, '');
    const before = fs.statSync(source).size;
    const dataUrl = `data:image/png;base64,${fs.readFileSync(source).toString('base64')}`;
    const outputs = await page.evaluate(async ({ dataUrl, widths, quality }) => {
      const bitmap = await createImageBitmap(await (await fetch(dataUrl)).blob());
      return widths.map(width => {
        const height = Math.round(bitmap.height * width / bitmap.width);
        const canvas = document.createElement('canvas');
        canvas.width = width; canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(bitmap, 0, 0, width, height);
        return { width, height, url: canvas.toDataURL('image/webp', quality) };
      });
    }, { dataUrl, widths: [FULL, THUMB], quality: QUALITY });
    for (const [i, out] of outputs.entries()) {
      const target = path.join(DIR, i === 0 ? `${base}.webp` : `${base}-thumb.webp`);
      fs.writeFileSync(target, Buffer.from(out.url.split(',')[1], 'base64'));
      rows.push({ file: path.basename(target), size: `${out.width}x${out.height}`, bytes: fs.statSync(target).size });
    }
    rows.push({ file, size: 'source', bytes: before });
  }
  for (const row of rows) console.log(`${row.file.padEnd(26)} ${row.size.padEnd(10)} ${(row.bytes / 1024).toFixed(0)} kB`);
} finally {
  await browser.close();
}
