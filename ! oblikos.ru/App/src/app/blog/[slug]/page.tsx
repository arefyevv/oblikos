import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { BlogCard } from "@/features/blog/blog-card";
import { blogConfig, formatBlogDate } from "@/features/blog/config";
import { BlogContent, BlogTableOfContents } from "@/features/blog/content";
import { getBlogPost, listBlogPosts, relatedBlogPosts } from "@/features/blog/repository";
import { blogMetadata, blogStructuredData, serializeJsonLd } from "@/features/blog/seo";
import { categoryTitle } from "@/features/blog/types";

type Props = { params: Promise<{ slug: string }> };

export async function generateStaticParams() {
  return (await listBlogPosts()).map(({ slug }) => ({ slug }));
}

export async function generateMetadata({ params }: Props) {
  const post = await getBlogPost((await params).slug);
  if (!post) notFound();
  return blogMetadata(post);
}

export default async function BlogPostPage({ params }: Props) {
  const post = await getBlogPost((await params).slug);
  if (!post) notFound();
  const related = await relatedBlogPosts(post);
  return <>
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(blogStructuredData(post)) }} />
    <nav className="blog-breadcrumbs" aria-label="Хлебные крошки"><a href={blogConfig.origin}>Главная</a><span aria-hidden="true">/</span><Link href="/blog">Блог</Link><span aria-hidden="true">/</span><span aria-current="page">{post.title}</span></nav>
    <article>
      <header className="blog-article-header"><Badge variant="accent">{categoryTitle(post.category)}</Badge><h1>{post.title}</h1><p className="blog-lead">{post.description}</p>
        <div className="blog-byline"><span>{post.author}</span><span>Опубликовано <time dateTime={post.publishedAt}>{formatBlogDate(post.publishedAt)}</time></span>{post.updatedAt && <span>Обновлено <time dateTime={post.updatedAt}>{formatBlogDate(post.updatedAt)}</time></span>}</div>
        <ul className="blog-tags" aria-label="Теги">{post.tags.map((tag) => <li key={tag}>#{tag}</li>)}</ul>
      </header>
      <div className="blog-cover"><Image src={post.coverImage ?? blogConfig.defaultCover} alt={`Цифровой персонаж: ${post.title}`} fill sizes="(max-width: 1200px) 100vw, 1200px" priority unoptimized /></div>
      <div className="blog-reading-layout"><aside><BlogTableOfContents content={post.content} /></aside><BlogContent content={post.content} /></div>
      <section className="blog-cta"><div><h2>От идеи к своему персонажу</h2><p>Соберите внешность, характер и контекст в одном пространстве Oblik OS.</p></div><ButtonLink href={blogConfig.registrationUrl}>Создать своего AI-персонажа</ButtonLink></section>
    </article>
    {related.length > 0 && <section className="blog-related" aria-labelledby="related-heading"><h2 id="related-heading">Читайте также</h2><div className="blog-grid">{related.map((item) => <BlogCard key={item.slug} post={item} />)}</div></section>}
  </>;
}
