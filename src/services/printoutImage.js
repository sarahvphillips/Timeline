/** Draw the number-sentence card to a PNG data URI. No native screenshot module. */

const GLYPHS = {
  ' ': [0, 0, 0, 0, 0, 0, 0],
  '0': [0x0e, 0x11, 0x13, 0x15, 0x19, 0x11, 0x0e],
  '1': [0x04, 0x0c, 0x04, 0x04, 0x04, 0x04, 0x0e],
  '2': [0x0e, 0x11, 0x01, 0x06, 0x08, 0x10, 0x1f],
  '3': [0x0e, 0x11, 0x01, 0x06, 0x01, 0x11, 0x0e],
  '4': [0x02, 0x06, 0x0a, 0x12, 0x1f, 0x02, 0x02],
  '5': [0x1f, 0x10, 0x1e, 0x01, 0x01, 0x11, 0x0e],
  '6': [0x06, 0x08, 0x10, 0x1e, 0x11, 0x11, 0x0e],
  '7': [0x1f, 0x01, 0x02, 0x04, 0x08, 0x08, 0x08],
  '8': [0x0e, 0x11, 0x11, 0x0e, 0x11, 0x11, 0x0e],
  '9': [0x0e, 0x11, 0x11, 0x0f, 0x01, 0x02, 0x0c],
  A: [0x0e, 0x11, 0x11, 0x1f, 0x11, 0x11, 0x11],
  B: [0x1e, 0x11, 0x11, 0x1e, 0x11, 0x11, 0x1e],
  C: [0x0e, 0x11, 0x10, 0x10, 0x10, 0x11, 0x0e],
  D: [0x1c, 0x12, 0x11, 0x11, 0x11, 0x12, 0x1c],
  E: [0x1f, 0x10, 0x10, 0x1e, 0x10, 0x10, 0x1f],
  F: [0x1f, 0x10, 0x10, 0x1e, 0x10, 0x10, 0x10],
  G: [0x0e, 0x11, 0x10, 0x17, 0x11, 0x11, 0x0f],
  H: [0x11, 0x11, 0x11, 0x1f, 0x11, 0x11, 0x11],
  I: [0x0e, 0x04, 0x04, 0x04, 0x04, 0x04, 0x0e],
  J: [0x07, 0x02, 0x02, 0x02, 0x02, 0x12, 0x0c],
  K: [0x11, 0x12, 0x14, 0x18, 0x14, 0x12, 0x11],
  L: [0x10, 0x10, 0x10, 0x10, 0x10, 0x10, 0x1f],
  M: [0x11, 0x1b, 0x15, 0x15, 0x11, 0x11, 0x11],
  N: [0x11, 0x19, 0x15, 0x13, 0x11, 0x11, 0x11],
  O: [0x0e, 0x11, 0x11, 0x11, 0x11, 0x11, 0x0e],
  P: [0x1e, 0x11, 0x11, 0x1e, 0x10, 0x10, 0x10],
  Q: [0x0e, 0x11, 0x11, 0x11, 0x15, 0x12, 0x0d],
  R: [0x1e, 0x11, 0x11, 0x1e, 0x14, 0x12, 0x11],
  S: [0x0f, 0x10, 0x10, 0x0e, 0x01, 0x01, 0x1e],
  T: [0x1f, 0x04, 0x04, 0x04, 0x04, 0x04, 0x04],
  U: [0x11, 0x11, 0x11, 0x11, 0x11, 0x11, 0x0e],
  V: [0x11, 0x11, 0x11, 0x11, 0x0a, 0x0a, 0x04],
  W: [0x11, 0x11, 0x11, 0x15, 0x15, 0x1b, 0x11],
  X: [0x11, 0x11, 0x0a, 0x04, 0x0a, 0x11, 0x11],
  Y: [0x11, 0x11, 0x0a, 0x04, 0x04, 0x04, 0x04],
  Z: [0x1f, 0x01, 0x02, 0x04, 0x08, 0x10, 0x1f],
  a: [0x00, 0x00, 0x0e, 0x01, 0x0f, 0x11, 0x0f],
  b: [0x10, 0x10, 0x1e, 0x11, 0x11, 0x11, 0x1e],
  c: [0x00, 0x00, 0x0e, 0x10, 0x10, 0x11, 0x0e],
  d: [0x01, 0x01, 0x0d, 0x13, 0x11, 0x11, 0x0f],
  e: [0x00, 0x00, 0x0e, 0x11, 0x1f, 0x10, 0x0e],
  f: [0x06, 0x08, 0x1c, 0x08, 0x08, 0x08, 0x08],
  g: [0x00, 0x0e, 0x11, 0x11, 0x0f, 0x01, 0x1e],
  h: [0x10, 0x10, 0x16, 0x19, 0x11, 0x11, 0x11],
  i: [0x04, 0x00, 0x0c, 0x04, 0x04, 0x04, 0x0e],
  j: [0x02, 0x00, 0x06, 0x02, 0x02, 0x12, 0x0c],
  k: [0x10, 0x10, 0x12, 0x14, 0x18, 0x14, 0x12],
  l: [0x0c, 0x04, 0x04, 0x04, 0x04, 0x04, 0x0e],
  m: [0x00, 0x00, 0x1a, 0x15, 0x15, 0x11, 0x11],
  n: [0x00, 0x00, 0x16, 0x19, 0x11, 0x11, 0x11],
  o: [0x00, 0x00, 0x0e, 0x11, 0x11, 0x11, 0x0e],
  p: [0x00, 0x1e, 0x11, 0x11, 0x1e, 0x10, 0x10],
  q: [0x00, 0x0f, 0x11, 0x11, 0x0f, 0x01, 0x01],
  r: [0x00, 0x00, 0x16, 0x19, 0x10, 0x10, 0x10],
  s: [0x00, 0x00, 0x0f, 0x10, 0x0e, 0x01, 0x1e],
  t: [0x08, 0x08, 0x1e, 0x08, 0x08, 0x09, 0x06],
  u: [0x00, 0x00, 0x11, 0x11, 0x11, 0x13, 0x0d],
  v: [0x00, 0x00, 0x11, 0x11, 0x11, 0x0a, 0x04],
  w: [0x00, 0x00, 0x11, 0x11, 0x15, 0x15, 0x0a],
  x: [0x00, 0x00, 0x11, 0x0a, 0x04, 0x0a, 0x11],
  y: [0x00, 0x11, 0x11, 0x0f, 0x01, 0x01, 0x0e],
  z: [0x00, 0x00, 0x1f, 0x02, 0x04, 0x08, 0x1f],
  '.': [0x00, 0x00, 0x00, 0x00, 0x00, 0x0c, 0x0c],
  ',': [0x00, 0x00, 0x00, 0x00, 0x0c, 0x04, 0x08],
  "'": [0x04, 0x04, 0x08, 0x00, 0x00, 0x00, 0x00],
  '-': [0x00, 0x00, 0x00, 0x1f, 0x00, 0x00, 0x00],
  '#': [0x0a, 0x0a, 0x1f, 0x0a, 0x1f, 0x0a, 0x0a],
  ':': [0x00, 0x0c, 0x0c, 0x00, 0x0c, 0x0c, 0x00],
  '/': [0x01, 0x02, 0x04, 0x08, 0x10, 0x00, 0x00],
  '(': [0x02, 0x04, 0x08, 0x08, 0x08, 0x04, 0x02],
  ')': [0x08, 0x04, 0x02, 0x02, 0x02, 0x04, 0x08],
  '·': [0x00, 0x00, 0x00, 0x0c, 0x0c, 0x00, 0x00],
};

function glyph(ch) {
  return GLYPHS[ch] || GLYPHS[ch.toUpperCase()] || GLYPHS[ch.toLowerCase()] || null;
}

function hex(color) {
  const h = String(color).replace('#', '');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16), 255];
}

const CREAM = hex('#f3e6c8');
const WORD = hex('#f6f1e6');
const GOLD = hex('#c4a574');
const BLUE = hex('#6ea8d8');
const RED = hex('#e85d5d');
const INK = hex('#1c140f');

function textWidth(text, scale) {
  const gap = scale;
  const advance = 5 * scale + gap;
  return Math.max(0, String(text || '').length * advance - gap);
}

function drawText(s, text, x, y, scale, color) {
  let cursor = x;
  const gap = scale;
  String(text || '').split('').forEach((ch) => {
    const rows = glyph(ch);
    if (rows) {
      rows.forEach((bits, row) => {
        for (let col = 0; col < 5; col += 1) {
          if (bits & (1 << (4 - col))) {
            fillRect(s, cursor + col * scale, y + row * scale, scale, scale, color);
          }
        }
      });
    }
    cursor += 5 * scale + gap;
  });
}

function fillRect(s, x, y, w, h, color) {
  const x0 = Math.max(0, Math.round(x));
  const y0 = Math.max(0, Math.round(y));
  const x1 = Math.min(s.w, Math.round(x + w));
  const y1 = Math.min(s.h, Math.round(y + h));
  for (let yy = y0; yy < y1; yy += 1) {
    let i = (yy * s.w + x0) * 4;
    for (let xx = x0; xx < x1; xx += 1) {
      s.data[i] = color[0];
      s.data[i + 1] = color[1];
      s.data[i + 2] = color[2];
      s.data[i + 3] = 255;
      i += 4;
    }
  }
}

function wrapText(text, maxWidth, scale) {
  const words = String(text || '').split(/\s+/).filter(Boolean);
  const lines = [];
  let line = '';
  words.forEach((word) => {
    const next = line ? `${line} ${word}` : word;
    if (textWidth(next, scale) <= maxWidth) line = next;
    else {
      if (line) lines.push(line);
      line = word;
    }
  });
  if (line) lines.push(line);
  return lines.length ? lines : [''];
}

function tokenBlock(token, scale, small) {
  const word = token.word || '·';
  const lines = [{ text: word, color: WORD, scale }];
  if (token.calc) lines.push({ text: token.calc, color: GOLD, scale: small });
  if (token.number) lines.push({ text: String(token.number), color: token.red ? RED : BLUE, scale: small });
  (token.options || []).forEach((option) => {
    lines.push({ text: option, color: CREAM, scale: small, chip: true });
  });
  const width = lines.reduce((max, row) => Math.max(max, textWidth(row.text, row.scale) + (row.chip ? 16 : 0)), 40);
  const height = lines.reduce((sum, row) => sum + 7 * row.scale + (row.chip ? 14 : 6), 0);
  return { lines, width, height };
}

function layoutHeight(spec) {
  const width = 720;
  const inner = width - 80;
  let y = 48;
  y += 7 * 4 + 18;
  y += 16;
  if (spec.note) y += wrapText(spec.note, inner, 2).length * (7 * 2 + 6) + 10;
  (spec.readings || []).forEach((reading) => {
    if (reading.label) y += 7 * 2 + 12;
    (reading.rows || []).forEach((row) => {
      const blocks = (row || []).map((token) => tokenBlock(token, 3, 2));
      let rowH = 0;
      let used = 0;
      blocks.forEach((block) => {
        if (used && used + block.width + 16 > inner) {
          y += rowH + 16;
          rowH = 0;
          used = 0;
        }
        rowH = Math.max(rowH, block.height);
        used += block.width + 16;
      });
      y += rowH + 20;
    });
    y += 8;
  });
  return Math.min(Math.max(y + 48, 280), 4200);
}

function crc32(bytes) {
  let c = ~0;
  for (let i = 0; i < bytes.length; i += 1) {
    c ^= bytes[i];
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  return ~c >>> 0;
}

function chunk(type, data) {
  const out = new Uint8Array(12 + data.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, data.length);
  out[4] = type.charCodeAt(0);
  out[5] = type.charCodeAt(1);
  out[6] = type.charCodeAt(2);
  out[7] = type.charCodeAt(3);
  out.set(data, 8);
  const crc = crc32(out.subarray(4, 8 + data.length));
  view.setUint32(8 + data.length, crc);
  return out;
}

function zlibStore(data) {
  const parts = [new Uint8Array([0x78, 0x01])];
  let offset = 0;
  while (offset < data.length) {
    const len = Math.min(65535, data.length - offset);
    const last = offset + len >= data.length;
    const head = new Uint8Array(5);
    head[0] = last ? 1 : 0;
    head[1] = len & 255;
    head[2] = (len >> 8) & 255;
    const nlen = len ^ 0xffff;
    head[3] = nlen & 255;
    head[4] = (nlen >> 8) & 255;
    parts.push(head, data.subarray(offset, offset + len));
    offset += len;
  }
  let a = 1;
  let b = 0;
  for (let i = 0; i < data.length; i += 1) {
    a = (a + data[i]) % 65521;
    b = (b + a) % 65521;
  }
  const sum = ((b << 16) | a) >>> 0;
  const tail = new Uint8Array(4);
  tail[0] = (sum >>> 24) & 255;
  tail[1] = (sum >>> 16) & 255;
  tail[2] = (sum >>> 8) & 255;
  tail[3] = sum & 255;
  parts.push(tail);
  const total = parts.reduce((n, part) => n + part.length, 0);
  const out = new Uint8Array(total);
  let at = 0;
  parts.forEach((part) => {
    out.set(part, at);
    at += part.length;
  });
  return out;
}

function toBase64(bytes) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i];
    const b1 = i + 1 < bytes.length ? bytes[i + 1] : 0;
    const b2 = i + 2 < bytes.length ? bytes[i + 2] : 0;
    const n = (b0 << 16) | (b1 << 8) | b2;
    out += alphabet[(n >> 18) & 63];
    out += alphabet[(n >> 12) & 63];
    out += i + 1 < bytes.length ? alphabet[(n >> 6) & 63] : '=';
    out += i + 2 < bytes.length ? alphabet[n & 63] : '=';
  }
  return out;
}

function encodePng(surface) {
  const { w, h, data } = surface;
  const stride = w * 4;
  const raw = new Uint8Array((stride + 1) * h);
  for (let y = 0; y < h; y += 1) {
    raw[y * (stride + 1)] = 0;
    raw.set(data.subarray(y * stride, (y + 1) * stride), y * (stride + 1) + 1);
  }
  const ihdr = new Uint8Array(13);
  const view = new DataView(ihdr.buffer);
  view.setUint32(0, w);
  view.setUint32(4, h);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const sig = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
  const parts = [sig, chunk('IHDR', ihdr), chunk('IDAT', zlibStore(raw)), chunk('IEND', new Uint8Array(0))];
  const total = parts.reduce((n, part) => n + part.length, 0);
  const png = new Uint8Array(total);
  let at = 0;
  parts.forEach((part) => {
    png.set(part, at);
    at += part.length;
  });
  return `data:image/png;base64,${toBase64(png)}`;
}

export function renderPrintoutPng(spec) {
  const width = 720;
  const height = layoutHeight(spec);
  const data = new Uint8Array(width * height * 4);
  const bg = hex('#1c140f');
  for (let i = 0; i < width * height; i += 1) {
    data[i * 4] = bg[0];
    data[i * 4 + 1] = bg[1];
    data[i * 4 + 2] = bg[2];
    data[i * 4 + 3] = 255;
  }
  const s = { w: width, h: height, data };
  fillRect(s, 16, 16, width - 32, 2, GOLD);
  fillRect(s, 16, height - 18, width - 32, 2, GOLD);
  fillRect(s, 16, 16, 2, height - 32, GOLD);
  fillRect(s, width - 18, 16, 2, height - 32, GOLD);

  const inner = width - 80;
  let y = 48;
  const title = spec.title || 'Number sentence';
  drawText(s, title, Math.max(40, (width - textWidth(title, 4)) / 2), y, 4, CREAM);
  y += 7 * 4 + 12;
  const ruleW = 220;
  fillRect(s, (width - ruleW) / 2, y, ruleW, 2, GOLD);
  y += 18;
  if (spec.note) {
    wrapText(spec.note, inner, 2).forEach((line) => {
      drawText(s, line, Math.max(40, (width - textWidth(line, 2)) / 2), y, 2, GOLD);
      y += 7 * 2 + 6;
    });
    y += 8;
  }

  (spec.readings || []).forEach((reading) => {
    if (reading.label) {
      drawText(s, reading.label, Math.max(40, (width - textWidth(reading.label, 2)) / 2), y, 2, GOLD);
      y += 7 * 2 + 12;
    }
    (reading.rows || []).forEach((row) => {
      const blocks = (row || []).map((token) => tokenBlock(token, 3, 2));
      let start = 0;
      while (start < blocks.length) {
        let used = 0;
        let end = start;
        while (end < blocks.length && (used === 0 || used + blocks[end].width + 16 <= inner)) {
          used += blocks[end].width + 16;
          end += 1;
        }
        const slice = blocks.slice(start, end);
        const rowW = slice.reduce((sum, block) => sum + block.width, 0) + Math.max(0, slice.length - 1) * 16;
        let x = Math.max(40, (width - rowW) / 2);
        const rowH = slice.reduce((max, block) => Math.max(max, block.height), 0);
        slice.forEach((block) => {
          let ty = y;
          block.lines.forEach((line) => {
            const tw = textWidth(line.text, line.scale);
            if (line.chip) {
              fillRect(s, x, ty, block.width, 7 * line.scale + 10, INK);
              fillRect(s, x, ty, block.width, 1, GOLD);
              fillRect(s, x, ty + 7 * line.scale + 9, block.width, 1, GOLD);
              fillRect(s, x, ty, 1, 7 * line.scale + 10, GOLD);
              fillRect(s, x + block.width - 1, ty, 1, 7 * line.scale + 10, GOLD);
              drawText(s, line.text, x + 8, ty + 4, line.scale, line.color);
              ty += 7 * line.scale + 14;
            } else {
              drawText(s, line.text, x + Math.max(0, (block.width - tw) / 2), ty, line.scale, line.color);
              ty += 7 * line.scale + 6;
            }
          });
          x += block.width + 16;
        });
        y += rowH + 18;
        start = end;
      }
    });
    y += 8;
  });

  return encodePng(s);
}
