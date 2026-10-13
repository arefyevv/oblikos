import { BlogGrid } from "@/features/blog/blog-grid";
import { blogConfig } from "@/features/blog/config";
import { listBlogPosts } from "@/features/blog/repository";
import { blogMetadata, blogStructuredData, serializeJsonLd } from "@/features/blog/seo";

export const metadata = blogMetadata();

export default async function BlogPage() {
  const posts = await listBlogPosts();
  return <>
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(blogStructuredData()) }} />
    <section className="blog-intro"><span className="blog-eyebrow">Идеи, практика, цифровая личность</span><h1>{blogConfig.title}</h1><p>{blogConfig.description}</p></section>
    <BlogGrid posts={posts} />
  </>;
}
