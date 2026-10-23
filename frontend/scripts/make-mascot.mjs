// Draws the built-in companion (a little terminal on two legs) and writes
// public/mascot/{walk,idle,done,error}.gif. Vite copies public/ into dist/, so they ship in the installer.
//   cd frontend && node scripts/make-mascot.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import gifenc from 'gifenc';
const { GIFEncoder, quantize, applyPalette } = gifenc;

const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public', 'mascot');
const N = 32, SCALE = 5, GROUND = 29;   // drawn on a 32x32 grid, written at 160x160

const C = {
  green: [57, 255, 20], dimGreen: [24, 92, 16], screen: [9, 20, 9], redScreen: [48, 8, 8],
  red: [255, 77, 77], amber: [255, 176, 0], blue: [61, 139, 255], pink: [255, 111, 174],
  white: [235, 255, 235], leg: [163, 163, 163], foot: [107, 107, 107],
};

function frame() {
  const px = new Uint8Array(N * N * 4);
  const set = (x, y, c) => {
    if (x < 0 || y < 0 || x >= N || y >= N) return;
    px.set([...c, 255], (y * N + x) * 4);
  };
  const line = (x0, y0, x1, y1, c) => {   // Bresenham
    const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    for (;;) {
      set(x0, y0, c);
      if (x0 === x1 && y0 === y1) return;
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x0 += sx; }
      if (e2 <= dx) { err += dx; y0 += sy; }
    }
  };
  return { px, set, line };
}

// One character pose. bx/by = body top-left; legs = [dx, lift] per leg; airborne legs hang from the hips.
function draw({
  bx = 6, by = 8, border = C.green, screen = C.screen, eyes = 'open', look = 0, mouth = 'smile',
  prompt = 'cursor', cursor = true, legs = [[0, 0], [0, 0]], airborne = false, sparkles = null, drop = null,
}) {
  const f = frame();
  const { set, line } = f;
  // Body: a rounded terminal window, 20x16.
  for (let x = bx + 1; x < bx + 19; x++) { set(x, by, border); set(x, by + 15, border); }
  for (let y = by + 1; y < by + 15; y++) { set(bx, y, border); set(bx + 19, y, border); }
  for (let y = by + 1; y < by + 15; y++) for (let x = bx + 1; x < bx + 19; x++) set(x, y, screen);
  set(bx + 2, by + 2, C.red); set(bx + 4, by + 2, C.amber); set(bx + 6, by + 2, C.green);   // window buttons
  for (let x = bx + 1; x < bx + 19; x++) set(x, by + 3, C.dimGreen);                         // title bar edge

  const ex = [bx + 5 + look, bx + 13 + look], ey = by + 6;
  for (const x of ex) {
    if (eyes === 'open') { set(x, ey, C.white); set(x + 1, ey, C.green); set(x, ey + 1, C.green); set(x + 1, ey + 1, C.green); }
    if (eyes === 'closed') { set(x, ey + 1, C.green); set(x + 1, ey + 1, C.green); }
    if (eyes === 'happy') { set(x - 1, ey + 1, C.green); set(x, ey, C.green); set(x + 1, ey, C.green); set(x + 2, ey + 1, C.green); }
    if (eyes === 'x') { for (let i = 0; i < 3; i++) { set(x - 1 + i, ey - 1 + i, C.red); set(x + 1 - i, ey - 1 + i, C.red); } }
  }
  if (eyes !== 'x') { set(bx + 3, by + 9, C.pink); set(bx + 4, by + 9, C.pink); set(bx + 15, by + 9, C.pink); set(bx + 16, by + 9, C.pink); }

  const mx = bx + 7 + look, my = by + 9;   // mouth, 6 wide
  if (mouth === 'smile') { set(mx, my, C.green); set(mx + 5, my, C.green); for (let x = mx + 1; x < mx + 5; x++) set(x, my + 1, C.green); }
  if (mouth === 'grin') {
    for (let x = mx; x < mx + 6; x++) set(x, my, C.green);
    set(mx + 1, my + 1, C.green); set(mx + 2, my + 1, C.pink); set(mx + 3, my + 1, C.pink); set(mx + 4, my + 1, C.green);
    set(mx + 2, my + 2, C.green); set(mx + 3, my + 2, C.green);
  }
  if (mouth === 'frown') { for (let x = mx + 1; x < mx + 5; x++) set(x, my + 1, C.red); set(mx, my + 2, C.red); set(mx + 5, my + 2, C.red); }

  if (prompt === 'cursor') {   // ">_" with a blinking block
    set(bx + 2, by + 11, C.green); set(bx + 3, by + 12, C.green); set(bx + 2, by + 13, C.green);
    if (cursor) for (const [x, y] of [[bx + 5, by + 12], [bx + 6, by + 12], [bx + 5, by + 13], [bx + 6, by + 13]]) set(x, y, C.green);
  }
  if (prompt === 'check') for (const [x, y] of [[bx + 2, by + 13], [bx + 3, by + 14], [bx + 4, by + 13], [bx + 5, by + 12], [bx + 6, by + 11]]) set(x, y, C.amber);
  if (prompt === 'bang' && cursor) { for (let y = by + 10; y < by + 13; y++) set(bx + 3, y, C.red); set(bx + 3, by + 14, C.red); }

  // Two legs from the hips down to the ground (or dangling when airborne), with little feet.
  [bx + 6, bx + 13].forEach((hx, i) => {
    const [dx, lift] = legs[i];
    const footY = airborne ? by + 21 : GROUND - lift;
    line(hx, by + 16, hx + dx, footY - 1, C.leg);
    set(hx + dx, footY, C.foot); set(hx + dx + 1, footY, C.foot);
  });

  if (sparkles) for (const [x, y] of sparkles) {
    set(x, y, C.amber); set(x - 1, y, C.amber); set(x + 1, y, C.amber); set(x, y - 1, C.amber); set(x, y + 1, C.amber);
  }
  if (drop) { set(drop[0], drop[1], C.blue); set(drop[0], drop[1] + 1, C.blue); set(drop[0] - 1, drop[1] + 1, C.blue); }
  return f.px;
}

const ANIMATIONS = {
  // Legs swing, body bobs on the passing step, eyes look ahead, prompt cursor blinks.
  walk: Array.from({ length: 8 }, (_, i) => {
    const step = i % 4;
    const legs = [[[-2, 0], [2, 0]], [[0, 1], [0, 0]], [[2, 0], [-2, 0]], [[0, 0], [0, 1]]][step];
    return { pose: { by: step % 2 ? 7 : 8, legs, look: 1, cursor: i < 4 }, delay: 120 };
  }),
  // Breathes, glances left and right, blinks.
  idle: [
    { pose: { cursor: true }, delay: 300 },
    { pose: { cursor: true }, delay: 300 },
    { pose: { cursor: true, look: -1 }, delay: 300 },
    { pose: { cursor: false, look: -1 }, delay: 300 },
    { pose: { cursor: false, by: 9 }, delay: 300 },
    { pose: { cursor: true, by: 9 }, delay: 300 },
    { pose: { cursor: true, look: 1 }, delay: 300 },
    { pose: { cursor: false, eyes: 'closed' }, delay: 130 },
    { pose: { cursor: false }, delay: 300 },
  ],
  // Crouch, jump, land, then a happy wiggle with sparkles and a check mark.
  done: [
    { by: 9, legs: [[-1, 0], [1, 0]] },
    { by: 5, air: true }, { by: 2, air: true, sp: 0 }, { by: 1, air: true, sp: 1 }, { by: 3, air: true, sp: 0 },
    { by: 7 }, { by: 9, legs: [[-1, 0], [1, 0]] },
    { by: 8, sp: 1 }, { by: 8, sp: 0, look: 1 }, { by: 8, sp: 1 }, { by: 8, sp: 0, look: -1 }, { by: 8, sp: 1 },
  ].map(({ by, air, sp, legs, look = 0 }) => ({
    pose: {
      by, look, eyes: 'happy', mouth: 'grin', prompt: 'check', airborne: !!air, legs: legs ?? (air ? [[-1, 0], [1, 0]] : undefined),
      sparkles: sp === undefined ? null : sp ? [[3, 5], [28, 12], [27, 3]] : [[28, 6], [3, 14], [4, 2]],
    },
    delay: air ? 90 : 110,
  })),
  // Red flash and shake, X eyes, frown, blinking "!", knocking knees and a sweat drop.
  error: Array.from({ length: 10 }, (_, i) => ({
    pose: {
      bx: i < 4 ? (i % 2 ? 5 : 7) : 6, border: C.red, screen: i < 4 && i % 2 === 0 ? C.redScreen : C.screen,
      eyes: 'x', mouth: 'frown', prompt: 'bang', cursor: i % 4 < 2, legs: [[1, 0], [-1, 0]],
      drop: i >= 4 ? [27, 9 + (i - 4)] : null,
    },
    delay: i < 4 ? 70 : 140,
  })),
};

function encode(frames) {
  const W = N * SCALE;
  const gif = GIFEncoder();
  for (const { pose, delay } of frames) {
    const small = draw(pose), big = new Uint8Array(W * W * 4);
    for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) {
      const s = (Math.floor(y / SCALE) * N + Math.floor(x / SCALE)) * 4;
      big.set(small.subarray(s, s + 4), (y * W + x) * 4);
    }
    const palette = quantize(big, 64, { format: 'rgba4444', oneBitAlpha: true });
    const t = palette.findIndex(c => c[3] === 0);
    gif.writeFrame(applyPalette(big, palette, 'rgba4444'), W, W, { palette, delay, transparent: t >= 0, transparentIndex: Math.max(t, 0), dispose: 2 });
  }
  gif.finish();
  return gif.bytes();
}

fs.mkdirSync(OUT, { recursive: true });
for (const [name, frames] of Object.entries(ANIMATIONS)) {
  const bytes = encode(frames);
  fs.writeFileSync(path.join(OUT, `${name}.gif`), bytes);
  console.log(`${name}.gif  ${frames.length} frames  ${(bytes.length / 1024).toFixed(1)} KB`);
}
