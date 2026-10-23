import { GIFEncoder, quantize, applyPalette } from 'gifenc';

// Turns a GIF with a solid background (e.g. white) into a transparent GIF cropped to the character.
// The background colour is taken from the corners. Only pixels connected to the frame edge are
// cleared, so matching colours enclosed by the character (a white eye, a white shirt) survive.
// Frames are decoded by the browser's own ImageDecoder; gifenc writes the new GIF.
export async function removeGifBackground(bytes: Uint8Array, tolerance = 40): Promise<Uint8Array> {
  const decoder = new ImageDecoder({ data: bytes, type: 'image/gif' });
  await decoder.tracks.ready;
  const count = decoder.tracks.selectedTrack?.frameCount ?? 1;
  const frames: { data: Uint8ClampedArray; delay: number }[] = [];
  let w = 0, h = 0;
  for (let i = 0; i < count; i++) {
    const { image } = await decoder.decode({ frameIndex: i });  // fully composited frame
    w = image.displayWidth; h = image.displayHeight;
    const ctx = new OffscreenCanvas(w, h).getContext('2d')!;
    ctx.drawImage(image, 0, 0);
    frames.push({ data: ctx.getImageData(0, 0, w, h).data, delay: (image.duration ?? 100_000) / 1000 });
    image.close();
  }
  decoder.close();

  // Background = the colour most corners agree on.
  const first = frames[0].data;
  const corners = [0, w - 1, (h - 1) * w, h * w - 1].map(p => first.slice(p * 4, p * 4 + 4));
  const near = (d: ArrayLike<number>, i: number, c: ArrayLike<number>, tol: number) =>
    Math.abs(d[i] - c[0]) <= tol && Math.abs(d[i + 1] - c[1]) <= tol && Math.abs(d[i + 2] - c[2]) <= tol;
  const bg = corners.find(c => corners.filter(o => near(o, 0, c, tolerance)).length >= 2) ?? corners[0];
  if (bg[3] < 128) throw new Error('This GIF already has a transparent background.');

  let left = w, top = h, right = -1, bottom = -1;
  const seen = new Uint8Array(w * h);
  for (const { data } of frames) {
    const isBg = (p: number) => data[p * 4 + 3] < 128 || near(data, p * 4, bg, tolerance);
    // Flood fill from every edge pixel through background-coloured pixels.
    seen.fill(0);
    const stack: number[] = [];
    for (let x = 0; x < w; x++) stack.push(x, (h - 1) * w + x);
    for (let y = 0; y < h; y++) stack.push(y * w, y * w + w - 1);
    while (stack.length) {
      const p = stack.pop()!;
      if (seen[p] || !isBg(p)) continue;
      seen[p] = 1;
      data[p * 4 + 3] = 0;
      const x = p % w;
      if (x > 0) stack.push(p - 1);
      if (x < w - 1) stack.push(p + 1);
      if (p >= w) stack.push(p - w);
      if (p < (h - 1) * w) stack.push(p + w);
    }
    // One softer pass on the outline removes the light halo anti-aliased (anime) GIFs leave behind.
    for (let p = 0; p < w * h; p++) {
      if (seen[p] || !near(data, p * 4, bg, tolerance * 2)) continue;
      const x = p % w;
      if ((x > 0 && seen[p - 1]) || (x < w - 1 && seen[p + 1]) || (p >= w && seen[p - w]) || (p < (h - 1) * w && seen[p + w]))
        data[p * 4 + 3] = 0;
    }
    for (let p = 0; p < w * h; p++) {
      if (!data[p * 4 + 3]) continue;
      const x = p % w, y = (p - x) / w;
      left = Math.min(left, x); right = Math.max(right, x);
      top = Math.min(top, y); bottom = Math.max(bottom, y);
    }
  }
  if (right < 0) throw new Error('Could not find a character: the whole GIF matched the background.');

  // Crop every frame to the area the character ever covers, then encode.
  const cw = right - left + 1, ch = bottom - top + 1;
  const gif = GIFEncoder();
  for (const { data, delay } of frames) {
    const crop = new Uint8Array(cw * ch * 4);
    for (let y = 0; y < ch; y++) crop.set(data.subarray(((y + top) * w + left) * 4, ((y + top) * w + right + 1) * 4), y * cw * 4);
    // Cleared pixels still carry their old colour; gifenc matches on RGB too, and would map a
    // "transparent white" pixel to opaque white. Zero them so they all hit the transparent entry.
    for (let i = 0; i < crop.length; i += 4) if (!crop[i + 3]) crop[i] = crop[i + 1] = crop[i + 2] = 0;
    const palette = quantize(crop, 256, { format: 'rgba4444', oneBitAlpha: true });
    const t = palette.findIndex(c => c[3] === 0);
    gif.writeFrame(applyPalette(crop, palette, 'rgba4444'), cw, ch, { palette, delay, transparent: t >= 0, transparentIndex: Math.max(t, 0), dispose: 2 });
  }
  gif.finish();
  return gif.bytes();
}
