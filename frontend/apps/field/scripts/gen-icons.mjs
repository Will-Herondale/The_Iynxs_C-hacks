/* global console, Buffer */
// Generates PNG icons (no dependencies): node apps/field/scripts/gen-icons.mjs
// Glyph = a bridge (setu): white arch over a deck bar on SETU blue.
import { deflateSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const out = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');
const BG = [0x0b, 0x5c, 0xad];

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type), data]);
  const c = Buffer.alloc(4);
  c.writeUInt32BE(crc(body));
  return Buffer.concat([len, body, c]);
};

// u,v in [0,1]; s = glyph scale around the centre (maskable uses a smaller one).
function glyph(u, v, s) {
  const x = (u - 0.5) / s;
  const y = (v - 0.5) / s;
  const r = Math.hypot(x, y - 0.1);
  const arch = y - 0.1 <= 0 && r <= 0.36 && r >= 0.26;
  const deck = Math.abs(y - 0.1) <= 0.04 && Math.abs(x) <= 0.4;
  const pillars = Math.abs(y - 0.2) <= 0.1 && Math.abs(Math.abs(x) - 0.3) <= 0.04;
  return arch || deck || pillars;
}

function render(size, { rounded, scale }) {
  const SS = 3;
  const stride = size * 4 + 1;
  const raw = Buffer.alloc(stride * size);
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let a = 0, g = 0;
      for (let sy = 0; sy < SS; sy++) for (let sx = 0; sx < SS; sx++) {
        const u = (px + (sx + 0.5) / SS) / size;
        const v = (py + (sy + 0.5) / SS) / size;
        let inside = true;
        if (rounded) {
          const rad = 0.19;
          const cx = Math.min(Math.max(u, rad), 1 - rad);
          const cy = Math.min(Math.max(v, rad), 1 - rad);
          inside = Math.hypot(u - cx, v - cy) <= rad;
        }
        if (inside) { a++; if (glyph(u, v, scale)) g++; }
      }
      const o = py * stride + 1 + px * 4;
      const white = a ? g / a : 0;
      for (let i = 0; i < 3; i++) raw[o + i] = Math.round(BG[i] + (255 - BG[i]) * white);
      raw[o + 3] = Math.round((a / (SS * SS)) * 255);
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

const files = {
  'pwa-192.png': [192, { rounded: true, scale: 1.1 }],
  'pwa-512.png': [512, { rounded: true, scale: 1.1 }],
  'pwa-maskable-512.png': [512, { rounded: false, scale: 0.8 }],
  'apple-touch-icon.png': [180, { rounded: false, scale: 0.9 }],
};
for (const [name, [size, opts]] of Object.entries(files)) {
  writeFileSync(path.join(out, name), render(size, opts));
  console.log('wrote', name);
}
