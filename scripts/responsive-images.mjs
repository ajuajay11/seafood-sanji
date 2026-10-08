// Generate every width requested by next.config.ts from the existing WebPs.
import { mkdir, readdir } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const source = path.resolve("public/images");
const target = path.join(source, "responsive");
const widths = [64, 128, 256, 384, 640, 750, 828, 1080, 1200, 1600];
await mkdir(target, { recursive: true });
for (const file of (await readdir(source)).filter((file) => file.endsWith(".webp"))) {
  for (const width of widths) {
    await sharp(path.join(source, file))
      .resize({ width, withoutEnlargement: true })
      .webp({ quality: 80, effort: 5 })
      .toFile(path.join(target, `${path.basename(file, ".webp")}-${width}.webp`));
  }
}
