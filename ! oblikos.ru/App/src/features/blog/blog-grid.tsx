"use client";

import { useState } from "react";
import { BlogCard } from "./blog-card";
import { blogCategories, type BlogPostSummary } from "./types";

export function BlogGrid({ posts }: { posts: BlogPostSummary[] }) {
  const [category, setCategory] = useState("all");
  const filtered = posts.filter((post) => category === "all" || post.category === category);
  return <>
    <div className="blog-filters" role="group" aria-label="Категории статей">
      {[{ slug: "all", title: "Все статьи" }, ...blogCategories].map((item) => <button
        type="button" key={item.slug} aria-pressed={category === item.slug}
        onClick={() => setCategory(item.slug)}>{item.title}</button>)}
    </div>
    <p className="blog-count" aria-live="polite">Статей: {filtered.length}</p>
    {filtered.length ? <div className="blog-grid">{filtered.map((post) => <BlogCard key={post.slug} post={post} />)}</div>
      : <p className="blog-empty">В этой категории пока нет статей. Выберите другую тему.</p>}
  </>;
}
