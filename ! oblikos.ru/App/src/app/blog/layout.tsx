import Link from "next/link";
import { Brand } from "@/components/layout/brand";
import { ButtonLink } from "@/components/ui/button";
import { blogConfig } from "@/features/blog/config";
import "./blog.css";

export default function BlogLayout({ children }: { children: React.ReactNode }) {
  return <div className="blog-shell">
    <a href="#blog-main" className="blog-skip">К содержанию</a>
    <header className="blog-header"><div className="blog-container blog-header__inner">
      <Brand href={blogConfig.origin} label="главная" logoSrc="/blog/media/logo.svg" />
      <nav aria-label="Публичная навигация">
        <a href={`${blogConfig.origin}/#features`}>Возможности</a>
        <Link href="/blog">Блог</Link>
        <ButtonLink href={blogConfig.registrationUrl}>Создать персонажа</ButtonLink>
      </nav>
    </div></header>
    <main id="blog-main" className="blog-container">{children}</main>
    <footer className="blog-footer blog-container"><Brand href={blogConfig.origin} label="главная" logoSrc="/blog/media/logo.svg" /><p>Постоянная личность. Новые истории.</p><Link href="/blog">Блог</Link></footer>
  </div>;
}
