export const blogCategories = [
  { slug: "ai-characters", title: "AI-персонажи" },
  { slug: "ai-influencers", title: "AI-инфлюенсеры" },
  { slug: "content", title: "Создание контента" },
  { slug: "marketing", title: "Бренды и маркетинг" },
  { slug: "guides", title: "Гайды" },
  { slug: "cases", title: "Кейсы" },
] as const;

export type BlogCategory = (typeof blogCategories)[number]["slug"];

export type BlogPost = {
  slug: string;
  title: string;
  description: string;
  excerpt?: string;
  publishedAt: string;
  updatedAt?: string;
  author: string;
  category: BlogCategory;
  tags: string[];
  coverImage?: string;
  content: string;
};

export type BlogPostSummary = Omit<BlogPost, "content">;

export function categoryTitle(category: BlogCategory) {
  return blogCategories.find((item) => item.slug === category)!.title;
}
