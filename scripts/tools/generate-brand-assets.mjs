// Generates every icon/social image from public/logo.png (the single source of truth).
// Run: node scripts/tools/generate-brand-assets.mjs
import sharp from 'sharp';
import { writeFileSync } from 'node:fs';

const SRC = 'public/logo.png';
const CLEAR = { r: 0, g: 0, b: 0, alpha: 0 };
const WHITE = { r: 255, g: 255, b: 255, alpha: 1 };

// Logo centred on a square canvas, `pad` = fraction of the canvas left as margin.
async function square(size, { pad = 0.1, background = CLEAR } = {}) {
  const inner = Math.round(size * (1 - pad * 2));
  const logo = await sharp(SRC).resize(inner, inner, { fit: 'contain', background: CLEAR }).png().toBuffer();
  return sharp({ create: { width: size, height: size, channels: 4, background } })
    .composite([{ input: logo, gravity: 'centre' }])
    .png()
    .toBuffer();
}

async function social(w, h) {
  const logoH = Math.round(h * 0.5);
  const logo = await sharp(SRC).resize({ height: logoH }).png().toBuffer();
  return sharp({ create: { width: w, height: h, channels: 4, background: WHITE } })
    .composite([{ input: logo, gravity: 'centre' }])
    .png()
    .toBuffer();
}

// PNG-in-ICO container (supported by all modern browsers).
function ico(pngs) {
  const head = Buffer.alloc(6);
  head.writeUInt16LE(1, 2);
  head.writeUInt16LE(pngs.length, 4);
  let offset = 6 + 16 * pngs.length;
  const dirs = pngs.map(({ size, buf }) => {
    const d = Buffer.alloc(16);
    d[0] = size >= 256 ? 0 : size;
    d[1] = size >= 256 ? 0 : size;
    d.writeUInt16LE(1, 4);
    d.writeUInt16LE(32, 6);
    d.writeUInt32LE(buf.length, 8);
    d.writeUInt32LE(offset, 12);
    offset += buf.length;
    return d;
  });
  return Buffer.concat([head, ...dirs, ...pngs.map((p) => p.buf)]);
}

const out = (p, b) => { writeFileSync(p, b); console.log('wrote', p); };

// App Router file conventions (auto-wired into <head> by Next.js)
out('src/app/icon.png', await square(512, { pad: 0.08 }));
out('src/app/apple-icon.png', await square(180, { pad: 0.16, background: WHITE }));
out('src/app/opengraph-image.png', await social(1200, 630));
out('src/app/twitter-image.png', await social(1200, 630));
const icoSizes = [16, 32, 48, 64];
out('src/app/favicon.ico', ico(await Promise.all(icoSizes.map(async (size) => ({ size, buf: await square(size, { pad: 0.04 }) })))));

// Public assets (PWA manifest, direct links)
out('public/icon-192.png', await square(192, { pad: 0.1 }));
out('public/icon-512.png', await square(512, { pad: 0.1 }));
out('public/icon-maskable-512.png', await square(512, { pad: 0.22, background: WHITE }));

// Chrome extension icons (extension/public/icon/*.png)
for (const [file, size] of [['16.png', 16], ['32.png', 32], ['48.png', 48], ['128.png', 128]]) {
  out(`extension/public/icon/${file}`, await square(size, { pad: size <= 32 ? 0.04 : 0.08 }));
}
