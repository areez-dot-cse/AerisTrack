// Draws small placeholder "photos" (a solid colour with a pixel-font label)
// as PNG buffers, so the seed needs no real photos and no image library.
import zlib from 'node:zlib';

// 5x7 pixel font for the characters the labels use.
const GLYPHS = {
  A: ['01110', '10001', '10001', '11111', '10001', '10001', '10001'],
  B: ['11110', '10001', '10001', '11110', '10001', '10001', '11110'],
  C: ['01110', '10001', '10000', '10000', '10000', '10001', '01110'],
  D: ['11110', '10001', '10001', '10001', '10001', '10001', '11110'],
  E: ['11111', '10000', '10000', '11110', '10000', '10000', '11111'],
  F: ['11111', '10000', '10000', '11110', '10000', '10000', '10000'],
  G: ['01110', '10001', '10000', '10111', '10001', '10001', '01111'],
  H: ['10001', '10001', '10001', '11111', '10001', '10001', '10001'],
  I: ['01110', '00100', '00100', '00100', '00100', '00100', '01110'],
  K: ['10001', '10010', '10100', '11000', '10100', '10010', '10001'],
  L: ['10000', '10000', '10000', '10000', '10000', '10000', '11111'],
  N: ['10001', '10001', '11001', '10101', '10011', '10001', '10001'],
  O: ['01110', '10001', '10001', '10001', '10001', '10001', '01110'],
  P: ['11110', '10001', '10001', '11110', '10000', '10000', '10000'],
  R: ['11110', '10001', '10001', '11110', '10100', '10010', '10001'],
  S: ['01111', '10000', '10000', '01110', '00001', '00001', '11110'],
  T: ['11111', '00100', '00100', '00100', '00100', '00100', '00100'],
  U: ['10001', '10001', '10001', '10001', '10001', '10001', '01110'],
  W: ['10001', '10001', '10001', '10101', '10101', '10101', '01010'],
  1: ['00100', '01100', '00100', '00100', '00100', '00100', '01110'],
  2: ['01110', '10001', '00001', '00010', '00100', '01000', '11111'],
  3: ['11111', '00010', '00100', '00010', '00001', '10001', '01110'],
  '-': ['00000', '00000', '00000', '11111', '00000', '00000', '00000'],
  ' ': ['00000', '00000', '00000', '00000', '00000', '00000', '00000'],
};

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const typed = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(zlib.crc32(typed));
  return Buffer.concat([length, typed, crc]);
}

export function labelPng({ width = 640, height = 480, colour, label }) {
  const [r, g, b] = colour;
  const pixels = Buffer.alloc(width * height * 3);
  for (let i = 0; i < width * height; i += 1) {
    pixels[i * 3] = r; pixels[i * 3 + 1] = g; pixels[i * 3 + 2] = b;
  }
  // A lighter band across the middle, then white text on it.
  const bandTop = Math.floor(height * 0.4);
  const bandBottom = Math.floor(height * 0.6);
  for (let y = bandTop; y < bandBottom; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = (y * width + x) * 3;
      pixels[i] = Math.min(255, r + 30); pixels[i + 1] = Math.min(255, g + 30); pixels[i + 2] = Math.min(255, b + 30);
    }
  }
  const scale = 6;
  const text = label.toUpperCase();
  const textWidth = text.length * 6 * scale;
  let originX = Math.max(8, Math.floor((width - textWidth) / 2));
  const originY = Math.floor((bandTop + bandBottom) / 2) - Math.floor((7 * scale) / 2);
  for (const char of text) {
    const glyph = GLYPHS[char] ?? GLYPHS[' '];
    glyph.forEach((row, gy) => {
      [...row].forEach((bit, gx) => {
        if (bit !== '1') return;
        for (let dy = 0; dy < scale; dy += 1) {
          for (let dx = 0; dx < scale; dx += 1) {
            const x = originX + gx * scale + dx;
            const y = originY + gy * scale + dy;
            if (x >= width || y >= height) continue;
            const i = (y * width + x) * 3;
            pixels[i] = 255; pixels[i + 1] = 255; pixels[i + 2] = 255;
          }
        }
      });
    });
    originX += 6 * scale;
  }

  const rows = [];
  for (let y = 0; y < height; y += 1) {
    rows.push(Buffer.from([0])); // filter type: none
    rows.push(pixels.subarray(y * width * 3, (y + 1) * width * 3));
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0; // 8-bit RGB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(Buffer.concat(rows))),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}
