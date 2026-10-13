import type { MetadataRoute } from "next";
import { blogUrl } from "@/features/blog/config";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: ["/$", "/blog", "/_next/static/", "/sitemap.xml"], disallow: "/" },
    sitemap: blogUrl("/sitemap.xml"),
  };
}
