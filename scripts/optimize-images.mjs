// Turns the original Sanji PNGs (2560px, 4–6 MB each) into web-sized WebP
// files in public/images. The intro plays eight frames in under two seconds,
// so every frame has to be downloaded before it starts; at full size that
// was ~35 MB, at these sizes it is a small fraction of that.
//
//   pnpm images                 # reads ~/Downloads/sanji
//   pnpm images path/to/pngs    # or any other folder
import { mkdir, readdir } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import sharp from "sharp";

const source = path.resolve(process.argv[2] ?? path.join(homedir(), "Downloads", "sanji"));
const target = path.resolve("public", "images");

await mkdir(target, { recursive: true });

// Browser downloads of the same file come back as "name (1).png" — skip those.
const files = (await readdir(source)).filter(
  (file) => file.toLowerCase().endsWith(".png") && !/\(\d+\)\.png$/i.test(file),
);

for (const file of files) {
  const input = sharp(path.join(source, file));
  const { width = 0, height = 0 } = await input.metadata();
  const portrait = height > width;

  const output = path.join(target, file.replace(/\.png$/i, ".webp"));
  const info = await input
    .resize({ ...(portrait ? { height: 1200 } : { width: 1600 }), withoutEnlargement: true })
    .webp({ quality: 80, effort: 5 })
    .toFile(output);

  console.log(`${file} → ${path.basename(output)}  ${info.width}×${info.height}  ${Math.round(info.size / 1024)} KB`);
}
