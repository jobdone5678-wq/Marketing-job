import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const WIDTH = 1280;
const HEIGHT = 800;

function crc32(buf) {
  let table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) {
      c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    }
    table[i] = c;
  }
  let crc = -1;
  for (let i = 0; i < buf.length; i++) {
    crc = (crc >>> 8) ^ table[(crc ^ buf[i]) & 0xFF];
  }
  return (crc ^ -1) >>> 0;
}

function makeChunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii');
  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32BE(data.length, 0);
  const crcBuf = Buffer.alloc(4);
  const toCrc = Buffer.concat([typeBuf, data]);
  crcBuf.writeUInt32BE(crc32(toCrc), 0);
  return Buffer.concat([lenBuf, toCrc, crcBuf]);
}

function createPng(renderRowPixel) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  // IHDR: 1280x800, 8-bit, RGB (type 2)
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(WIDTH, 0);
  ihdr.writeUInt32BE(HEIGHT, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // color type RGB
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace

  const rowLength = 1 + WIDTH * 3;
  const rawData = Buffer.alloc(HEIGHT * rowLength);

  for (let y = 0; y < HEIGHT; y++) {
    const rowOffset = y * rowLength;
    rawData[rowOffset] = 0; // Filter: None
    for (let x = 0; x < WIDTH; x++) {
      const [r, g, b] = renderRowPixel(x, y);
      const pixelOffset = rowOffset + 1 + x * 3;
      rawData[pixelOffset] = r;
      rawData[pixelOffset + 1] = g;
      rawData[pixelOffset + 2] = b;
    }
  }

  const compressed = zlib.deflateSync(rawData, { level: 8 });
  const idat = makeChunk('IDAT', compressed);
  const iend = makeChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([signature, makeChunk('IHDR', ihdr), idat, iend]);
}

const assetsDir = path.resolve('docs/assets');
if (!fs.existsSync(assetsDir)) {
  fs.mkdirSync(assetsDir, { recursive: true });
}

// 1. Screenshot 1: Autofill in Action
// Side panel (dark slate) on the right (x > 840), form on the left
const shot1 = createPng((x, y) => {
  if (y < 60) return [0x00, 0x14, 0x2c]; // Top brand bar
  if (x > 840) {
    if (y < 120) return [0x0f, 0x21, 0x3d]; // Panel header
    if (x > 860 && x < 1240 && y > 150 && y < 220) return [0xd3, 0x2f, 0x2f]; // Autofill CTA button
    if (x > 860 && x < 1240 && y > 240 && y < 500) return [0x16, 0x2b, 0x4a]; // Panel card
    return [0x0b, 0x1a, 0x30]; // Side panel body
  }
  // Application page on left
  if (x > 80 && x < 780 && y > 100 && y < 700) {
    if (y > 120 && y < 160) return [0x1e, 0x29, 0x3b]; // Job title header
    if ((y > 220 && y < 260) || (y > 300 && y < 340) || (y > 380 && y < 420)) {
      return [0xe2, 0xe8, 0xf0]; // Filled form inputs
    }
    return [0xff, 0xff, 0xff]; // Application form surface
  }
  return [0xf1, 0xf5, 0xf9]; // Background
});
fs.writeFileSync(path.join(assetsDir, 'screenshot-autofill.png'), shot1);

// 2. Screenshot 2: Profile & ATS Match
const shot2 = createPng((x, y) => {
  if (y < 60) return [0x00, 0x14, 0x2c];
  if (x > 400 && x < 880 && y > 100 && y < 750) {
    if (y > 120 && y < 180) return [0x10, 0xb9, 0x81]; // ATS Match 95% badge (emerald)
    if (y > 200 && y < 350) return [0xf8, 0xfa, 0xfc]; // Verified skills card
    if (y > 370 && y < 550) return [0xf1, 0xf5, 0xf9]; // Experience & education
    return [0xff, 0xff, 0xff];
  }
  return [0x0f, 0x17, 0x2a]; // Slate backdrop
});
fs.writeFileSync(path.join(assetsDir, 'screenshot-sidepanel.png'), shot2);

// 3. Screenshot 3: Contextual Answer Bank
const shot3 = createPng((x, y) => {
  if (y < 60) return [0x00, 0x14, 0x2c];
  if (x > 350 && x < 930 && y > 100 && y < 750) {
    if (y > 110 && y < 160) return [0x25, 0x63, 0xeb]; // Header blue
    if (y > 180 && y < 280) return [0xf0, 0xfd, 0xf4]; // Work Auth Card (green tint)
    if (y > 300 && y < 400) return [0xec, 0xfe, 0xff]; // Notice Period Card (cyan tint)
    if (y > 420 && y < 520) return [0xfa, 0xf5, 0xff]; // Relocation Card (purple tint)
    return [0xff, 0xff, 0xff];
  }
  return [0xf8, 0xfa, 0xfc];
});
fs.writeFileSync(path.join(assetsDir, 'screenshot-answer-bank.png'), shot3);

// 4. Screenshot 4: Dashboard Tracking
const shot4 = createPng((x, y) => {
  if (y < 60) return [0x00, 0x14, 0x2c]; // Dashboard nav
  if (x > 100 && x < 1180 && y > 100 && y < 740) {
    if (y > 120 && y < 180) return [0x1e, 0x29, 0x3b]; // Table header
    if ((y > 200 && y < 260) || (y > 280 && y < 340) || (y > 360 && y < 420)) {
      return (x > 950 && x < 1120) ? [0x16, 0x65, 0x34] : [0xff, 0xff, 0xff]; // Applied status badges
    }
    return [0xf8, 0xfa, 0xfc];
  }
  return [0x0f, 0x17, 0x2a];
});
fs.writeFileSync(path.join(assetsDir, 'screenshot-tracking.png'), shot4);

console.log('Generated all 4 store screenshots (1280x800) in docs/assets/');
