"use client";

import type { ImageLoaderProps } from "next/image";

export default function imageLoader({ src, width }: ImageLoaderProps) {
  return src.replace(/^\/images\/(.+)\.webp$/, `/images/responsive/$1-${width}.webp`);
}
