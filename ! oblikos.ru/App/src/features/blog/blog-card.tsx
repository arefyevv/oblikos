import Image from "next/image";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { blogConfig, formatBlogDate } from "./config";
import { categoryTitle, type BlogPostSummary } from "./types";

export function BlogCard({ post }: { post: BlogPostSummary }) {
  return <article className="blog-card">
    <Link href={`/blog/${post.slug}`} className="blog-card__link">
      <div className="blog-card__image"><Image src={post.coverImage ?? blogConfig.defaultCover} alt="" fill sizes="(max-width: 640px) 100vw, (max-width: 1000px) 50vw, 33vw" unoptimized /></div>
      <div className="blog-card__body">
        <div className="blog-card__meta"><Badge>{categoryTitle(post.category)}</Badge><time dateTime={post.publishedAt}>{formatBlogDate(post.publishedAt)}</time></div>
        <h2>{post.title}</h2>
        <p>{post.excerpt ?? post.description}</p>
        <span className="blog-card__read">Читать статью <span aria-hidden="true">↗</span></span>
      </div>
    </Link>
  </article>;
}
