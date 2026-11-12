/**
 * Generate PWA icons from a single SVG source using sharp.
 * Run: npm run icons
 */
import sharp from 'sharp';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const publicDir = path.join(root, 'apps/web/public');
await mkdir(publicDir, { recursive: true });

const BRAND = '#4f46e5';
const BG = '#f7f7f8';

/** Rounded-square app icon with "é" glyph. */
function iconSvg(size, { rounded = true, letter = 'é' } = {}) {
  const r = rounded ? size * 0.22 : 0;
  return Buffer.from(`
    <svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
      <defs>
        <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="#6366f1"/>
          <stop offset="1" stop-color="${BRAND}"/>
        </linearGradient>
      </defs>
      <rect width="${size}" height="${size}" rx="${r}" fill="url(#g)"/>
      <text x="50%" y="50%" dy="0.35em" text-anchor="middle"
        font-family="-apple-system, 'SF Pro Display', 'Segoe UI', Roboto, sans-serif"
        font-size="${size * 0.52}" font-weight="700" fill="#ffffff">${letter}</text>
    </svg>
  `);
}

/** Maskable icon: glyph in a safe zone (80% of canvas). */
function maskableSvg(size) {
  return Buffer.from(`
    <svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
      <rect width="${size}" height="${size}" fill="${BRAND}"/>
      <text x="50%" y="50%" dy="0.35em" text-anchor="middle"
        font-family="-apple-system, 'SF Pro Display', 'Segoe UI', Roboto, sans-serif"
        font-size="${size * 0.42}" font-weight="700" fill="#ffffff">é</text>
    </svg>
  `);
}

const targets = [
  ['pwa-192x192.png', iconSvg(192)],
  ['pwa-512x512.png', iconSvg(512)],
  ['pwa-maskable-512x512.png', maskableSvg(512)],
  ['apple-touch-icon.png', iconSvg(180, { rounded: false })],
];

for (const [name, svg] of targets) {
  await sharp(svg).png().toFile(path.join(publicDir, name));
  console.log('wrote', name);
}

// Favicon SVG (crisp at any size).
await writeFile(
  path.join(publicDir, 'favicon.svg'),
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="${BRAND}"/><text x="50%" y="54%" text-anchor="middle" font-family="-apple-system, Roboto, sans-serif" font-size="38" font-weight="700" fill="#fff">é</text></svg>`,
);
console.log('wrote favicon.svg');
