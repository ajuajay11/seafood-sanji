import type { MetadataRoute } from "next";
import { SITE_URL } from "./site-info";

export const dynamic = "force-static";

export default function sitemap(): MetadataRoute.Sitemap {
  return ["/", "/recipes"].map((path) => ({ url: `${SITE_URL}${path}` }));
}
