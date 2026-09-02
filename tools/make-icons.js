// Draws the app icons and writes them as PNGs.
//
//   node tools/make-icons.js
//
// Hand rolled rather than pulled from a library, the same way the other three
// games do it: a PNG is a header, one zlib stream of filtered scanlines and a
// trailer, and node has zlib built in. That keeps the project at zero
// dependencies, and the icons stay reproducible - run this again and you get the
// same bytes.
//
// The picture is the ship with its pod in front of it, in the colours the game
// actually uses, taken from constants.js rather than typed out again.

import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { POD_KINDS, SHIP_PRESETS } from '../src/constants.js';
import { STAGES } from '../src/game/stages.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function chunk(type, data) {
  const out = Buffer.alloc(data.length + 12);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, 'ascii');
  data.copy(out, 8);
  const body = out.subarray(4, 8 + data.length);
  out.writeUInt32BE(crc32(body), 8 + data.length);
  return out;
}

/** @param {Uint8Array} rgba length size*size*4 */
function encodePng(size, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // truecolour with alpha
  // 10, 11, 12 stay zero: deflate, adaptive filtering, no interlacing

  // Each scanline is prefixed with its filter type; 0 means "store as is".
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    const at = y * (size * 4 + 1);
    raw[at] = 0;
    Buffer.from(rgba.buffer, y * size * 4, size * 4).copy(raw, at + 1);
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/** '#58e6ff' -> [88, 230, 255]. */
function rgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function mix(a, b, t) {
  return [
    Math.round(a[0] + (b[0] - a[0]) * t),
    Math.round(a[1] + (b[1] - a[1]) * t),
    Math.round(a[2] + (b[2] - a[2]) * t),
  ];
}

/**
 * The ship, nose right, with its pod ahead of it and a beam leaving both.
 *
 * The beam is there for a reason rather than for decoration: at 32 pixels a
 * small wedge on a dark square could be almost anything, and a bright horizontal
 * line coming out of the front of it says shooter immediately.
 */
function draw(size) {
  const px = new Uint8Array(size * size * 4);
  const set = (x, y, [r, g, b], a = 255) => {
    const ix = Math.round(x);
    const iy = Math.round(y);
    if (ix < 0 || iy < 0 || ix >= size || iy >= size) return;
    const i = (iy * size + ix) * 4;
    // Painted over whatever is there rather than replacing it, so the glow and
    // the beam add up the way they do in the game.
    const was = [px[i], px[i + 1], px[i + 2]];
    const now = a >= 255 ? [r, g, b] : mix(was, [r, g, b], a / 255);
    px[i] = now[0];
    px[i + 1] = now[1];
    px[i + 2] = now[2];
    px[i + 3] = 255;
  };

  // The core stage's palette, because it is the one with the most contrast in
  // it and an icon has thirty-two pixels to make an impression in.
  const theme = STAGES[0].theme;
  const sky = rgb(theme.sky);
  const far = rgb(theme.far);
  const rock = rgb(theme.rock);
  const edge = rgb(theme.edge);
  const star = rgb(theme.star);
  const ship = SHIP_PRESETS[0];
  const hull = rgb(ship.hull);
  const trim = rgb(ship.trim);
  const glow = rgb(ship.glow);
  const pod = rgb(POD_KINDS.blue.colour);

  // Sky, darkest at the edges.
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const t = 1 - Math.abs(y / size - 0.5) * 2;
      set(x, y, mix(sky, far, t * 0.9));
    }
  }

  // A few stars, at fixed places so the icon is the same every time it is built.
  const spots = [[0.13, 0.2], [0.34, 0.11], [0.72, 0.17], [0.22, 0.83], [0.61, 0.9],
    [0.87, 0.72], [0.46, 0.28], [0.9, 0.36]];
  for (const [sx, sy] of spots) set(sx * size, sy * size, star, 200);

  // The corridor: rock along the top and the bottom, with a lit lip.
  const lip = Math.max(1, size * 0.03);
  for (let x = 0; x < size; x++) {
    const wave = Math.sin((x / size) * 5) * size * 0.035;
    const top = size * 0.13 + wave;
    const bot = size * 0.87 + wave;
    for (let y = 0; y < top; y++) set(x, y, rock);
    for (let y = bot; y < size; y++) set(x, y, rock);
    for (let y = top - lip; y < top; y++) set(x, y, edge);
    for (let y = bot; y < bot + lip; y++) set(x, y, edge);
  }

  // The beam, out of the nose and off the right-hand edge.
  const midY = size * 0.52;
  for (let x = size * 0.5; x < size; x++) {
    const w = size * 0.055;
    for (let d = -w; d <= w; d += 0.4) {
      const fade = 1 - Math.abs(d) / w;
      set(x, midY + d, mix(glow, [255, 255, 255], fade * fade), 120 + fade * 135);
    }
  }

  // The pod: a small bright disc out in front.
  const podX = size * 0.62;
  const podR = size * 0.09;
  for (let y = -podR; y <= podR; y += 0.4) {
    for (let x = -podR; x <= podR; x += 0.4) {
      const d = Math.hypot(x, y) / podR;
      if (d > 1) continue;
      set(podX + x, midY + y, d > 0.62 ? pod : [255, 255, 255]);
    }
  }

  // The ship: a wedge, with the wing behind it and a flame behind that.
  const nose = size * 0.5;
  const tail = size * 0.2;
  const half = size * 0.11;
  for (let x = tail; x <= nose; x += 0.4) {
    const t = (x - tail) / (nose - tail);
    const h = half * (1 - t * 0.8);
    for (let y = -h; y <= h; y += 0.4) {
      const wing = Math.abs(y) > h * 0.62;
      set(x, midY + y, wing ? trim : hull);
    }
  }
  for (let x = tail - size * 0.14; x < tail; x += 0.4) {
    const t = (tail - x) / (size * 0.14);
    const h = half * 0.4 * (1 - t);
    for (let y = -h; y <= h; y += 0.4) {
      set(x, midY + y, mix(glow, sky, t), 255 - t * 120);
    }
  }
  // The cockpit, which is what stops it reading as an arrow.
  for (let y = -size * 0.022; y <= size * 0.022; y += 0.4) {
    for (let x = size * 0.34; x <= size * 0.42; x += 0.4) set(x, midY + y, glow);
  }

  return px;
}

mkdirSync(path.join(ROOT, 'icons'), { recursive: true });
for (const size of [32, 180, 192, 512]) {
  const file = path.join('icons', `icon-${size}.png`);
  writeFileSync(path.join(ROOT, file), encodePng(size, draw(size)));
  console.log(`wrote ${file}`);
}
