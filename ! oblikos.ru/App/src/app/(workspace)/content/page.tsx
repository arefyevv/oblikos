import { ContentList } from "@/features/content/content-list";
import { content } from "@/features/content/service";
import { ButtonLink } from "@/components/ui/button";

export default async function ContentPage() {
  const result = await content.list();
  return <><div className="content-buttons content-animation-link"><ButtonLink variant="secondary" href="/animation">Оживить фото или повторить видео →</ButtonLink></div><ContentList entries={result.entries} total={result.total}/></>;
}
