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
