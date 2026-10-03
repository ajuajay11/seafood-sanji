import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // A pure static site: `next build` writes plain HTML/CSS/JS to `out/`,
  // ready for any static host. No server, no database.
  output: "export",
  // The default image optimizer needs a server. The images are already
  // web-sized WebP files (see scripts/optimize-images.mjs).
  images: { unoptimized: true },
};

export default nextConfig;
