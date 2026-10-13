import { ButtonLink } from "@/components/ui/button";

export default function BlogNotFound() {
  return <section className="blog-intro"><h1>Статья не найдена</h1><p>Возможно, адрес изменился. Другие материалы доступны в блоге.</p><div className="mt-6"><ButtonLink href="/blog">Все статьи</ButtonLink></div></section>;
}
