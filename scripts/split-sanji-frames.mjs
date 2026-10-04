import sharp from 'sharp';
import { mkdir } from 'node:fs/promises';

// The source poses are unevenly spaced; isolate each connected silhouette.
for (const [name, file, top, count, reverse] of [
  ['run', 'sanji-running_frames.png', 0, 8, false],
  ['kick', 'sanji-kicking-frames.png', 32, 8, false],
  ['zoro-walk', 'zoro_walk.png', 0, 7, false],
  ['zoro-fall', 'zoro_felldown.png', 0, 7, true],
]) {
  const { data, info } = await sharp(`public/frames/${file}`).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: w, height: h } = info;
  const seen = new Uint8Array(w * h);
  const poses = [];
  for (let y = top; y < h; y++) for (let x = 0; x < w; x++) {
    const p = y * w + x;
    if (seen[p] || data[p * 4 + 3] < 80) continue;
    const pixels = [p]; seen[p] = 1;
    let minX = x, maxX = x, minY = y, maxY = y;
    for (let i = 0; i < pixels.length; i++) {
      const k = pixels[i], cx = k % w, cy = Math.floor(k / w);
      minX = Math.min(minX, cx); maxX = Math.max(maxX, cx);
      minY = Math.min(minY, cy); maxY = Math.max(maxY, cy);
      for (const [nx, ny] of [[cx - 1, cy], [cx + 1, cy], [cx, cy - 1], [cx, cy + 1]]) {
        if (nx < 0 || nx >= w || ny < top || ny >= h) continue;
        const n = ny * w + nx;
        if (!seen[n] && data[n * 4 + 3] >= 80) { seen[n] = 1; pixels.push(n); }
      }
    }
    if (pixels.length > 1000) poses.push({ pixels, minX, maxX, minY, maxY });
  }
  poses.sort((a, b) => a.minX - b.minX);
  if (poses.length !== count) throw new Error(`Expected ${count} ${name} poses, found ${poses.length}`);
  if (reverse) poses.reverse();
  await mkdir(`public/frames/${name}`, { recursive: true });
  for (const [index, pose] of poses.entries()) {
    const left = Math.max(0, pose.minX - 2), right = Math.min(w - 1, pose.maxX + 2);
    const upper = Math.max(top, pose.minY - 2), bottom = Math.min(h - 1, pose.maxY + 2);
    const width = right - left + 1, height = bottom - upper + 1;
    const mask = new Uint8Array(w * h);
    for (const p of pose.pixels) {
      const x = p % w, y = Math.floor(p / w);
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
        const nx = x + dx, ny = y + dy;
        if (nx >= left && nx <= right && ny >= upper && ny <= bottom) mask[ny * w + nx] = 1;
      }
    }
    const result = Buffer.alloc(width * height * 4);
    for (let y = upper; y <= bottom; y++) for (let x = left; x <= right; x++) {
      if (!mask[y * w + x]) continue;
      const src = (y * w + x) * 4, dest = ((y - upper) * width + x - left) * 4;
      data.copy(result, dest, src, src + 4);
    }
    await sharp(result, { raw: { width, height, channels: 4 } }).png().toFile(`public/frames/${name}/${index}.png`);
  }
}

// Diable Jambe: the flames break into loose sparks, so each spark joins the pose whose body is
// nearest instead of being dropped. Prints each frame's head centre (from the blond hair) so the
// game can hold Sanji steady while the burning leg swings out.
{
  const { data, info } = await sharp('public/frames/kick/sanji-dijambe.png').ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: w, height: h } = info;
  const label = new Int32Array(w * h).fill(-1);
  const parts = [];
  for (let start = 0; start < w * h; start++) {
    if (label[start] !== -1 || data[start * 4 + 3] < 80) continue;
    const stack = [start], pixels = [];
    label[start] = parts.length;
    let minX = w, maxX = 0, minY = h, maxY = 0;
    while (stack.length) {
      const k = stack.pop(), x = k % w, y = Math.floor(k / w);
      pixels.push(k);
      minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y);
      for (const [nx, ny] of [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]]) {
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const n = ny * w + nx;
        if (label[n] === -1 && data[n * 4 + 3] >= 80) { label[n] = parts.length; stack.push(n); }
      }
    }
    parts.push({ pixels, minX, maxX, minY, maxY });
  }
  const bodies = parts.filter((part) => part.pixels.length > 20000).sort((a, b) => a.minX - b.minX);
  if (bodies.length !== 7) throw new Error(`Expected 7 diable-jambe poses, found ${bodies.length}`);
  const poses = bodies.map((body) => ({ ...body, pixels: [...body.pixels], body }));
  for (const part of parts) {
    if (part.pixels.length > 20000) continue;
    const cx = (part.minX + part.maxX) / 2, cy = (part.minY + part.maxY) / 2;
    const gap = (box) => Math.hypot(Math.max(box.minX - cx, 0, cx - box.maxX), Math.max(box.minY - cy, 0, cy - box.maxY));
    const pose = poses.reduce((best, next) => (gap(next.body) < gap(best.body) ? next : best));
    pose.pixels.push(...part.pixels);
    pose.minX = Math.min(pose.minX, part.minX); pose.maxX = Math.max(pose.maxX, part.maxX);
    pose.minY = Math.min(pose.minY, part.minY); pose.maxY = Math.max(pose.maxY, part.maxY);
  }
  const standing = bodies[0].maxY - bodies[0].minY;
  await mkdir('public/frames/diable-jambe', { recursive: true });
  const anchors = [];
  for (const [index, pose] of poses.entries()) {
    const left = Math.max(0, pose.minX - 2), right = Math.min(w - 1, pose.maxX + 2);
    const upper = Math.max(0, pose.minY - 2), bottom = Math.min(h - 1, pose.body.maxY + 2);
    const width = right - left + 1, height = bottom - upper + 1;
    const result = Buffer.alloc(width * height * 4);
    for (const p of pose.pixels) {
      const x = p % w, y = Math.floor(p / w);
      if (y > bottom) continue;
      data.copy(result, ((y - upper) * width + x - left) * 4, p * 4, p * 4 + 4);
    }
    await sharp(result, { raw: { width, height, channels: 4 } }).png().toFile(`public/frames/diable-jambe/${index}.png`);
    // Blond hair in the head band, left of the kicking leg; flames are redder (lower G/R).
    const { body } = pose, limitX = body.minX + (body.maxX - body.minX) * 0.65;
    let sum = 0, count = 0;
    for (let y = Math.round(body.maxY - standing * 1.05); y < body.maxY - standing * 0.8; y++) {
      for (let x = body.minX; x < limitX; x++) {
        const i = (y * w + x) * 4, [r, g, b, a] = [data[i], data[i + 1], data[i + 2], data[i + 3]];
        if (a > 200 && r > 170 && g > 130 && b < 120 && g / r > 0.72) { sum += x; count++; }
      }
    }
    anchors.push(+(((count ? sum / count : (body.minX + body.maxX) / 2) - left) / width).toFixed(3));
  }
  console.log('diable-jambe head anchors (fraction of frame width):', JSON.stringify(anchors));
}
