#!/usr/bin/env node
// Takes the screenshots for a PR from docs/mockups/<slug>/shots.json, into the same folder. Run from the repo root
// with the app already running (seeded/demo data):
//
//   BASE_URL=http://localhost:8080 node /tmp/shared-workflows/scripts/shoot.mjs <slug>
//
// shots.json is a list (or {"defaults": {...}, "shots": [...]}) of:
//
//   name      PNG name without .png (required), e.g. "built-desktop"
//   path      page to open, relative to BASE_URL (default "/")
//   file      or: a local HTML file in the slug folder, e.g. "mockup.html" (no BASE_URL needed)
//   width     viewport width (default 1440)
//   height    viewport height (default 900)
//   theme     "dark" or "light": sets prefers-color-scheme and localStorage.theme before the page loads
//   full      true for the whole scrolling page (default false: just the viewport)
//   waitFor   CSS selector to wait for before shooting
//   click     CSS selector, or a list of them, to click in order first (open a menu, a dialog, a tab)
//   selector  shoot just this element instead of the page
//   wait      extra milliseconds to wait before shooting (animations)
//
// It warns when a page scrolls sideways or a PNG is over 400 KB. Needs Playwright: it uses the repo's own
// (npm i -D playwright) if there is one, else a global install, else one fetched into a temp folder with npm.
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const MAX_BYTES = 400 * 1024;

function loadPlaywright() {
  const tries = [path.join(process.cwd(), 'package.json'), import.meta.url];
  for (const from of tries) {
    try { return createRequire(from)('playwright'); } catch {}
  }
  try {
    const root = execSync('npm root -g', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    return createRequire(path.join(root, 'noop.js'))('playwright');
  } catch {}
  const dir = path.join(tmpdir(), 'shared-workflows-playwright');
  if (!existsSync(path.join(dir, 'node_modules', 'playwright'))) {
    console.log('shoot: installing Playwright into', dir);
    mkdirSync(dir, { recursive: true });
    execSync('npm install --no-save --no-audit --no-fund playwright', { stdio: 'inherit', cwd: dir });
    execSync('npx playwright install chromium', { stdio: 'inherit', cwd: dir });
  }
  return createRequire(path.join(dir, 'noop.js'))('playwright');
}

export function readShots(text) {
  const raw = JSON.parse(text);
  const list = Array.isArray(raw) ? raw : raw.shots;
  if (!Array.isArray(list)) throw new Error('shots.json must be a list, or {"defaults": {...}, "shots": [...]}');
  const defaults = Array.isArray(raw) ? {} : raw.defaults || {};
  return list.map((s, i) => {
    const shot = { width: 1440, height: 900, full: false, ...defaults, ...s };
    if (!shot.name) throw new Error(`shot ${i + 1} has no name`);
    if (shot.path && shot.file) throw new Error(`${shot.name}: give path or file, not both`);
    if (shot.theme && !['dark', 'light'].includes(shot.theme)) throw new Error(`${shot.name}: theme is dark or light`);
    shot.click = shot.click == null ? [] : [].concat(shot.click);
    return shot;
  });
}

export function urlFor(shot, base, dir) {
  if (shot.file) return pathToFileURL(path.resolve(dir, shot.file)).href;
  if (!base) throw new Error(`${shot.name}: set BASE_URL to the running app (or use "file")`);
  return new URL(shot.path || '/', base.endsWith('/') ? base : base + '/').href;
}

async function main() {
  const slug = process.argv[2];
  if (!slug) {
    console.error('usage: BASE_URL=http://localhost:8080 node shoot.mjs <slug>   (shoots docs/mockups/<slug>/shots.json)');
    process.exit(2);
  }
  const dir = path.resolve('docs', 'mockups', slug);
  const shots = readShots(readFileSync(path.join(dir, 'shots.json'), 'utf8'));
  const base = process.env.BASE_URL || '';
  const { chromium } = loadPlaywright();
  const browser = await chromium.launch();
  let problems = 0;
  try {
    for (const shot of shots) {
      const ctx = await browser.newContext({
        viewport: { width: shot.width, height: shot.height },
        colorScheme: shot.theme || 'light',
        deviceScaleFactor: 1,
      });
      if (shot.theme) await ctx.addInitScript((t) => { try { localStorage.setItem('theme', t); } catch {} }, shot.theme);
      const page = await ctx.newPage();
      page.on('pageerror', (e) => console.warn(`  ${shot.name}: page error: ${e.message}`));
      await page.goto(urlFor(shot, base, dir), { waitUntil: 'load' });
      await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});
      if (shot.waitFor) await page.waitForSelector(shot.waitFor, { timeout: 15000 });
      for (const sel of shot.click) {
        await page.click(sel);
        await page.waitForTimeout(150);
      }
      if (shot.wait) await page.waitForTimeout(shot.wait);
      const out = path.join(dir, `${shot.name}.png`);
      if (shot.selector) await page.locator(shot.selector).first().screenshot({ path: out });
      else await page.screenshot({ path: out, fullPage: !!shot.full });
      const sideways = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
      const bytes = statSync(out).size;
      const notes = [];
      if (sideways) notes.push('SCROLLS SIDEWAYS');
      if (bytes > MAX_BYTES) notes.push(`over 400 KB (${Math.round(bytes / 1024)} KB)`);
      problems += notes.length;
      console.log(`${notes.length ? '!' : '✓'} ${path.relative(process.cwd(), out)}  ${shot.width}×${shot.height}${shot.theme ? ' ' + shot.theme : ''}  ${Math.round(bytes / 1024)} KB${notes.length ? '  ' + notes.join(', ') : ''}`);
      await ctx.close();
    }
  } finally {
    await browser.close();
  }
  if (problems) {
    console.log(`shoot: ${problems} problem(s) to fix (sideways scroll, or crop/shrink the big PNGs)`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((e) => { console.error('shoot:', e.message); process.exit(1); });
}
