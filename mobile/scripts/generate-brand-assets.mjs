/**
 * Renders the app icon, adaptive icon, splash and favicon from the vector
 * monogram in src/brand/logo.ts, so every launcher asset stays in sync with the
 * in-app mark.
 *
 * Playwright is only needed to run this, not to build the app, so it is not a
 * package dependency:
 *
 *   cd mobile && npx playwright@latest install chromium
 *   node scripts/generate-brand-assets.mjs
 *
 * If you replace assets/logo.png with the original artwork, re-run this to
 * regenerate the launcher assets from that file instead.
 */
import { chromium } from 'playwright';
import { readFileSync, existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const assets = path.join(root, 'assets');
if (!existsSync(assets)) mkdirSync(assets, { recursive: true });

const BLACK = '#000000';
const GOLD = { bright: '#F0D68A', base: '#D9A93C', deep: '#95690F' };

/** Pulls the SVG out of the TypeScript source so there is one definition. */
function monogramSvg() {
  const src = readFileSync(path.join(root, 'src/brand/logo.ts'), 'utf8');
  const match = src.match(/export const MONOGRAM_SVG = `([\s\S]*?)`;/);
  if (!match) throw new Error('MONOGRAM_SVG not found in src/brand/logo.ts');

  const gradient = `
    <linearGradient id="twrGold" x1="0" y1="0" x2="0.4" y2="1">
      <stop offset="0" stop-color="${GOLD.bright}"/>
      <stop offset="0.42" stop-color="${GOLD.base}"/>
      <stop offset="1" stop-color="${GOLD.deep}"/>
    </linearGradient>`;

  return match[1].replace(/\$\{goldGradient\}/g, gradient);
}

const MONOGRAM = monogramSvg();

const page$ = (inner, w, h) => `<!doctype html><html><body style="margin:0;width:${w}px;height:${h}px;
  background:${BLACK};display:flex;align-items:center;justify-content:center;overflow:hidden;
  font-family:Helvetica,Arial,sans-serif">${inner}</body></html>`;

const wordmark = (size) => `
  <div style="display:flex;flex-direction:column;align-items:center;gap:${size * 0.06}px">
    <div style="width:${size * 1.55}px">${MONOGRAM}</div>
    <div style="font-size:${size * 0.2}px;font-weight:900;font-style:italic;letter-spacing:-1px;
                white-space:nowrap;color:#fff">
      TRAIN<span style="color:${GOLD.base}">WITH</span>ROHIN
    </div>
    <div style="display:flex;align-items:center;gap:${size * 0.05}px">
      <div style="width:${size * 0.14}px;height:2px;background:${GOLD.deep}"></div>
      <div style="font-size:${size * 0.066}px;letter-spacing:${size * 0.014}px;color:#fff;
                  white-space:nowrap;font-weight:600">
        STRENGTH<span style="color:${GOLD.base}"> | </span>DISCIPLINE<span style="color:${GOLD.base}"> | </span>RESULTS
      </div>
      <div style="width:${size * 0.14}px;height:2px;background:${GOLD.deep}"></div>
    </div>
  </div>`;

const TARGETS = [
  // Launcher icon: monogram only — a wordmark is illegible at 48px.
  { file: 'icon.png', w: 1024, h: 1024, body: `<div style="width:760px">${MONOGRAM}</div>` },
  // Android masks the adaptive icon to a circle, so keep well inside the safe zone.
  { file: 'adaptive-icon.png', w: 1024, h: 1024, body: `<div style="width:560px">${MONOGRAM}</div>` },
  { file: 'splash.png', w: 1242, h: 2436, body: wordmark(340) },
  { file: 'favicon.png', w: 196, h: 196, body: `<div style="width:150px">${MONOGRAM}</div>` },
];

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
for (const { file, w, h, body } of TARGETS) {
  const page = await browser.newPage({ viewport: { width: w, height: h } });
  await page.setContent(page$(body, w, h));
  await page.waitForTimeout(250);
  await page.screenshot({ path: path.join(assets, file) });
  await page.close();
  console.log(`wrote assets/${file}  ${w}×${h}`);
}
await browser.close();
