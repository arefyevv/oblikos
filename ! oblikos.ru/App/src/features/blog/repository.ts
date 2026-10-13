import { z } from "zod";
import { blogCategories, type BlogPost, type BlogPostSummary } from "./types";
import { createAiCharacter } from "./posts/create-ai-character";
import { createAiInfluencer } from "./posts/create-ai-influencer";
import { virtualBlogger } from "./posts/virtual-blogger";
import { brandContent } from "./posts/brand-content";
import { consistentPersonality } from "./posts/consistent-personality";

const postSchema = z.object({
  slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  title: z.string().min(1), description: z.string().min(1), excerpt: z.string().min(1).optional(),
  publishedAt: z.iso.datetime({ offset: true }), updatedAt: z.iso.datetime({ offset: true }).optional(),
  author: z.string().min(1), category: z.enum(blogCategories.map((category) => category.slug)),
  tags: z.array(z.string().min(1)), coverImage: z.string().regex(/^\/blog\/media\/[^/]+\.(webp|png|jpe?g)$/).optional(),
  content: z.string().min(1),
}).refine((post) => !post.updatedAt || Date.parse(post.updatedAt) >= Date.parse(post.publishedAt), {
  message: "updatedAt must not precede publishedAt",
});

const posts: BlogPost[] = [createAiCharacter, createAiInfluencer, virtualBlogger, brandContent, consistentPersonality]
  .map((post) => postSchema.parse(post))
  .sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt));

if (new Set(posts.map((post) => post.slug)).size !== posts.length) {
  throw new Error("Blog post slugs must be unique");
}

function summary(post: BlogPost): BlogPostSummary {
  return {
    slug: post.slug, title: post.title, description: post.description, excerpt: post.excerpt,
    publishedAt: post.publishedAt, updatedAt: post.updatedAt, author: post.author,
    category: post.category, tags: [...post.tags], coverImage: post.coverImage,
  };
}

// Pages depend only on this async interface. Replace the local source here for a CMS.
export async function listBlogPosts(): Promise<BlogPostSummary[]> {
  return posts.map(summary);
}

export async function getBlogPost(slug: string): Promise<BlogPost | undefined> {
  const post = posts.find((item) => item.slug === slug);
  return post ? { ...post, tags: [...post.tags] } : undefined;
}

export async function relatedBlogPosts(post: BlogPost, limit = 3): Promise<BlogPostSummary[]> {
  const score = (candidate: BlogPost) => (candidate.category === post.category ? 3 : 0)
    + candidate.tags.filter((tag) => post.tags.includes(tag)).length;
  return posts.filter((candidate) => candidate.slug !== post.slug)
    .sort((a, b) => score(b) - score(a) || Date.parse(b.publishedAt) - Date.parse(a.publishedAt))
    .slice(0, limit).map(summary);
}
