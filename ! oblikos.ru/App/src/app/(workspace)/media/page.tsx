import { media } from "@/features/media/service";
import { mediaView } from "@/features/media/operations";
import { MediaGallery } from "@/features/media/gallery";
import { characters } from "@/features/characters/service";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { ButtonLink } from "@/components/ui/button";
import { videos } from "@/features/media/video-service";
import { VideoJobs } from "@/features/media/video-jobs";

export default async function MediaPage({ searchParams }: { searchParams: Promise<{ page?: string; type?: string }> }) {
  const params = await searchParams;
  const type = params.type === "IMAGE" || params.type === "VIDEO" ? params.type : undefined;
  const raw = Number(params.page || 1);
  const page = Number.isInteger(raw) && raw > 0 && raw <= 10000 ? raw : 1;
  const [result, available, generations] = await Promise.all([media.list(undefined, page, type), characters.list(), videos.list()]);
  const active = available.find((c) => c.status !== "ARCHIVED");
  const cta = active ? <ButtonLink href={`/characters/${active.id}/media`}>Создать изображение</ButtonLink> : available.length ? <ButtonLink href="/characters">Восстановить персонажа</ButtonLink> : <ButtonLink href="/characters/new">Создать персонажа</ButtonLink>;
  return <><PageHeader title="Медиатека" description="Сохранённые изображения и видео персонажей вашего пространства." action={result.total > 0 ? cta : undefined}/>
    <VideoJobs generations={generations} global/>
    <nav className="content-buttons media-filters" aria-label="Тип медиа">{[["", "Все"], ["IMAGE", "Изображения"], ["VIDEO", "Видео"]].map(([value, label]) => <ButtonLink key={value} scroll={false} variant="secondary" aria-current={(type || "") === value ? "page" : undefined} href={`?type=${value}`}>{label}</ButtonLink>)}</nav>
    {result.total ? <><MediaGallery global entries={result.entries.map(mediaView)}/><div className="content-buttons">{page > 1 && <ButtonLink variant="secondary" href={`?type=${type || ""}&page=${page - 1}`}>Предыдущие</ButtonLink>}{page * 48 < result.total && <ButtonLink variant="secondary" href={`?type=${type || ""}&page=${page + 1}`}>Следующие</ButtonLink>}</div></> : <EmptyState icon="media" title={type ? "Медиа этого типа пока нет" : "Медиатека пока пуста"} description="Создайте основной образ и новые изображения персонажа.">{cta}</EmptyState>}
  </>;
}
