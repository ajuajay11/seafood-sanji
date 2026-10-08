import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // A pure static site: `next build` writes plain HTML/CSS/JS to `out/`,
  // ready for any static host. No server, no database.
  output: "export",
  // Serve build-time variants without requiring an image optimization server.
  images: {
    loader: "custom",
    loaderFile: "./app/image-loader.ts",
    deviceSizes: [384, 640, 750, 828, 1080, 1200, 1600],
    imageSizes: [64, 128, 256],
  },
};

export default nextConfig;
