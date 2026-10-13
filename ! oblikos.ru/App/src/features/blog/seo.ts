import type { Metadata } from "next";
import { blogConfig, blogUrl } from "./config";
import { categoryTitle, type BlogPost } from "./types";

export function blogMetadata(post?: BlogPost): Metadata {
  const title = post?.title ?? blogConfig.title;
  const description = post?.description ?? blogConfig.description;
  const url = blogUrl(post ? `/blog/${post.slug}` : "/blog");
  const images = [{ url: blogUrl(post?.coverImage ?? blogConfig.defaultCover), alt: title }];
  return {
    title, description,
    alternates: { canonical: url },
    robots: { index: true, follow: true },
    ...(post ? { authors: [{ name: post.author }], keywords: post.tags } : {}),
    openGraph: {
      title, description, url, siteName: "Oblik OS", locale: "ru_RU", images,
      ...(post ? {
        type: "article", publishedTime: post.publishedAt,
        modifiedTime: post.updatedAt ?? post.publishedAt,
        authors: [post.author], section: categoryTitle(post.category), tags: post.tags,
      } : { type: "website" }),
    },
    twitter: { card: "summary_large_image", title, description, images },
  };
}

export function blogStructuredData(post?: BlogPost) {
  const url = blogUrl(post ? `/blog/${post.slug}` : "/blog");
  const breadcrumbs = {
    "@context": "https://schema.org", "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Oblik OS", item: blogUrl("/") },
      { "@type": "ListItem", position: 2, name: blogConfig.title, item: blogUrl() },
      ...(post ? [{ "@type": "ListItem", position: 3, name: post.title, item: url }] : []),
    ],
  };
  if (!post) return breadcrumbs;
  return [breadcrumbs, {
    "@context": "https://schema.org", "@type": "BlogPosting",
    "@id": `${url}#article`, url, mainEntityOfPage: { "@type": "WebPage", "@id": url },
    headline: post.title, description: post.description,
    datePublished: post.publishedAt, dateModified: post.updatedAt ?? post.publishedAt,
    author: { "@type": "Organization", name: post.author, url: blogUrl("/") },
    publisher: { "@type": "Organization", name: "Oblik OS", url: blogUrl("/") },
    image: [blogUrl(post.coverImage ?? blogConfig.defaultCover)],
    articleSection: categoryTitle(post.category), keywords: post.tags.join(", "), inLanguage: "ru-RU",
  }];
}

export function serializeJsonLd(value: unknown) {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}
