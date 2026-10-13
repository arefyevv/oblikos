import type { MetadataRoute } from "next";
import { blogUrl } from "@/features/blog/config";
import { listBlogPosts } from "@/features/blog/repository";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const posts = await listBlogPosts();
  const latest = posts.reduce((date, post) => {
    const modified = post.updatedAt ?? post.publishedAt;
    return Date.parse(modified) > Date.parse(date) ? modified : date;
  }, posts[0]?.publishedAt ?? "2026-10-06T00:00:00+03:00");
  return [
    { url: blogUrl("/"), changeFrequency: "monthly", priority: 1 },
    { url: blogUrl(), lastModified: latest, changeFrequency: "weekly", priority: 0.8 },
    ...posts.map((post) => ({
      url: blogUrl(`/blog/${post.slug}`), lastModified: post.updatedAt ?? post.publishedAt,
      changeFrequency: "monthly" as const, priority: 0.7,
    })),
  ];
}
